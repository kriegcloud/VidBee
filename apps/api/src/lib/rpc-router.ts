import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { access, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { implement, ORPCError } from '@orpc/server'
import type { DownloadTask } from '@vidbee/downloader-core'
import {
  downloaderContract,
  enqueueInstagramProfileDownload,
  expandTikTokShortLink,
  planPlaylistDownloadOrder,
  playlistEntryGroupKey,
  resolveDownloadTaskKind
} from '@vidbee/downloader-core'
import { isMappedProfilePostUrl } from '@vidbee/downloader-core/mapped-profile-source'
import { resolveAutoVideoDownloadPath } from '@vidbee/downloader-core/output-path'
import { resolveSocialSource, SocialMediaOptionsSchema } from '@vidbee/downloader-core/social-media'
import {
  downloadSocialMedia,
  previewSocialMedia
} from '@vidbee/downloader-core/social-media-service'
import { isDownloadTaskKind, type Task, type TaskStatus } from '@vidbee/task-queue'
import { apiDataDir, apiDefaultDownloadDir, apiSettingsFilesDir, isPathInside } from './api-paths'
import { APP_VERSION } from './app-version'
import { getDatabaseFilePath } from './database'
import { downloadDir, taskQueue } from './downloader'
import {
  applyEngineDownloadSettings,
  checkEngineUpdates,
  getEngineStatus,
  updateYtDlp
} from './engines'
import { projectTaskForApi } from './projection'
import {
  applyApiTranscriptionConcurrency,
  fanslyProfiles,
  instagramProfileInspector,
  onlyFansProfiles,
  resolveGalleryDlExtraArgs,
  resolveGalleryDlPath,
  setApiAutoTranscribe,
  socialProfileManager,
  sourceAdmission
} from './task-queue-host'
import { webSettingsStore } from './web-settings-store'
import { fetchPlaylistInfo, fetchVideoInfo } from './yt-dlp-info'

const os = implement(downloaderContract)
const WEB_SETTINGS_FILES_DIR = apiSettingsFilesDir
const MAX_WEB_SETTINGS_FILE_BYTES = 1_000_000
const MANAGED_SETTINGS_FILE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const SAFE_FILE_NAME_REGEX = /[^A-Za-z0-9._-]+/g
type ManagedSettingsFileKind = 'cookies' | 'config'
type SystemCommand =
  | 'explorer.exe'
  | 'open'
  | 'osascript'
  | 'powershell.exe'
  | 'rundll32.exe'
  | 'xdg-open'

const TERMINAL_TASK_STATUSES = new Set<TaskStatus>(['completed', 'failed', 'cancelled'])
const NON_TERMINAL_TASK_STATUSES = new Set<TaskStatus>([
  'queued',
  'running',
  'processing',
  'paused',
  'retry-scheduled'
])

const toErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return fallbackMessage
}

/** Execute an allowlisted system helper without invoking a shell. */
const runProcess = (command: SystemCommand, args: string[]): Promise<boolean> =>
  new Promise((resolve) => {
    execFile(command, args, { shell: false, windowsHide: true }, (error) => resolve(error === null))
  })

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await access(targetPath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

const isPathWithinBase = (basePath: string, targetPath: string): boolean =>
  isPathInside(basePath, targetPath) && path.resolve(basePath) !== path.resolve(targetPath)

const openFileWithSystem = async (targetPath: string): Promise<boolean> => {
  if (process.platform === 'darwin') {
    return runProcess('open', [targetPath])
  }
  if (process.platform === 'win32') {
    return runProcess('rundll32.exe', ['url.dll,FileProtocolHandler', targetPath])
  }
  return runProcess('xdg-open', [targetPath])
}

const openFileLocationWithSystem = async (targetPath: string): Promise<boolean> => {
  if (process.platform === 'darwin') {
    return runProcess('open', ['-R', targetPath])
  }
  if (process.platform === 'win32') {
    return runProcess('explorer.exe', [`/select,${targetPath}`])
  }
  return runProcess('xdg-open', [path.dirname(targetPath)])
}

const copyFileToClipboardWithSystem = async (targetPath: string): Promise<boolean> => {
  if (process.platform === 'darwin') {
    return runProcess('osascript', [
      '-e',
      'on run argv',
      '-e',
      'set the clipboard to (POSIX file (item 1 of argv))',
      '-e',
      'end run',
      targetPath
    ])
  }
  if (process.platform === 'win32') {
    return runProcess('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Set-Clipboard -LiteralPath $args[0]',
      targetPath
    ])
  }
  return false
}

