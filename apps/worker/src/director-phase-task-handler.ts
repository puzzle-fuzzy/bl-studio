import type { DirectorPhaseRunForWorker, DirectorRepository } from '@bailian-studio/director-repository'
import type { GenerationQuotaLimits, GenerationRepository } from '@bailian-studio/generation-repository'
import type { MediaRepository } from '@bailian-studio/media-repository'
import { validateModelParams } from '@bailian-studio/model-core'
import { getBailianOperationCapability } from '@bailian-studio/dashscope-manifests'
import { DirectorAnalysisResultSchema, DirectorAssemblyPlanSchema, DirectorCharactersResultSchema, DirectorLocationsResultSchema } from '@bailian-studio/director-contracts'
import type { Logger } from '@bailian-studio/shared'
import type { TaskError, TaskRecord } from '@bailian-studio/task-engine'
import { parseDirectorAnalysisOutput, parseDirectorScriptChatOutputDetailed } from './director-analysis'
import { parseDirectorCharactersOutput } from './director-characters'
import { parseDirectorLocationsOutputDetailed } from './director-locations'
import { parseDirectorStoryboardOutput } from './director-storyboard'
import { continuityPrompt, parseDirectorContinuityOutput, type DirectorContinuityShotInput } from './director-continuity'
import { parseDirectorPromptRebuildOutput, promptRebuildPrompt, type DirectorPromptRebuildShotInput } from './director-prompts'
import { dialoguePrompt, parseDirectorDialogueOutput, type DirectorDialogueShotInput } from './director-dialogue'
import { buildDirectorVideoGenerationInput, DirectorVideoInputError, parseDirectorVideoRunSummary, type DirectorVideoGenerationProgress, type DirectorVideoShotSnapshot } from './director-video'
import { analysisPrompt, charactersPrompt, entityExtractionPrompt, locationsPrompt, runInputSnapshot, scriptChatPrompt, storyboardPrompt, type RunInputSnapshot } from './director-llm-prompts'
import { parseEntityExtractionOutput } from './director-entities'
import { completePhase, failed, failPhase, isRecord, readTextOutput, retryUntilGenerationCompletes, runTextPhase, stringInput } from './director-text-phase'
import type { ModelRegistryLookup, TaskProcessOutcome } from './task-contracts'

const MAX_ANALYSIS_STORY_LENGTH = 30_000

export interface DirectorPhaseTaskHandlerDeps {
  readonly repository: GenerationRepository
  readonly directorRepository?: DirectorRepository
  readonly mediaRepository?: MediaRepository
  readonly modelRegistry: ModelRegistryLookup
  readonly logger: Logger
  /**
   * 阶段任务创建 generation 时的原子准入限额。与 API 路径共用同一解析器，
   * 保证每日任务数/成本限额对导演流程同样生效；缺省不设限（保持旧行为）。
   */
  readonly generationQuota?: GenerationQuotaLimits
}

