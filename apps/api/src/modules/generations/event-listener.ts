import { generationEventNameForStatus, makeGenerationEvent, type GenerationEventName, type GenerationEventPayload, type BailianStudioSSEEvent } from '@bailian-studio/event-bus'
import {
  createGenerationEventListener,
  ensureGenerationEventsTrigger,
  type GenerationRepository,
  type GenerationEventNotification,
  type NotificationListener,
} from '@bailian-studio/generation-repository'
import { createLogger, type Logger } from '@bailian-studio/shared'

export interface GenerationSsePublisher {
  publish(event: BailianStudioSSEEvent): void
}

export interface StartGenerationEventListenerOptions {
  connectionString: string
  repository: GenerationRepository
  hub: GenerationSsePublisher
  logger?: Logger
}

/**
 * Pure mapping, exported for unit testing. `GenerationEventPayload.status`
 * is `string`, so notification.status flows in cast-free.
 */
export function generationEventFromNotification(
  notification: GenerationEventNotification,
): { id: string; event: GenerationEventName; data: GenerationEventPayload } {
  return {
    id: notification.id,
    ...makeGenerationEvent(
      generationEventNameForStatus(notification.status),
      {
        recordId: notification.recordId,
        userId: notification.userId,
        status: notification.status,
        modelId: notification.modelId,
        updatedAt: notification.updatedAt,
      },
    ),
  }
}

/**
 * Ensure the trigger is installed, then listen for generation_events and
 * republish each as an SSE event into the hub. The hub delivers to live SSE
 * subscribers and keeps a bounded pre-connection buffer for the next connect.
 */
export async function startGenerationEventListener(
  options: StartGenerationEventListenerOptions,
): Promise<NotificationListener> {
  const logger = options.logger ?? createLogger('generation-event-listener')
  await ensureGenerationEventsTrigger(options.connectionString)
  let cursor = await options.repository.getLatestGenerationEvent()
  let draining: Promise<void> | undefined
  let drainRequested = false
  const drain = async (): Promise<void> => {
    if (draining !== undefined) {
      drainRequested = true
      return draining
    }
    draining = (async () => {
      do {
        // A NOTIFY can arrive while the previous query is in flight. Keep a
        // dirty bit so that notification is not lost behind the in-flight
        // promise; the next pass reads strictly after the advanced cursor.
        drainRequested = false
        const events = await options.repository.listGenerationEvents({
          ...(cursor === undefined
            ? {}
            : {
                afterCursor: {
                  id: cursor.id,
                  createdAt: cursor.createdAt,
                },
              }),
          limit: 500,
        })
        for (const event of events) {
          options.hub.publish(generationEventFromNotification(event))
          cursor = event
        }
      } while (drainRequested)
    })().finally(() => {
      const rerun = drainRequested
      draining = undefined
      if (rerun) void drain()
    })
    return draining
  }

  const listener = await createGenerationEventListener({
    connectionString: options.connectionString,
    logger,
    onEvent: () => { void drain() },
  })
  // Close the race between reading the startup cursor and registering LISTEN:
  // anything committed during that window is present in the outbox and is
  // drained immediately after the listener is ready.
  await drain()
  return listener
}