const listServerDirectories = async (
  rawPath: string | undefined
): Promise<{
  currentPath: string
  parentPath: string | null
  directories: { name: string; path: string }[]
}> => {
  const requestedPath = rawPath?.trim()
  const candidatePath =
    requestedPath && requestedPath.length > 0 ? requestedPath : apiDefaultDownloadDir
  const currentPath = path.resolve(candidatePath)

  const pathInfo = await stat(currentPath)
  if (!pathInfo.isDirectory()) {
    throw new Error('Path is not a directory.')
  }

  const entries = await readdir(currentPath, { withFileTypes: true })
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.join(currentPath, entry.name)
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const parsed = path.parse(currentPath)
  const parentPath = currentPath === parsed.root ? null : path.dirname(currentPath)

  return { currentPath, parentPath, directories }
}

const sanitizeUploadedFileName = (fileName: string, fallbackFileName: string): string => {
  const normalized = path
    .basename(fileName.trim())
    .replace(SAFE_FILE_NAME_REGEX, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!normalized) {
    return fallbackFileName
  }
  return normalized.slice(0, 120)
}

const storeWebSettingsFile = async (
  kind: 'cookies' | 'config',
  fileName: string,
  content: string
): Promise<string> => {
  const contentBuffer = Buffer.from(content, 'utf-8')
  if (contentBuffer.byteLength > MAX_WEB_SETTINGS_FILE_BYTES) {
    throw new Error('Uploaded file is too large.')
  }

  const destinationDir = path.join(WEB_SETTINGS_FILES_DIR, kind)
  await mkdir(destinationDir, { recursive: true })

  const fallbackFileName = kind === 'cookies' ? 'cookies.txt' : 'config.txt'
  const safeFileName = sanitizeUploadedFileName(fileName, fallbackFileName)
  const storedFileName = `${Date.now()}-${randomUUID()}-${safeFileName}`
  const destinationPath = path.join(destinationDir, storedFileName)

  await writeFile(destinationPath, contentBuffer)
  return destinationPath
}

const resolveManagedSettingsFilePath = (
  rawPath: string,
  kind: ManagedSettingsFileKind
): string | null => {
  const trimmedPath = rawPath.trim()
  if (!trimmedPath) {
    return null
  }
  const resolvedPath = path.resolve(trimmedPath)
  const managedDirectory = path.join(WEB_SETTINGS_FILES_DIR, kind)
  if (!isPathWithinBase(managedDirectory, resolvedPath)) {
    return null
  }
  return resolvedPath
}

const pruneManagedSettingsFiles = async (
  kind: ManagedSettingsFileKind,
  referencedPaths: string[]
): Promise<void> => {
  const managedDirectory = path.join(WEB_SETTINGS_FILES_DIR, kind)
  const keepPaths = new Set<string>()
  for (const rawPath of referencedPaths) {
    const managedPath = resolveManagedSettingsFilePath(rawPath, kind)
    if (managedPath) {
      keepPaths.add(managedPath)
    }
  }
  let entries: { isFile: () => boolean; name: string }[] = []
  try {
    entries = await readdir(managedDirectory, { withFileTypes: true })
  } catch {
    return
  }
  const now = Date.now()
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }
    const candidatePath = path.resolve(path.join(managedDirectory, entry.name))
    if (keepPaths.has(candidatePath)) {
      continue
    }
    try {
      const candidateInfo = await stat(candidatePath)
      if (now - candidateInfo.mtimeMs < MANAGED_SETTINGS_FILE_RETENTION_MS) {
        continue
      }
      await rm(candidatePath, { force: true })
    } catch {
      // Ignore cleanup errors to keep upload and settings updates resilient.
    }
  }
}