export async function processDirectorPhaseTask(
  task: TaskRecord,
  deps: DirectorPhaseTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  const phaseRunId = stringInput(task.input, 'phaseRunId')
  if (phaseRunId === undefined) {
    return failed({
      category: 'validation',
      message: `Task ${task.id} is missing a string phaseRunId in its input`,
      retriable: false,
      code: 'DIRECTOR_PHASE_RUN_ID_INVALID',
    })
  }
  if (deps.directorRepository === undefined) {
    return failed({
      category: 'system',
      message: 'Director repository is not configured in this worker',
      retriable: false,
      code: 'DIRECTOR_REPOSITORY_UNAVAILABLE',
    })
  }

  const run = await deps.directorRepository.getPhaseRunForWorker(phaseRunId)
  if (run === undefined) {
    return failed({
      category: 'validation',
      message: `Director phase run not found: ${phaseRunId}`,
      retriable: false,
      code: 'DIRECTOR_PHASE_RUN_NOT_FOUND',
    })
  }
  if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
    return { status: 'cancelled', error: staleRunError(run.status) }
  }

  await deps.directorRepository.markPhaseRunRunning({ runId: phaseRunId })
  const modelId = stringInput(task.input, 'modelId') ?? stringInput(run.outputSummary ?? {}, 'modelId')
  const snapshot = runInputSnapshot(run)
  const chatMessage = snapshot.chatMessage

  deps.logger.info('director.phase.started', {
    taskId: task.id,
    traceId: task.traceId,
    phaseRunId: run.id,
    projectId: run.projectId,
    phase: run.phase,
    modelId,
    isScriptChat: chatMessage !== undefined,
    ...(chatMessage === undefined ? {} : { messageLength: chatMessage.length }),
  })

  if (run.phase === 'assemble') {
    if (task.userId === undefined) {
      return failPhase(run.id, {
        category: 'auth',
        message: 'Director assembly task is missing its owner',
        retriable: false,
        code: 'DIRECTOR_USER_ID_REQUIRED',
      }, deps)
    }
    return processAssemblyPhase(run, task, deps, task.userId, snapshot)
  }

  if (modelId === undefined) {
    return failPhase(run.id, {
      category: 'validation',
      message: run.phase === 'videos'
        ? 'A reference-to-video model is required to generate storyboard videos'
        : 'A text model is required to execute this screenplay phase',
      retriable: false,
      code: run.phase === 'videos' ? 'DIRECTOR_VIDEO_MODEL_ID_REQUIRED' : 'DIRECTOR_MODEL_ID_REQUIRED',
    }, deps)
  }
  if (task.userId === undefined) {
    return failPhase(run.id, {
      category: 'auth',
      message: 'Director phase task is missing its owner',
      retriable: false,
      code: 'DIRECTOR_USER_ID_REQUIRED',
    }, deps)
  }
  if (run.phase === 'entities') {
    return processEntitiesPhase(run, task, deps, modelId, task.userId, snapshot)
  }
  if (run.phase === 'characters') {
    return processCharactersPhase(run, task, deps, modelId, task.userId, snapshot)
  }
  if (run.phase === 'locations') {
    return processLocationsPhase(run, task, deps, modelId, task.userId, snapshot)
  }
  if (run.phase === 'storyboard') {
    return processStoryboardPhase(run, task, deps, modelId, task.userId, snapshot)
  }
  if (run.phase === 'continuity') {
    return processContinuityPhase(run, task, deps, modelId, task.userId, snapshot)
  }
  if (run.phase === 'rebuild') {
    return processPromptRebuildPhase(run, task, deps, modelId, task.userId, snapshot)
  }
  if (run.phase === 'dialogue') {
    return processDialoguePhase(run, task, deps, modelId, task.userId, snapshot)
  }
  if (run.phase === 'bgm') {
    return processMusicPhase(run, task, deps, modelId, task.userId, snapshot)
  }
  if (run.phase === 'videos') {
    return processVideosPhase(run, task, deps, modelId, task.userId, snapshot)
  }
  if (run.phase !== 'analyze') {
    return failPhase(run.id, {
      category: 'validation',
      message: `Director phase is not implemented yet: ${run.phase}`,
      retriable: false,
      code: 'DIRECTOR_PHASE_NOT_IMPLEMENTED',
    }, deps)
  }
  if (snapshot.storyText.length > MAX_ANALYSIS_STORY_LENGTH) {
    return failPhase(run.id, {
      category: 'validation',
      message: `Screenplay is too long for the first analysis executor (${MAX_ANALYSIS_STORY_LENGTH} characters maximum)`,
      retriable: false,
      code: 'DIRECTOR_ANALYSIS_INPUT_TOO_LONG',
    }, deps)
  }

  const generationId = stringInput(run.outputSummary ?? {}, 'generationId')
  if (generationId === undefined) {
    try {
      const generation = await deps.repository.createGeneration({
        userId: task.userId,
        modelId,
        params: {
          prompt: chatMessage === undefined
            ? analysisPrompt(snapshot.title, snapshot.synopsis, snapshot.storyText)
            : scriptChatPrompt(snapshot, chatMessage),
          maxTokens: chatMessage === undefined ? 4_096 : 8_192,
          temperature: 0.4,
          topP: 0.8,
        },
        idempotencyKey: chatMessage === undefined
          ? `director:${run.id}:analysis`
          : `director:${run.id}:script-chat`,
        traceId: task.traceId,
        ...(deps.generationQuota === undefined ? {} : { quota: deps.generationQuota }),
      })
      await deps.directorRepository?.setPhaseRunProgress({
        runId: run.id,
        outputSummary: { generationId: generation.record.id, modelId },
      })
      deps.logger.info('director.phase_generation_queued', {
        taskId: task.id,
        phaseRunId: run.id,
        generationId: generation.record.id,
        phase: run.phase,
      })
      return retryUntilGenerationCompletes(task, 'Director analysis generation is queued')
    } catch (error) {
      return failPhase(run.id, {
        category: 'validation',
        message: error instanceof Error ? error.message : String(error),
        retriable: false,
        code: 'DIRECTOR_ANALYSIS_GENERATION_CREATE_FAILED',
      }, deps)
    }
  }

  const generation = await deps.repository.getGenerationRecord(generationId)
  if (generation === undefined) {
    return failPhase(run.id, {
      category: 'validation',
      message: `Analysis generation record not found: ${generationId}`,
      retriable: false,
      code: 'DIRECTOR_ANALYSIS_GENERATION_NOT_FOUND',
    }, deps)
  }
  if (generation.status === 'succeeded') {
    const analysisText = readTextOutput(generation.outputResult)
    if (analysisText === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Analysis generation completed without text output',
        retriable: false,
        code: 'DIRECTOR_ANALYSIS_OUTPUT_MISSING',
      }, deps)
    }
    if (chatMessage !== undefined) {
      const parsedChat = parseDirectorScriptChatOutputDetailed(analysisText)
      if (parsedChat.output === undefined) {
        deps.logger.error('director.script_chat.output_invalid', {
          taskId: task.id,
          traceId: task.traceId,
          phaseRunId: run.id,
          projectId: run.projectId,
          generationId,
          outputLength: analysisText.length,
          parseMode: parsedChat.mode,
          topLevelKeys: parsedChat.topLevelKeys,
          issuePaths: parsedChat.issuePaths,
        })
        return failPhase(run.id, {
          category: 'provider',
          message: 'Screenplay chat generation returned text that does not match the screenplay editor contract',
          retriable: false,
          code: 'DIRECTOR_SCRIPT_CHAT_OUTPUT_INVALID',
        }, deps)
      }
      if (parsedChat.mode === 'normalized-json') {
        deps.logger.warn('director.script_chat.output_normalized', {
          taskId: task.id,
          traceId: task.traceId,
          phaseRunId: run.id,
          projectId: run.projectId,
          generationId,
          outputLength: analysisText.length,
          topLevelKeys: parsedChat.topLevelKeys,
          normalizedIssuePaths: parsedChat.issuePaths,
        })
      }
      const chat = parsedChat.output
      await deps.directorRepository.applyScriptChat({
        userId: task.userId,
        projectId: run.projectId,
        runId: run.id,
        screenplay: chat.screenplay,
        synopsis: chat.synopsis,
        reply: chat.reply,
      })
      return completePhase(run.id, {
        generationId,
        modelId,
        analysisText: JSON.stringify(chat.analysis),
        analysis: chat.analysis,
        screenplay: chat.screenplay,
        synopsis: chat.synopsis,
        reply: chat.reply,
        changes: chat.changes,
      }, deps, JSON.stringify(chat.analysis))
    }
    const analysis = parseDirectorAnalysisOutput(analysisText)
    if (analysis === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Analysis generation returned text that does not match the Director analysis contract',
        retriable: false,
        code: 'DIRECTOR_ANALYSIS_OUTPUT_INVALID',
      }, deps)
    }
    return completePhase(run.id, { generationId, modelId, analysisText, analysis }, deps, analysisText)
  }
  if (generation.status === 'failed' || generation.status === 'cancelled') {
    return failPhase(run.id, {
      category: 'provider',
      message: generation.errorJson?.message === undefined
        ? `Analysis generation ${generation.status}`
        : String(generation.errorJson.message),
      retriable: false,
      code: 'DIRECTOR_ANALYSIS_GENERATION_FAILED',
    }, deps)
  }

  return retryUntilGenerationCompletes(task, `Analysis generation is ${generation.status}`)
}

