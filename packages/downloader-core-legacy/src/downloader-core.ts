import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import * as NodePath from '@effect/platform-node/NodePath'
import { runLegacyPromise, runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { Downloader } from '../../downloader-core/src/Downloader.service.js'
import { DownloaderHost } from '../../downloader-core/src/DownloaderHost.service.js'
import { layer as downloaderLayer } from '../../downloader-core/src/downloader-core.js'
import { layer as ytProcessLayer } from '../../downloader-core/src/YtDlpProcess.layer.js'
import { DownloadArgumentsLive } from '../../downloader-core/src/DownloadArguments.layer.js'
import { DownloadTiming } from '../../downloader-core/src/DownloadTiming.service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import { DownloadFilesLegacy } from './DownloadFiles.layer.js'
import { DownloadHostLegacy } from './DownloadHost.layer.js'
import { makeProcessLayer } from './Process.layer.js'
import { argumentError } from './arguments-runtime.js'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lowerChildPriority } from '@vidbee/task-queue-legacy/process'
import YTDlpWrap from 'yt-dlp-wrap-plus'
import type {
  CreateDownloadInput,
  DownloadRuntimeSettings,
  DownloadTask,
  PlaylistDownloadInput,
  PlaylistDownloadResult,
  PlaylistInfo,
  VideoFormat,
  VideoInfo
} from './types'
import { mapPlaylistInfo, planPlaylistDownloadOrder } from './playlist-plan'
import {
  buildPlaylistInfoArgs,
  buildVideoInfoArgs,
  retryTransientYtDlpNetworkError
} from './yt-dlp-args'
import { resolveYtDlpWrapCtor } from './yt-dlp-wrap'

interface YtDlpExecProcess {
  ytDlpProcess?: {
    pid?: number
    stdout?: NodeJS.ReadableStream
    stderr?: NodeJS.ReadableStream
  }
  on(event: 'progress', listener: (payload: ProgressPayload) => void): this
  on(event: 'close', listener: (code: number | null) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  once(event: 'close', listener: (code: number | null) => void): this
  once(event: 'error', listener: (error: Error) => void): this
}

interface YtDlpWrapInstance {
  exec(args: string[], options?: { signal?: AbortSignal; detached?: boolean }): YtDlpExecProcess
}

type YtDlpWrapConstructor = new (binaryPath: string) => YtDlpWrapInstance
const YTDlpWrapCtor = resolveYtDlpWrapCtor<YtDlpWrapConstructor>(YTDlpWrap)

interface RawVideoInfo {
  id?: string
  title?: string
  thumbnail?: string | null
  duration?: number | null
  extractor_key?: string | null
  webpage_url?: string | null
  description?: string | null
  view_count?: number | null
  uploader?: string | null
  tags?: unknown
  formats?: Array<{
    format_id?: string | null
    ext?: string | null
    width?: number | null
    height?: number | null
    fps?: number | null
    vcodec?: string | null
    acodec?: string | null
    filesize?: number | null
    filesize_approx?: number | null
    format_note?: string | null
    tbr?: number | null
    quality?: number | null
    protocol?: string | null
    language?: string | null
    video_ext?: string | null
    audio_ext?: string | null
  }>
}

interface RawPlaylistInfo {
  id?: string | null
  title?: string | null
  entries?: Record<string, unknown>[]
}

interface ProgressPayload {
  percent?: number
  currentSpeed?: string
  eta?: string
  downloaded?: string
  total?: string
}

export interface DownloaderCoreOptions {
  downloadDir?: string
  maxConcurrent?: number
  runtimeSettings?: DownloadRuntimeSettings
}

const DEFAULT_DOWNLOAD_DIR = path.join(os.homedir(), 'Downloads', 'VidBeep')
const DEFAULT_MAX_CONCURRENT = 3
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT_FROM_MODULE = path.resolve(MODULE_DIR, '../../..')

const getDesktopResourcesDirs = (): string[] => {
  const dirs: string[] = []
  const cwd = process.cwd()

  dirs.push(path.join(cwd, 'resources'))
  dirs.push(path.join(cwd, 'apps', 'desktop', 'resources'))
  dirs.push(path.resolve(cwd, '..', 'desktop', 'resources'))

  dirs.push(path.join(REPO_ROOT_FROM_MODULE, 'resources'))
  dirs.push(path.join(REPO_ROOT_FROM_MODULE, 'apps', 'desktop', 'resources'))

  if (process.env.NODE_ENV === 'development') {
    dirs.push(path.join(REPO_ROOT_FROM_MODULE, 'apps', 'desktop', 'resources'))
  }

  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    dirs.push(path.join(resourcesPath, 'app.asar.unpacked', 'resources'))
    dirs.push(path.join(resourcesPath, 'resources'))
  }

