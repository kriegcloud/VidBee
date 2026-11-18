import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import { TaskExecutor } from '@vidbee/task-queue/TaskExecutor.service'
import { runLegacyPromise, runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { GalleryDlExecutorHost } from '../../downloader-core/src/GalleryDlExecutorHost.service.js'
import { layer as executorLayer } from '../../downloader-core/src/GalleryDlExecutor.layer.js'
import { DownloadTiming } from '../../downloader-core/src/DownloadTiming.service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import { makeProcessLayer } from './Process.layer.js'
import { executorError } from './executor-errors.js'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  type Executor,
  type ExecutorContext,
  type ExecutorEvents,
  type ExecutorRun,
  type TaskKind,
} from '@vidbee/task-queue-legacy'
import { normalizeFacebookGalleryUrl } from './facebook-gallery'
import { buildGalleryDlRuntimeArgs, INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS } from './instagram-profile'
import { normalizePinterestUrl, PINTEREST_EXTRACTOR_ARGS } from './pinterest'
import { normalizeSnapchatUrl } from './snapchat'
import {
  resolveSocialSource,
  SocialMediaOptionsSchema,
  socialCollectionUrl
} from './social-media'
import { normalizeThreadsUrl } from './threads'
import { normalizeTikTokPhotoUrl } from './tiktok-photo'
import type { DownloadRuntimeSettings } from './types'
import { normalizeVscoUrl } from './vsco'
import type { YtDlpTaskOptions } from './yt-dlp-executor'

const DEFAULT_KILL_GRACE_MS = 10_000
const EVENT_PREFIX = '__VIDBEE_GDL__'
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
const SEQUENTIAL_TEMPLATE_REGEX = /^(\d+)\.%\(ext\)s$/

export const VSCO_GALLERY_DL_EXTRACTOR_ARGS = [
  '-o',
  'extractor.vsco.tls12=true',
  '-o',
  'extractor.vsco.videos=true',
  '--sleep-request',
  '1',
  '--sleep-429',
  '60',
  '--retries',
  '8'
] as const

export const FACEBOOK_GALLERY_DL_EXTRACTOR_ARGS = [
  '--sleep-request',
  '1',
  '--sleep-429',
  '60',
  '--retries',
  '8'
] as const

/**
 * Photo-mode posts carry images plus the slideshow sound. Videos stay off so
 * gallery-dl never reaches for its optional ytdl module; yt-dlp owns TikTok video.
 */
export const TIKTOK_PHOTO_GALLERY_DL_EXTRACTOR_ARGS = [
  '-o',
  'extractor.tiktok.photos=true',
  '-o',
  'extractor.tiktok.audio=true',
  '-o',
  'extractor.tiktok.videos=false',
  '--sleep-429',
  '60',
  '--retries',
  '5'
] as const

export interface NormalizedVscoGalleryUrl {
  username: string
  profileUrl: string
}

interface GalleryDlTaskOptions extends YtDlpTaskOptions {
  galleryDlBaseDirectory?: string
  galleryDlDirectorySegments?: readonly string[]
  galleryDlDirectoryTemplate?: string
  galleryDlFilenameTemplate?: string
  galleryDlFilter?: string
  expectedAssetCount?: number
}

export interface GalleryDlExecutorOptions {
  resolveBinaryPath: () => string
  defaultDownloadDir: string
  resolveExtraArgs?: (settings?: DownloadRuntimeSettings, url?: string) => readonly string[]
  resolveFfmpegLocation?: () => string | undefined
  killGraceMs?: number
  clock?: () => number
}

/** Normalize the VSCO profile gallery aliases supported by gallery-dl. */
export const normalizeVscoGalleryUrl = (value: string): NormalizedVscoGalleryUrl | null => {
  const vsco = normalizeVscoUrl(value)
  return vsco?.kind === 'gallery' ? { username: vsco.username, profileUrl: vsco.url } : null
}