async function processCharactersPhase(
	run: DirectorPhaseRunForWorker,
	task: TaskRecord,
	deps: DirectorPhaseTaskHandlerDeps,
	modelId: string,
	userId: string,
	snapshot: RunInputSnapshot,
): Promise<TaskProcessOutcome> {
	const analysisResult = DirectorAnalysisResultSchema.safeParse(snapshot.analysis)
	if (!analysisResult.success) {
		return failPhase(run.id, {
			category: 'validation',
			message: 'A validated screenplay analysis is required before generating characters',
			retriable: false,
			code: 'DIRECTOR_CHARACTERS_INPUT_INVALID',
		}, deps)
	}
	if (snapshot.storyText.length > MAX_ANALYSIS_STORY_LENGTH) {
		return failPhase(run.id, {
			category: 'validation',
			message: `Screenplay is too long for the first characters executor (${MAX_ANALYSIS_STORY_LENGTH} characters maximum)`,
			retriable: false,
			code: 'DIRECTOR_CHARACTERS_INPUT_TOO_LONG',
		}, deps)
	}

	return runTextPhase(run, task, deps, modelId, userId, {
		phaseKey: 'characters',
		codePrefix: 'DIRECTOR_CHARACTERS',
		label: 'character',
		prompt: charactersPrompt(snapshot, analysisResult.data),
		maxTokens: 4_096,
		temperature: 0.4,
		parse(text) {
			const characters = parseDirectorCharactersOutput(text)
			return characters === undefined
				? {
						ok: false,
						error: {
							category: 'provider',
							message: 'Character generation returned text that does not match the Director character contract',
							retriable: false,
							code: 'DIRECTOR_CHARACTERS_OUTPUT_INVALID',
						},
					}
				: { ok: true, value: characters }
		},
		buildCompletion: (generationId, modelId, charactersText, characters) => ({
			summary: { generationId, modelId, charactersText, characters },
			outputText: charactersText,
		}),
	})
}

async function processLocationsPhase(
	run: DirectorPhaseRunForWorker,
	task: TaskRecord,
	deps: DirectorPhaseTaskHandlerDeps,
	modelId: string,
	userId: string,
	snapshot: RunInputSnapshot,
): Promise<TaskProcessOutcome> {
	const charactersResult = DirectorCharactersResultSchema.safeParse(snapshot.characters)
	if (!charactersResult.success) {
		return failPhase(run.id, {
			category: 'validation',
			message: 'A validated character result is required before generating locations',
			retriable: false,
			code: 'DIRECTOR_LOCATIONS_INPUT_INVALID',
		}, deps)
	}
	if (snapshot.storyText.length > MAX_ANALYSIS_STORY_LENGTH) {
		return failPhase(run.id, {
			category: 'validation',
			message: `Screenplay is too long for the first locations executor (${MAX_ANALYSIS_STORY_LENGTH} characters maximum)`,
			retriable: false,
			code: 'DIRECTOR_LOCATIONS_INPUT_TOO_LONG',
		}, deps)
	}

	return runTextPhase(run, task, deps, modelId, userId, {
		phaseKey: 'locations',
		codePrefix: 'DIRECTOR_LOCATIONS',
		label: 'location',
		prompt: locationsPrompt(snapshot, charactersResult.data),
		maxTokens: 4_096,
		temperature: 0.4,
		parse(text) {
			const parsedLocations = parseDirectorLocationsOutputDetailed(text)
			if (parsedLocations.locations === undefined) {
				deps.logger.error('director.locations.output_invalid', {
					taskId: task.id,
					traceId: task.traceId,
					phaseRunId: run.id,
					projectId: run.projectId,
					outputLength: text.length,
					parseMode: parsedLocations.mode,
				})
				return {
					ok: false,
					error: {
						category: 'provider',
						message: 'Location generation returned text that does not match the Director location contract',
						retriable: false,
						code: 'DIRECTOR_LOCATIONS_OUTPUT_INVALID',
					},
				}
			}
			if (parsedLocations.mode === 'repaired-json') {
				deps.logger.warn('director.locations.output_repaired', {
					taskId: task.id,
					traceId: task.traceId,
					phaseRunId: run.id,
					projectId: run.projectId,
					outputLength: text.length,
				})
			}
			return { ok: true, value: parsedLocations.locations }
		},
		buildCompletion: (generationId, modelId, locationsText, locations) => ({
			summary: { generationId, modelId, locationsText, locations },
			outputText: locationsText,
		}),
	})
}

async function processStoryboardPhase(
	run: DirectorPhaseRunForWorker,
	task: TaskRecord,
	deps: DirectorPhaseTaskHandlerDeps,
	modelId: string,
	userId: string,
	snapshot: RunInputSnapshot,
): Promise<TaskProcessOutcome> {
	const analysisResult = DirectorAnalysisResultSchema.safeParse(snapshot.analysis)
	const charactersResult = DirectorCharactersResultSchema.safeParse(snapshot.characters)
	const locationsResult = DirectorLocationsResultSchema.safeParse(snapshot.locations)
	if (!analysisResult.success || !charactersResult.success || !locationsResult.success) {
		return failPhase(run.id, {
			category: 'validation',
			message: 'Validated analysis, character, and location results are required before generating storyboard',
			retriable: false,
			code: 'DIRECTOR_STORYBOARD_INPUT_INVALID',
		}, deps)
	}
	if (snapshot.storyText.length > MAX_ANALYSIS_STORY_LENGTH) {
		return failPhase(run.id, {
			category: 'validation',
			message: `Screenplay is too long for the first storyboard executor (${MAX_ANALYSIS_STORY_LENGTH} characters maximum)`,
			retriable: false,
			code: 'DIRECTOR_STORYBOARD_INPUT_TOO_LONG',
		}, deps)
	}

	return runTextPhase(run, task, deps, modelId, userId, {
		phaseKey: 'storyboard',
		codePrefix: 'DIRECTOR_STORYBOARD',
		label: 'storyboard',
		prompt: storyboardPrompt(snapshot, analysisResult.data, charactersResult.data, locationsResult.data),
		maxTokens: 8_192,
		temperature: 0.4,
		parse(text) {
			const storyboard = parseDirectorStoryboardOutput(text)
			return storyboard === undefined
				? {
						ok: false,
						error: {
							category: 'provider',
							message: 'Storyboard generation returned text that does not match the Director storyboard contract',
							retriable: false,
							code: 'DIRECTOR_STORYBOARD_OUTPUT_INVALID',
						},
					}
				: { ok: true, value: storyboard }
		},
		buildCompletion: (generationId, modelId, storyboardText, storyboard) => ({
			summary: { generationId, modelId, storyboardText, storyboard },
			outputText: storyboardText,
		}),
	})
}

