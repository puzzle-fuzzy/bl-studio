import type { DirectorPhaseRunForWorker, DirectorRepository } from '@bailian-studio/director-repository'
import type { GenerationRepository } from '@bailian-studio/generation-repository'
import type { MediaRepository } from '@bailian-studio/media-repository'
import { getBailianOperationCapability, validateModelParams } from '@bailian-studio/model-core'
import { DirectorAnalysisResultSchema, DirectorAssemblyPlanSchema, DirectorCharactersResultSchema, DirectorLocationsResultSchema, type DirectorAnalysisResult, type DirectorCharactersResult, type DirectorLocationsResult, type Logger } from '@bailian-studio/shared'
import { nextRunAt } from '@bailian-studio/task-engine'
import type { TaskError, TaskRecord } from '@bailian-studio/task-engine'
import { parseDirectorAnalysisOutput, parseDirectorScriptChatOutputDetailed } from './director-analysis'
import { parseDirectorCharactersOutput } from './director-characters'
import { parseDirectorLocationsOutputDetailed } from './director-locations'
import { parseDirectorStoryboardOutput } from './director-storyboard'
import { continuityPrompt, parseDirectorContinuityOutput, type DirectorContinuityShotInput } from './director-continuity'
import { parseDirectorPromptRebuildOutput, promptRebuildPrompt, type DirectorPromptRebuildShotInput } from './director-prompts'
import { dialoguePrompt, parseDirectorDialogueOutput, type DirectorDialogueShotInput } from './director-dialogue'
import { buildDirectorVideoGenerationInput, DirectorVideoInputError, parseDirectorVideoRunSummary, type DirectorVideoGenerationProgress, type DirectorVideoShotSnapshot } from './director-video'
import type { ModelRegistryLookup, TaskProcessOutcome } from './task-contracts'

const MAX_ANALYSIS_STORY_LENGTH = 30_000
const PHASE_POLL_DELAY_MS = 5_000

export interface DirectorPhaseTaskHandlerDeps {
  readonly repository: GenerationRepository
  readonly directorRepository?: DirectorRepository
  readonly mediaRepository?: MediaRepository
  readonly modelRegistry: ModelRegistryLookup
  readonly logger: Logger
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