/** Keep photo galleries out of single-media and transcription flows. */
export const resolveDownloadTaskKind = (
  url: string,
  requestedType: 'audio' | 'video'
): TaskKind => {
  if (normalizePinterestUrl(url)) {
    return 'pinterest-gallery'
  }
  if (resolveSocialSource(url)) {
    return 'social-media'
  }
  const threads = normalizeThreadsUrl(url)
  if (threads) {
    return threads.kind === 'post' ? 'threads-post' : 'threads-profile'
  }
  if (normalizeSnapchatUrl(url)) {
    return 'snapchat-media'
  }
  if (normalizeFacebookGalleryUrl(url)) {
    return 'facebook-gallery'
  }
  if (normalizeTikTokPhotoUrl(url)) {
    return 'tiktok-photo'
  }
  return normalizeVscoUrl(url) ? 'vsco-gallery' : requestedType
}

export const resolveDefaultGalleryDlFilenameTemplate = (url: string): string => {
  if (normalizeSnapchatUrl(url)) {
    // Snap file ids are unique per asset; the date keeps folders chronological.
    return '{date:%Y-%m-%d}_{file_id}.{extension}'
  }
  if (normalizeThreadsUrl(url) || normalizePinterestUrl(url)) {
    return '{id}_{num:>02}.{extension}'
  }
  if (normalizeTikTokPhotoUrl(url)) {
    // Images enumerate from 1; the slideshow sound is num 0.
    return '{id}_{num:>02}.{extension}'
  }
  return normalizeVscoUrl(url) || normalizeFacebookGalleryUrl(url)
    ? '{id}.{extension}'
    : '{sidecar_media_id:?/_/}{media_id}.{extension}'
}

export const resolveGalleryDlFilenameTemplate = (
  url: string,
  options: GalleryDlTaskOptions
): string => {
  if (
    normalizePinterestUrl(url) ||
    normalizeVscoUrl(url) ||
    normalizeFacebookGalleryUrl(url) ||
    normalizeTikTokPhotoUrl(url) ||
    normalizeThreadsUrl(url) ||
    normalizeSnapchatUrl(url)
  ) {
    return resolveDefaultGalleryDlFilenameTemplate(url)
  }
  const galleryTemplate = options.galleryDlFilenameTemplate?.trim()
  if (galleryTemplate) {
    return galleryTemplate
  }
  const trimmed = options.customFilenameTemplate?.trim() ?? ''
  if (!trimmed) {
    return resolveDefaultGalleryDlFilenameTemplate(url)
  }
  const sequential = SEQUENTIAL_TEMPLATE_REGEX.exec(trimmed)
  if (sequential) {
    return `${sequential[1]}.{num}.{extension}`
  }
  return '{sidecar_media_id:?/_/}{media_id}.{extension}'
}

const buildArgs = (
  url: string,
  directoryTemplate: string,
  filenameTemplate: string,
  extraArgs: readonly string[],
  baseDirectory?: string,
  directorySegments?: readonly string[],
  filter?: string
): string[] => [
  ...(baseDirectory && directorySegments?.length
    ? [
        '--destination',
        baseDirectory,
        '-o',
        `extractor.directory=${JSON.stringify(directorySegments)}`
      ]
    : ['--directory', directoryTemplate]),
  '--filename',
  filenameTemplate,
  '--config-ignore',
  '--no-input',
  '--no-colors',
  '--user-agent',
  CHROME_USER_AGENT,
  ...(filter ? ['--filter', filter] : []),
  '--Print',
  `prepare:${EVENT_PREFIX}\tprepare\t{_path}`,
  '--Print',
  `after:${EVENT_PREFIX}\tafter\t{_path}`,
  '--Print',
  `skip:${EVENT_PREFIX}\tskip\t{_path}`,
  '--Print',
  `error:${EVENT_PREFIX}\terror\t{_path}`,
  ...extraArgs,
  url
]

