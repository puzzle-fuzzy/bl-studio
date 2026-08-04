import type {
  CompleteMediaJobInput,
  CreateMediaJobInput,
  CreateMediaJobResult,
  FailMediaJobInput,
  GetMediaJobInput,
  MediaJob,
  MediaRepository,
  MediaSource,
} from '@bailian-studio/media-repository'
import type { TaskRecord } from '@bailian-studio/task-engine'
import type {
  ExtractAudioInput,
  ExtractAudioOutput,
  GenerateThumbnailInput,
  GenerateThumbnailOutput,
  MediaProcessor,
} from '../src/media-processor'
import { NOW, makeTask } from './fixtures'

export class FakeMediaRepository implements MediaRepository {
  job: MediaJob = makeMediaJob()
  readonly processingJobIds: string[] = []
  readonly completed: CompleteMediaJobInput[] = []
  readonly failed: FailMediaJobInput[] = []
  completeError: Error | null = null
  source: MediaSource = {
    storageProvider: 'local',
    storageKey: 'user_uploads/user_1/video.mp4',
    fileName: 'video.mp4',
    mimeType: 'video/mp4',
    byteSize: 10,
  }

  createMediaJob(_input: CreateMediaJobInput): Promise<CreateMediaJobResult> {
    return Promise.reject(new Error('FakeMediaRepository.createMediaJob is not used'))
  }

  getMediaJob(_input: GetMediaJobInput): Promise<MediaJob | undefined> {
    return Promise.resolve(this.job)
  }

  getMediaJobById(jobId: string): Promise<MediaJob | undefined> {
    return Promise.resolve(jobId === this.job.id ? this.job : undefined)
  }

  getMediaSource(jobId: string): Promise<MediaSource | undefined> {
    return Promise.resolve(jobId === this.job.id ? this.source : undefined)
  }

  markMediaJobProcessing(jobId: string): Promise<MediaJob> {
    this.processingJobIds.push(jobId)
    return Promise.resolve({ ...this.job, status: 'processing' })
  }

  completeMediaJob(input: CompleteMediaJobInput): Promise<MediaJob> {
    this.completed.push(input)
    if (this.completeError !== null) return Promise.reject(this.completeError)
    return Promise.resolve({ ...this.job, status: 'succeeded', outputAssetId: input.outputAsset.id })
  }

  failMediaJob(input: FailMediaJobInput): Promise<MediaJob> {
    this.failed.push(input)
    return Promise.resolve({ ...this.job, status: 'failed', error: input.error })
  }
}

export class FakeMediaProcessor implements MediaProcessor {
  readonly inputs: ExtractAudioInput[] = []
  readonly thumbnailInputs: GenerateThumbnailInput[] = []
  throwError: Error | null = null

  extractAudio(input: ExtractAudioInput): Promise<ExtractAudioOutput> {
    this.inputs.push(input)
    if (this.throwError !== null) return Promise.reject(this.throwError)
    return Promise.resolve({
      body: new TextEncoder().encode('audio bytes'),
      fileName: 'video.mp3',
      mimeType: 'audio/mpeg',
      metadata: { durationSeconds: 1 },
    })
  }

  generateThumbnail(input: GenerateThumbnailInput): Promise<GenerateThumbnailOutput> {
    this.thumbnailInputs.push(input)
    if (this.throwError !== null) return Promise.reject(this.throwError)
    return Promise.resolve({
      body: new TextEncoder().encode('thumbnail bytes'),
      mimeType: 'image/webp',
      metadata: { format: 'webp', maxDimension: 640 },
    })
  }
}

export function makeMediaTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return makeTask({
    id: 'task_media_1',
    type: 'media.process',
    domain: 'media',
    input: {
      jobId: 'media_job_1',
      operation: 'video.extract_audio',
      options: { format: 'mp3' },
    },
    recordId: 'media_job_1',
    ...overrides,
  })
}

export function makeMediaJob(overrides: Partial<MediaJob> = {}): MediaJob {
  return {
    id: 'media_job_1',
    userId: 'user_1',
    operation: 'video.extract_audio',
    status: 'queued',
    sourceAssetId: 'asset_video',
    sourceKind: 'video',
    input: {
      source: {
        assetId: 'asset_video',
        kind: 'video',
        fileName: 'video.mp4',
      },
      options: { format: 'mp3' },
    },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}
