/**
 * apps/api host for @vidbee/task-queue.
 *
 * Constructs the single TaskQueueAPI used by /rpc/* and /events for the
 * Web/API surface, plus a thin yt-dlp metadata client used by `videoInfo`
 * and `playlist.info` (those calls are stateless and bypass the queue).
 *
 * Operational env vars (preserved from the pre-NEX-131 surface):
 *   VIDBEE_DOWNLOAD_DIR          – default download dir for new tasks
 *   VIDBEE_MAX_CONCURRENT        – Scheduler.maxConcurrency
 *   VIDBEE_HISTORY_STORE_PATH    – legacy history sqlite path; only used by
 *                                  scripts/migrate-history.ts now
 *   VIDBEE_PERSIST_QUEUE=1       – switch from in-memory to SQLite-backed
 *                                  TaskQueue (matches Desktop crash recovery)
 *   VIDBEE_TASK_QUEUE_DB         – override task-queue sqlite path
 *   YTDLP_PATH / FFMPEG_PATH     – binary overrides (unchanged)
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TASK_QUEUE_DDL_V1 } from '@vidbee/db/task-queue'
import { TRANSCRIPT_DDL_V1 } from '@vidbee/db/transcripts'
import {
  GalleryDlExecutor,
  HostRoutingExecutor,
  InstagramProfileInspector,
  restoreInstagramProfileGroupCaps,
  YtDlpExecutor
} from '@vidbee/downloader-core'
import {
  ExecutorRouter,
  MemoryPersistAdapter,
  SqlitePersistAdapter,
  TaskQueueAPI,
  TRANSCRIPTION_GROUP_KEY
} from '@vidbee/task-queue'
import {
  AutoTranscriptionCoordinator,
  clampMaxConcurrentTranscriptions,
  extractEmbeddedCaptionTracks,
  importCaptionsForDownload,
  ModelManager,
  mergeLegacyTaskQueueDb,
  preferredCaptionLanguages,
  TranscriptionExecutor,
  TranscriptStore
} from '@vidbee/transcription'

const require = createRequire(import.meta.url)

const DEFAULT_DOWNLOAD_DIR_FALLBACK = path.join(os.homedir(), 'Downloads', 'VidBee')

const trimEnv = (name: string): string | undefined => {
  const v = process.env[name]?.trim()
  return v && v.length > 0 ? v : undefined
}

export const apiDefaultDownloadDir =
  trimEnv('VIDBEE_DOWNLOAD_DIR') ?? trimEnv('DOWNLOAD_DIR') ?? DEFAULT_DOWNLOAD_DIR_FALLBACK

const parsedMaxConcurrent = Number(trimEnv('VIDBEE_MAX_CONCURRENT') ?? '')
export const apiMaxConcurrent =
  Number.isFinite(parsedMaxConcurrent) && parsedMaxConcurrent > 0 ? parsedMaxConcurrent : 4

const persistEnabled = trimEnv('VIDBEE_PERSIST_QUEUE') === '1'

const unifiedDbDir = path.join(apiDefaultDownloadDir, '.vidbee')
const legacyTaskQueueDbPath =
  trimEnv('VIDBEE_TASK_QUEUE_DB') ?? path.join(unifiedDbDir, 'task-queue.db')
const taskQueueDbPath = trimEnv('VIDBEE_DB') ?? path.join(unifiedDbDir, 'vidbee.db')

fs.mkdirSync(apiDefaultDownloadDir, { recursive: true })

let cachedYtDlpPath: string | null = null
const resolveYtDlpPath = (): string => {
  if (cachedYtDlpPath && fs.existsSync(cachedYtDlpPath)) {
    return cachedYtDlpPath
  }
  const envPath = trimEnv('YTDLP_PATH')
  if (envPath && fs.existsSync(envPath)) {
    cachedYtDlpPath = envPath
    return envPath
  }
  // Fall back to PATH lookup via execSync `which yt-dlp` / `where yt-dlp`.
  try {
    const out = require('node:child_process')
      .execSync(process.platform === 'win32' ? 'where yt-dlp' : 'which yt-dlp', {
        stdio: ['ignore', 'pipe', 'ignore']
      })
      .toString()
      .split(/\r?\n/)
      .map((s: string) => s.trim())
      .find((s: string) => s.length > 0)
    if (out && fs.existsSync(out)) {
      cachedYtDlpPath = out
      return out
    }
  } catch {
    /* noop */
  }
  throw new Error('yt-dlp binary not found. Set YTDLP_PATH or install yt-dlp in PATH.')
}