/** Honor bounded waits announced by gallery-dl without hiding real stalls. */
export const galleryWaitDurationMs = (line: string): number | undefined => {
  const match =
    /\[(?:info|warning)\] Waiting for (\d+(?:\.\d+)?) (seconds?|minutes?) (?:until|\()/i.exec(line)
  if (!match) {
    return undefined
  }
  const duration = Number(match[1]) * (match[2]?.toLowerCase().startsWith('minute') ? 60_000 : 1000)
  return Number.isFinite(duration) ? Math.min(duration, 10 * 60_000) : undefined
}

const inspectFiles = async (files: string[]) => {
  let totalSize = 0
  let firstFileSize = 0
  let invalidCount = 0
  // Bound filesystem concurrency and keep large profile scans off the main thread.
  for (let offset = 0; offset < files.length; offset += 8) {
    const sizes = await Promise.all(
      files.slice(offset, offset + 8).map(async (file) => {
        try {
          const info = await stat(file)
          return info.isFile() ? info.size : 0
        } catch {
          return 0
        }
      })
    )
    if (offset === 0) {
      firstFileSize = sizes[0] ?? 0
    }
    for (const size of sizes) {
      totalSize += size
      if (size <= 0) {
        invalidCount++
      }
    }
  }
  return { totalSize, firstFileSize, invalidCount }
}

export class GalleryDlExecutor implements Executor {
  private readonly runtime: ManagedRuntime.ManagedRuntime<TaskExecutor, never>
  private readonly options: Required<
    Omit<GalleryDlExecutorOptions, 'resolveExtraArgs' | 'resolveFfmpegLocation'>
  > &
    Pick<GalleryDlExecutorOptions, 'resolveExtraArgs' | 'resolveFfmpegLocation'>

  constructor(options: GalleryDlExecutorOptions) {
    this.options = {
      resolveBinaryPath: options.resolveBinaryPath,
      defaultDownloadDir: options.defaultDownloadDir,
      resolveExtraArgs: options.resolveExtraArgs,
      resolveFfmpegLocation: options.resolveFfmpegLocation,
      killGraceMs: options.killGraceMs ?? DEFAULT_KILL_GRACE_MS,
      clock: options.clock ?? Date.now
    }
    const failure = (operation: string, cause: unknown) => new HostFailure({ operation, cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) })
    const host = Layer.succeed(GalleryDlExecutorHost, {
      now: this.options.clock, killGraceMs: this.options.killGraceMs, platform: () => process.platform,
      command: ctx => Effect.sync(() => this.buildCommand(ctx)),
      binary: Effect.try({ try: this.options.resolveBinaryPath, catch: cause => failure('binary', cause) }),
      spec: (binary, args) => Effect.sync(() => {
        const ffmpegLocation = this.options.resolveFfmpegLocation?.()
        const childPath = ffmpegLocation ? `${ffmpegLocation}${path.delimiter}${process.env.PATH ?? ''}` : process.env.PATH
        return { command: binary, argv: args, env: { ...process.env, PATH: childPath }, extendEnv: false, cwd: undefined, detached: process.platform !== 'win32', windowsHide: true, stdin: 'ignore' as const, stdout: 'pipe' as const, stderr: 'pipe' as const }
      }),
      inspect: paths => Effect.tryPromise({ try: () => inspectFiles(paths), catch: cause => failure('inspect', cause) }),
      socialManifest: directory => Effect.tryPromise({ try: async () => {
        const resolvedDirectory = await realpath(directory).catch(() => path.resolve(directory))
        const manifest = path.join(resolvedDirectory, '.vidbee', 'social-media.sqlite')
        const file = await stat(manifest).catch(() => null)
        return { directory: resolvedDirectory, manifest, isFile: file?.isFile() ?? false }
      }, catch: cause => failure('socialManifest', cause) }),
    })
    const timing = Layer.succeed(DownloadTiming, { turn: () => Effect.void, sleep: milliseconds => Effect.callback(resume => { const timer = setTimeout(() => resume(Effect.void), milliseconds); return Effect.sync(() => clearTimeout(timer)) }) })
    this.runtime = ManagedRuntime.make(executorLayer.pipe(Layer.provide(Layer.mergeAll(host, timing, makeProcessLayer(() => this.runtime, executorError), Layer.succeed(Scheduler.PreventSchedulerYield, true)))))
    this.runtime.runSync(Effect.void)

  }

  private buildCommand(ctx: ExecutorContext) {
    const taskOptions = (ctx.input.options ?? {}) as GalleryDlTaskOptions
    const socialSource =
      ctx.input.kind === 'social-media' ? resolveSocialSource(ctx.input.url) : null
    const socialOptions = socialSource
      ? SocialMediaOptionsSchema.parse(ctx.input.options?.socialMedia ?? {})
      : undefined
    const configuredOutputDirectory =
      taskOptions.customDownloadPath?.trim() ||
      taskOptions.settings?.downloadPath?.trim() ||
      this.options.defaultDownloadDir
    const pinterest = normalizePinterestUrl(ctx.input.url)
    const vsco = normalizeVscoUrl(ctx.input.url)
    const facebookGallery = normalizeFacebookGalleryUrl(ctx.input.url)
    const tiktokPhoto = normalizeTikTokPhotoUrl(ctx.input.url)
    const threads = normalizeThreadsUrl(ctx.input.url)
    const snapchat = normalizeSnapchatUrl(ctx.input.url)
    const galleryDirectorySegments =
      pinterest?.directorySegments ??
      threads?.directorySegments ??
      snapchat?.directorySegments ??
      facebookGallery?.directorySegments ??
      tiktokPhoto?.directorySegments ??
      vsco?.directorySegments ??
      null
    const outputDirectory = galleryDirectorySegments
      ? path.join(configuredOutputDirectory, ...galleryDirectorySegments)
      : configuredOutputDirectory
    const directoryTemplate = taskOptions.galleryDlDirectoryTemplate?.trim() || outputDirectory
    const baseDirectory = threads
      ? configuredOutputDirectory
      : taskOptions.galleryDlBaseDirectory?.trim()
    const directorySegments = threads
      ? ['Threads', threads.username, '{shortcode}']
      : taskOptions.galleryDlDirectorySegments?.map((segment) => segment.trim()).filter(Boolean)
    const filenameTemplate = resolveGalleryDlFilenameTemplate(ctx.input.url, taskOptions)
    const filter = taskOptions.galleryDlFilter?.trim()
    const expectedAssetCount = Math.max(taskOptions.expectedAssetCount ?? 0, 0)
    const extraArgs = [
      ...(this.options.resolveExtraArgs?.(taskOptions.settings, ctx.input.url) ??
        buildGalleryDlRuntimeArgs(taskOptions.settings))
    ]
    const extractorArgs = resolveExtractorArgs({
      pinterest,
      facebookGallery,
      tiktokPhoto,
      vsco,
      threads,
      snapchat
    })
    const args = buildArgs(
      pinterest?.url ??
        threads?.url ??
        snapchat?.url ??
        facebookGallery?.url ??
        tiktokPhoto?.url ??
        vsco?.url ??
        ctx.input.url,
      directoryTemplate,
      filenameTemplate,
      [...extractorArgs, ...extraArgs],
      baseDirectory,
      directorySegments,
      filter
    )

    if (socialSource) {
      if (socialSource.kind === 'unsupported') {
        return { args, configuredOutputDirectory, outputDirectory, expectedAssetCount, social: true, profileCategory: false, unsupported: true }
      }
      args.splice(
        0,
        args.length,
        '--config-ignore',
        '--no-input',
        '--no-colors',
        '--retries',
        '3',
        '--sleep-request',
        '1',
        '--sleep-429',
        '60',
        ...extraArgs,
        '-o',
        `extractor.vidbee-social.destination=${JSON.stringify(path.resolve(configuredOutputDirectory))}`,
        '-o',
        `extractor.vidbee-social.source=${JSON.stringify(socialSource)}`,
        '-o',
        `extractor.vidbee-social.options=${JSON.stringify(socialOptions)}`,
        '-o',
        `extractor.vidbee-social.run-id=${JSON.stringify(ctx.attemptId)}`,
        '-o',
        `extractor.vidbee-social.inspect=${ctx.input.options?.socialInspect === true}`,
        '-o',
        `extractor.vidbee-social.map-items=${ctx.input.options?.socialMap === true}`,
        ...(typeof ctx.input.options?.socialKnownItemsFile === 'string'
          ? [
              '-o',
              `extractor.vidbee-social.known-items-file=${JSON.stringify(ctx.input.options.socialKnownItemsFile)}`
            ]
          : []),
        `vidbee-social:${socialCollectionUrl(socialSource)}`
      )
    }

    return { args, configuredOutputDirectory, outputDirectory, expectedAssetCount, social: Boolean(socialSource), profileCategory: ctx.input.kind === 'instagram-profile-category' || Boolean(galleryDirectorySegments), unsupported: false }
  }

  run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun {
    const handle = runLegacySync(this.runtime, Effect.flatMap(TaskExecutor, executor => executor.run(ctx, {
      emit: event => Effect.sync(() => {
        switch (event.type) {
          case 'spawn': { const { type, ...payload } = event; events.onSpawn(payload); break }
          case 'progress': { const { type, ...payload } = event; events.onProgress(payload); break }
          case 'processing': { const { type, ...payload } = event; events.onProcessing?.(payload); break }
          case 'std': { const { type, ...payload } = event; events.onStd(payload); break }
          case 'finish': { const { type, ...payload } = event; events.onFinish(payload); break }
        }
      })
    })), executorError)
    return { cancel: timeout => runLegacyPromise(this.runtime, handle.cancel(timeout), executorError), pause: () => runLegacyPromise(this.runtime, handle.pause, executorError) }
  }

}