const triggerManagedSettingsFilePrune = (
  kind: ManagedSettingsFileKind,
  newlyUploadedPath: string
): void => {
  void (async () => {
    try {
      const settings = await webSettingsStore.get()
      const currentSettingsPath = kind === 'cookies' ? settings.cookiesPath : settings.configPath
      await pruneManagedSettingsFiles(kind, [newlyUploadedPath, currentSettingsPath])
    } catch {
      // Ignore cleanup errors to keep upload and settings updates resilient.
    }
  })()
}

const PLAYLIST_GROUP_PREFIX = 'playlist_group_'

const projectTask = (task: Readonly<Task>): DownloadTask => projectTaskForApi(task)

const listTasksByStatuses = (statuses: ReadonlySet<TaskStatus>): DownloadTask[] => {
  const tasks: Task[] = []
  let cursor: string | null = null
  do {
    const page = taskQueue.list({ limit: 200, cursor })
    for (const t of page.tasks) {
      if (statuses.has(t.status)) {
        tasks.push(t)
      }
    }
    cursor = page.nextCursor
  } while (cursor)
  return tasks.sort((a, b) => b.createdAt - a.createdAt).map(projectTask)
}

export const rpcRouter = os.router({
  status: os.status.handler(() => {
    const stats = taskQueue.stats()
    return {
      ok: true,
      version: APP_VERSION,
      active: stats.running,
      pending: stats.queued,
      downloadDir: apiDefaultDownloadDir,
      dataDir: apiDataDir,
      dbPath: getDatabaseFilePath()
    }
  }),

  videoInfo: os.videoInfo.handler(async ({ input }) => {
    try {
      const video = await fetchVideoInfo(input.url, input.settings)
      return { video }
    } catch (error) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: toErrorMessage(error, 'Failed to fetch video info.')
      })
    }
  }),

  resolveUrl: os.resolveUrl.handler(async ({ input }) => ({
    url: await expandTikTokShortLink(input.url)
  })),

  playlist: {
    info: os.playlist.info.handler(async ({ input }) => {
      try {
        const playlist = await fetchPlaylistInfo(input.url, input.settings)
        return { playlist }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to fetch playlist info.')
        })
      }
    }),
    download: os.playlist.download.handler(async ({ input }) => {
      try {
        const playlist = await fetchPlaylistInfo(input.url, input.settings)
        const groupId = `${PLAYLIST_GROUP_PREFIX}${Date.now()}_${randomUUID().slice(0, 8)}`

        if (playlist.entryCount === 0) {
          return {
            result: {
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
        }

        let selected = playlist.entries
        if (input.entryIds && input.entryIds.length > 0) {
          const ids = new Set(input.entryIds)
          selected = playlist.entries.filter((e) => ids.has(e.id))
        } else {
          const requestedStart = Math.max((input.startIndex ?? 1) - 1, 0)
          const requestedEnd = input.endIndex
            ? Math.min(input.endIndex - 1, playlist.entryCount - 1)
            : playlist.entryCount - 1
          const rangeStart = Math.min(requestedStart, requestedEnd)
          const rangeEnd = Math.max(requestedStart, requestedEnd)
          selected = playlist.entries.slice(rangeStart, rangeEnd + 1)
        }

        const created: Array<{
          downloadId: string
          entryId: string
          title: string
          url: string
          index: number
        }> = []

        const playlistGroupKey = `playlist:${groupId}`
        for (const entry of planPlaylistDownloadOrder(selected)) {
          const result = await taskQueue.add({
            input: {
              url: entry.url,
              kind: input.type === 'audio' ? 'audio' : 'video',
              title: entry.title,
              thumbnail: entry.thumbnail,
              playlistId: groupId,
              playlistIndex: entry.index,
              options: {
                type: input.type,
                format: input.format,
                audioFormat: input.audioFormat,
                audioFormatIds: input.audioFormatIds,
                customDownloadPath: input.customDownloadPath,
                customFilenameTemplate: input.customFilenameTemplate,
                containerFormat: input.containerFormat,
                settings: input.settings,
                title: entry.title,
                thumbnail: entry.thumbnail,
                playlistTitle: playlist.title,
                playlistSize: selected.length,
                mediaKind: entry.mediaKind
              }
            },
            groupKey: playlistEntryGroupKey(entry, playlistGroupKey)
          })
          created.push({
            downloadId: result.id,
            entryId: entry.id,
            title: entry.title,
            url: entry.url,
            index: entry.index
          })
        }

        return {
          result: {
            groupId,
            playlistId: playlist.id,
            playlistTitle: playlist.title,
            type: input.type,
            totalCount: selected.length,
            startIndex: selected[0]?.index ?? 0,
            endIndex: selected.at(-1)?.index ?? 0,
            entries: created
          }
        }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to start playlist download.')
        })
      }
    })
  },

  socialMedia: {
    inspect: os.socialMedia.inspect.handler(async ({ input }) => {
      const storedSettings = await webSettingsStore.get()
      return previewSocialMedia(
        input.url,
        {
          admission: sourceAdmission,
          resolveBinaryPath: resolveGalleryDlPath,
          resolveExtraArgs: resolveGalleryDlExtraArgs
        },
        { ...storedSettings, ...input.settings }
      )
    }),
    download: os.socialMedia.download.handler(async ({ input }) => {
      const storedSettings = await webSettingsStore.get()
      return downloadSocialMedia(taskQueue, {
        ...input,
        settings: { ...storedSettings, ...input.settings }
      })
    })
  },
  socialProfile: {
    get: os.socialProfile.get.handler(({ input }) => socialProfileManager.get(input.url)),
    list: os.socialProfile.list.handler(() => socialProfileManager.list()),
    map: os.socialProfile.map.handler(async ({ input }) => {
      const settings = await webSettingsStore.get()
      return socialProfileManager.map(input.url, input.category, settings)
    }),
    stop: os.socialProfile.stop.handler(({ input }) => socialProfileManager.stop(input.url)),
    download: os.socialProfile.download.handler(async ({ input }) => {
      const profile = socialProfileManager.get(input.url)
      const items =
        profile.categories[input.category]?.items.filter((item) => input.ids.includes(item.id)) ??
        []
      if (items.length !== new Set(input.ids).size) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Selected posts are no longer in the saved profile map.'
        })
      }
      if (items.some((item) => !isMappedProfilePostUrl(profile.platform, item.url))) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Saved profile contains an invalid post URL.'
        })
      }
      const settings = await webSettingsStore.get()
      const batchId = `social_profile_${randomUUID()}`
      const batchTitle = `@${profile.owner}`
      let count = 0
      for (const [index, item] of items.entries()) {
        if (profile.platform === 'redgifs') {
          await taskQueue.add({
            input: {
              url: item.url,
              kind: 'video',
              title: item.title,
              options: {
                type: 'video',
                singleVideo: true,
                customDownloadPath: input.destination,
                settings,
                batchId,
                batchKind: 'social-media',
                batchTitle,
                batchOrder: index
              }
            }
          })
          count += 1
        } else {
          const result = await downloadSocialMedia(
            taskQueue,
            { url: item.url, customDownloadPath: input.destination, settings },
            { id: batchId, title: batchTitle, order: index }
          )
          count += result.ids.length
        }
      }
      return { count }
    })
  },
  fanslyProfile: {
    command: os.fanslyProfile.command.handler(({ input }) => fanslyProfiles.command(input)),
    list: os.fanslyProfile.list.handler(() => fanslyProfiles.list()),
    download: os.fanslyProfile.download.handler(({ input }) =>
      fanslyProfiles.enqueue(taskQueue, input)
    )
  },
  onlyFansProfile: {
    command: os.onlyFansProfile.command.handler(({ input }) => onlyFansProfiles.command(input)),
    list: os.onlyFansProfile.list.handler(() => onlyFansProfiles.list()),
    download: os.onlyFansProfile.download.handler(({ input }) =>
      onlyFansProfiles.enqueue(taskQueue, input)
    )
  },
  instagramProfile: {
    list: os.instagramProfile.list.handler(() => ({ profiles: instagramProfileInspector.list() })),
    cancel: os.instagramProfile.cancel.handler(({ input }) => ({
      cancelled: instagramProfileInspector.cancel(input.url)
    })),
    inspect: os.instagramProfile.inspect.handler(async ({ input }) => {
      try {
        const inspection = await instagramProfileInspector.inspect(
          input.url,
          input.settings,
          input.categories
        )
        return { inspection }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to inspect Instagram profile.')
        })
      }
    }),
    download: os.instagramProfile.download.handler(async ({ input }) => {
      try {
        const result = await enqueueInstagramProfileDownload({
          queue: taskQueue,
          inspector: instagramProfileInspector,
          input,
          defaultDownloadDir: downloadDir
        })
        return { result }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to start Instagram profile download.')
        })
      }
    })
  },

  downloads: {
    create: os.downloads.create.handler(async ({ input }) => {
      try {
        const storedSettings = await webSettingsStore.get()
        const customDownloadPath =
          input.customDownloadPath?.trim() ||
          (input.playlistId || (resolveSocialSource(input.url) && !input.singleVideo)
            ? undefined
            : resolveAutoVideoDownloadPath(
                input.settings?.downloadPath?.trim() || storedSettings.downloadPath,
                { title: input.title, uploader: input.uploader },
                input.settings?.downloadWithoutChannelSubfolders ??
                  storedSettings.downloadWithoutChannelSubfolders
              ))
        // Share-sheet links hide whether the post is a video or a photo set.
        const url = await expandTikTokShortLink(input.url)
        const result = await taskQueue.add({
          groupKey:
            resolveSocialSource(url) && !input.singleVideo
              ? `social:${resolveSocialSource(url)?.platform}`
              : undefined,
          input: {
            url,
            kind: input.singleVideo ? input.type : resolveDownloadTaskKind(url, input.type),
            title: input.title,
            thumbnail: input.thumbnail,
            playlistId: input.playlistId,
            playlistIndex: input.playlistIndex,
            options: {
              type: input.type,
              singleVideo: input.singleVideo,
              socialMedia: resolveSocialSource(url)
                ? SocialMediaOptionsSchema.parse(input.socialMedia ?? {})
                : undefined,
              sourceMediaKind:
                resolveSocialSource(url) && !input.singleVideo
                  ? input.socialMedia?.media === 'images'
                    ? 'image'
                    : input.socialMedia?.media === 'videos'
                      ? 'video'
                      : 'mixed'
                  : undefined,

              format: input.format,
              audioFormat: input.audioFormat,
              audioFormatIds: input.audioFormatIds,
              startTime: input.startTime,
              endTime: input.endTime,
              customDownloadPath,
              customFilenameTemplate: input.customFilenameTemplate,
              containerFormat: input.containerFormat,
              settings: { ...storedSettings, ...input.settings },
              title: input.title,
              thumbnail: input.thumbnail,
              description: input.description,
              channel: input.channel,
              uploader: input.uploader,
              viewCount: input.viewCount,
              tags: input.tags ? [...input.tags] : undefined,
              duration: input.duration,
              playlistTitle: input.playlistTitle,
              playlistSize: input.playlistSize
            }
          }
        })
        const created = taskQueue.get(result.id)
        if (!created) {
          throw new Error('Failed to read back created task.')
        }
        return { download: projectTask(created) }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to create download.')
        })
      }
    }),
    list: os.downloads.list.handler(() => {
      return { downloads: listTasksByStatuses(NON_TERMINAL_TASK_STATUSES) }
    }),
    cancel: os.downloads.cancel.handler(async ({ input }) => {
      try {
        const task = taskQueue.get(input.id)
        if (!task) {
          return { cancelled: false }
        }
        await taskQueue.cancel(input.id)
        return { cancelled: true }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to cancel download.')
        })
      }
    }),
    cancelAll: os.downloads.cancelAll.handler(async () => {
      const ids: string[] = []
      let cursor: string | null = null
      do {
        const page = taskQueue.list({ limit: 200, cursor })
        for (const task of page.tasks) {
          if (NON_TERMINAL_TASK_STATUSES.has(task.status) && isDownloadTaskKind(task.kind)) {
            ids.push(task.id)
          }
        }
        cursor = page.nextCursor
      } while (cursor)
      let cancelled = 0
      let failed = 0
      for (const id of ids) {
        const task = taskQueue.get(id)
        if (!(task && NON_TERMINAL_TASK_STATUSES.has(task.status))) {
          continue
        }
        try {
          await taskQueue.cancel(id)
          cancelled += 1
        } catch {
          failed += 1
        }
      }
      return { cancelled, failed }
    }),
    pause: os.downloads.pause.handler(async ({ input }) => {
      try {
        const task = taskQueue.get(input.id)
        if (!task) {
          return { paused: false }
        }
        await taskQueue.pause(input.id)
        return { paused: true }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to pause download.')
        })
      }
    }),
    resume: os.downloads.resume.handler(async ({ input }) => {
      try {
        const task = taskQueue.get(input.id)
        if (!task) {
          return { resumed: false }
        }
        await taskQueue.resume(input.id)
        return { resumed: true }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to resume download.')
        })
      }
    }),
    retry: os.downloads.retry.handler(async ({ input }) => {
      try {
        const task = taskQueue.get(input.id)
        if (task?.kind === 'social-media' && task.status === 'completed') {
          const settings = await webSettingsStore.get()
          await taskQueue.add({
            input: { ...task.input, options: { ...task.input.options, settings } },
            groupKey: task.groupKey
          })
          return { retried: true }
        }
        if (!task || (task.status !== 'failed' && task.status !== 'cancelled')) {
          return { retried: false }
        }
        await taskQueue.retryManual(input.id, {
          ...task.input.options,
          settings: await webSettingsStore.get()
        })
        return { retried: true }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to retry download.')
        })
      }
    })
  },

  history: {
    list: os.history.list.handler(() => {
      return { history: listTasksByStatuses(TERMINAL_TASK_STATUSES) }
    }),
    removeItems: os.history.removeItems.handler(async ({ input }) => {
      let removed = 0
      for (const rawId of input.ids) {
        const id = rawId.trim()
        if (!id) {
          continue
        }
        const task = taskQueue.get(id)
        if (!task) {
          continue
        }
        try {
          await taskQueue.removeFromHistory(id)
          removed += 1
        } catch {
          // Non-terminal tasks throw; skip them quietly to match legacy behavior.
        }
      }
      return { removed }
    }),
    removeByPlaylist: os.history.removeByPlaylist.handler(async ({ input }) => {
      const playlistId = input.playlistId.trim()
      if (!playlistId) {
        return { removed: 0 }
      }
      let removed = 0
      let cursor: string | null = null
      do {
        const page = taskQueue.list({ limit: 200, cursor })
        for (const t of page.tasks) {
          if (t.input.playlistId === playlistId && TERMINAL_TASK_STATUSES.has(t.status)) {
            try {
              await taskQueue.removeFromHistory(t.id)
              removed += 1
            } catch {
              /* skip */
            }
          }
        }
        cursor = page.nextCursor
      } while (cursor)
      return { removed }
    })
  },

  files: {
    exists: os.files.exists.handler(async ({ input }) => {
      try {
        const resolvedPath = path.resolve(input.path)
        return { exists: await pathExists(resolvedPath) }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to check file existence.')
        })
      }
    }),
    listDirectories: os.files.listDirectories.handler(async ({ input }) => {
      try {
        return await listServerDirectories(input.path)
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to list server directories.')
        })
      }
    }),
    openFile: os.files.openFile.handler(async ({ input }) => {
      try {
        const resolvedPath = path.resolve(input.path)
        const exists = await pathExists(resolvedPath)
        if (!exists) {
          return { success: false }
        }
        return { success: await openFileWithSystem(resolvedPath) }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to open file.')
        })
      }
    }),
    openFileLocation: os.files.openFileLocation.handler(async ({ input }) => {
      try {
        const resolvedPath = path.resolve(input.path)
        const exists = await pathExists(resolvedPath)
        if (!exists) {
          return { success: false }
        }
        return { success: await openFileLocationWithSystem(resolvedPath) }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to open file location.')
        })
      }
    }),
    copyFileToClipboard: os.files.copyFileToClipboard.handler(async ({ input }) => {
      try {
        const resolvedPath = path.resolve(input.path)
        const exists = await pathExists(resolvedPath)
        if (!exists) {
          return { success: false }
        }
        return { success: await copyFileToClipboardWithSystem(resolvedPath) }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to copy file to clipboard.')
        })
      }
    }),
    deleteFile: os.files.deleteFile.handler(async ({ input }) => {
      try {
        const settings = await webSettingsStore.get()
        const managedRoots = [apiDefaultDownloadDir, settings.downloadPath.trim()].filter(
          (root, index, roots) => root.length > 0 && roots.indexOf(root) === index
        )
        if (managedRoots.length === 0) {
          throw new ORPCError('FORBIDDEN', {
            message: 'Deleting files is disabled until a download path is configured.'
          })
        }
        const resolvedPath = path.resolve(input.path)
        if (!managedRoots.some((root) => isPathWithinBase(root, resolvedPath))) {
          throw new ORPCError('FORBIDDEN', {
            message: 'Refusing to delete files outside the managed download directory.'
          })
        }
        const exists = await pathExists(resolvedPath)
        if (!exists) {
          return { success: false }
        }
        await rm(resolvedPath)
        return { success: true }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to delete file.')
        })
      }
    }),
    uploadSettingsFile: os.files.uploadSettingsFile.handler(async ({ input }) => {
      try {
        const storedPath = await storeWebSettingsFile(input.kind, input.fileName, input.content)
        triggerManagedSettingsFilePrune(input.kind, storedPath)
        return { path: storedPath }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to upload settings file.')
        })
      }
    })
  },

  settings: {
    get: os.settings.get.handler(async () => {
      try {
        const settings = await webSettingsStore.get()
        return { settings }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to read settings.')
        })
      }
    }),
    set: os.settings.set.handler(async ({ input }) => {
      try {
        const settings = await webSettingsStore.set(input.settings)
        setApiAutoTranscribe(settings.autoTranscribeAfterDownload === true)
        applyApiTranscriptionConcurrency(settings.maxConcurrentTranscriptions)
        applyEngineDownloadSettings({
          downloadMirror: settings.downloadMirror,
          language: settings.language
        })
        return { settings }
      } catch (error) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: toErrorMessage(error, 'Failed to save settings.')
        })
      }
    })
  },

  engines: {
    status: os.engines.status.handler(async () => getEngineStatus()),
    check: os.engines.check.handler(async () => checkEngineUpdates()),
    update: os.engines.update.handler(async () => updateYtDlp())
  }
})