  return Array.from(new Set(dirs))
}

const ensureExecutable = (targetPath: string): void => {
  if (process.platform === 'win32') {
    return
  }
  try {
    fs.chmodSync(targetPath, 0o755)
  } catch {
    // Ignore permission errors and let process execution decide.
  }
}

const resolveBundledYtDlpPath = (): string | undefined => {
  const binaryName =
    process.platform === 'win32'
      ? 'yt-dlp.exe'
      : process.platform === 'darwin'
        ? 'yt-dlp_macos'
        : 'yt-dlp_linux'

  for (const resourcesDir of getDesktopResourcesDirs()) {
    const candidate = path.join(resourcesDir, binaryName)
    if (!fs.existsSync(candidate)) {
      continue
    }
    ensureExecutable(candidate)
    return candidate
  }

  return undefined
}

const resolveBundledFfmpegLocation = (): string | undefined => {
  const ffmpegBinaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const ffprobeBinaryName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'

  for (const resourcesDir of getDesktopResourcesDirs()) {
    const candidateDir = path.join(resourcesDir, 'ffmpeg')
    const ffmpegPath = path.join(candidateDir, ffmpegBinaryName)
    const ffprobePath = path.join(candidateDir, ffprobeBinaryName)
    if (!(fs.existsSync(ffmpegPath) && fs.existsSync(ffprobePath))) {
      continue
    }
    ensureExecutable(ffmpegPath)
    ensureExecutable(ffprobePath)
    return candidateDir
  }

  return undefined
}

const tryCommandPath = (command: string): string | null => {
  const commandName = process.platform === 'win32' ? `where ${command}` : `which ${command}`
  try {
    const output = execSync(commandName, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .split(/\r?\n/)
      .map((value) => value.trim())
      .find((value) => value.length > 0)
    return output ?? null
  } catch {
    return null
  }
}

const resolveYtDlpPath = (): string => {
  const envPath = process.env.YTDLP_PATH?.trim()
  if (envPath && fs.existsSync(envPath)) {
    return envPath
  }
  const bundledPath = resolveBundledYtDlpPath()
  if (bundledPath) {
    return bundledPath
  }
  const commandPath = tryCommandPath('yt-dlp')
  if (commandPath) {
    return commandPath
  }
  throw new Error('yt-dlp binary not found. Set YTDLP_PATH or install yt-dlp in PATH.')
}

const resolveFfmpegLocation = (ytDlpPath?: string): string | undefined => {
  const ffmpegBinaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const ffprobeBinaryName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
  const resolveFromDirectory = (directory: string): string | undefined => {
    const ffmpegPath = path.join(directory, ffmpegBinaryName)
    const ffprobePath = path.join(directory, ffprobeBinaryName)
    if (!(fs.existsSync(ffmpegPath) && fs.existsSync(ffprobePath))) {
      return undefined
    }
    ensureExecutable(ffmpegPath)
    ensureExecutable(ffprobePath)
    return directory
  }
  const envPath = process.env.FFMPEG_PATH?.trim()
  if (envPath && fs.existsSync(envPath)) {
    const stats = fs.statSync(envPath)
    if (stats.isDirectory()) {
      return resolveFromDirectory(envPath)
    }
    const candidateDir = path.dirname(envPath)
    return resolveFromDirectory(candidateDir)
  }

  if (ytDlpPath) {
    const ytDlpDir = path.dirname(ytDlpPath)
    const sameDirResolved = resolveFromDirectory(ytDlpDir)
    if (sameDirResolved) {
      return sameDirResolved
    }

    // Align with Desktop resource layout: resources/yt-dlp_* + resources/ffmpeg/{ffmpeg,ffprobe}
    const siblingDirResolved = resolveFromDirectory(path.join(ytDlpDir, 'ffmpeg'))
    if (siblingDirResolved) {
      return siblingDirResolved
    }
  }

  const bundledLocation = resolveBundledFfmpegLocation()
  if (bundledLocation) {
    return bundledLocation
  }

  const commandPath = tryCommandPath('ffmpeg')
  if (commandPath) {
    const resolved = resolveFromDirectory(path.dirname(commandPath))
    if (resolved) {
      return resolved
    }
  }

  if (process.platform === 'darwin') {
    const macCommonDirs = ['/opt/homebrew/bin', '/usr/local/bin']
    for (const dirPath of macCommonDirs) {
      const resolved = resolveFromDirectory(dirPath)
      if (resolved) {
        return resolved
      }
    }
  }

  return undefined
}

const resolveJsRuntimePath = (runtime: string): string | undefined => {
  const envPath = process.env.YTDLP_JS_RUNTIME_PATH?.trim()
  if (envPath && fs.existsSync(envPath)) {
    return envPath
  }

  const runtimeCandidates: string[] = []
  if (runtime === 'node') {
    const nodeName = process.platform === 'win32' ? 'node.exe' : 'node'
    runtimeCandidates.push(path.join('node', nodeName), nodeName)
  } else if (runtime === 'deno') {
    runtimeCandidates.push(process.platform === 'win32' ? 'deno.exe' : 'deno')
  } else if (runtime === 'bun') {
    runtimeCandidates.push(process.platform === 'win32' ? 'bun.exe' : 'bun')
  } else if (runtime === 'quickjs') {
    runtimeCandidates.push(process.platform === 'win32' ? 'qjs.exe' : 'qjs')
  } else {
    runtimeCandidates.push(runtime)
    if (process.platform === 'win32' && !runtime.endsWith('.exe')) {
      runtimeCandidates.push(`${runtime}.exe`)
    }
  }

  for (const resourcesDir of getDesktopResourcesDirs()) {
    for (const candidateName of runtimeCandidates) {
      const candidatePath = path.join(resourcesDir, candidateName)
      if (!fs.existsSync(candidatePath)) {
        continue
      }
      ensureExecutable(candidatePath)
      return candidatePath
    }
  }

  const commandPath = tryCommandPath(runtime)
  return commandPath ?? undefined
}

const resolveJsRuntimeArgs = (): string[] => {
  const runtime = (process.env.YTDLP_JS_RUNTIME || 'node').trim()
  if (!runtime || runtime === 'none') {
    return []
  }

  const runtimePath = resolveJsRuntimePath(runtime)
  if (runtimePath) {
    return ['--js-runtimes', `${runtime}:${runtimePath}`]
  }

  return process.env.YTDLP_JS_RUNTIME ? ['--js-runtimes', runtime] : []
}

const toOptionalNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined
  }

  return value
}

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  return trimmed
}

const toOptionalStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }

  const list = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  return list.length > 0 ? list : undefined
}

export class DownloaderCore extends EventEmitter {
  private readonly maxConcurrent: number
  private readonly downloadDir: string
  private readonly defaultRuntimeSettings: DownloadRuntimeSettings
  private readonly jsRuntimeArgs: string[]
  private ytdlp: YtDlpWrapInstance | null = null
  private ffmpegLocation: string | undefined
  private binaryPath = ''
  private readonly service: typeof Downloader.Service
  private readonly sync: <A,E>(effect: Effect.Effect<A,E>) => A
  private readonly promise: <A,E>(effect: Effect.Effect<A,E>) => Promise<A>
  constructor(options: DownloaderCoreOptions = {}) {
    super()
    this.maxConcurrent = Math.max(options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT, 1)
    this.downloadDir = options.downloadDir?.trim() || DEFAULT_DOWNLOAD_DIR
    this.defaultRuntimeSettings = { ...(options.runtimeSettings ?? {}) }
    this.jsRuntimeArgs = resolveJsRuntimeArgs()
    const host = Layer.succeed(DownloaderHost, {
      downloadDir: this.downloadDir, maxConcurrent: this.maxConcurrent,
      runtimeSettings: this.defaultRuntimeSettings, jsRuntimeArgs: this.jsRuntimeArgs,
      platform: process.platform, now: Date.now, uuid: randomUUID,
      initialize: Effect.try({ try: () => {
        this.initializeSync()
        return { binary: this.binaryPath, ffmpeg: this.ffmpegLocation }
      }, catch: cause => new HostFailure({ operation: 'initialize', legacyMessage: cause instanceof Error ? cause.message : String(cause), cause }) }),
      cancellation: Effect.sync(() => { const controller = new AbortController(); return { signal: controller.signal, abort: Effect.sync(() => controller.abort()) } }),
      lowerPriority: pid => Effect.sync(() => lowerChildPriority(pid)),
      emit: event => Effect.sync(() => { this.emit(event.type, event.value) }),
    })
    const base = Layer.mergeAll(DownloadFilesLegacy, DownloadHostLegacy, NodePath.layer)
    const dependencies = Layer.mergeAll(host, NodePath.layer, Layer.succeed(Scheduler.PreventSchedulerYield, true),
      DownloadArgumentsLive.pipe(Layer.provide(base)),
      Layer.succeed(DownloadTiming, { turn: () => Effect.callback(resume => { queueMicrotask(() => resume(Effect.void)) }), sleep: ms => Effect.callback(resume => { const timer = setTimeout(() => resume(Effect.void), ms); return Effect.sync(() => clearTimeout(timer)) }) }),
      ytProcessLayer.pipe(Layer.provide(makeProcessLayer(() => runtime, argumentError))),
    )
    const runtime: ManagedRuntime.ManagedRuntime<Downloader, never> = ManagedRuntime.make(downloaderLayer.pipe(Layer.provide(dependencies)))
    this.sync = effect => runLegacySync(runtime, effect, argumentError)
    this.promise = effect => runLegacyPromise(runtime, effect, argumentError)
    this.service = runtime.runSync(Downloader)
  }