const GALLERY_DL_HOSTS = ['instagram.com', 'instagr.am', 'cdninstagram.com'] as const

const resolveExtractorArgs = (galleries: {
  pinterest: unknown
  threads: unknown
  facebookGallery: unknown
  tiktokPhoto: unknown
  vsco: unknown
  snapchat: unknown
}): readonly string[] => {
  if (galleries.pinterest) {
    return [
      ...PINTEREST_EXTRACTOR_ARGS,
      '--sleep-request',
      '1',
      '--sleep-429',
      '60',
      '--retries',
      '3'
    ]
  }
  if (galleries.threads || galleries.snapchat) {
    return ['--sleep-request', '1', '--sleep-429', '60', '--retries', '3']
  }
  if (galleries.facebookGallery) {
    return FACEBOOK_GALLERY_DL_EXTRACTOR_ARGS
  }
  if (galleries.tiktokPhoto) {
    return TIKTOK_PHOTO_GALLERY_DL_EXTRACTOR_ARGS
  }
  if (galleries.vsco) {
    return VSCO_GALLERY_DL_EXTRACTOR_ARGS
  }
  // Each Instagram item is its own gallery-dl process, so the in-process
  // request interval never spaces the first request. Pace launches and keep
  // retries short so a throttle is reported instead of hammered.
  return [
    ...INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS,
    '--sleep-extractor',
    '4.0-8.0',
    '--retries',
    '2',
    '--sleep-429',
    '60'
  ]
}

