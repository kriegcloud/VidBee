import * as Effect from 'effect/Effect'
import type { TaskQueueAPI } from '@vidbee/task-queue-legacy'
import { DownloadQueue, type DownloadQueueOperations } from '../../downloader-core/src/DownloadQueue.service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
const adapters = new WeakMap<TaskQueueAPI, DownloadQueueOperations>()
const failure = (operation: string) => (cause: unknown) => HostFailure.make({ operation, cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) })
export function queueAdapter(queue: TaskQueueAPI): DownloadQueueOperations {
  const previous = adapters.get(queue)
  if (previous) return previous
  const adapter = DownloadQueue.of({
    identity: queue,
    get: id => Effect.sync(() => queue.get(id)),
    list: options => Effect.sync(() => queue.list(options)),
    add: request => Effect.tryPromise({ try: () => queue.add(request), catch: failure('queue.add') }),
    retryManual: (id, options) => Effect.tryPromise({ try: () => queue.retryManual(id, options), catch: failure('queue.retryManual') }),
    setMaxPerGroup: (group, maximum) => Effect.tryPromise({ try: () => queue.setMaxPerGroup(group, maximum), catch: failure('queue.setMaxPerGroup') })
  })
  adapters.set(queue, adapter)
  return adapter
}
