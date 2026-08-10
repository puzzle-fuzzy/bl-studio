import type { DirectorPhaseRunForWorker, DirectorRepository } from '@bailian-studio/director-repository'
import type { GenerationRepository } from '@bailian-studio/generation-repository'
import { DirectorAnalysisResultSchema, DirectorCharactersResultSchema, DirectorLocationsResultSchema, type DirectorAnalysisResult, type DirectorCharactersResult, type DirectorLocationsResult, type Logger } from '@bailian-studio/shared'
import { nextRunAt } from '@bailian-studio/task-engine'
import type { TaskError, TaskRecord } from '@bailian-studio/task-engine'
import { parseDirectorAnalysisOutput } from './director-analysis'
import { parseDirectorCharactersOutput } from './director-characters'
import { parseDirectorLocationsOutput } from './director-locations'
import { parseDirectorStoryboardOutput } from './director-storyboard'
import { buildDirectorVideoGenerationInput, DirectorVideoInputError, parseDirectorVideoRunSummary, type DirectorVideoGenerationProgress, type DirectorVideoShotSnapshot } from './director-video'
import type { ModelRegistryLookup, TaskProcessOutcome } from './task-contracts'

const MAX_ANALYSIS_STORY_LENGTH = 9_000
const PHASE_POLL_DELAY_MS = 5_000

export interface DirectorPhaseTaskHandlerDeps {
  readonly repository: GenerationRepository
  readonly directorRepository?: DirectorRepository
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
          prompt: analysisPrompt(snapshot.title, snapshot.synopsis, snapshot.storyText),
          maxTokens: 4_096,
          temperature: 0.4,
          topP: 0.8,
        },
        idempotencyKey: `director:${run.id}:analysis`,
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
    const locations = parseDirectorLocationsOutput(locationsText)
    if (locations === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Location generation returned text that does not match the Director location contract',
        retriable: false,
        code: 'DIRECTOR_LOCATIONS_OUTPUT_INVALID',
      }, deps)
    }
    return completePhase(run.id, { generationId, modelId, locationsText, locations }, deps, locationsText)
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

interface RunInputSnapshot {
  title: string
  synopsis: string | null
  storyText: string
  analysis: unknown
  characters: unknown
  locations: unknown
  shots: unknown
}

function runInputSnapshot(run: DirectorPhaseRunForWorker): RunInputSnapshot {
  const snapshot = run.inputSnapshot
  return {
    title: stringInput(snapshot, 'title') ?? 'Untitled screenplay',
    synopsis: typeof snapshot['synopsis'] === 'string' ? snapshot['synopsis'] : null,
    storyText: stringInput(snapshot, 'storyText') ?? '',
    analysis: snapshot['analysis'],
    characters: snapshot['characters'],
    locations: snapshot['locations'],
    shots: snapshot['shots'],
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
  return failed(error)
}

function failed(error: TaskError): TaskProcessOutcome {
  return { status: 'failed', error }
}

function stringInput(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function staleRunError(status: string): TaskError {
  return {
    category: 'validation',
    message: `Director phase run is already ${status}`,
    retriable: false,
    code: 'DIRECTOR_PHASE_RUN_STALE',
  }
}