export const shouldUseGalleryDl = (url: string): boolean => {
  if (resolveSocialSource(url)) {
    return true
  }
  if (
    normalizePinterestUrl(url) ||
    normalizeVscoUrl(url) ||
    normalizeFacebookGalleryUrl(url) ||
    normalizeTikTokPhotoUrl(url) ||
    normalizeThreadsUrl(url) ||
    normalizeSnapchatUrl(url)
  ) {
    return true
  }
  try {
    const host = new URL(url).hostname.toLowerCase()
    return GALLERY_DL_HOSTS.some(
      (candidate) => host === candidate || host.endsWith(`.${candidate}`)
    )
  } catch {
    return false
  }
}

export class HostRoutingExecutor implements Executor {
  private readonly ytDlp: Executor
  private readonly galleryDl: Executor

  constructor(ytDlp: Executor, galleryDl: Executor) {
    this.ytDlp = ytDlp
    this.galleryDl = galleryDl
  }

  run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun {
    if (ctx.input.options?.singleVideo === true) {
      return this.ytDlp.run(ctx, events)
    }
    if (
      ctx.input.kind === 'social-media' ||
      ctx.input.kind === 'instagram-profile-category' ||
      shouldUseGalleryDl(ctx.input.url)
    ) {
      return this.galleryDl.run(ctx, events)
    }
    return this.ytDlp.run(ctx, events)
  }
}
