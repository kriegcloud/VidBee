import * as Effect from 'effect/Effect'
import { runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import type { TaskQueueAPI } from '@vidbee/task-queue-legacy'
import { enqueueInstagramProfileDownload as enqueue, restoreInstagramProfileGroupCaps as restore, InstagramInspectionLookup } from '../../downloader-core/src/InstagramEnqueue.service.js'
import { DownloadQueue } from '../../downloader-core/src/DownloadQueue.service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import type { EnqueueInstagramProfileOptions } from './instagram-profile.js'
import { queueAdapter } from './queue-adapter.js'
import { argumentsRuntime, argumentError } from './arguments-runtime.js'

export const enqueueInstagramProfileDownload = ({queue,inspector,input,defaultDownloadDir,batch,priority}:EnqueueInstagramProfileOptions) => runLegacyPromise(argumentsRuntime,
  enqueue({input,defaultDownloadDir,batch,priority}).pipe(
    Effect.provideService(DownloadQueue,queueAdapter(queue)),
    Effect.provideService(InstagramInspectionLookup,{get:id=>Effect.try({try:()=>inspector.get(id),catch:cause=>HostFailure.make({operation:'instagram.get',legacyMessage:cause instanceof Error ? cause.message : String(cause),cause})})}),
  ),argumentError)
export const restoreInstagramProfileGroupCaps = (queue:TaskQueueAPI):Promise<void> => runLegacyPromise(argumentsRuntime,restore().pipe(Effect.provideService(DownloadQueue,queueAdapter(queue))),argumentError)