async function processContinuityPhase(
	run: DirectorPhaseRunForWorker,
	task: TaskRecord,
	deps: DirectorPhaseTaskHandlerDeps,
	modelId: string,
	userId: string,
	snapshot: RunInputSnapshot,
): Promise<TaskProcessOutcome> {
	const shots = readContinuityShotInputs(snapshot.shots)
	if (shots.length === 0) {
		return failPhase(run.id, {
			category: 'validation',
			message: 'No storyboard shots were captured for continuity review',
			retriable: false,
			code: 'DIRECTOR_CONTINUITY_SHOTS_MISSING',
		}, deps)
	}

	return runTextPhase(run, task, deps, modelId, userId, {
		phaseKey: 'continuity',
		codePrefix: 'DIRECTOR_CONTINUITY',
		label: 'continuity',
		prompt: continuityPrompt(snapshot.title, snapshot.synopsis, shots),
		maxTokens: 4_096,
		temperature: 0.2,
		parse(text) {
			const continuity = parseDirectorContinuityOutput(text)
			if (continuity === undefined) {
				return {
					ok: false,
					error: {
						category: 'provider',
						message: 'Continuity generation returned text that does not match the Director continuity contract',
						retriable: false,
						code: 'DIRECTOR_CONTINUITY_OUTPUT_INVALID',
					},
				}
			}
			const shotSequences = new Map(shots.map(shot => [shot.id, shot.sequence]))
			if (continuity.issues.some(issue => shotSequences.get(issue.shotId) !== issue.sequence)) {
				return {
					ok: false,
					error: {
						category: 'provider',
						message: 'Continuity output referenced an unknown storyboard shot or mismatched its sequence',
						retriable: false,
						code: 'DIRECTOR_CONTINUITY_OUTPUT_SCOPE_INVALID',
					},
				}
			}
			return { ok: true, value: continuity }
		},
		buildCompletion: (generationId, modelId, continuityText, continuity) => ({
			summary: { generationId, modelId, continuityText, continuity },
			outputText: continuityText,
		}),
	})
}

async function processPromptRebuildPhase(
	run: DirectorPhaseRunForWorker,
	task: TaskRecord,
	deps: DirectorPhaseTaskHandlerDeps,
	modelId: string,
	userId: string,
	snapshot: RunInputSnapshot,
): Promise<TaskProcessOutcome> {
	const shots = readPromptRebuildShotInputs(snapshot.shots)
	if (shots.length === 0) {
		return failPhase(run.id, {
			category: 'validation',
			message: 'No storyboard shots were captured for prompt rebuilding',
			retriable: false,
			code: 'DIRECTOR_PROMPT_REBUILD_SHOTS_MISSING',
		}, deps)
	}

	return runTextPhase(run, task, deps, modelId, userId, {
		phaseKey: 'rebuild',
		codePrefix: 'DIRECTOR_PROMPT_REBUILD',
		label: 'prompt rebuild',
		prompt: promptRebuildPrompt(snapshot.title, snapshot.synopsis, shots, snapshot.continuity),
		maxTokens: 8_192,
		temperature: 0.3,
		parse(text) {
			const promptRebuild = parseDirectorPromptRebuildOutput(text)
			if (promptRebuild === undefined) {
				return {
					ok: false,
					error: {
						category: 'provider',
						message: 'Prompt rebuild generation returned text that does not match the Director prompt contract',
						retriable: false,
						code: 'DIRECTOR_PROMPT_REBUILD_OUTPUT_INVALID',
					},
				}
			}
			const shotSequences = new Map(shots.map(shot => [shot.id, shot.sequence]))
			if (promptRebuild.shots.some(shot => shotSequences.get(shot.shotId) !== shot.sequence)) {
				return {
					ok: false,
					error: {
						category: 'provider',
						message: 'Prompt rebuild output referenced an unknown storyboard shot or mismatched its sequence',
						retriable: false,
						code: 'DIRECTOR_PROMPT_REBUILD_OUTPUT_SCOPE_INVALID',
					},
				}
			}
			return { ok: true, value: promptRebuild }
		},
		buildCompletion: (generationId, modelId, promptRebuildText, promptRebuild) => ({
			summary: { generationId, modelId, promptRebuildText, promptRebuild },
			outputText: promptRebuildText,
		}),
	})
}

async function processDialoguePhase(
	run: DirectorPhaseRunForWorker,
	task: TaskRecord,
	deps: DirectorPhaseTaskHandlerDeps,
	modelId: string,
	userId: string,
	snapshot: RunInputSnapshot,
): Promise<TaskProcessOutcome> {
	const shots = readDialogueShotInputs(snapshot.shots)
	if (shots.length === 0) {
		return failPhase(run.id, {
			category: 'validation',
			message: 'No storyboard shots were captured for dialogue review',
			retriable: false,
			code: 'DIRECTOR_DIALOGUE_SHOTS_MISSING',
		}, deps)
	}

	return runTextPhase(run, task, deps, modelId, userId, {
		phaseKey: 'dialogue',
		codePrefix: 'DIRECTOR_DIALOGUE',
		label: 'dialogue',
		prompt: dialoguePrompt(snapshot.title, snapshot.synopsis, shots),
		maxTokens: 8_192,
		temperature: 0.3,
		parse(text) {
			const dialogue = parseDirectorDialogueOutput(text)
			if (dialogue === undefined) {
				return {
					ok: false,
					error: {
						category: 'provider',
						message: 'Dialogue generation returned text that does not match the Director dialogue contract',
						retriable: false,
						code: 'DIRECTOR_DIALOGUE_OUTPUT_INVALID',
					},
				}
			}
			const shotSequences = new Map(shots.map(shot => [shot.id, shot.sequence]))
			if (dialogue.shots.some(shot => shotSequences.get(shot.shotId) !== shot.sequence)) {
				return {
					ok: false,
					error: {
						category: 'provider',
						message: 'Dialogue output referenced an unknown storyboard shot or mismatched its sequence',
						retriable: false,
						code: 'DIRECTOR_DIALOGUE_OUTPUT_SCOPE_INVALID',
					},
				}
			}
			return { ok: true, value: dialogue }
		},
		buildCompletion: (generationId, modelId, dialogueText, dialogue) => ({
			summary: { generationId, modelId, dialogueText, dialogue },
			outputText: dialogueText,
		}),
	})
}

