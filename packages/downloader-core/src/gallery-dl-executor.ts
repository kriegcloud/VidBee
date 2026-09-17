import { type ChildProcess, spawn } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'

import {
  classify,
  type Executor,
  type ExecutorContext,
  type ExecutorEvents,
  type ExecutorRun,
  type TaskKind,
  type TaskOutput,
  type TaskProgress,
  virtualError
} from '@vidbee/task-queue'

import { killProcessTree } from '@vidbee/task-queue/process'
import type { SocialCollectionSummary } from '@vidbee/task-queue/types'
import { normalizeFacebookGalleryUrl } from './facebook-gallery'
import { buildGalleryDlRuntimeArgs, INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS } from './instagram-profile'
import { SocialCollectionSummarySchema } from './schemas'
import { resolveSocialSource, SocialMediaOptionsSchema, socialCollectionUrl } from './social-media'
import { normalizeThreadsUrl } from './threads'
import { normalizeTikTokPhotoUrl } from './tiktok-photo'
import type { DownloadRuntimeSettings } from './types'
import type { YtDlpTaskOptions } from './yt-dlp-executor'

const DEFAULT_KILL_GRACE_MS = 10_000
const STDOUT_TAIL_BYTES = 8 * 1024
const STDERR_TAIL_BYTES = 8 * 1024
const EVENT_PREFIX = '__VIDBEE_GDL__'
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
const SEQUENTIAL_TEMPLATE_REGEX = /^(\d+)\.%\(ext\)s$/
const VSCO_GALLERY_PATH = /^\/([A-Za-z0-9][A-Za-z0-9._-]*)(?:\/(?:gallery|images))?\/?$/i

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
  resolveExtraArgs?: (settings?: DownloadRuntimeSettings) => readonly string[]
  resolveFfmpegLocation?: () => string | undefined
  killGraceMs?: number
  clock?: () => number
}

interface TailBuffer {
  append: (text: string) => void
  read: () => string
}

/** Normalize the VSCO profile gallery aliases supported by gallery-dl. */
export const normalizeVscoGalleryUrl = (value: string): NormalizedVscoGalleryUrl | null => {
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null
    }
    const host = parsed.hostname.toLowerCase()
    if (!(host === 'vsco.co' || host === 'www.vsco.co')) {
      return null
    }
    const match = VSCO_GALLERY_PATH.exec(parsed.pathname)
    const username = match?.[1]
    if (!username) {
      return null
    }
    return {
      username,
      profileUrl: `https://vsco.co/${username}/gallery`
    }
  } catch {
    return null
  }
}

/** Keep photo galleries out of single-media and transcription flows. */
export const resolveDownloadTaskKind = (
  url: string,
  requestedType: 'audio' | 'video'
): TaskKind => {
  if (resolveSocialSource(url)) {
    return 'social-media'
  }
  const threads = normalizeThreadsUrl(url)
  if (threads) {
    return threads.kind === 'post' ? 'threads-post' : 'threads-profile'
  }
  if (normalizeFacebookGalleryUrl(url)) {
    return 'facebook-gallery'
  }
  if (normalizeTikTokPhotoUrl(url)) {
    return 'tiktok-photo'
  }
  return normalizeVscoGalleryUrl(url) ? 'vsco-gallery' : requestedType
}

const createTailBuffer = (maxBytes: number): TailBuffer => {
  let buffer = ''
  return {
    append(text) {
      buffer += text
      if (buffer.length > maxBytes * 4) {
        buffer = buffer.slice(buffer.length - maxBytes)
      }
    },
    read() {
      return buffer.length > maxBytes ? buffer.slice(buffer.length - maxBytes) : buffer
    }
  }
}

export const resolveDefaultGalleryDlFilenameTemplate = (url: string): string => {
  if (normalizeThreadsUrl(url)) {
    return '{id}_{num:>02}.{extension}'
  }
  if (normalizeTikTokPhotoUrl(url)) {
    // Images enumerate from 1; the slideshow sound is num 0.
    return '{id}_{num:>02}.{extension}'
  }
  return normalizeVscoGalleryUrl(url) || normalizeFacebookGalleryUrl(url)
    ? '{id}.{extension}'
    : '{sidecar_media_id:?/_/}{media_id}.{extension}'
}