  const generationId = stringInput(run.outputSummary ?? {}, 'generationId')
  if (generationId === undefined) {
    try {
      const generation = await deps.repository.createGeneration({
        userId,
        modelId,
        params: {
          prompt: charactersPrompt(snapshot, analysisResult.data),
          maxTokens: 4_096,
          temperature: 0.4,
          topP: 0.8,
        },
        idempotencyKey: `director:${run.id}:characters`,
        traceId: task.traceId,
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
      return retryUntilGenerationCompletes(task, 'Director character generation is queued', 'DIRECTOR_CHARACTERS')
    } catch (error) {
      return failPhase(run.id, {
        category: 'validation',
        message: error instanceof Error ? error.message : String(error),
        retriable: false,
        code: 'DIRECTOR_CHARACTERS_GENERATION_CREATE_FAILED',
      }, deps)
    }
  }

  const generation = await deps.repository.getGenerationRecord(generationId)
  if (generation === undefined) {
    return failPhase(run.id, {
      category: 'validation',
      message: `Character generation record not found: ${generationId}`,
      retriable: false,
      code: 'DIRECTOR_CHARACTERS_GENERATION_NOT_FOUND',
    }, deps)
  }
  if (generation.status === 'succeeded') {
    const charactersText = readTextOutput(generation.outputResult)
    if (charactersText === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Character generation completed without text output',
        retriable: false,
        code: 'DIRECTOR_CHARACTERS_OUTPUT_MISSING',
      }, deps)
    }
    const characters = parseDirectorCharactersOutput(charactersText)
    if (characters === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Character generation returned text that does not match the Director character contract',
        retriable: false,
        code: 'DIRECTOR_CHARACTERS_OUTPUT_INVALID',
      }, deps)
    }
    return completePhase(run.id, { generationId, modelId, charactersText, characters }, deps, charactersText)
  }
  if (generation.status === 'failed' || generation.status === 'cancelled') {
    return failPhase(run.id, {
      category: 'provider',
      message: generation.errorJson?.message === undefined
        ? `Character generation ${generation.status}`
        : String(generation.errorJson.message),
      retriable: false,
      code: 'DIRECTOR_CHARACTERS_GENERATION_FAILED',
    }, deps)
  }

  return retryUntilGenerationCompletes(task, `Character generation is ${generation.status}`, 'DIRECTOR_CHARACTERS')
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

  const generationId = stringInput(run.outputSummary ?? {}, 'generationId')
  if (generationId === undefined) {
    try {
      const generation = await deps.repository.createGeneration({
        userId,
        modelId,
        params: {
          prompt: locationsPrompt(snapshot, charactersResult.data),
          maxTokens: 4_096,
          temperature: 0.4,
          topP: 0.8,
        },
        idempotencyKey: `director:${run.id}:locations`,
        traceId: task.traceId,
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
      return retryUntilGenerationCompletes(task, 'Director location generation is queued', 'DIRECTOR_LOCATIONS')
    } catch (error) {
      return failPhase(run.id, {
        category: 'validation',
        message: error instanceof Error ? error.message : String(error),
        retriable: false,
        code: 'DIRECTOR_LOCATIONS_GENERATION_CREATE_FAILED',
      }, deps)
    }
  }

  const generation = await deps.repository.getGenerationRecord(generationId)
  if (generation === undefined) {
    return failPhase(run.id, {
      category: 'validation',
      message: `Location generation record not found: ${generationId}`,
      retriable: false,
      code: 'DIRECTOR_LOCATIONS_GENERATION_NOT_FOUND',
    }, deps)
  }
  if (generation.status === 'succeeded') {
    const locationsText = readTextOutput(generation.outputResult)
    if (locationsText === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Location generation completed without text output',
        retriable: false,
        code: 'DIRECTOR_LOCATIONS_OUTPUT_MISSING',
      }, deps)
    }
    const parsedLocations = parseDirectorLocationsOutputDetailed(locationsText)
    if (parsedLocations.locations === undefined) {
      deps.logger.error('director.locations.output_invalid', {
        taskId: task.id,
        traceId: task.traceId,
        phaseRunId: run.id,
        projectId: run.projectId,
        generationId,
        outputLength: locationsText.length,
        parseMode: parsedLocations.mode,
      })
      return failPhase(run.id, {
        category: 'provider',
        message: 'Location generation returned text that does not match the Director location contract',
        retriable: false,
        code: 'DIRECTOR_LOCATIONS_OUTPUT_INVALID',
      }, deps)
    }
    if (parsedLocations.mode === 'repaired-json') {
      deps.logger.warn('director.locations.output_repaired', {
        taskId: task.id,
        traceId: task.traceId,
        phaseRunId: run.id,
        projectId: run.projectId,
        generationId,
        outputLength: locationsText.length,
      })
    }
    return completePhase(run.id, { generationId, modelId, locationsText, locations: parsedLocations.locations }, deps, locationsText)
  }
  if (generation.status === 'failed' || generation.status === 'cancelled') {
    return failPhase(run.id, {
      category: 'provider',
      message: generation.errorJson?.message === undefined
        ? `Location generation ${generation.status}`
        : String(generation.errorJson.message),
      retriable: false,
      code: 'DIRECTOR_LOCATIONS_GENERATION_FAILED',
    }, deps)
  }

  return retryUntilGenerationCompletes(task, `Location generation is ${generation.status}`, 'DIRECTOR_LOCATIONS')
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

  const generationId = stringInput(run.outputSummary ?? {}, 'generationId')
  if (generationId === undefined) {
    try {
      const generation = await deps.repository.createGeneration({
        userId,
        modelId,
        params: {
          prompt: storyboardPrompt(snapshot, analysisResult.data, charactersResult.data, locationsResult.data),
          maxTokens: 8_192,
          temperature: 0.4,
          topP: 0.8,
        },
        idempotencyKey: `director:${run.id}:storyboard`,
        traceId: task.traceId,
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
      return retryUntilGenerationCompletes(task, 'Director storyboard generation is queued', 'DIRECTOR_STORYBOARD')
    } catch (error) {
      return failPhase(run.id, {
        category: 'validation',
        message: error instanceof Error ? error.message : String(error),
        retriable: false,
        code: 'DIRECTOR_STORYBOARD_GENERATION_CREATE_FAILED',
      }, deps)
    }
  }

  const generation = await deps.repository.getGenerationRecord(generationId)
  if (generation === undefined) {
    return failPhase(run.id, {
      category: 'validation',
      message: `Storyboard generation record not found: ${generationId}`,
      retriable: false,
      code: 'DIRECTOR_STORYBOARD_GENERATION_NOT_FOUND',
    }, deps)
  }
  if (generation.status === 'succeeded') {
    const storyboardText = readTextOutput(generation.outputResult)
    if (storyboardText === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Storyboard generation completed without text output',
        retriable: false,
        code: 'DIRECTOR_STORYBOARD_OUTPUT_MISSING',
      }, deps)
    }
    const storyboard = parseDirectorStoryboardOutput(storyboardText)
    if (storyboard === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Storyboard generation returned text that does not match the Director storyboard contract',
        retriable: false,
        code: 'DIRECTOR_STORYBOARD_OUTPUT_INVALID',
      }, deps)
    }
    return completePhase(run.id, { generationId, modelId, storyboardText, storyboard }, deps, storyboardText)
  }
  if (generation.status === 'failed' || generation.status === 'cancelled') {
    return failPhase(run.id, {
      category: 'provider',
      message: generation.errorJson?.message === undefined
        ? `Storyboard generation ${generation.status}`
        : String(generation.errorJson.message),
      retriable: false,
      code: 'DIRECTOR_STORYBOARD_GENERATION_FAILED',
    }, deps)
  }

  return retryUntilGenerationCompletes(task, `Storyboard generation is ${generation.status}`, 'DIRECTOR_STORYBOARD')
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

  const generationId = stringInput(run.outputSummary ?? {}, 'generationId')
  if (generationId === undefined) {
    try {
      const generation = await deps.repository.createGeneration({
        userId,
        modelId,
        params: {
          prompt: continuityPrompt(snapshot.title, snapshot.synopsis, shots),
          maxTokens: 4_096,
          temperature: 0.2,
          topP: 0.8,
        },
        idempotencyKey: `director:${run.id}:continuity`,
        traceId: task.traceId,
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
      return retryUntilGenerationCompletes(task, 'Director continuity generation is queued', 'DIRECTOR_CONTINUITY')
    } catch (error) {
      return failPhase(run.id, {
        category: 'validation',
        message: error instanceof Error ? error.message : String(error),
        retriable: false,
        code: 'DIRECTOR_CONTINUITY_GENERATION_CREATE_FAILED',
      }, deps)
    }
  }

  const generation = await deps.repository.getGenerationRecord(generationId)
  if (generation === undefined) {
    return failPhase(run.id, {
      category: 'validation',
      message: `Continuity generation record not found: ${generationId}`,
      retriable: false,
      code: 'DIRECTOR_CONTINUITY_GENERATION_NOT_FOUND',
    }, deps)
  }
  if (generation.status === 'succeeded') {
    const continuityText = readTextOutput(generation.outputResult)
    if (continuityText === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Continuity generation completed without text output',
        retriable: false,
        code: 'DIRECTOR_CONTINUITY_OUTPUT_MISSING',
      }, deps)
    }
    const continuity = parseDirectorContinuityOutput(continuityText)
    if (continuity === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Continuity generation returned text that does not match the Director continuity contract',
        retriable: false,
        code: 'DIRECTOR_CONTINUITY_OUTPUT_INVALID',
      }, deps)
    }
    const shotSequences = new Map(shots.map(shot => [shot.id, shot.sequence]))
    if (continuity.issues.some(issue => shotSequences.get(issue.shotId) !== issue.sequence)) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Continuity output referenced an unknown storyboard shot or mismatched its sequence',
        retriable: false,
        code: 'DIRECTOR_CONTINUITY_OUTPUT_SCOPE_INVALID',
      }, deps)
    }
    return completePhase(run.id, { generationId, modelId, continuityText, continuity }, deps, continuityText)
  }
  if (generation.status === 'failed' || generation.status === 'cancelled') {
    return failPhase(run.id, {
      category: 'provider',
      message: generation.errorJson?.message === undefined
        ? `Continuity generation ${generation.status}`
        : String(generation.errorJson.message),
      retriable: false,
      code: 'DIRECTOR_CONTINUITY_GENERATION_FAILED',
    }, deps)
  }

  return retryUntilGenerationCompletes(task, `Continuity generation is ${generation.status}`, 'DIRECTOR_CONTINUITY')
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

  const generationId = stringInput(run.outputSummary ?? {}, 'generationId')
  if (generationId === undefined) {
    try {
      const generation = await deps.repository.createGeneration({
        userId,
        modelId,
        params: {
          prompt: promptRebuildPrompt(snapshot.title, snapshot.synopsis, shots, snapshot.continuity),
          maxTokens: 8_192,
          temperature: 0.3,
          topP: 0.8,
        },
        idempotencyKey: `director:${run.id}:rebuild`,
        traceId: task.traceId,
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
      return retryUntilGenerationCompletes(task, 'Director prompt rebuild generation is queued', 'DIRECTOR_PROMPT_REBUILD')
    } catch (error) {
      return failPhase(run.id, {
        category: 'validation',
        message: error instanceof Error ? error.message : String(error),
        retriable: false,
        code: 'DIRECTOR_PROMPT_REBUILD_GENERATION_CREATE_FAILED',
      }, deps)
    }
  }

  const generation = await deps.repository.getGenerationRecord(generationId)
  if (generation === undefined) {
    return failPhase(run.id, {
      category: 'validation',
      message: `Prompt rebuild generation record not found: ${generationId}`,
      retriable: false,
      code: 'DIRECTOR_PROMPT_REBUILD_GENERATION_NOT_FOUND',
    }, deps)
  }
  if (generation.status === 'succeeded') {
    const promptRebuildText = readTextOutput(generation.outputResult)
    if (promptRebuildText === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Prompt rebuild generation completed without text output',
        retriable: false,
        code: 'DIRECTOR_PROMPT_REBUILD_OUTPUT_MISSING',
      }, deps)
    }
    const promptRebuild = parseDirectorPromptRebuildOutput(promptRebuildText)
    if (promptRebuild === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Prompt rebuild generation returned text that does not match the Director prompt contract',
        retriable: false,
        code: 'DIRECTOR_PROMPT_REBUILD_OUTPUT_INVALID',
      }, deps)
    }
    const shotSequences = new Map(shots.map(shot => [shot.id, shot.sequence]))
    if (promptRebuild.shots.some(shot => shotSequences.get(shot.shotId) !== shot.sequence)) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Prompt rebuild output referenced an unknown storyboard shot or mismatched its sequence',
        retriable: false,
        code: 'DIRECTOR_PROMPT_REBUILD_OUTPUT_SCOPE_INVALID',
      }, deps)
    }
    return completePhase(run.id, { generationId, modelId, promptRebuildText, promptRebuild }, deps, promptRebuildText)
  }
  if (generation.status === 'failed' || generation.status === 'cancelled') {
    return failPhase(run.id, {
      category: 'provider',
      message: generation.errorJson?.message === undefined
        ? `Prompt rebuild generation ${generation.status}`
        : String(generation.errorJson.message),
      retriable: false,
      code: 'DIRECTOR_PROMPT_REBUILD_GENERATION_FAILED',
    }, deps)
  }

  return retryUntilGenerationCompletes(task, `Prompt rebuild generation is ${generation.status}`, 'DIRECTOR_PROMPT_REBUILD')
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

  const generationId = stringInput(run.outputSummary ?? {}, 'generationId')
  if (generationId === undefined) {
    try {
      const generation = await deps.repository.createGeneration({
        userId,
        modelId,
        params: {
          prompt: dialoguePrompt(snapshot.title, snapshot.synopsis, shots),
          maxTokens: 8_192,
          temperature: 0.3,
          topP: 0.8,
        },
        idempotencyKey: `director:${run.id}:dialogue`,
        traceId: task.traceId,
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
      return retryUntilGenerationCompletes(task, 'Director dialogue generation is queued', 'DIRECTOR_DIALOGUE')
    } catch (error) {
      return failPhase(run.id, {
        category: 'validation',
        message: error instanceof Error ? error.message : String(error),
        retriable: false,
        code: 'DIRECTOR_DIALOGUE_GENERATION_CREATE_FAILED',
      }, deps)
    }
  }

  const generation = await deps.repository.getGenerationRecord(generationId)
  if (generation === undefined) {
    return failPhase(run.id, {
      category: 'validation',
      message: `Dialogue generation record not found: ${generationId}`,
      retriable: false,
      code: 'DIRECTOR_DIALOGUE_GENERATION_NOT_FOUND',
    }, deps)
  }
  if (generation.status === 'succeeded') {
    const dialogueText = readTextOutput(generation.outputResult)
    if (dialogueText === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Dialogue generation completed without text output',
        retriable: false,
        code: 'DIRECTOR_DIALOGUE_OUTPUT_MISSING',
      }, deps)
    }
    const dialogue = parseDirectorDialogueOutput(dialogueText)
    if (dialogue === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Dialogue generation returned text that does not match the Director dialogue contract',
        retriable: false,
        code: 'DIRECTOR_DIALOGUE_OUTPUT_INVALID',
      }, deps)
    }
    const shotSequences = new Map(shots.map(shot => [shot.id, shot.sequence]))
    if (dialogue.shots.some(shot => shotSequences.get(shot.shotId) !== shot.sequence)) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Dialogue output referenced an unknown storyboard shot or mismatched its sequence',
        retriable: false,
        code: 'DIRECTOR_DIALOGUE_OUTPUT_SCOPE_INVALID',
      }, deps)
    }
    return completePhase(run.id, { generationId, modelId, dialogueText, dialogue }, deps, dialogueText)
  }
  if (generation.status === 'failed' || generation.status === 'cancelled') {
    return failPhase(run.id, {
      category: 'provider',
      message: generation.errorJson?.message === undefined
        ? `Dialogue generation ${generation.status}`
        : String(generation.errorJson.message),
      retriable: false,
      code: 'DIRECTOR_DIALOGUE_GENERATION_FAILED',
    }, deps)
  }

  return retryUntilGenerationCompletes(task, `Dialogue generation is ${generation.status}`, 'DIRECTOR_DIALOGUE')
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