async function processMusicPhase(
  run: DirectorPhaseRunForWorker,
  task: TaskRecord,
  deps: DirectorPhaseTaskHandlerDeps,
  modelId: string,
  userId: string,
  snapshot: RunInputSnapshot,
): Promise<TaskProcessOutcome> {
  const manifest = deps.modelRegistry.getModelById(modelId)
  if (manifest === undefined || manifest.availability.enabled === false || getBailianOperationCapability(manifest.id) !== 'music.generate') {
    return failPhase(run.id, {
      category: 'validation',
      message: `Music model is unavailable: ${modelId}`,
      retriable: false,
      code: 'DIRECTOR_MUSIC_MODEL_UNAVAILABLE',
    }, deps)
  }

  const musicInput = isRecord(snapshot.music) ? snapshot.music : {}
  const params = musicGenerationParams(musicInput)
  const validation = validateModelParams(manifest, params)
  if (!validation.valid) {
    return failPhase(run.id, {
      category: 'validation',
      message: validation.errors[0]?.message ?? 'Music generation parameters are invalid',
      retriable: false,
      code: 'DIRECTOR_MUSIC_INPUT_INVALID',
    }, deps)
  }

  const generationId = stringInput(run.outputSummary ?? {}, 'generationId')
  if (generationId === undefined) {
    try {
      const generation = await deps.repository.createGeneration({
        userId,
        modelId,
        params,
        idempotencyKey: `director:${run.id}:bgm`,
        traceId: task.traceId,
        ...(deps.generationQuota === undefined ? {} : { quota: deps.generationQuota }),
      })
      await deps.directorRepository?.setPhaseRunProgress({
        runId: run.id,
        outputSummary: { generationId: generation.record.id, modelId },
      })
      deps.logger.info('director.phase_generation_queued', {
        taskId: task.id,
        phaseRunId: run.id,
        generationId: generation.record.id,
        phase: run.phase,
      })
      return retryUntilGenerationCompletes(task, 'Director music generation is queued', 'DIRECTOR_MUSIC')
    } catch (error) {
      return failPhase(run.id, {
        category: 'validation',
        message: error instanceof Error ? error.message : String(error),
        retriable: false,
        code: 'DIRECTOR_MUSIC_GENERATION_CREATE_FAILED',
      }, deps)
    }
  }

  const generation = await deps.repository.getGenerationRecord(generationId)
  if (generation === undefined) {
    return failPhase(run.id, {
      category: 'validation',
      message: `Music generation record not found: ${generationId}`,
      retriable: false,
      code: 'DIRECTOR_MUSIC_GENERATION_NOT_FOUND',
    }, deps)
  }
  if (generation.status === 'succeeded') {
    const musicAsset = await deps.directorRepository?.finalizeDirectorMusic({
      userId,
      projectId: run.projectId,
      phaseRunId: run.id,
      generationId,
    })
    if (musicAsset === undefined) {
      return retryUntilGenerationCompletes(task, 'Music generation succeeded but its audio asset is not ready', 'DIRECTOR_MUSIC_ASSET')
    }
    const summary = { generationId, modelId, musicAssetId: musicAsset.id }
    return completePhase(run.id, summary, deps, JSON.stringify(summary))
  }
  if (generation.status === 'failed' || generation.status === 'cancelled') {
    return failPhase(run.id, {
      category: 'provider',
      message: generation.errorJson?.message === undefined
        ? `Music generation ${generation.status}`
        : String(generation.errorJson.message),
      retriable: false,
      code: 'DIRECTOR_MUSIC_GENERATION_FAILED',
    }, deps)
  }

  return retryUntilGenerationCompletes(task, `Music generation is ${generation.status}`, 'DIRECTOR_MUSIC')
}

async function processAssemblyPhase(
  run: DirectorPhaseRunForWorker,
  task: TaskRecord,
  deps: DirectorPhaseTaskHandlerDeps,
  userId: string,
  snapshot: RunInputSnapshot,
): Promise<TaskProcessOutcome> {
  const mediaRepository = deps.mediaRepository
  if (mediaRepository === undefined) {
    return failPhase(run.id, {
      category: 'system',
      message: 'Media repository is not configured for director assembly',
      retriable: false,
      code: 'DIRECTOR_ASSEMBLY_MEDIA_REPOSITORY_UNAVAILABLE',
    }, deps)
  }
  const parsedPlan = DirectorAssemblyPlanSchema.safeParse(snapshot.assembly)
  if (!parsedPlan.success || parsedPlan.data.shots.length === 0) {
    return failPhase(run.id, {
      category: 'validation',
      message: 'A validated assembly plan with video shots is required',
      retriable: false,
      code: 'DIRECTOR_ASSEMBLY_INPUT_INVALID',
    }, deps)
  }

  const mediaJobId = stringInput(run.outputSummary ?? {}, 'mediaJobId')
  if (mediaJobId === undefined) {
    try {
      const plan = parsedPlan.data
      const firstShot = plan.shots[0]
      if (firstShot === undefined) {
        return failPhase(run.id, {
          category: 'validation',
          message: 'A validated assembly plan with video shots is required',
          retriable: false,
          code: 'DIRECTOR_ASSEMBLY_INPUT_INVALID',
        }, deps)
      }
      const mediaJob = await mediaRepository.createMediaJob({
        userId,
        operation: 'video.assemble',
        source: {
          assetId: firstShot.assetId,
          kind: 'video',
          fileName: `shot-${firstShot.sequence}.mp4`,
        },
        assembly: {
          videoSources: plan.shots.map(shot => ({
            assetId: shot.assetId,
            kind: 'video' as const,
            fileName: `shot-${shot.sequence}.mp4`,
          })),
          ...(plan.music === null ? {} : {
            musicSource: {
              assetId: plan.music.assetId,
              kind: 'audio' as const,
              fileName: 'director-music.mp3',
            },
          }),
        },
        options: plan.settings,
        idempotencyKey: `director:${run.id}:assemble`,
        traceId: task.traceId,
      })
      await deps.directorRepository?.setPhaseRunProgress({
        runId: run.id,
        outputSummary: { mediaJobId: mediaJob.job.id },
      })
      deps.logger.info('director.assembly_media_job_queued', {
        taskId: task.id,
        phaseRunId: run.id,
        mediaJobId: mediaJob.job.id,
      })
      return retryUntilGenerationCompletes(task, 'Director assembly media job is queued', 'DIRECTOR_ASSEMBLY')
    } catch (error) {
      return failPhase(run.id, {
        category: 'validation',
        message: error instanceof Error ? error.message : String(error),
        retriable: false,
        code: 'DIRECTOR_ASSEMBLY_JOB_CREATE_FAILED',
      }, deps)
    }
  }

  const mediaJob = await mediaRepository.getMediaJob({ userId, jobId: mediaJobId })
  if (mediaJob === undefined) {
    return failPhase(run.id, {
      category: 'validation',
      message: `Assembly media job not found: ${mediaJobId}`,
      retriable: false,
      code: 'DIRECTOR_ASSEMBLY_JOB_NOT_FOUND',
    }, deps)
  }
  if (mediaJob.status === 'succeeded') {
    if (mediaJob.outputAssetId === undefined) {
      return failPhase(run.id, {
        category: 'system',
        message: 'Assembly media job succeeded without an output asset',
        retriable: false,
        code: 'DIRECTOR_ASSEMBLY_OUTPUT_MISSING',
      }, deps)
    }
    const finalAsset = await deps.directorRepository?.finalizeDirectorAssembly({
      userId,
      projectId: run.projectId,
      phaseRunId: run.id,
      mediaJobId,
      outputAssetId: mediaJob.outputAssetId,
    })
    if (finalAsset === undefined) {
      return retryUntilGenerationCompletes(task, 'Assembly output is ready but final asset is not persisted', 'DIRECTOR_ASSEMBLY_ASSET')
    }
    const summary = { mediaJobId, outputAssetId: mediaJob.outputAssetId, finalVideoAssetId: finalAsset.id }
    return completePhase(run.id, summary, deps, JSON.stringify(summary))
  }
  if (mediaJob.status === 'failed' || mediaJob.status === 'cancelled') {
    return failPhase(run.id, {
      category: 'system',
      message: mediaJob.error?.message ?? `Assembly media job ${mediaJob.status}`,
      retriable: false,
      code: mediaJob.error?.code ?? 'DIRECTOR_ASSEMBLY_JOB_FAILED',
    }, deps)
  }
  return retryUntilGenerationCompletes(task, `Assembly media job is ${mediaJob.status}`, 'DIRECTOR_ASSEMBLY')
}

