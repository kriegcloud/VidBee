import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import { runLegacyPromise, runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { TaskExecutor } from '@vidbee/task-queue/TaskExecutor.service'
import { YtDlpExecutorHost } from '../../downloader-core/src/YtDlpExecutorHost.service.js'
import { DownloadTiming } from '../../downloader-core/src/DownloadTiming.service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import { layer as executorLayer } from '../../downloader-core/src/YtDlpExecutor.layer.js'
import { layer as ytDlpProcessLayer } from '../../downloader-core/src/YtDlpProcess.layer.js'
import { DownloadFilesLegacy } from './DownloadFiles.layer.js'
import { makeProcessLayer } from './Process.layer.js'
import { makeInjectedYtDlpProcessLayer } from './YtDlpProcess.layer.js'
import { executorError } from './executor-errors.js'
/**
 * YtDlpExecutor — host-neutral implementation of the @vidbee/task-queue-legacy
 * `Executor` interface. Owns yt-dlp spawn, progress parsing, postprocess
 * detection, output discovery, and SIGTERM/SIGKILL cancel semantics.
 *
 * The executor is deliberately minimal: it does NOT manage queues, history,
 * crash recovery, or persistence — those live in TaskQueueAPI. Hosts wire
 * one of these per process and feed it into TaskQueueAPI so Desktop, Web/API
 * and CLI all execute downloads identically.
 *
 * Reference: NEX-131 issue body §A; design doc §5 / §10.
 */
import type {
  Executor,
  ExecutorContext,
  ExecutorEvents,
  ExecutorRun,
  TaskInput,
  TaskOutput
} from '@vidbee/task-queue-legacy'
import {
  lowerChildPriority
} from '@vidbee/task-queue-legacy/process'
import YTDlpWrap from 'yt-dlp-wrap-plus'
import type { OneClickContainerOption } from './format-preferences'
import type { DownloadRuntimeSettings } from './types'
import {
  buildDownloadArgs,
  formatYtDlpCommand,
  resolveSubtitleDownloadSkipReason,
} from './yt-dlp-args'
import type { YtDlpProgressPayload } from './yt-dlp-progress'
import { resolveYtDlpWrapCtor } from './yt-dlp-wrap'

interface YtDlpExecProcess {
  ytDlpProcess?: {
    pid?: number
    stdout?: NodeJS.ReadableStream
    stderr?: NodeJS.ReadableStream
    kill: (signal?: NodeJS.Signals | number) => boolean
  }
  on(event: 'progress', listener: (payload: YtDlpProgressPayload) => void): this
  on(event: 'close', listener: (code: number | null) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  once(event: 'close', listener: (code: number | null) => void): this
  once(event: 'error', listener: (error: Error) => void): this
}

interface YtDlpWrapInstance {
  exec(args: string[], options?: { signal?: AbortSignal; detached?: boolean }): YtDlpExecProcess
}

type YtDlpWrapConstructor = new (binaryPath: string) => YtDlpWrapInstance
resolveYtDlpWrapCtor<YtDlpWrapConstructor>(YTDlpWrap)

/**
 * Per-task data hosts pack into `Task.input.options` when calling
 * `TaskQueueAPI.add({ input })`. Adapters that route through downloads.*
 * routes MUST shape options to this contract; `YtDlpExecutor` reads them
 * back out at spawn time.
 */
export interface YtDlpTaskOptions {
  type?: 'video' | 'audio'
  format?: string
  audioFormat?: string
  audioFormatIds?: readonly string[]
  startTime?: string
  endTime?: string
  customDownloadPath?: string
  customFilenameTemplate?: string
  containerFormat?: OneClickContainerOption
  /** Per-task overrides on top of the executor's default DownloadRuntimeSettings. */
  settings?: DownloadRuntimeSettings
  /**
   * Display-only metadata stored at create time. Surfaces back through the
   * legacy projection so renderers see the same fields they used to.
   */
  title?: string
  thumbnail?: string
  description?: string
  channel?: string
  uploader?: string
  duration?: number
  viewCount?: number
  tags?: readonly string[]
  playlistTitle?: string
  playlistSize?: number
  mediaKind?: 'photo' | 'video' | 'recording'
  batchId?: string
  batchKind?: 'instagram-profile'
  batchTitle?: string
  batchCategory?: string
  batchOrder?: number
  batchSourceCount?: number
  batchAssetCount?: number
  galleryDlDirectoryTemplate?: string
  galleryDlFilenameTemplate?: string
  expectedAssetCount?: number
  fileSize?: number
  startedAt?: number
  completedAt?: number
  downloadPath?: string
}

export interface YtDlpExecutorOptions {
  /** yt-dlp binary path. Resolved lazily so adapters can pick one up after
   *  startup (e.g. desktop's auto-installer). */
  resolveYtDlpPath: () => string
  /** ffmpeg directory; passed to yt-dlp via `--ffmpeg-location`. Lazy. */
  resolveFfmpegLocation: () => string | undefined
  /** Default download dir if a task does not provide one. */
  defaultDownloadDir: string
  /** Default runtime settings (cookies, proxy, embed flags). */
  defaultRuntimeSettings?: DownloadRuntimeSettings
  /**
   * Extra argv injected after `buildDownloadArgs` (e.g. `--js-runtimes deno:/path`)
   * so adapters can plumb their own runtime resolution.
   */
  extraArgs?: () => readonly string[]
  /**
   * Override args builder. Mostly used by the CLI's `yt-dlp-forward` flow
   * which passes raw argv unchanged.
   */
  buildArgs?: (input: TaskInput, defaultDownloadDir: string) => string[]
  /**
   * Optional host hook that can replace cookies/proxy settings immediately
   * before yt-dlp starts, including retries.
   */
  prepareSettings?: (input: TaskInput) => Promise<DownloadRuntimeSettings | undefined>
  /** Grace period between SIGTERM and SIGKILL. Default 10s. */
  killGraceMs?: number
  /** Test seam. Defaults to Date.now. */
  clock?: () => number
  /** Test seam: override the yt-dlp-wrap-plus invocation. */
  spawnFn?: (binaryPath: string, args: string[], signal: AbortSignal) => YtDlpExecProcess
}

const DEFAULT_KILL_GRACE_MS = 10_000

export class YtDlpExecutor implements Executor {
  private readonly opts: Required<
    Omit<
      YtDlpExecutorOptions,
      'extraArgs' | 'buildArgs' | 'spawnFn' | 'defaultRuntimeSettings' | 'prepareSettings'
    >
  > &
    Pick<YtDlpExecutorOptions, 'extraArgs' | 'buildArgs' | 'spawnFn' | 'prepareSettings'> & {
      defaultRuntimeSettings: DownloadRuntimeSettings
    }
  private readonly runtime: ManagedRuntime.ManagedRuntime<TaskExecutor, never>

  constructor(options: YtDlpExecutorOptions) {
    this.opts = {
      resolveYtDlpPath: options.resolveYtDlpPath,
      resolveFfmpegLocation: options.resolveFfmpegLocation,
      defaultDownloadDir: options.defaultDownloadDir,
      defaultRuntimeSettings: options.defaultRuntimeSettings ?? {},
      extraArgs: options.extraArgs,
      buildArgs: options.buildArgs,
      prepareSettings: options.prepareSettings,
      killGraceMs: options.killGraceMs ?? DEFAULT_KILL_GRACE_MS,
      clock: options.clock ?? Date.now,
      spawnFn: options.spawnFn
    }
    const sync = <A>(operation: string, evaluate: () => A) => Effect.try({ try: evaluate, catch: cause => new HostFailure({ operation, cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) }) })
    const host = Layer.succeed(YtDlpExecutorHost, {
      now: this.opts.clock, parseDate: Date.parse, killGraceMs: this.opts.killGraceMs, platform: process.platform,
      prepareSettings: this.opts.prepareSettings ? input => { const pending = this.opts.prepareSettings!(input); return Effect.tryPromise({ try: () => pending, catch: cause => new HostFailure({ operation: 'prepareSettings', cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) }) }) } : undefined,
      command: (input, settings) => sync('buildArgs', () => ({ args: this.buildArgsFor(input, settings), settings: this.resolveRuntimeSettings(input, settings), initialSubtitleStatus: this.resolveInitialSubtitleStatus(input) as 'skipped-auth' | undefined, canRetryWithoutSubtitles: !(input.rawArgs?.length || this.opts.buildArgs) })),
      binary: sync('binary', this.opts.resolveYtDlpPath), ffmpeg: Effect.sync(this.opts.resolveFfmpegLocation),
      cancellation: Effect.sync(() => { const controller = new AbortController(); return { signal: controller.signal, abort: Effect.sync(() => { try { controller.abort() } catch {} }) } }),
      lowerPriority: pid => Effect.sync(() => lowerChildPriority(pid)),
    })
    const timing = Layer.succeed(DownloadTiming, {
      turn: () => Effect.void,
      sleep: milliseconds => Effect.callback(resume => { const timer = setTimeout(() => resume(Effect.void), milliseconds); return Effect.sync(() => clearTimeout(timer)) }),
    })
    const processLayer = this.opts.spawnFn
      ? makeInjectedYtDlpProcessLayer(() => this.runtime, executorError, this.opts.spawnFn)
      : ytDlpProcessLayer.pipe(Layer.provide(makeProcessLayer(() => this.runtime, executorError)))
    this.runtime = ManagedRuntime.make(executorLayer.pipe(Layer.provide(Layer.mergeAll(host, timing, DownloadFilesLegacy, processLayer, Layer.succeed(Scheduler.PreventSchedulerYield, true)))))
    this.runtime.runSync(Effect.void)

  }

  run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun {
    const handle = runLegacySync(this.runtime, Effect.flatMap(TaskExecutor, executor => executor.run(ctx, {
      emit: event => Effect.sync(() => {
        const { type, ...payload } = event
        switch (type) {
          case 'spawn': events.onSpawn(payload as Parameters<ExecutorEvents['onSpawn']>[0]); break
          case 'progress': events.onProgress(payload as Parameters<ExecutorEvents['onProgress']>[0]); break
          case 'processing': events.onProcessing?.(payload); break
          case 'std': events.onStd(payload as Parameters<ExecutorEvents['onStd']>[0]); break
          case 'finish': events.onFinish(payload as Parameters<ExecutorEvents['onFinish']>[0]); break
        }
      })
    })), executorError)
    return {
      cancel: timeout => runLegacyPromise(this.runtime, handle.cancel(timeout), executorError),
      pause: () => runLegacyPromise(this.runtime, handle.pause, executorError),
    }
  }

  /** Merge host defaults with per-task runtime setting overrides. */
  private resolveRuntimeSettings(
    input: TaskInput,
    override?: DownloadRuntimeSettings
  ): DownloadRuntimeSettings {
    const opts = (input.options ?? {}) as YtDlpTaskOptions
    return {
      ...this.opts.defaultRuntimeSettings,
      ...(opts.settings ?? {}),
      ...(override ?? {})
    }
  }

  /** Detect user-visible subtitle skips that happen before yt-dlp starts. */
  private resolveInitialSubtitleStatus(input: TaskInput): TaskOutput['subtitleStatus'] | undefined {
    if (input.rawArgs?.length || this.opts.buildArgs) {
      return undefined
    }
    const opts = (input.options ?? {}) as YtDlpTaskOptions
    const type = opts.type ?? (input.kind === 'audio' ? 'audio' : 'video')
    const skipReason = resolveSubtitleDownloadSkipReason(
      { type, url: input.url },
      this.resolveRuntimeSettings(input)
    )
    return skipReason === 'auth-required' ? 'skipped-auth' : undefined
  }

  /** Build the final yt-dlp arguments for one task input. */
  private buildArgsFor(input: TaskInput, settingsOverride?: DownloadRuntimeSettings): string[] {
    if (this.opts.buildArgs) {
      return this.opts.buildArgs(input, this.opts.defaultDownloadDir)
    }
    if (input.rawArgs && input.rawArgs.length > 0) {
      return [...input.rawArgs]
    }
    const opts = (input.options ?? {}) as YtDlpTaskOptions
    const type = opts.type ?? (input.kind === 'audio' ? 'audio' : 'video')
    const settings = this.resolveRuntimeSettings(input, settingsOverride)
    const downloadPath =
      opts.customDownloadPath?.trim() ||
      settings.downloadPath?.trim() ||
      this.opts.defaultDownloadDir
    const merged: DownloadRuntimeSettings = { ...settings, downloadPath }
    const extra = this.opts.extraArgs ? [...this.opts.extraArgs()] : []
    return buildDownloadArgs(
      {
        url: input.url,
        type,
        format: opts.format,
        audioFormat: opts.audioFormat,
        audioFormatIds: opts.audioFormatIds ? [...opts.audioFormatIds] : undefined,
        startTime: opts.startTime,
        endTime: opts.endTime,
        customDownloadPath: opts.customDownloadPath,
        customFilenameTemplate: opts.customFilenameTemplate,
        containerFormat: opts.containerFormat
      },
      this.opts.defaultDownloadDir,
      merged,
      extra
    )
  }

  /** Diagnostic: return the resolved argv yt-dlp would be invoked with. */
  describeCommandFor(input: TaskInput): string {
    return formatYtDlpCommand(this.buildArgsFor(input))
  }


}

// Re-export types adapters need to wire host-specific args building.
export type { ExecutorContext, ExecutorEvents, ExecutorRun, TaskInput }
