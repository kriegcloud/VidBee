import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import * as NodePath from '@effect/platform-node/NodePath'
import type { TaskPriority, TaskQueueAPI } from '@vidbee/task-queue-legacy'
import type { SourceAdmission } from '@vidbee/task-queue-legacy/source-admission'
import { runLegacyPromise, runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { InstagramProfileInspector as NativeInspector, instagramProfileInspectorLayer } from '../../downloader-core/src/instagram-profile.js'
import type { InspectionCacheEntry, InstagramInspectionListEntry, InspectionRequest } from '../../downloader-core/src/instagram-profile.js'
import { buildGalleryDlRuntimeArgs as nativeGalleryArgs } from '../../downloader-core/src/gallery-runtime-args.js'
import { DownloadTiming } from '../../downloader-core/src/DownloadTiming.service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import { DownloadFilesLegacy } from './DownloadFiles.layer.js'
import { DownloadHostLegacy } from './DownloadHost.layer.js'
import { makeProcessLayer } from './Process.layer.js'
import { argumentsRuntime, argumentError } from './arguments-runtime.js'
import { normalizeInstagramProfileUrl } from './instagram-url.js'
import type { DownloadRuntimeSettings, InstagramProfileCategory, InstagramProfileDownloadInput, InstagramProfileInspection } from './types.js'
export { INSTAGRAM_PROFILE_CATEGORIES, normalizeInstagramProfileUrl, instagramInspectionId, INSTAGRAM_RATE_LIMIT_COOLDOWN_MS, INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS, buildInstagramCategoryUrl } from '../../downloader-core/src/instagram-profile.js'
export { enqueueInstagramProfileDownload, restoreInstagramProfileGroupCaps } from './instagram-enqueue.js'
export interface InstagramProfileInspectorOptions {
  admission?: SourceAdmission
  completedDownloads?: () => { url: string; category: string; assetCount: number }[]
  storageDir?: string
  resolveBinaryPath: () => string
  resolveExtraArgs?: (settings?: DownloadRuntimeSettings) => readonly string[]
  clock?: () => number
  maxCacheEntries?: number
}

export interface EnqueueInstagramProfileOptions {
  queue: TaskQueueAPI
  inspector: InstagramProfileInspector
  input: InstagramProfileDownloadInput
  defaultDownloadDir: string
  /** Join an existing queue batch (one subscription check) instead of a new one. */
  batch?: { id: string; title: string }
  /** Defaults to `PRIORITY_USER`. */
  priority?: TaskPriority
}


function runtimeFor(options: InstagramProfileInspectorOptions) {
  const dependencies = Layer.mergeAll(DownloadFilesLegacy, DownloadHostLegacy, NodePath.layer,
    Layer.succeed(DownloadTiming, { turn: () => Effect.promise(() => Promise.resolve()), sleep: milliseconds => Effect.promise(() => new Promise(resolve => setTimeout(resolve, milliseconds))) }),
    makeProcessLayer(() => runtime, argumentError))
  const runtime: ManagedRuntime.ManagedRuntime<NativeInspector, never> = ManagedRuntime.make(Layer.mergeAll(
    instagramProfileInspectorLayer({ ...options, clock: options.clock ?? Date.now, admission: options.admission === undefined ? undefined : { acquire: (url, signal) => Effect.tryPromise({ try: async () => { const release = await options.admission?.acquire(url, signal); return release ? Effect.sync(release) : undefined }, catch: cause => HostFailure.make({ operation: 'instagram.admission', legacyMessage: cause instanceof Error ? cause.message : String(cause), cause }) }) } }).pipe(Layer.provide(dependencies)),
    Layer.succeed(Scheduler.PreventSchedulerYield, true)
  ))
  runtime.runSync(Effect.void)
  return runtime
}
export const buildGalleryDlRuntimeArgs = (settings?: DownloadRuntimeSettings): readonly string[] => runLegacySync(argumentsRuntime, nativeGalleryArgs(settings), argumentError)
export class InstagramProfileInspector {
  private readonly runtime: ReturnType<typeof runtimeFor>
  private readonly pending = new Map<string, Promise<InstagramProfileInspection>>()
  constructor(options: InstagramProfileInspectorOptions) { this.runtime = runtimeFor(options) }
  get(id: string): InspectionCacheEntry | null { return runLegacySync(this.runtime, Effect.flatMap(NativeInspector, inspector => inspector.get(id)), argumentError) }
  list(): InstagramInspectionListEntry[] { return runLegacySync(this.runtime, Effect.flatMap(NativeInspector, inspector => inspector.list), argumentError) }
  stop(): Promise<void> { return runLegacyPromise(this.runtime, Effect.flatMap(NativeInspector, inspector => inspector.stop), argumentError) }
  cancel(url: string): boolean { return runLegacySync(this.runtime, Effect.flatMap(NativeInspector, inspector => inspector.cancel(url)), argumentError) }
  inspect(url: string, settings?: DownloadRuntimeSettings, categories?: readonly InstagramProfileCategory[]): Promise<InstagramProfileInspection> {
    const normalized = normalizeInstagramProfileUrl(url)
    if (!normalized) return Promise.reject(new Error('Enter a valid Instagram profile URL.'))
    if (categories?.length === 0) return runLegacyPromise(this.runtime, Effect.flatMap(NativeInspector, inspector => Effect.flatMap(inspector.request(url, settings, categories), request => request.result)), argumentError)
    const key = JSON.stringify([normalized.profileUrl, settings, categories])
    const existing = this.pending.get(key)
    if (existing) return existing
    let scheduled: InspectionRequest
    try { scheduled = runLegacySync(this.runtime, Effect.flatMap(NativeInspector, inspector => inspector.request(url, settings, categories)), argumentError) } catch (failure) { return Promise.reject(failure) }
    const raw = runLegacyPromise(this.runtime, scheduled.result, argumentError).finally(() => { this.pending.delete(key) })
    this.pending.set(key, raw)
    return raw.then(inspection => runLegacySync(this.runtime, scheduled.snapshot(inspection), argumentError))
  }
}