async function processVideosPhase(
  run: DirectorPhaseRunForWorker,
  task: TaskRecord,
  deps: DirectorPhaseTaskHandlerDeps,
  modelId: string,
  userId: string,
  snapshot: RunInputSnapshot,
): Promise<TaskProcessOutcome> {
  const manifest = deps.modelRegistry.getModelById(modelId)
  if (manifest === undefined || manifest.availability.enabled === false) {
    return failPhase(run.id, {
      category: 'validation',
      message: `Video model is unavailable: ${modelId}`,
      retriable: false,
      code: 'DIRECTOR_VIDEO_MODEL_UNAVAILABLE',
    }, deps)
  }

  const shots = readVideoShotSnapshots(snapshot.shots)
  if (shots.length === 0) {
    return failPhase(run.id, {
      category: 'validation',
      message: 'No locked storyboard shots were captured for video generation',
      retriable: false,
      code: 'DIRECTOR_VIDEO_SHOTS_MISSING',
    }, deps)
  }

  const project = await deps.directorRepository?.getProject({ userId, projectId: run.projectId })
  if (project === undefined) {
    return failPhase(run.id, {
      category: 'validation',
      message: `Director project not found: ${run.projectId}`,
      retriable: false,
      code: 'DIRECTOR_VIDEO_PROJECT_NOT_FOUND',
    }, deps)
  }

  const existing = parseDirectorVideoRunSummary(run.outputSummary)
  if (existing !== undefined && existing.modelId !== modelId) {
    return failPhase(run.id, {
      category: 'validation',
      message: 'The video phase cannot switch models after a shot generation has started',
      retriable: false,
      code: 'DIRECTOR_VIDEO_MODEL_CHANGED',
    }, deps)
  }
  const shotGenerations: Record<string, DirectorVideoGenerationProgress> = existing?.shotGenerations ?? {}
  const preparedInputs = new Map<string, ReturnType<typeof buildDirectorVideoGenerationInput>>()
  for (const snapshotShot of shots) {
    const currentShot = project.shots.find(shot => shot.id === snapshotShot.id)
    if (currentShot === undefined) {
      return failPhase(run.id, {
        category: 'validation',
        message: `Storyboard shot no longer exists: ${snapshotShot.id}`,
        retriable: false,
        code: 'DIRECTOR_VIDEO_SHOT_NOT_FOUND',
      }, deps)
    }
    const persistedVideoAsset = currentShot.activeVideoAssetId === null
      ? undefined
      : project.assets.find(asset => asset.id === currentShot.activeVideoAssetId && asset.kind === 'shot_video')
    const hasPersistedVideo = currentShot.status === 'succeeded' && typeof persistedVideoAsset?.metadata.generationId === 'string'
    const hasExistingGeneration = currentShot.videoGenerationId !== null || shotGenerations[snapshotShot.id] !== undefined
    if (hasPersistedVideo || hasExistingGeneration) continue
    try {
      preparedInputs.set(snapshotShot.id, buildDirectorVideoGenerationInput(currentShot, project.assets, manifest))
    } catch (error) {
      return failPhase(run.id, {
        category: 'validation',
        message: error instanceof Error ? error.message : String(error),
        retriable: false,
        code: error instanceof DirectorVideoInputError ? error.code : 'DIRECTOR_VIDEO_INPUT_INVALID',
      }, deps)
    }
  }
  let waitingForGeneration = false

  for (const snapshotShot of shots) {
    const currentShot = project.shots.find(shot => shot.id === snapshotShot.id)
    if (currentShot === undefined) {
      return failPhase(run.id, {
        category: 'validation',
        message: `Storyboard shot no longer exists: ${snapshotShot.id}`,
        retriable: false,
        code: 'DIRECTOR_VIDEO_SHOT_NOT_FOUND',
      }, deps)
    }

    const persistedVideoAsset = currentShot.activeVideoAssetId === null
      ? undefined
      : project.assets.find(asset => asset.id === currentShot.activeVideoAssetId && asset.kind === 'shot_video')
    const generationIdFromAsset = persistedVideoAsset?.metadata.generationId
    if (currentShot.status === 'succeeded' && typeof generationIdFromAsset === 'string') {
      shotGenerations[snapshotShot.id] = {
        shotId: snapshotShot.id,
        sequence: snapshotShot.sequence,
        generationId: generationIdFromAsset,
        status: 'succeeded',
      }
      continue
    }

    const currentGenerationId = currentShot.videoGenerationId ?? shotGenerations[snapshotShot.id]?.generationId
    if (currentGenerationId === undefined) {
      try {
        const generationInput = preparedInputs.get(snapshotShot.id)
        if (generationInput === undefined) {
          throw new Error(`Video input was not prepared for storyboard shot: ${snapshotShot.id}`)
        }
        const generation = await deps.repository.createGeneration({
          userId,
          modelId,
          params: generationInput.params,
          ...(generationInput.assetRefs === undefined ? {} : { assetRefs: generationInput.assetRefs }),
          idempotencyKey: `director:${run.id}:shot:${snapshotShot.id}`,
          traceId: task.traceId,
          ...(deps.generationQuota === undefined ? {} : { quota: deps.generationQuota }),
        })
        await deps.directorRepository?.startShotVideo({
          userId,
          projectId: run.projectId,
          shotId: snapshotShot.id,
          generationId: generation.record.id,
        })
        shotGenerations[snapshotShot.id] = {
          shotId: snapshotShot.id,
          sequence: snapshotShot.sequence,
          generationId: generation.record.id,
          status: 'queued',
        }
        await persistVideoProgress(run.id, modelId, shotGenerations, deps)
        waitingForGeneration = true
        continue
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (error instanceof DirectorVideoInputError) {
          return failPhase(run.id, {
            category: 'validation',
            message,
            retriable: false,
            code: error.code,
          }, deps)
        }
        return failPhase(run.id, {
          category: 'validation',
          message,
          retriable: false,
          code: 'DIRECTOR_VIDEO_GENERATION_CREATE_FAILED',
        }, deps)
      }
    }

    const generationId = currentGenerationId
    const generation = await deps.repository.getGenerationRecord(generationId)
    if (generation === undefined) {
      return failPhase(run.id, {
        category: 'validation',
        message: `Video generation record not found: ${generationId}`,
        retriable: false,
        code: 'DIRECTOR_VIDEO_GENERATION_NOT_FOUND',
      }, deps)
    }
    if (generation.status === 'succeeded') {
      const finalized = await deps.directorRepository?.finalizeShotVideo({ generationId })
      if (finalized !== true) {
        waitingForGeneration = true
        shotGenerations[snapshotShot.id] = {
          shotId: snapshotShot.id,
          sequence: snapshotShot.sequence,
          generationId,
          status: 'processing',
        }
        continue
      }
      shotGenerations[snapshotShot.id] = {
        shotId: snapshotShot.id,
        sequence: snapshotShot.sequence,
        generationId,
        status: 'succeeded',
      }
      continue
    }
    if (generation.status === 'failed' || generation.status === 'cancelled') {
      await deps.directorRepository?.markShotVideoFailed({
        generationId,
        error: {
          code: 'DIRECTOR_VIDEO_GENERATION_FAILED',
          message: generation.errorJson?.message === undefined
            ? `Video generation ${generation.status}`
            : String(generation.errorJson.message),
        },
      })
      return failPhase(run.id, {
        category: 'provider',
        message: generation.errorJson?.message === undefined
          ? `Video generation ${generation.status}`
          : String(generation.errorJson.message),
        retriable: false,
        code: 'DIRECTOR_VIDEO_GENERATION_FAILED',
      }, deps)
    }
    shotGenerations[snapshotShot.id] = {
      shotId: snapshotShot.id,
      sequence: snapshotShot.sequence,
      generationId,
      status: 'processing',
    }
    waitingForGeneration = true
  }

  const summary = { modelId, shotGenerations }
  await persistVideoProgress(run.id, modelId, shotGenerations, deps)
  if (waitingForGeneration || Object.values(shotGenerations).some(progress => progress.status !== 'succeeded')) {
    return retryUntilGenerationCompletes(task, 'Director storyboard videos are still processing', 'DIRECTOR_VIDEOS')
  }
  return completePhase(run.id, summary, deps, JSON.stringify(summary))
}