let cachedFfmpegLocation: string | null | undefined
const resolveFfmpegLocation = (): string | undefined => {
  if (cachedFfmpegLocation !== undefined) {
    return cachedFfmpegLocation ?? undefined
  }
  const envPath = trimEnv('FFMPEG_PATH')
  if (envPath) {
    try {
      const stats = fs.statSync(envPath)
      if (stats.isDirectory()) {
        cachedFfmpegLocation = envPath
        return envPath
      }
      const dir = path.dirname(envPath)
      cachedFfmpegLocation = dir
      return dir
    } catch {
      /* fall through */
    }
  }
  for (const candidate of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']) {
    if (fs.existsSync(path.join(candidate, 'ffmpeg'))) {
      cachedFfmpegLocation = candidate
      return candidate
    }
  }
  cachedFfmpegLocation = null
  return undefined
}

let cachedGalleryDlPath: string | null = null
const resolveGalleryDlPath = (): string => {
  if (cachedGalleryDlPath && fs.existsSync(cachedGalleryDlPath)) {
    return cachedGalleryDlPath
  }
  const envPath = trimEnv('GALLERY_DL_PATH')
  if (envPath && fs.existsSync(envPath)) {
    cachedGalleryDlPath = envPath
    return envPath
  }
  try {
    const out = require('node:child_process')
      .execSync(process.platform === 'win32' ? 'where gallery-dl' : 'which gallery-dl', {
        stdio: ['ignore', 'pipe', 'ignore']
      })
      .toString()
      .split(/\r?\n/)
      .map((candidate: string) => candidate.trim())
      .find((candidate: string) => candidate.length > 0)
    if (out && fs.existsSync(out)) {
      cachedGalleryDlPath = out
      return out
    }
  } catch {
    // Fall through to the actionable error below.
  }
  throw new Error('gallery-dl binary not found. Set GALLERY_DL_PATH or install gallery-dl in PATH.')
}

const ytDlpExecutor = new YtDlpExecutor({
  resolveYtDlpPath,
  resolveFfmpegLocation,
  defaultDownloadDir: apiDefaultDownloadDir
})
const galleryDlExecutor = new GalleryDlExecutor({
  resolveBinaryPath: resolveGalleryDlPath,
  resolveFfmpegLocation,
  defaultDownloadDir: apiDefaultDownloadDir
})
const downloadExecutor = new HostRoutingExecutor(ytDlpExecutor, galleryDlExecutor)

export const instagramProfileInspector = new InstagramProfileInspector({
  resolveBinaryPath: resolveGalleryDlPath
})

const apiModelsDir = path.join(unifiedDbDir, 'models', 'transcription')
const apiHere = path.dirname(fileURLToPath(import.meta.url))
const apiWorkerCandidates = [
  path.join(apiHere, 'transcription-worker.js'),
  path.join(apiHere, '../../../../packages/transcription/src/worker/entry.ts')
]
const apiWorkerScript =
  apiWorkerCandidates.find((candidate) => fs.existsSync(candidate)) ?? apiWorkerCandidates[0]

const Database = require('better-sqlite3') as typeof import('better-sqlite3')
fs.mkdirSync(path.dirname(taskQueueDbPath), { recursive: true })
const sharedSqlite = persistEnabled
  ? new Database(taskQueueDbPath, { timeout: 5000 })
  : new Database(':memory:')
sharedSqlite.exec(TASK_QUEUE_DDL_V1)
sharedSqlite.exec(TRANSCRIPT_DDL_V1)
if (
  persistEnabled &&
  legacyTaskQueueDbPath !== taskQueueDbPath &&
  fs.existsSync(legacyTaskQueueDbPath)
) {
  mergeLegacyTaskQueueDb({
    target: sharedSqlite,
    legacyPath: legacyTaskQueueDbPath,
    openLegacy: (legacyPath) => new Database(legacyPath, { timeout: 5000, fileMustExist: true })
  })
}

