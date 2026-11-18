import * as asyncFs from 'node:fs/promises'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as NodePath from '@effect/platform-node/NodePath'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as Scheduler from 'effect/Scheduler'
import { TaskExecutor } from '@vidbee/task-queue/TaskExecutor.service'
import { HostFailure as QueueHostFailure } from '@vidbee/task-queue/TaskQueue.errors'
import type { TaskQueueAPI } from '@vidbee/task-queue-legacy'
import type { SourceAdmission } from '@vidbee/task-queue-legacy/source-admission'
import { runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import { z } from 'zod'
import * as Native from '../../downloader-core/src/social-media-service.js'
import { DownloadQueue } from '../../downloader-core/src/DownloadQueue.service.js'
import { DownloadTiming } from '../../downloader-core/src/DownloadTiming.service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import { DownloadFiles } from '../../downloader-core/src/DownloadFiles.service.js'
import { DownloadFilesLegacy } from './DownloadFiles.layer.js'
import { DownloadHostLegacy } from './DownloadHost.layer.js'
import { argumentError } from './arguments-runtime.js'
import { queueAdapter } from './queue-adapter.js'
import { GalleryDlExecutor, type GalleryDlExecutorOptions } from './gallery-dl-executor.js'
import type { MappedProfilePlatform } from './mapped-profile-source.js'
import { type SocialMediaOptions, SocialMediaOptionsSchema } from './social-media.js'
import type { DownloadRuntimeSettings } from './types.js'
export interface SocialMappedItem {
  id: string
  url: string
  author: string
  title?: string
  images: number
  videos: number
  downloaded?: boolean
  /** Epoch ms of the post when the mapper can read it. */
  publishedAt?: number
}

export interface SocialProfileCategory {
  state: 'unscanned' | 'mapping' | 'partial' | 'complete' | 'auth-required' | 'error'
  items: SocialMappedItem[]
  error?: string
}

export interface SocialMappedProfile {
  profileUrl: string
  platform: MappedProfilePlatform
  owner: string
  categories: Record<string, SocialProfileCategory>
  updatedAt: number
}

export const SocialMappedItemSchema = z.object({
  id: z.string(),
  url: z.url(),
  author: z.string(),
  title: z.string().optional(),
  images: z.number().int().nonnegative(),
  videos: z.number().int().nonnegative(),
  downloaded: z.boolean().optional(),
  publishedAt: z.number().int().nonnegative().optional()
})

export const SocialProfileCategorySchema = z.object({
  state: z.enum(['unscanned', 'mapping', 'partial', 'complete', 'auth-required', 'error']),
  items: z.array(SocialMappedItemSchema),
  error: z.string().optional()
})

export const SocialMappedProfileSchema = z.object({
  profileUrl: z.url(),
  platform: z.enum([
    'x',
    'tiktok',
    'redgifs',
    'facebook',
    'vsco',
    'threads',
    'pinterest',
    'snapchat'
  ]),
  owner: z.string(),
  categories: z.record(z.string(), SocialProfileCategorySchema),
  updatedAt: z.number()
})

/** Shared by the X/TikTok and Threads mappers when a refresh may stop early. */
export interface ProfileMapOptions {
  /**
   * Post ids already in the saved map. The extractor stops after a run of
   * consecutive known posts instead of walking the whole timeline again.
   */
  knownIds?: readonly string[]
}

export interface SocialMediaDownloadRequest {
  url: string
  categories?: string[]
  options?: Partial<SocialMediaOptions>
  customDownloadPath?: string
  settings?: DownloadRuntimeSettings
}


const asyncFiles = Layer.effect(DownloadFiles, Effect.map(DownloadFiles, files => ({ ...files,
  write: (file: string, text: string, mode?: number) => Effect.tryPromise({ try: () => asyncFs.writeFile(file, text, { mode }), catch: cause => HostFailure.make({ operation: 'write', legacyMessage: cause instanceof Error ? cause.message : String(cause), cause }) }),
  makeTempDirectory: (prefix: string) => Effect.tryPromise({ try: () => asyncFs.mkdtemp(prefix), catch: cause => HostFailure.make({ operation: 'makeTempDirectory', legacyMessage: cause instanceof Error ? cause.message : String(cause), cause }) }),
  remove: (file: string, recursive: boolean) => Effect.tryPromise({ try: () => asyncFs.rm(file, { recursive, force: true }), catch: cause => HostFailure.make({ operation: 'remove', legacyMessage: cause instanceof Error ? cause.message : String(cause), cause }) })
}))).pipe(Layer.provide(DownloadFilesLegacy))
const runtime = ManagedRuntime.make(Layer.mergeAll(asyncFiles, DownloadHostLegacy, NodePath.layer, FetchHttpClient.layer,
  Layer.succeed(Scheduler.PreventSchedulerYield, true),
  Layer.succeed(DownloadTiming, { turn: () => Effect.promise(() => Promise.resolve()), sleep: milliseconds => Effect.promise(() => new Promise(resolve => setTimeout(resolve, milliseconds))) }),
  Layer.succeed(Native.SocialOptionsCodec, { decode: value => Effect.try({ try: () => SocialMediaOptionsSchema.parse(value), catch: cause => HostFailure.make({ operation: 'social.options', legacyMessage: cause instanceof Error ? cause.message : String(cause), cause }) }) })
))
runtime.runSync(Effect.void)
const admission = (source: SourceAdmission | undefined) => Native.SocialAdmission.of({ acquire: (url, signal) => Effect.tryPromise({ try: async () => { const release = await source?.acquire(url, signal); return release ? Effect.sync(release) : undefined }, catch: cause => HostFailure.make({ operation: 'admission', legacyMessage: cause instanceof Error ? cause.message : String(cause), cause }) }) })
function executor(options: Omit<GalleryDlExecutorOptions, 'defaultDownloadDir'>) {
  return TaskExecutor.of({ run: (context, sink) => Effect.sync(() => {
    const outputPath = context.input.options?.customDownloadPath
    const run = new GalleryDlExecutor({ ...options, defaultDownloadDir: typeof outputPath === 'string' ? outputPath : '' }).run(context, {
      onSpawn: event => runtime.runSync(sink.emit({ type: 'spawn', ...event })),
      onProgress: event => runtime.runSync(sink.emit({ type: 'progress', ...event })),
      onStd: event => runtime.runSync(sink.emit({ type: 'std', ...event })),
      onFinish: event => runtime.runSync(sink.emit({ type: 'finish', ...event }))
    })
    const cancel = (timeout?: number) => Effect.tryPromise({ try: () => run.cancel(timeout), catch: original => QueueHostFailure.make({ legacyMessage: original instanceof Error ? original.message : String(original), original }) })
    return { cancel, pause: Effect.tryPromise({ try: () => run.pause(), catch: original => QueueHostFailure.make({ legacyMessage: original instanceof Error ? original.message : String(original), original }) }) }
  }) })
}
export const inspectSocialMedia = (url: string) => runLegacyPromise(runtime, Native.inspectSocialMedia(url), argumentError)
export const writeKnownItemsFile = (directory: string, knownIds: readonly string[] | undefined) => runLegacyPromise(runtime, Native.writeKnownItemsFile(directory, knownIds), argumentError)
export const downloadSocialMedia = (queue: TaskQueueAPI, request: SocialMediaDownloadRequest, batch?: { id: string; title: string; order: number }) => runLegacyPromise(runtime, Native.downloadSocialMedia(request, batch).pipe(Effect.provideService(DownloadQueue, queueAdapter(queue))), argumentError)
export const restoreSocialMediaGroupCaps = (queue: TaskQueueAPI) => runLegacyPromise(runtime, Native.restoreSocialMediaGroupCaps().pipe(Effect.provideService(DownloadQueue, queueAdapter(queue))), argumentError)
export const mapSocialMediaProfile = (url: string, options: Omit<GalleryDlExecutorOptions, 'defaultDownloadDir'> & { admission?: SourceAdmission }, settings: DownloadRuntimeSettings | undefined, signal: AbortSignal, onItem: (item: SocialMappedItem) => void, mapOptions: ProfileMapOptions = {}) => runLegacyPromise(runtime, Native.mapSocialMediaProfile(url, settings, signal, item => Effect.sync(() => onItem(item)), mapOptions).pipe(Effect.provideService(TaskExecutor, executor(options)), Effect.provideService(Native.SocialAdmission, admission(options.admission))), argumentError)
export const previewSocialMedia = (url: string, options: Omit<GalleryDlExecutorOptions, 'defaultDownloadDir'> & { admission?: SourceAdmission }, settings?: DownloadRuntimeSettings) => runLegacyPromise(runtime, Native.previewSocialMedia(url, settings).pipe(Effect.provideService(TaskExecutor, executor(options)), Effect.provideService(Native.SocialAdmission, admission(options.admission))), argumentError)