export const resolveGalleryDlFilenameTemplate = (
  url: string,
  options: GalleryDlTaskOptions
): string => {
  if (
    normalizeVscoGalleryUrl(url) ||
    normalizeFacebookGalleryUrl(url) ||
    normalizeTikTokPhotoUrl(url) ||
    normalizeThreadsUrl(url)
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

const makeNoopRun = (): ExecutorRun => ({
  cancel: async () => {
    // Nothing spawned.
  },
  pause: async () => {
    // Nothing spawned.
  }
})

const emitProgress = (
  events: ExecutorEvents,
  ctx: ExecutorContext,
  expectedAssetCount: number,
  discoveredCount: number,
  processedCount: number,
  ticks: number
): void => {
  const total = Math.max(expectedAssetCount, discoveredCount)
  const progress: TaskProgress = {
    percent: expectedAssetCount > 0 ? Math.min(processedCount / total, 0.99) : null,
    bytesDownloaded: null,
    bytesTotal: null,
    speedBps: null,
    etaMs: null,
    ticks
  }
  events.onProgress({
    taskId: ctx.taskId,
    attemptId: ctx.attemptId,
    progress,
    enteredProcessing: false
  })
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
  }

  run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun {
    const stdoutTail = createTailBuffer(STDOUT_TAIL_BYTES)
    const stderrTail = createTailBuffer(STDERR_TAIL_BYTES)
    const materializedFiles = new Set<string>()
    let settled = false
    let cancelRequested = false
    let killTimer: NodeJS.Timeout | null = null
    let stdoutCarry = ''
    let discoveredCount = 0
    let downloadedCount = 0
    let skippedCount = 0
    let failedCount = 0
    let ticks = 0
    let socialSummary: SocialCollectionSummary | undefined
    let socialComplete = false
    let protocolError = false

    const finishOnce = (event: Parameters<ExecutorEvents['onFinish']>[0]): void => {
      if (settled) {
        return
      }
      settled = true
      if (killTimer) {
        clearTimeout(killTimer)
        killTimer = null
      }
      events.onFinish(event)
    }

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
    const vscoGallery = normalizeVscoGalleryUrl(ctx.input.url)
    const facebookGallery = normalizeFacebookGalleryUrl(ctx.input.url)
    const tiktokPhoto = normalizeTikTokPhotoUrl(ctx.input.url)
    const threads = normalizeThreadsUrl(ctx.input.url)
    const galleryDirectorySegments =
      threads?.directorySegments ??
      facebookGallery?.directorySegments ??
      tiktokPhoto?.directorySegments ??
      (vscoGallery ? ['VSCO', vscoGallery.username, 'Gallery'] : null)
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
      ...(this.options.resolveExtraArgs?.(taskOptions.settings) ??
        buildGalleryDlRuntimeArgs(taskOptions.settings))
    ]
    const extractorArgs = resolveExtractorArgs({
      facebookGallery,
      tiktokPhoto,
      vscoGallery,
      threads
    })
    const args = buildArgs(
      threads?.url ??
        facebookGallery?.url ??
        tiktokPhoto?.url ??
        vscoGallery?.profileUrl ??
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
        finishOnce({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          result: {
            type: 'error',
            error: virtualError('unknown', 'Unsupported social media collection URL.'),
            exitCode: null
          },
          closedAt: this.options.clock(),
          stdoutTail: '',
          stderrTail: ''
        })
        return makeNoopRun()
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
        `vidbee-social:${socialCollectionUrl(socialSource)}`
      )
    }

    let binaryPath: string
    try {
      binaryPath = this.options.resolveBinaryPath()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      finishOnce({
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        result: {
          type: 'error',
          error: virtualError('binary-missing', message),
          exitCode: null
        },
        closedAt: this.options.clock(),
        stdoutTail: '',
        stderrTail: message
      })
      return makeNoopRun()
    }

    const ffmpegLocation = this.options.resolveFfmpegLocation?.()
    const childPath = ffmpegLocation
      ? `${ffmpegLocation}${path.delimiter}${process.env.PATH ?? ''}`
      : process.env.PATH

    let processHandle: ChildProcess
    try {
      processHandle = spawn(binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        // A PyInstaller launcher spawns the real downloader. Keep both in one
        // process group so cancellation cannot leave a child holding the pipes.
        detached: process.platform !== 'win32',
        env: {
          ...process.env,
          PATH: childPath
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      finishOnce({
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        result: {
          type: 'error',
          error: classify({ stderr: message, exitCode: null }),
          exitCode: null
        },
        closedAt: this.options.clock(),
        stdoutTail: '',
        stderrTail: message
      })
      return makeNoopRun()
    }

    events.onSpawn({
      taskId: ctx.taskId,
      attemptId: ctx.attemptId,
      pid: processHandle.pid ?? -1,
      pidStartedAt: null,
      kind: 'gallery-dl',
      spawnedAt: this.options.clock()
    })

    const processStdoutLine = (rawLine: string): void => {
      const line = rawLine.trimEnd()
      if (!line) {
        return
      }
      events.onStd({
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        stream: 'stdout',
        line
      })

      if (socialSource) {
        if (line.startsWith('__VIDBEE_SOCIAL__\t')) {
          try {
            const event: unknown = JSON.parse(line.slice('__VIDBEE_SOCIAL__\t'.length))
            if (
              !event ||
              typeof event !== 'object' ||
              !('summary' in event) ||
              !('type' in event) ||
              !['progress', 'complete'].includes(String(event.type))
            ) {
              throw new Error('Invalid social event')
            }
            socialSummary = SocialCollectionSummarySchema.parse(event.summary)
            socialComplete = event.type === 'complete'
            ticks += 1
            events.onProgress({
              taskId: ctx.taskId,
              attemptId: ctx.attemptId,
              enteredProcessing: false,
              progress: {
                percent: null,
                bytesDownloaded: socialSummary.totalSize,
                bytesTotal: null,
                speedBps: null,
                etaMs: null,
                ticks,
                collectionSummary: socialSummary
              }
            })
          } catch {
            protocolError = true
          }
        }
        return
      }

      if (line.startsWith(`${EVENT_PREFIX}\t`)) {
        const [, eventName, eventPath = ''] = line.split('\t', 3)
        const normalizedPath = eventPath.trim()
        if (eventName === 'prepare') {
          discoveredCount += 1
        } else if (eventName === 'after') {
          downloadedCount += 1
          if (normalizedPath) {
            materializedFiles.add(normalizedPath)
          }
        } else if (eventName === 'skip') {
          skippedCount += 1
          if (normalizedPath) {
            materializedFiles.add(normalizedPath)
          }
        } else if (eventName === 'error') {
          failedCount += 1
        }
        ticks += 1
        emitProgress(
          events,
          ctx,
          expectedAssetCount,
          discoveredCount,
          downloadedCount + skippedCount + failedCount,
          ticks
        )
        return
      }

      // Only structured after/skip events identify outputs. Human progress lines
      // may contain carriage-return fragments, ANSI codes, or partial paths.
    }

    processHandle.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdoutTail.append(text)
      stdoutCarry += text
      if (stdoutCarry.length > 1024 * 1024) {
        protocolError = true
        stdoutCarry = stdoutCarry.slice(-1024 * 1024)
      }
      const lines = stdoutCarry.split(/\r?\n/)
      stdoutCarry = lines.pop() ?? ''
      for (const line of lines) {
        processStdoutLine(line)
      }
    })

    let stderrCarry = ''
    processHandle.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrTail.append(text)
      stderrCarry += text
      if (stderrCarry.length > 1024 * 1024) {
        stderrCarry = stderrCarry.slice(-1024 * 1024)
      }
      const lines = stderrCarry.split(/\r?\n/)
      stderrCarry = lines.pop() ?? ''
      for (const rawLine of lines) {
        const line = rawLine.trimEnd()
        if (!line) {
          continue
        }
        events.onStd({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          stream: 'stderr',
          line,
          expectedSilenceMs: galleryWaitDurationMs(line)
        })
      }
    })

    const finalizeProcess = async (exitCode: number | null): Promise<void> => {
      if (settled) {
        return
      }
      if (stdoutCarry.trim()) {
        processStdoutLine(stdoutCarry)
      }
      const closedAt = this.options.clock()
      const stdout = stdoutTail.read()
      const stderr = stderrTail.read()

      if (cancelRequested) {
        finishOnce({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          result: { type: 'cancelled' },
          closedAt,
          stdoutTail: stdout,
          stderrTail: stderr
        })
        return
      }

      if (socialSource && exitCode === 0) {
        const summary = socialSummary
        const resolvedDirectory = await realpath(configuredOutputDirectory).catch(() =>
          path.resolve(configuredOutputDirectory)
        )
        const manifest = path.join(resolvedDirectory, '.vidbee', 'social-media.sqlite')
        const verified =
          summary &&
          socialComplete &&
          !protocolError &&
          summary.reason !== 'incomplete' &&
          summary.failed === 0 &&
          summary.manifestPath === manifest &&
          (await stat(manifest).catch(() => null))?.isFile()
        if (cancelRequested) {
          finishOnce({
            taskId: ctx.taskId,
            attemptId: ctx.attemptId,
            result: { type: 'cancelled' },
            closedAt,
            stdoutTail: stdout,
            stderrTail: stderr
          })
          return
        }
        if (!verified) {
          const message =
            'Collection incomplete: missing traversal result or unverified media. Successfully saved files are retained.'
          finishOnce({
            taskId: ctx.taskId,
            attemptId: ctx.attemptId,
            result: { type: 'error', error: virtualError('output-missing', message), exitCode },
            closedAt,
            stdoutTail: stdout,
            stderrTail: message
          })
          return
        }
        finishOnce({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          result: {
            type: 'success',
            output: {
              filePath: manifest,
              size: summary.totalSize,
              durationMs: null,
              sha256: null,
              outputDirectory: resolvedDirectory,
              fileCount: summary.downloaded + summary.existing,
              downloadedCount: summary.downloaded,
              skippedCount: summary.existing,
              failedCount: 0,
              totalSize: summary.totalSize,
              collectionSummary: summary
            }
          },
          closedAt,
          stdoutTail: stdout,
          stderrTail: stderr
        })
        return
      }

      if (exitCode === 0) {
        const completedAssetCount = downloadedCount + skippedCount
        const missingAssetCount = Math.max(
          Math.max(discoveredCount, expectedAssetCount) - completedAssetCount - failedCount,
          0
        )
        const nonUniqueAssetCount = Math.max(completedAssetCount - materializedFiles.size, 0)
        if (failedCount > 0 || missingAssetCount > 0 || nonUniqueAssetCount > 0) {
          const message = `Gallery incomplete: ${failedCount} failed, ${missingAssetCount} unfinished, and ${nonUniqueAssetCount} non-unique assets.`
          finishOnce({
            taskId: ctx.taskId,
            attemptId: ctx.attemptId,
            result: {
              type: 'error',
              error: virtualError('unknown', message),
              exitCode: 0
            },
            closedAt,
            stdoutTail: stdout,
            stderrTail: stderr || message
          })
          return
        }
        const files = [...materializedFiles]
        const firstFile = files[0] ?? ''
        const { totalSize, firstFileSize, invalidCount } = await inspectFiles(files)
        if (cancelRequested) {
          finishOnce({
            taskId: ctx.taskId,
            attemptId: ctx.attemptId,
            result: { type: 'cancelled' },
            closedAt,
            stdoutTail: stdout,
            stderrTail: stderr
          })
          return
        }
        if (files.length === 0 || invalidCount > 0) {
          const message = `Gallery output missing or empty: ${invalidCount} invalid files among ${files.length} reported outputs.`
          finishOnce({
            taskId: ctx.taskId,
            attemptId: ctx.attemptId,
            result: { type: 'error', error: virtualError('output-missing', message), exitCode: 0 },
            closedAt,
            stdoutTail: stdout,
            stderrTail: stderr || message
          })
          return
        }
        const isProfileCategory =
          ctx.input.kind === 'instagram-profile-category' || Boolean(galleryDirectorySegments)
        const output: TaskOutput = {
          filePath: firstFile || outputDirectory,
          size: isProfileCategory ? totalSize : firstFileSize,
          durationMs: null,
          sha256: null,
          formatId: null,
          outputDirectory: isProfileCategory ? outputDirectory : undefined,
          fileCount: isProfileCategory ? files.length : undefined,
          downloadedCount: isProfileCategory ? downloadedCount : undefined,
          skippedCount: isProfileCategory ? skippedCount : undefined,
          failedCount: isProfileCategory ? failedCount : undefined,
          totalSize: isProfileCategory ? totalSize : undefined
        }
        finishOnce({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          result: { type: 'success', output },
          closedAt,
          stdoutTail: stdout,
          stderrTail: stderr
        })
        return
      }

      finishOnce({
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        result: {
          type: 'error',
          error: classify({
            stderr: stderr || `gallery-dl exited with code ${exitCode ?? -1}`,
            exitCode
          }),
          exitCode
        },
        closedAt,
        stdoutTail: stdout,
        stderrTail: stderr
      })
    }

    processHandle.once('close', (exitCode) => {
      void finalizeProcess(exitCode).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        finishOnce({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          result: { type: 'error', error: virtualError('unknown', message), exitCode },
          closedAt: this.options.clock(),
          stdoutTail: stdoutTail.read(),
          stderrTail: message
        })
      })
    })

    processHandle.once('error', (error) => {
      const closedAt = this.options.clock()
      if (cancelRequested) {
        finishOnce({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          result: { type: 'cancelled' },
          closedAt,
          stdoutTail: stdoutTail.read(),
          stderrTail: stderrTail.read()
        })
        return
      }
      finishOnce({
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        result: {
          type: 'error',
          error: classify({ stderr: error.message, exitCode: null }),
          exitCode: null
        },
        closedAt,
        stdoutTail: stdoutTail.read(),
        stderrTail: stderrTail.read()
      })
    })

    const signalProcess = (signal: 'SIGTERM' | 'SIGKILL'): void => {
      if (!processHandle.pid) {
        return
      }
      if (process.platform === 'win32') {
        killProcessTree(processHandle.pid, signal)
      } else {
        process.kill(-processHandle.pid, signal)
      }
    }

    const cancel = async (timeout?: number): Promise<void> => {
      if (settled) {
        return
      }
      cancelRequested = true
      const grace = timeout ?? this.options.killGraceMs
      try {
        signalProcess('SIGTERM')
      } catch {
        // Process already exited.
      }
      if (killTimer) {
        clearTimeout(killTimer)
      }
      if (grace <= 0) {
        try {
          signalProcess('SIGKILL')
        } catch {
          // Process already exited.
        }
        return
      }
      killTimer = setTimeout(() => {
        try {
          signalProcess('SIGKILL')
        } catch {
          // Process already exited.
        }
      }, grace)
    }

    return {
      cancel,
      pause: () => cancel(this.options.killGraceMs)
    }
  }
}

const GALLERY_DL_HOSTS = ['instagram.com', 'instagr.am', 'cdninstagram.com'] as const

const resolveExtractorArgs = (galleries: {
  threads: unknown
  facebookGallery: unknown
  tiktokPhoto: unknown
  vscoGallery: unknown
}): readonly string[] => {
  if (galleries.threads) {
    return ['--sleep-request', '1', '--sleep-429', '60', '--retries', '3']
  }
  if (galleries.facebookGallery) {
    return FACEBOOK_GALLERY_DL_EXTRACTOR_ARGS
  }
  if (galleries.tiktokPhoto) {
    return TIKTOK_PHOTO_GALLERY_DL_EXTRACTOR_ARGS
  }
  return galleries.vscoGallery
    ? VSCO_GALLERY_DL_EXTRACTOR_ARGS
    : INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS
}

export const shouldUseGalleryDl = (url: string): boolean => {
  if (resolveSocialSource(url)) {
    return true
  }
  if (
    normalizeVscoGalleryUrl(url) ||
    normalizeFacebookGalleryUrl(url) ||
    normalizeTikTokPhotoUrl(url) ||
    normalizeThreadsUrl(url)
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