const persist = persistEnabled
  ? new SqlitePersistAdapter({
      db: sharedSqlite as unknown as ConstructorParameters<typeof SqlitePersistAdapter>[0]['db'],
      ownsConnection: false
    })
  : new MemoryPersistAdapter()

export const transcriptStore = new TranscriptStore({ db: sharedSqlite })

export const modelManager = new ModelManager({ modelsDir: apiModelsDir })

const transcriptionExecutor = new TranscriptionExecutor({
  store: transcriptStore,
  workerScript: apiWorkerScript,
  modelsDir: apiModelsDir,
  execArgv: apiWorkerScript.endsWith('.ts') ? ['--import', 'tsx'] : undefined,
  resolveFfmpegPath: () => {
    const loc = resolveFfmpegLocation()
    if (!loc) {
      throw new Error('ffmpeg not found')
    }
    return fs.existsSync(path.join(loc, 'ffmpeg')) ? path.join(loc, 'ffmpeg') : loc
  },
  backend: process.env.VIDBEE_TRANSCRIPTION_BACKEND === 'fake' ? 'fake' : 'sherpa'
})

const executor = new ExecutorRouter({
  defaultExecutor: downloadExecutor,
  byKind: { transcription: transcriptionExecutor }
})

export const taskQueue = new TaskQueueAPI({
  persist,
  executor,
  maxConcurrency: apiMaxConcurrent
})

/**
 * Apply the transcription group cap without changing the env-based global slot budget.
 *
 * @param value Stored transcription concurrency setting.
 */
export const applyApiTranscriptionConcurrency = (value: unknown): void => {
  void taskQueue.setMaxPerGroup(TRANSCRIPTION_GROUP_KEY, clampMaxConcurrentTranscriptions(value))
}

void applyApiTranscriptionConcurrency(1)

export const taskQueueExecutor = downloadExecutor

let autoEnabled = false

const coordinator = new AutoTranscriptionCoordinator({
  queue: taskQueue,
  store: transcriptStore,
  isEnabled: () => autoEnabled,
  resolveSourceFile: (task) => task.output?.filePath ?? null,
  tryImportCaptions: async ({ downloadTaskId, sourceFilePath }) => {
    const loc = resolveFfmpegLocation()
    const binary = loc && fs.existsSync(path.join(loc, 'ffmpeg')) ? path.join(loc, 'ffmpeg') : loc
    const settings = await (await import('./web-settings-store')).webSettingsStore.get()
    const preferredLanguages = preferredCaptionLanguages(settings.language)
    const record = await importCaptionsForDownload({
      downloadTaskId,
      extractEmbedded: binary
        ? () =>
            extractEmbeddedCaptionTracks({
              ffmpegPath: binary,
              filePath: sourceFilePath,
              preferredLanguages
            })
        : undefined,
      preferredLanguages,
      sourceFilePath,
      store: transcriptStore
    })
    return record?.sourceKind === 'captions'
  }
})

let started = false
export const startTaskQueue = async (): Promise<void> => {
  if (started) {
    return
  }
  await taskQueue.start()
  await restoreInstagramProfileGroupCaps(taskQueue)
  try {
    const settings = await (await import('./web-settings-store')).webSettingsStore.get()
    autoEnabled = settings.autoTranscribeAfterDownload === true
    applyApiTranscriptionConcurrency(settings.maxConcurrentTranscriptions)
  } catch {
    autoEnabled = false
  }
  coordinator.start()
  started = true
}

export const setApiAutoTranscribe = (enabled: boolean): void => {
  autoEnabled = enabled
}

export const stopTaskQueue = async (): Promise<void> => {
  if (!started) {
    return
  }
  coordinator.stop()
  await taskQueue.stop()
  started = false
}

export const isTaskQueuePersistent = persistEnabled
export const taskQueueDbFile = taskQueueDbPath