interface RunInputSnapshot {
  title: string
  synopsis: string | null
  storyText: string
  chatMessage?: string
  chatHistory?: Array<{ role: string; content: string }>
  analysis: unknown
  characters: unknown
  locations: unknown
  shots: unknown
  continuity: unknown
  music: unknown
  assembly: unknown
}

function runInputSnapshot(run: DirectorPhaseRunForWorker): RunInputSnapshot {
  const snapshot = run.inputSnapshot
  return {
    title: stringInput(snapshot, 'title') ?? 'Untitled screenplay',
    synopsis: typeof snapshot['synopsis'] === 'string' ? snapshot['synopsis'] : null,
    storyText: stringInput(snapshot, 'storyText') ?? '',
    chatMessage: typeof snapshot['chatMessage'] === 'string' ? snapshot['chatMessage'] : undefined,
    chatHistory: Array.isArray(snapshot['chatHistory'])
      ? snapshot['chatHistory'].filter((entry): entry is { role: string; content: string } => (
        typeof entry === 'object'
        && entry !== null
        && typeof (entry as Record<string, unknown>).role === 'string'
        && typeof (entry as Record<string, unknown>).content === 'string'
      ))
      : undefined,
    analysis: snapshot['analysis'],
    characters: snapshot['characters'],
    locations: snapshot['locations'],
    shots: snapshot['shots'],
    continuity: snapshot['continuity'],
    music: snapshot['music'],
    assembly: snapshot['assembly'],
  }
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

function analysisPrompt(title: string, synopsis: string | null, storyText: string): string {
  return [
    '你是一名专业短剧编剧与导演顾问。请分析下面的剧本。',
    '只返回一个 JSON 对象，不要 Markdown、代码围栏、解释文字或额外字段。',
    'JSON 必须符合以下结构：',
    '{"summary":"一句话梗概","theme":"主题","audience":"受众","structure":[{"name":"结构段落","purpose":"作用","beats":["关键节拍"]}],"characters":[{"name":"角色名","role":"角色功能","description":"角色描述","traits":["特质"]}],"locations":[{"name":"场景名","description":"场景描述","atmosphere":"氛围"}],"continuityRisks":["连续性风险"],"visualMotifs":["视觉母题"]}',
    '不要编造原文没有的关键事实；如果信息不足，使用空数组或明确写出不确定性。',
    `项目：${title}`,
    synopsis === null ? '' : `简介：${synopsis}`,
    `剧本：\n${storyText}`,
  ].filter(Boolean).join('\n\n')
}

function scriptChatPrompt(snapshot: RunInputSnapshot, message: string): string {
  const contractReminder = 'analysis must use only structure.name/purpose/beats, characters.name/role/description/traits, and locations.name/description/atmosphere; do not use scene, function, keyProps, or details aliases.'
  message = `${contractReminder}\n\n${message}`
  const history = snapshot.chatHistory?.map(entry => `${entry.role === 'user' ? '用户' : '编剧'}：${entry.content}`).join('\n') ?? '暂无历史对话'
  return [
    '你是一名专业短剧编剧、剧本医生和导演台编辑。用户正在通过聊天修改一部短剧。',
    '请根据用户本次要求，直接修改当前剧本，并返回一个 JSON 对象，不要返回 Markdown、代码围栏或 JSON 以外的解释。',
    'screenplay 必须是修改后的完整标准剧本全文，不是 diff，不是提纲，不是修改建议。即使用户只修改一个细节，也必须保留未修改部分。',
    '标准剧本至少应包含：片名、人物表、场次编号、内/外景与地点、时间、动作描述、角色名、情绪/表演提示和对白。场次使用清晰的场景标题，例如“1. 内景｜出租屋｜夜”。',
    '不要臆造用户没有提供的关键事实；信息不足时保留原内容或使用中性表达。对话中的修改优先于旧剧本，但不能破坏已经建立的故事因果、人物关系和场景连续性。',
    'analysis 必须严格符合现有剧本分析结构，供后续角色、场景和分镜阶段使用。reply 是给用户看的简短说明，changes 是本次实际修改点。',
    '{"reply":"已完成本次修改","screenplay":"完整标准剧本","synopsis":"一句话简介或 null","analysis":{"summary":"","theme":"","audience":"","structure":[],"characters":[],"locations":[],"continuityRisks":[],"visualMotifs":[]},"changes":["修改点"]}',
    `项目：${snapshot.title}`,
    snapshot.synopsis === null ? '' : `当前简介：${snapshot.synopsis}`,
    `历史对话：\n${history}`,
    `当前剧本：\n${snapshot.storyText || '（当前还没有剧本，请根据用户要求从零开始创作标准剧本）'}`,
    `用户本次要求：\n${message}`,
  ].filter(Boolean).join('\n\n')
}

function charactersPrompt(snapshot: RunInputSnapshot, analysis: DirectorAnalysisResult): string {
  return [
    '你是一名专业短剧编剧、导演和人物统筹顾问。请基于已确认的剧本分析，生成可供后续视觉资产和分镜阶段使用的角色卡。',
    '只返回一个 JSON 对象，不要 Markdown、代码围栏、解释文字或额外字段。',
    'JSON 必须符合以下结构：',
    '{"characters":[{"name":"角色名","role":"角色功能","description":"外在身份与核心设定","traits":["特质"],"goal":"当前目标","conflict":"核心冲突","arc":"角色弧线","visualSignature":"可用于视觉统一的外观特征"}],"relationshipNotes":["角色关系与戏剧张力"]}',
    '只使用剧本和分析中能够得到的事实；无法确认时要明确写出不确定性，不要凭空增加关键背景。',
    `项目：${snapshot.title}`,
    snapshot.synopsis === null ? '' : `简介：${snapshot.synopsis}`,
    `已确认的剧本分析：\n${JSON.stringify(analysis)}`,
    `剧本原文：\n${snapshot.storyText}`,
  ].filter(Boolean).join('\n\n')
}

function locationsPrompt(snapshot: RunInputSnapshot, characters: DirectorCharactersResult): string {
  return [
    '你是一名专业短剧导演、场景设计和连续性统筹顾问。请基于角色卡与剧本原文，生成可供参考资产、分镜和视频提示词复用的场景卡。',
    '只返回一个 JSON 对象，不要 Markdown、代码围栏、解释文字或额外字段。',
    'JSON 必须符合以下结构：',
    '{"locations":[{"name":"场景名","description":"空间与叙事设定","atmosphere":"氛围","narrativeFunction":"场景在故事中的作用","timeOfDay":"时间","visualAnchors":["视觉锚点"],"continuityNotes":["连续性约束"]}],"continuityNotes":["跨场景连续性说明"]}',
    '只使用剧本原文和角色卡中能够得到的事实；不要虚构关键地点或事件。',
    `项目：${snapshot.title}`,
    snapshot.synopsis === null ? '' : `简介：${snapshot.synopsis}`,
    `角色卡：\n${JSON.stringify(characters)}`,
    `剧本原文：\n${snapshot.storyText}`,
  ].filter(Boolean).join('\n\n')
}

function storyboardPrompt(
  snapshot: RunInputSnapshot,
  analysis: DirectorAnalysisResult,
  characters: DirectorCharactersResult,
  locations: DirectorLocationsResult,
): string {
  return [
    '你是一名专业短剧导演、分镜师和连续性统筹。请基于已经确认的剧本分析、角色卡和场景卡，生成可供人工审核的分镜草稿。',
    '只返回一个 JSON 对象，不要 Markdown、代码围栏、解释文字或额外字段。',
    '每个 shot 必须是一个可独立审核的镜头，按 sequence 从 1 开始连续编号。不要自动生成视频，不要把图片资产 ID 编造进结果。',
    'JSON 必须符合以下结构：',
    '{"shots":[{"sequence":1,"sceneNumber":1,"slugline":"INT. 场景 - 时间","narrative":"镜头内发生的动作","camera":{"shotSize":"景别","angle":"机位","movement":"运动","lens":"镜头","composition":"构图"},"durationSeconds":5,"environmentPrompt":"环境画面提示词","videoPrompt":"动作与镜头运动提示词","negativePrompt":"负面提示词","dialogue":[{"speaker":"角色名","text":"对白","delivery":"语气"}],"referenceKeys":["角色名或场景名"],"continuity":{"前镜头衔接":"约束"}}]}',
    'sceneNumber、slugline、durationSeconds 可以为 null；没有对白时 dialogue 使用空数组。referenceKeys 只能填写已确认角色卡或场景卡的名称。',
    '只使用输入中能够得到的事实；无法确认时保持克制，不要增加关键人物、地点或事件。',
    `项目：${snapshot.title}`,
    snapshot.synopsis === null ? '' : `简介：${snapshot.synopsis}`,
    `剧本分析：\n${JSON.stringify(analysis)}`,
    `角色卡：\n${JSON.stringify(characters)}`,
    `场景卡：\n${JSON.stringify(locations)}`,
    `剧本原文：\n${snapshot.storyText}`,
  ].filter(Boolean).join('\n\n')
}

function readTextOutput(output: Record<string, unknown> | undefined): string | undefined {
  const artifacts = output?.['artifacts']
  if (!Array.isArray(artifacts)) return undefined
  for (const artifact of artifacts) {
    if (typeof artifact !== 'object' || artifact === null) continue
    const text = (artifact as { text?: unknown }).text
    if (typeof text === 'string' && text.trim().length > 0) return text
  }
  return undefined
}

function retryUntilGenerationCompletes(task: TaskRecord, message: string, codePrefix = 'DIRECTOR_ANALYSIS'): TaskProcessOutcome {
  if (task.attempts >= task.maxAttempts) {
    return failed({ category: 'timeout', message: `${message}; retry limit reached`, retriable: false, code: `${codePrefix}_RETRY_LIMIT` })
  }
  return {
    status: 'retry',
    nextRunAt: nextRunAt(new Date(Date.now() + PHASE_POLL_DELAY_MS).toISOString(), task.attempts),
    error: { category: 'network', message, retriable: true, code: `${codePrefix}_WAITING` },
  }
}

async function completePhase(
  runId: string,
  outputSummary: Record<string, unknown>,
  deps: DirectorPhaseTaskHandlerDeps,
  outputText: string,
): Promise<TaskProcessOutcome> {
  const completed = await deps.directorRepository?.completePhaseRun({ runId, outputSummary })
  if (completed === undefined) {
    return failed({
      category: 'system',
      message: `Director phase run could not be completed: ${runId}`,
      retriable: false,
      code: 'DIRECTOR_PHASE_COMPLETE_FAILED',
    })
  }
  deps.logger.info('director.phase.succeeded', {
    phaseRunId: runId,
    outputKeys: Object.keys(outputSummary).sort(),
  })
  return { status: 'succeeded', output: { artifacts: [{ kind: 'text', text: outputText }] } }
}

async function failPhase(
  runId: string,
  error: TaskError,
  deps: DirectorPhaseTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  await deps.directorRepository?.failPhaseRun({
    runId,
    error: {
      code: error.code ?? 'DIRECTOR_PHASE_FAILED',
      message: error.message,
      ...(error.retriable === undefined ? {} : { retriable: error.retriable }),
    },
  })
  deps.logger.error('director.phase.failed', {
    phaseRunId: runId,
    category: error.category,
    code: error.code,
    retriable: error.retriable,
    errorMessage: error.message,
  })
  return failed(error)
}

function failed(error: TaskError): TaskProcessOutcome {
  return { status: 'failed', error }
}

function stringInput(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function staleRunError(status: string): TaskError {
  return {
    category: 'validation',
    message: `Director phase run is already ${status}`,
    retriable: false,
    code: 'DIRECTOR_PHASE_RUN_STALE',
  }
}