async function persistVideoProgress(
  runId: string,
  modelId: string,
  shotGenerations: Record<string, DirectorVideoGenerationProgress>,
  deps: DirectorPhaseTaskHandlerDeps,
): Promise<void> {
  await deps.directorRepository?.setPhaseRunProgress({
    runId,
    outputSummary: { modelId, shotGenerations },
  })
}

function readVideoShotSnapshots(value: unknown): DirectorVideoShotSnapshot[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) return []
    const row = candidate as Record<string, unknown>
    if (
      typeof row.id !== 'string'
      || typeof row.sequence !== 'number'
      || typeof row.status !== 'string'
      || !Array.isArray(row.referenceAssetIds)
      || row.referenceAssetIds.some(referenceId => typeof referenceId !== 'string')
    ) return []
    return [{
      id: row.id,
      sequence: row.sequence,
      status: row.status,
      referenceAssetIds: row.referenceAssetIds as string[],
    }]
  })
}

function readContinuityShotInputs(value: unknown): DirectorContinuityShotInput[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(candidate => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || typeof candidate.sequence !== 'number' || typeof candidate.narrative !== 'string') return []
    return [{
      id: candidate.id,
      sequence: candidate.sequence,
      sceneNumber: typeof candidate.sceneNumber === 'number' ? candidate.sceneNumber : null,
      slugline: typeof candidate.slugline === 'string' ? candidate.slugline : null,
      narrative: candidate.narrative,
      camera: isRecord(candidate.camera) ? candidate.camera : {},
      durationSeconds: typeof candidate.durationSeconds === 'number' ? candidate.durationSeconds : null,
      environmentPrompt: typeof candidate.environmentPrompt === 'string' ? candidate.environmentPrompt : null,
      videoPrompt: typeof candidate.videoPrompt === 'string' ? candidate.videoPrompt : null,
      dialogue: candidate.dialogue === null || isRecord(candidate.dialogue) ? candidate.dialogue : null,
      continuity: candidate.continuity === null || isRecord(candidate.continuity) ? candidate.continuity : null,
    }]
  })
}

function readPromptRebuildShotInputs(value: unknown): DirectorPromptRebuildShotInput[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(candidate => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || typeof candidate.sequence !== 'number' || typeof candidate.narrative !== 'string') return []
    const referenceAssetIds = Array.isArray(candidate.referenceAssetIds)
      ? candidate.referenceAssetIds.filter((value): value is string => typeof value === 'string')
      : []
    return [{
      id: candidate.id,
      sequence: candidate.sequence,
      sceneNumber: typeof candidate.sceneNumber === 'number' ? candidate.sceneNumber : null,
      slugline: typeof candidate.slugline === 'string' ? candidate.slugline : null,
      narrative: candidate.narrative,
      camera: isRecord(candidate.camera) ? candidate.camera : {},
      durationSeconds: typeof candidate.durationSeconds === 'number' ? candidate.durationSeconds : null,
      environmentPrompt: typeof candidate.environmentPrompt === 'string' ? candidate.environmentPrompt : null,
      videoPrompt: typeof candidate.videoPrompt === 'string' ? candidate.videoPrompt : null,
      negativePrompt: typeof candidate.negativePrompt === 'string' ? candidate.negativePrompt : null,
      dialogue: candidate.dialogue === null || isRecord(candidate.dialogue) ? candidate.dialogue : null,
      continuity: candidate.continuity === null || isRecord(candidate.continuity) ? candidate.continuity : null,
      referenceAssetIds,
    }]
  })
}

