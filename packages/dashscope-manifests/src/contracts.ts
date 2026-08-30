/**
 * DashScope provider-specific manifest contracts.
 *
 * These types describe how a DashScope model is called, how its response is
 * read, and how its transport is resolved. They intentionally live beside the
 * DashScope catalog so model-core can remain provider-neutral.
 */

import type { ModelReferenceFormat } from '@bailian-studio/model-core'

/** Prompt reference syntax understood by a DashScope model. */
export type ReferenceFormat = ModelReferenceFormat

/** Maps one manifest parameter to a DashScope request location. */
export type ParameterBinding =
  | { target: 'input.prompt' }
  | { target: 'input.media'; mediaType: string }
  | { target: 'input.field'; field: string; wrapInArray?: boolean }
  | { target: 'parameters.field'; field?: string; wrapInArray?: boolean }
  | { target: 'ui.only' }

/** Describes the DashScope request body shape and parameter bindings. */
export type ProviderRequestMapping =
  | {
      kind: 'dashscope-chat'
      endpoint: string
      promptParam: string
      stream?: boolean
      bindings: Record<string, ParameterBinding>
    }
  | {
      kind: 'dashscope-image-message'
      endpoint: string
      bindings: Record<string, ParameterBinding>
    }
  | {
      kind: 'dashscope-image-flat'
      endpoint: string
      bindings: Record<string, ParameterBinding>
    }
  | {
      kind: 'dashscope-video-task'
      endpoint: string
      mediaMode: 'none' | 'single' | 'multi'
      bindings: Record<string, ParameterBinding>
      referenceFormat?: ReferenceFormat
    }
  | {
      kind: 'dashscope-audio-task'
      endpoint: string
      bindings: Record<string, ParameterBinding>
    }

/** Describes how a DashScope response is normalized into creative artifacts. */
export type ProviderOutputMapping =
  | { kind: 'images-from-message-content' }
  | { kind: 'video-url'; path: 'output.video_url' }
  | { kind: 'audio-url'; path: 'output.audio.url' }
  | { kind: 'text'; path: 'output.text' | 'output.choices.0.message.content' }
  | { kind: 'asr-transcription' }
  | { kind: 'custom'; extractor: string }

export interface ProviderTransportHeader {
  name: string
  value?: string
}

export interface ProviderSubmitTransport {
  method: 'POST'
  endpointTemplate: string
  modelFieldPath: string
  headers: ProviderTransportHeader[]
}

export interface ProviderPollingTransport {
  method: 'GET'
  endpointTemplate: string
  headers: ProviderTransportHeader[]
  taskIdPath: string
  statusPath: string
  succeededValues: string[]
  failedValues: string[]
}

export interface ProviderStreamingTransport {
  contentTypes: string[]
  framing: 'sse'
  headers: ProviderTransportHeader[]
}

/** Describes DashScope submit, polling, and streaming transport behavior. */
export type ProviderTransport =
  | { mode: 'provider_async'; submit: ProviderSubmitTransport; polling: ProviderPollingTransport }
  | { mode: 'sync'; submit: ProviderSubmitTransport; stream?: ProviderStreamingTransport }
  | { mode: 'stream'; submit: ProviderSubmitTransport; stream: ProviderStreamingTransport }
