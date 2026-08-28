import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
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

import { buildGalleryDlRuntimeArgs, INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS } from './instagram-profile'
import type { DownloadRuntimeSettings } from './types'
import type { YtDlpTaskOptions } from './yt-dlp-executor'

const DEFAULT_KILL_GRACE_MS = 10_000
const STDOUT_TAIL_BYTES = 8 * 1024
const STDERR_TAIL_BYTES = 8 * 1024
const EVENT_PREFIX = '__VIDBEE_GDL__'
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
const SEQUENTIAL_TEMPLATE_REGEX = /^(\d+)\.%\(ext\)s$/
const VSCO_GALLERY_PATH = /^\/([^/?#]+)\/(?:gallery|images)\/?$/i

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

/** Keep multi-file VSCO galleries out of single-media and transcription flows. */
export const resolveDownloadTaskKind = (url: string, requestedType: 'audio' | 'video'): TaskKind =>
  normalizeVscoGalleryUrl(url) ? 'vsco-gallery' : requestedType

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

export const resolveDefaultGalleryDlFilenameTemplate = (url: string): string =>
  normalizeVscoGalleryUrl(url)
    ? '{id}.{extension}'
    : '{sidecar_media_id:?/_/}{media_id}.{extension}'

export const resolveGalleryDlFilenameTemplate = (
  url: string,
  options: GalleryDlTaskOptions
): string => {
  if (normalizeVscoGalleryUrl(url)) {
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
    percent: total > 0 ? Math.min(processedCount / total, 0.99) : null,
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

const readFileSize = (filePath: string): number => {
  try {
    return existsSync(filePath) ? statSync(filePath).size : 0
  } catch {
    return 0
  }
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
    const configuredOutputDirectory =
      taskOptions.customDownloadPath?.trim() ||
      taskOptions.settings?.downloadPath?.trim() ||
      this.options.defaultDownloadDir
    const vscoGallery = normalizeVscoGalleryUrl(ctx.input.url)
    const outputDirectory = vscoGallery
      ? path.join(configuredOutputDirectory, 'VSCO', vscoGallery.username, 'Gallery')
      : configuredOutputDirectory
    const directoryTemplate = taskOptions.galleryDlDirectoryTemplate?.trim() || outputDirectory
    const baseDirectory = taskOptions.galleryDlBaseDirectory?.trim()
    const directorySegments = taskOptions.galleryDlDirectorySegments
      ?.map((segment) => segment.trim())
      .filter(Boolean)
    const filenameTemplate = resolveGalleryDlFilenameTemplate(ctx.input.url, taskOptions)
    const filter = taskOptions.galleryDlFilter?.trim()
    const expectedAssetCount = Math.max(taskOptions.expectedAssetCount ?? 0, 0)
    const extraArgs = [
      ...(this.options.resolveExtraArgs?.(taskOptions.settings) ??
        buildGalleryDlRuntimeArgs(taskOptions.settings))
    ]
    const extractorArgs = vscoGallery
      ? VSCO_GALLERY_DL_EXTRACTOR_ARGS
      : INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS
    const args = buildArgs(
      vscoGallery?.profileUrl ?? ctx.input.url,
      directoryTemplate,
      filenameTemplate,
      [...extractorArgs, ...extraArgs],
      baseDirectory,
      directorySegments,
      filter
    )

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

      const candidate = line.startsWith('# ') ? line.slice(2).trim() : line.trim()
      if (candidate.startsWith('/') || /^[A-Za-z]:[\\/]/.test(candidate)) {
        materializedFiles.add(candidate)
      }
    }

    processHandle.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdoutTail.append(text)
      stdoutCarry += text
      const lines = stdoutCarry.split(/\r?\n/)
      stdoutCarry = lines.pop() ?? ''
      for (const line of lines) {
        processStdoutLine(line)
      }
    })

    processHandle.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrTail.append(text)
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trimEnd()
        if (!line) {
          continue
        }
        events.onStd({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          stream: 'stderr',
          line
        })
      }
    })

    processHandle.once('close', (exitCode) => {
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

      if (exitCode === 0) {
        const completedAssetCount = downloadedCount + skippedCount
        const missingAssetCount = Math.max(discoveredCount - completedAssetCount - failedCount, 0)
        const nonUniqueAssetCount = Math.max(completedAssetCount - materializedFiles.size, 0)
        if (
          vscoGallery &&
          (failedCount > 0 || missingAssetCount > 0 || nonUniqueAssetCount > 0)
        ) {
          const message = `VSCO gallery incomplete: ${failedCount} failed, ${missingAssetCount} unfinished, and ${nonUniqueAssetCount} non-unique assets.`
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
        const firstFileSize = firstFile ? readFileSize(firstFile) : 0
        const totalSize = files.reduce((sum, filePath) => sum + readFileSize(filePath), 0)
        const isProfileCategory =
          ctx.input.kind === 'instagram-profile-category' || Boolean(vscoGallery)
        const profileFileCount = vscoGallery
          ? materializedFiles.size
          : downloadedCount + skippedCount
        const output: TaskOutput = {
          filePath: firstFile || outputDirectory,
          size: isProfileCategory ? totalSize : firstFileSize,
          durationMs: null,
          sha256: null,
          formatId: null,
          outputDirectory: isProfileCategory ? outputDirectory : undefined,
          fileCount: isProfileCategory ? profileFileCount : undefined,
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

    const cancel = async (timeout?: number): Promise<void> => {
      if (settled) {
        return
      }
      cancelRequested = true
      const grace = timeout ?? this.options.killGraceMs
      try {
        processHandle.kill('SIGTERM')
      } catch {
        // Process already exited.
      }
      if (killTimer) {
        clearTimeout(killTimer)
      }
      if (grace <= 0) {
        try {
          processHandle.kill('SIGKILL')
        } catch {
          // Process already exited.
        }
        return
      }
      killTimer = setTimeout(() => {
        try {
          processHandle.kill('SIGKILL')
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

export const shouldUseGalleryDl = (url: string): boolean => {
  if (normalizeVscoGalleryUrl(url)) {
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
    if (ctx.input.kind === 'instagram-profile-category' || shouldUseGalleryDl(ctx.input.url)) {
      return this.galleryDl.run(ctx, events)
    }
    return this.ytDlp.run(ctx, events)
  }
}