function readDialogueShotInputs(value: unknown): DirectorDialogueShotInput[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(candidate => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || typeof candidate.sequence !== 'number' || typeof candidate.narrative !== 'string') return []
    return [{
      id: candidate.id,
      sequence: candidate.sequence,
      sceneNumber: typeof candidate.sceneNumber === 'number' ? candidate.sceneNumber : null,
      slugline: typeof candidate.slugline === 'string' ? candidate.slugline : null,
      narrative: candidate.narrative,
      dialogue: candidate.dialogue === null || isRecord(candidate.dialogue) ? candidate.dialogue : null,
      continuity: candidate.continuity === null || isRecord(candidate.continuity) ? candidate.continuity : null,
    }]
  })
}

function musicGenerationParams(input: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(typeof input.prompt === 'string' && input.prompt.trim().length > 0 ? { prompt: input.prompt.trim() } : {}),
    ...(typeof input.lyrics === 'string' && input.lyrics.trim().length > 0 ? { lyrics: input.lyrics.trim() } : {}),
    isInstrumental: input.isInstrumental === true,
    gender: input.gender === 'male' ? 'male' : 'female',
    format: input.format === 'wav' ? 'wav' : 'mp3',
    enableAigcWatermark: input.enableAigcWatermark === true,
    duration: typeof input.duration === 'number' && Number.isInteger(input.duration) && input.duration > 0 ? input.duration : 60,
  }
}

function staleRunError(status: string): TaskError {
  return {
    category: 'validation',
    message: `Director phase run is already ${status}`,
    retriable: false,
    code: 'DIRECTOR_PHASE_RUN_STALE',
  }
}

/**
 * 实体提取阶段：从剧本原文提取角色/场景/道具候选 + 逐字引用（mentions），
 * 服务端校验并计算 UTF-16 偏移后持久化为 provisional 候选。
 *
 * 不使用 runTextPhase 的原因：需要在 parse 与 complete 之间插入异步的
 * createEntityCandidates 持久化步骤，而 runTextPhase 的 buildCompletion 是同步的。
 */
async function processEntitiesPhase(
	run: DirectorPhaseRunForWorker,
	task: TaskRecord,
	deps: DirectorPhaseTaskHandlerDeps,
	modelId: string,
	userId: string,
	snapshot: RunInputSnapshot,
): Promise<TaskProcessOutcome> {
	const generationId = stringInput(run.outputSummary ?? {}, 'generationId')
	if (generationId === undefined) {
		try {
			const generation = await deps.repository.createGeneration({
				userId,
				modelId,
				params: {
					prompt: entityExtractionPrompt(snapshot),
					maxTokens: 4_096,
					temperature: 0.3,
					topP: 0.8,
				},
				idempotencyKey: `director:${run.id}:entities`,
				traceId: task.traceId,
				...(deps.generationQuota === undefined ? {} : { quota: deps.generationQuota }),
			})
			await deps.directorRepository?.setPhaseRunProgress({
				runId: run.id,
				outputSummary: { generationId: generation.record.id, modelId },
			})
			return retryUntilGenerationCompletes(task, 'Director entity extraction generation is queued', 'DIRECTOR_ENTITIES')
		}
		catch (error) {
			return failPhase(run.id, {
				category: 'validation',
				message: error instanceof Error ? error.message : String(error),
				retriable: false,
				code: 'DIRECTOR_ENTITIES_GENERATION_CREATE_FAILED',
			}, deps)
		}
	}

	const generation = await deps.repository.getGenerationRecord(generationId)
	if (generation === undefined) {
		return failPhase(run.id, {
			category: 'validation',
			message: `Entity extraction generation record not found: ${generationId}`,
			retriable: false,
			code: 'DIRECTOR_ENTITIES_GENERATION_NOT_FOUND',
		}, deps)
	}
	if (generation.status === 'succeeded') {
		const outputText = readTextOutput(generation.outputResult)
		if (outputText === undefined) {
			return failPhase(run.id, {
				category: 'provider',
				message: 'Entity extraction generation completed without text output',
				retriable: false,
				code: 'DIRECTOR_ENTITIES_OUTPUT_MISSING',
			}, deps)
		}

		// 核心步骤：解析 + 校验 mentions（服务端 UTF-16 偏移）+ 持久化候选
		const candidates = parseEntityExtractionOutput(outputText, snapshot.storyText)
		if (candidates === undefined) {
			return failPhase(run.id, {
				category: 'provider',
				message: 'Entity extraction returned text that does not match the entity JSON contract',
				retriable: false,
				code: 'DIRECTOR_ENTITIES_OUTPUT_INVALID',
			}, deps)
		}

		// 持久化为 provisional 候选（用户在前端审核）
		const persisted = await deps.directorRepository?.createEntityCandidates({
			userId,
			projectId: run.projectId,
			sourceRunId: run.id,
			candidates,
		})

		const summary = {
			generationId,
			modelId,
			entityCount: candidates.length,
			persistedCount: persisted?.length ?? 0,
			kindCounts: {
				character: candidates.filter(c => c.kind === 'character').length,
				scene: candidates.filter(c => c.kind === 'scene').length,
				prop: candidates.filter(c => c.kind === 'prop').length,
			},
		}
		return completePhase(run.id, summary, deps, JSON.stringify(summary))
	}
	if (generation.status === 'failed' || generation.status === 'cancelled') {
		return failPhase(run.id, {
			category: 'provider',
			message: generation.errorJson?.message === undefined
				? `Entity extraction generation ${generation.status}`
				: String(generation.errorJson.message),
			retriable: false,
			code: 'DIRECTOR_ENTITIES_GENERATION_FAILED',
		}, deps)
	}

	return retryUntilGenerationCompletes(task, `Entity extraction generation is ${generation.status}`, 'DIRECTOR_ENTITIES')
}