  private initializeSync(): void {
    if (this.ytdlp) {
      return
    }
    fs.mkdirSync(this.downloadDir, { recursive: true })
    const ytDlpPath = resolveYtDlpPath()
    this.binaryPath = ytDlpPath
    this.ffmpegLocation = resolveFfmpegLocation(ytDlpPath)
    if (this.ffmpegLocation) {
      process.env.FFMPEG_PATH = this.ffmpegLocation
    }
    this.ytdlp = new YTDlpWrapCtor(ytDlpPath)
  }

  private getYtDlp(): YtDlpWrapInstance {
    if (!this.ytdlp) {
      throw new Error('DownloaderCore is not initialized.')
    }
    return this.ytdlp
  }

  private resolveRuntimeSettings(
    taskSettings?: DownloadRuntimeSettings | undefined
  ): DownloadRuntimeSettings {
    const merged: DownloadRuntimeSettings = {
      ...this.defaultRuntimeSettings,
      ...(taskSettings ?? {})
    }
    const downloadPath =
      taskSettings?.downloadPath?.trim() ||
      this.defaultRuntimeSettings.downloadPath?.trim() ||
      this.downloadDir

    return {
      ...merged,
      downloadPath
    }
  }

  private async runJsonCommand<T>(args: string[]): Promise<T> {
    const process = this.getYtDlp().exec(args)
    lowerChildPriority(process.ytDlpProcess?.pid)
    let stdout = ''
    let stderr = ''

    process.ytDlpProcess?.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    process.ytDlpProcess?.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    const code = await new Promise<number | null>((resolve, reject) => {
      process.once('close', (exitCode: number | null) => resolve(exitCode))
      process.once('error', reject)
    })

    if (code !== 0 || !stdout.trim()) {
      throw new Error(stderr.trim() || `yt-dlp exited with code ${code ?? -1}`)
    }

    return JSON.parse(stdout) as T
  }

  async getVideoInfo(url: string, runtimeSettings?: DownloadRuntimeSettings): Promise<VideoInfo> {
    await this.initialize()
    const target = url.trim()
    if (!target) {
      throw new Error('URL is required.')
    }

    const raw = await retryTransientYtDlpNetworkError(() =>
      this.runJsonCommand<RawVideoInfo>(
        buildVideoInfoArgs(target, this.resolveRuntimeSettings(runtimeSettings), this.jsRuntimeArgs)
      )
    )
    const formats: VideoFormat[] = (raw.formats ?? []).map((format) => ({
      formatId: format.format_id ?? 'unknown',
      ext: format.ext ?? 'unknown',
      width: toOptionalNumber(format.width),
      height: toOptionalNumber(format.height),
      fps: toOptionalNumber(format.fps),
      vcodec: toOptionalString(format.vcodec),
      acodec: toOptionalString(format.acodec),
      filesize: toOptionalNumber(format.filesize),
      filesizeApprox: toOptionalNumber(format.filesize_approx),
      formatNote: toOptionalString(format.format_note),
      tbr: toOptionalNumber(format.tbr),
      quality: toOptionalNumber(format.quality),
      protocol: toOptionalString(format.protocol),
      language: toOptionalString(format.language),
      videoExt: toOptionalString(format.video_ext),
      audioExt: toOptionalString(format.audio_ext)
    }))

    return {
      id: raw.id ?? target,
      title: raw.title ?? target,
      thumbnail: toOptionalString(raw.thumbnail),
      duration: toOptionalNumber(raw.duration),
      extractorKey: toOptionalString(raw.extractor_key),
      webpageUrl: toOptionalString(raw.webpage_url),
      description: toOptionalString(raw.description),
      viewCount: toOptionalNumber(raw.view_count),
      uploader: toOptionalString(raw.uploader),
      tags: toOptionalStringArray(raw.tags),
      formats
    }
  }

