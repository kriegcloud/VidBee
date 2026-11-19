import type { OnlyFansCommand, OnlyFansDownload, OnlyFansProfile } from '@vidbee/downloader-core/onlyfans-profile'
import type { TaskQueueAPI, Executor, ExecutorContext, ExecutorEvents, ExecutorRun } from '@vidbee/task-queue-legacy'
import { makeProfileExecutorFacade } from './ProfileExecutorHost.adapter.js'
import { HostFailure as DownloadHostFailure } from '../../downloader-core/src/Downloader.errors.js'
import type { DownloadQueueOperations } from '../../downloader-core/src/DownloadQueue.service.js'
import * as Effect from 'effect/Effect'
import type * as ManagedRuntime from 'effect/ManagedRuntime'
import { runLegacySync, runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import { BrowserProfiles } from '../../browser-capture/src/BrowserProfiles.service.js'
import { onlyFansAdapter } from '../../browser-capture/src/onlyfans-profile.js'
import type { BrowserProfileAdapter } from '../../browser-capture/src/onlyfans-profile.js'
import { makeProfileRuntime } from './profile-runtime.js'
import { captureError } from './errors.js'
import * as Pure from '@vidbee/browser-capture/onlyfans-profile'
import type { OnlyFansChatRoute } from '@vidbee/downloader-core/onlyfans-profile'
export { onlyFansMediaUrl, onlyFansItems, chatVideoAttachments } from '@vidbee/browser-capture/onlyfans-profile'
export const chatVideoByOrdinal=(payload:unknown,ordinal:number)=>Pure.chatVideoByOrdinal(payload,ordinal)
export const onlyFansChatResponse=(url:URL,chatId:string):boolean=>Pure.onlyFansChatResponse(url,chatId)
export const onlyFansChatMediaResponse=(url:URL,chatId:string,route?:OnlyFansChatRoute):boolean=>Pure.onlyFansChatMediaResponse(url,chatId,route)
export const onlyFansPurchasedResponse=(url:URL,userId:string):boolean=>Pure.onlyFansPurchasedResponse(url,userId)
export type { ChatVideoAttachment, BrowserProfileAdapter } from '@vidbee/browser-capture/onlyfans-profile'
const queueFailure=(cause:unknown)=>DownloadHostFailure.make({operation:'profile queue',cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})
const queueBridge=(queue:TaskQueueAPI):DownloadQueueOperations=>({
  identity:queue,
  get:id=>Effect.sync(()=>queue.get(id)),
  list:options=>Effect.sync(()=>queue.list(options)),
  add:input=>Effect.tryPromise({try:()=>queue.add(input),catch:queueFailure}),
  retryManual:(id,options)=>Effect.tryPromise({try:()=>queue.retryManual(id,options),catch:queueFailure}),
  setMaxPerGroup:(group,maximum)=>Effect.tryPromise({try:()=>queue.setMaxPerGroup(group,maximum),catch:queueFailure}),
})
export class OnlyFansProfiles {
  readonly adapter:BrowserProfileAdapter
  private readonly runtime:ManagedRuntime.ManagedRuntime<BrowserProfiles,never>
  constructor(storageDir:string,defaultDownloadDir:()=>string,adapter:BrowserProfileAdapter=onlyFansAdapter) {
    this.adapter=adapter
    this.runtime=makeProfileRuntime(storageDir,defaultDownloadDir,adapter)
  }
  get(url:string):OnlyFansProfile { return runLegacySync(this.runtime,Effect.flatMap(BrowserProfiles,profiles=>profiles.get(url)),captureError) }
  list():OnlyFansProfile[] { return runLegacySync(this.runtime,Effect.flatMap(BrowserProfiles,profiles=>profiles.list),captureError) }
  command(input:OnlyFansCommand):Promise<OnlyFansProfile> {return runLegacyPromise(this.runtime,Effect.flatMap(BrowserProfiles,profiles=>profiles.command(input)),captureError)}
  enqueue(queue:TaskQueueAPI,input:OnlyFansDownload):Promise<{count:number}> {return runLegacyPromise(this.runtime,Effect.flatMap(BrowserProfiles,profiles=>profiles.enqueue(queueBridge(queue),input)),captureError)}
  download(profileUrl:string,mediaId:string,destination:string,signal:AbortSignal,progress:(bytes:number,total:number)=>void):Promise<{filePath:string,size:number}> {
    return runLegacyPromise(this.runtime,Effect.flatMap(BrowserProfiles,profiles=>profiles.download(profileUrl,mediaId,destination,signal,{emit:(bytes,total)=>Effect.sync(()=>progress(bytes,total))})),captureError)
  }
  stop():Promise<void> {return runLegacyPromise(this.runtime,Effect.flatMap(BrowserProfiles,profiles=>profiles.stop),captureError)}
}

/** Route OnlyFans ahead of yt-dlp, including old queued URLs, so Chrome cookies never leave Chrome. */
export class OnlyFansBrowserExecutor implements Executor {
  private readonly executor: Executor
  constructor(profiles: OnlyFansProfiles, fallback: Executor, defaultDirectory: () => string) {
    this.executor = makeProfileExecutorFacade(profiles, fallback, defaultDirectory)
  }
  run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun { return this.executor.run(ctx, events) }
}