  async getPlaylistInfo(
    url: string,
    runtimeSettings?: DownloadRuntimeSettings
  ): Promise<PlaylistInfo> {
    await this.initialize()
    const target = url.trim()
    if (!target) {
      throw new Error('URL is required.')
    }

    const raw = await retryTransientYtDlpNetworkError(() =>
      this.runJsonCommand<RawPlaylistInfo>(
        buildPlaylistInfoArgs(
          target,
          this.resolveRuntimeSettings(runtimeSettings),
          this.jsRuntimeArgs
        )
      )
    )

    return mapPlaylistInfo(raw, target)
  }

  async startPlaylistDownload(input: PlaylistDownloadInput): Promise<PlaylistDownloadResult> {
    const playlist = await this.getPlaylistInfo(input.url, input.settings)
    const groupId = `playlist_group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    if (playlist.entryCount === 0) {
      return {
        groupId,
        playlistId: playlist.id,
        playlistTitle: playlist.title,
        type: input.type,
        totalCount: 0,
        startIndex: 0,
        endIndex: 0,
        entries: []
      }
    }

    let selectedEntries: PlaylistInfo['entries'] = []

    if (input.entryIds && input.entryIds.length > 0) {
      const selectedIdSet = new Set(input.entryIds)
      selectedEntries = playlist.entries.filter((entry) => selectedIdSet.has(entry.id))
    } else {
      const requestedStart = Math.max((input.startIndex ?? 1) - 1, 0)
      const requestedEnd = input.endIndex
        ? Math.min(input.endIndex - 1, playlist.entryCount - 1)
        : playlist.entryCount - 1
      const rangeStart = Math.min(requestedStart, requestedEnd)
      const rangeEnd = Math.max(requestedStart, requestedEnd)
      selectedEntries = playlist.entries.slice(rangeStart, rangeEnd + 1)
    }

    const createdEntries: PlaylistDownloadResult['entries'] = []

    for (const entry of planPlaylistDownloadOrder(selectedEntries)) {
      const download = await this.createDownload({
        url: entry.url,
        type: input.type,
        title: entry.title,
        thumbnail: entry.thumbnail,
        playlistId: groupId,
        playlistTitle: playlist.title,
        playlistIndex: entry.index,
        playlistSize: selectedEntries.length,
        format: input.format,
        audioFormat: input.audioFormat,
        audioFormatIds: input.audioFormatIds,
        customDownloadPath: input.customDownloadPath,
        customFilenameTemplate: input.customFilenameTemplate,
        containerFormat: input.containerFormat,
        settings: input.settings
      })

      createdEntries.push({
        downloadId: download.id,
        entryId: entry.id,
        title: entry.title,
        url: entry.url,
        index: entry.index
      })
    }

    return {
      groupId,
      playlistId: playlist.id,
      playlistTitle: playlist.title,
      type: input.type,
      totalCount: selectedEntries.length,
      startIndex: selectedEntries[0]?.index ?? 0,
      endIndex: selectedEntries.at(-1)?.index ?? 0,
      entries: createdEntries
    }
  }

  initialize(): Promise<void> { return this.promise(this.service.initialize) }
  createDownload(input: CreateDownloadInput): Promise<DownloadTask> { return this.promise(this.service.createDownload(input)) }
  cancelDownload(id: string): Promise<boolean> { return this.promise(this.service.cancelDownload(id)) }
  removeHistoryItems(ids: string[]): number { return this.sync(this.service.removeHistoryItems(ids)) }
  removeHistoryByPlaylist(id: string): number { return this.sync(this.service.removeHistoryByPlaylist(id)) }
  listDownloads(): DownloadTask[] { return this.sync(this.service.listDownloads) }
  listHistory(): DownloadTask[] { return this.sync(this.service.listHistory) }
  getStatus(): {active:number;pending:number} { return this.sync(this.service.getStatus) }
}
