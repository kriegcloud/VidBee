import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
import { Progress } from '@renderer/components/ui/progress'
import { RemoteImage } from '@renderer/components/ui/remote-image'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@renderer/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { useNavigate } from '@tanstack/react-router'
import { getCookieSetupFailureKind } from '@vidbee/downloader-core/cookie-setup'
import type { TaskCreationMetadata } from '@vidbee/task-queue'
import { DownloadContentStack } from '@vidbee/ui/components/ui/download-content-stack'
import { DownloadPlatformIcon } from '@vidbee/ui/components/ui/download-platform-icon'
import {
  DOWNLOAD_FEEDBACK_ISSUE_TITLE,
  FeedbackLinkButtons
} from '@vidbee/ui/components/ui/feedback-link-buttons'
import { SocialMediaStatus } from '@vidbee/ui/components/ui/social-media-status'
import {
  downloadPlatformDisplayLabel,
  LOCAL_DOWNLOAD_PLATFORM_KEY,
  resolveDownloadPlatform
} from '@vidbee/ui/lib/download-platform'
import { isListIgnoreTarget } from '@vidbee/ui/lib/list-marquee'
import { isBrowserOpenableUrl } from '@vidbee/ui/lib/url-kind'
import { useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle, Copy, Loader2, MoreHorizontal, Pause, Play, RotateCw, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  buildFilePathCandidates,
  normalizeSavedFileName
} from '../../../../shared/utils/download-file'
import { useCachedThumbnail } from '../../hooks/use-cached-thumbnail'
import type { DownloadSelectionModifiers } from '../../hooks/use-download-selection'
import { useLocalPoster } from '../../hooks/use-local-poster'
import { downloadDisplayTitle } from '../../lib/download-display-title'
import { getDownloadErrorGuidance } from '../../lib/download-error-guidance'
import { rememberDownloadListFocus } from '../../lib/download-list-focus'
import { ipcServices } from '../../lib/ipc'
import { selectLocalPosterInput } from '../../lib/local-poster-input'
import { logger } from '../../lib/logger'
import { openContextMenuFromClick } from '../../lib/open-context-menu'
import { isNowPlayingLibraryItem } from '../../lib/transcript-playback'
import { buildTranscriptPlaybackInput } from '../../lib/transcript-playback-source'
import { flyCoverToPlaylistButton } from '../../lib/transcript-playlist-fly'
import { agentTaskAiSnapshotAtom, agentTasksByDownloadAtom } from '../../store/agent-tasks'
import { cookieSetupRequestAtom } from '../../store/cookie-setup'
import {
  addDownloadAtom,
  type DownloadRecord,
  removeDownloadAtom,
  removeHistoryRecordAtom
} from '../../store/downloads'
import { settingsAtom } from '../../store/settings'
import {
  playbackPlayingAtom,
  playbackSessionAtom,
  takePlaybackSessionAtom
} from '../../store/transcript-playback'
import { transcriptMapAtom } from '../../store/transcripts'
import { useAppInfo } from '../feedback/FeedbackLinks'
import { TranscriptAudioEqualizer } from '../transcript/TranscriptAudioEqualizer'
import { AgentTaskIndicator } from './AgentTaskIndicator'
import { DownloadRecordContextMenuItems } from './DownloadRecordContextMenuItems'
import { DownloadTroubleshootButton } from './DownloadTroubleshootButton'
import { resolveDownloadContents } from './download-contents'
import { canRetryDownload, getQualityLabel } from './download-item-utils'

/** The only parts of a row that open its detail view. */
const ACTIVATE_SELECTOR = '[data-download-activate]'

const tryFileOperation = async (
  paths: string[],
  operation: (filePath: string) => Promise<boolean>
): Promise<boolean> => {
  for (const filePath of paths) {
    const success = await operation(filePath)
    if (success) {
      return true
    }
  }
  return false
}

const getSavedFileExtension = (fileName?: string): string | undefined => {
  const normalized = normalizeSavedFileName(fileName)
  if (!normalized) {
    return undefined
  }
  if (!normalized.includes('.')) {
    return undefined
  }
  const ext = normalized.split('.').pop()
  return ext?.toLowerCase()
}

const resolveDownloadExtension = (download: DownloadRecord): string => {
  const savedExt = getSavedFileExtension(download.savedFileName)
  if (savedExt) {
    return savedExt
  }
  const selectedExt = download.selectedFormat?.ext?.toLowerCase()
  if (selectedExt) {
    return selectedExt
  }
  return download.type === 'audio' ? 'mp3' : 'mp4'
}

/**
 * True when yt-dlp's resolved format id does not include the user-picked
 * format id as a `+`-separated component. Used to surface the fallback
 * notice on completed rows so users know their preferred quality wasn't
 * actually delivered.
 */
const didFallbackFromPick = (download: DownloadRecord): boolean => {
  const picked = download.selectedFormat?.format_id
  const resolved = download.resolvedFormatId
  if (!(picked && resolved)) {
    return false
  }
  const parts = resolved
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  return !parts.includes(picked)
}

interface DownloadItemProps {
  download: DownloadRecord
  compact?: boolean
  isSelected?: boolean
  isTabStop?: boolean
  selectionActive?: boolean
  selectionContextMenu?: ReactNode
  onToggleSelect?: (id: string, modifiers?: DownloadSelectionModifiers) => void
}

const formatFileSize = (bytes?: number) => {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return <span className="text-meta">—</span>
  }
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const order =
    bytes === 0
      ? 0
      : Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1))
  return (
    <span>
      {(bytes / 1024 ** order).toFixed(1)}{' '}
      <span className="font-normal text-meta">{sizes[order]}</span>
    </span>
  )
}

const formatDateShort = (
  timestamp: number | undefined,
  language: string,
  today: string,
  yesterday: string
) => {
  if (timestamp === undefined || !Number.isFinite(timestamp)) {
    return '—'
  }
  const date = new Date(timestamp)
  const now = new Date()
  const previousDay = new Date(now)
  previousDay.setDate(now.getDate() - 1)
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(
    date
  )
  if (date.toDateString() === now.toDateString()) {
    return `${today} ${time}`
  }
  if (date.toDateString() === previousDay.toDateString()) {
    return `${yesterday} ${time}`
  }
  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric' }).format(date)
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Render the shared library row, with a compact details link for Agent Chat cards. */
export function DownloadItem({
  download,
  compact = false,
  isSelected = false,
  isTabStop = true,
  selectionActive = false,
  selectionContextMenu,
  onToggleSelect
}: DownloadItemProps) {
  const { t, i18n } = useTranslation()
  const appInfo = useAppInfo()
  const settings = useAtomValue(settingsAtom)
  const setCookieSetupRequest = useSetAtom(cookieSetupRequestAtom)
  const navigate = useNavigate()
  const transcriptMap = useAtomValue(transcriptMapAtom)
  const transcript = transcriptMap[download.id]
  const displayTitle = downloadDisplayTitle(download, transcript?.title)
  const agentTasks = useAtomValue(agentTasksByDownloadAtom)[download.id]
  const agentTaskAiSnapshot = useAtomValue(agentTaskAiSnapshotAtom)
  const playbackSession = useAtomValue(playbackSessionAtom)
  const takePlaybackSession = useSetAtom(takePlaybackSessionAtom)
  const playbackPlaying = useAtomValue(playbackPlayingAtom)
  const isNowPlaying = isNowPlayingLibraryItem(playbackSession, download.id)
  const addDownload = useSetAtom(addDownloadAtom)
  const removeDownload = useSetAtom(removeDownloadAtom)
  const removeHistory = useSetAtom(removeHistoryRecordAtom)
  const isHistory = download.entryType === 'history'
  const timestamp = download.completedAt ?? download.downloadedAt ?? download.createdAt
  const resolvedExtension = resolveDownloadExtension(download)
  const selectionEnabled = isHistory && Boolean(onToggleSelect)
  const contents = resolveDownloadContents({ download, t, transcript })
  // Track if the file exists
  const [fileExists, setFileExists] = useState(false)
  // undefined while the existence check runs, null when nothing was found.
  const [existingFilePath, setExistingFilePath] = useState<string | null | undefined>()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [logAutoScroll, setLogAutoScroll] = useState(true)
  // Saved yt-dlp log fetched on demand for terminal items (live stream is gone).
  const [savedLog, setSavedLog] = useState<string | null>(null)
  const logContainerRef = useRef<HTMLDivElement | null>(null)
  const coverRef = useRef<HTMLDivElement | null>(null)
  const lastSheetOpenRef = useRef(false)
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false)
  const cachedThumbnail = useCachedThumbnail(download.thumbnail)
  // Sites reached through gallery-dl report no thumbnail URL, so the saved
  // media is the only poster source those rows will ever have.
  const localPoster = useLocalPoster(
    selectLocalPosterInput({
      collectionSummary: download.collectionSummary,
      existingFilePath,
      fileCount: download.fileCount,
      outputDirectory: download.outputDirectory,
      thumbnail: download.thumbnail
    })
  )
  const playbackInput = buildTranscriptPlaybackInput({
    cachedThumbnail,
    download,
    downloadId: download.id,
    fallbackTitle: t('transcript.title'),
    snapshot: transcript ?? null
  })

  // Check if file exists when download data changes
  useEffect(() => {
    setExistingFilePath(undefined)
    const checkFileExists = async () => {
      if (!(download.title && download.downloadPath)) {
        setExistingFilePath(null)
        setFileExists(false)
        return
      }

      try {
        const formatForPath = resolvedExtension
        const filePaths = buildFilePathCandidates(
          download.downloadPath,
          download.title,
          formatForPath,
          download.savedFileName
        )
        for (const filePath of filePaths) {
          const exists = await ipcServices.fs.fileExists(filePath)
          if (exists) {
            setExistingFilePath(filePath)
            setFileExists(true)
            return
          }
        }
        setExistingFilePath(null)
        setFileExists(false)
      } catch (error) {
        logger.error('Failed to check file existence:', error)
        setExistingFilePath(null)
        setFileExists(false)
      }
    }

    checkFileExists()
  }, [download.title, download.downloadPath, download.savedFileName, resolvedExtension])

  /** Cancel the task and remove its row only after the main process confirms persistence. */
  const handleCancel = async (): Promise<void> => {
    if (isHistory) {
      return
    }
    try {
      const cancelled = await ipcServices.download.cancelDownload(download.id)
      if (cancelled) {
        removeDownload(download.id)
      }
    } catch (error) {
      logger.error('Failed to cancel download:', error)
    }
  }

  /**
   * Pause an in-flight download without dropping the queue row.
   */
  const handlePause = async () => {
    if (isHistory) {
      return
    }
    try {
      await ipcServices.download.pauseDownload(download.id)
    } catch (error) {
      logger.error('Failed to pause download:', error)
    }
  }

  /**
   * Resume a paused download from the preserved partial file.
   */
  const handleResume = async () => {
    if (isHistory) {
      return
    }
    try {
      await ipcServices.download.resumeDownload(download.id)
    } catch (error) {
      logger.error('Failed to resume download:', error)
    }
  }

  const handleRetryDownload = async () => {
    if (!download.url) {
      toast.error(t('errors.emptyUrl'))
      return
    }
    try {
      const retried = await ipcServices.download.retryDownload(download.id)
      if (!retried) {
        toast.info(t('notifications.downloadAlreadyQueued'))
        return
      }
      if (download.collectionSummary && download.status === 'completed') {
        return
      }
      addDownload({
        ...download,
        status: 'pending',
        progress: { percent: 0 },
        error: undefined
      })
    } catch (error) {
      logger.error('Failed to retry download:', error)
      toast.error(t('notifications.downloadFailed'))
    }
  }

  const handleOpenFolder = async () => {
    try {
      if (download.collectionSummary && download.outputDirectory) {
        await ipcServices.fs.openFile(download.outputDirectory)
        return
      }
      const downloadPath = download.downloadPath || settings.downloadPath
      const format = resolvedExtension
      const filePaths = buildFilePathCandidates(
        downloadPath,
        download.title,
        format,
        download.savedFileName
      )

      const success = await tryFileOperation(filePaths, (filePath) =>
        ipcServices.fs.openFileLocation(filePath)
      )
      if (!success) {
        toast.error(t('notifications.openFolderFailed'))
      }
    } catch (error) {
      logger.error('Failed to open file location:', error)
      toast.error(t('notifications.openFolderFailed'))
    }
  }

  const handleOpenFile = async () => {
    try {
      const downloadPath = download.downloadPath || settings.downloadPath
      if (!(downloadPath && download.title)) {
        toast.error(t('notifications.openFileFailed'))
        return
      }
      const format = resolvedExtension
      const filePaths = buildFilePathCandidates(
        downloadPath,
        download.title,
        format,
        download.savedFileName
      )

      const success = await tryFileOperation(filePaths, (filePath) =>
        ipcServices.fs.openFile(filePath)
      )
      if (!success) {
        toast.error(t('notifications.openFileFailed'))
      }
    } catch (error) {
      logger.error('Failed to open file:', error)
      toast.error(t('notifications.openFileFailed'))
    }
  }

  /** Open the post's source page in the system browser. */
  const handleOpenInBrowser = async () => {
    if (!isBrowserOpenableUrl(download.url)) {
      return
    }
    try {
      // Main logs and returns false on failure rather than throwing.
      const opened = await ipcServices.fs.openExternal(download.url)
      if (!opened) {
        toast.error(t('notifications.openInBrowserFailed'))
      }
    } catch (error) {
      logger.error('Failed to open the source URL:', error)
      toast.error(t('notifications.openInBrowserFailed'))
    }
  }

  const handleCopyLink = async () => {
    if (!download.url) {
      toast.error(t('notifications.copyFailed'))
      return
    }

    if (!navigator.clipboard?.writeText) {
      toast.error(t('notifications.copyFailed'))
      return
    }

    try {
      await navigator.clipboard.writeText(download.url)
      toast.success(t('notifications.urlCopied'))
    } catch (error) {
      logger.error('Failed to copy link:', error)
      toast.error(t('notifications.copyFailed'))
    }
  }
  // Check if copy to clipboard is available
  const canCopyToClipboard = () => {
    return Boolean(download.title && download.downloadPath && fileExists)
  }

  // need title, downloadPath, format
  const handleCopyToClipboard = async () => {
    if (!canCopyToClipboard()) {
      toast.error(t('notifications.copyFailed'))
      return
    }

    // Type guard: these values are guaranteed to exist after canCopyToClipboard() check
    const downloadPath = download.downloadPath
    const format = resolvedExtension
    const title = download.title
    if (!(downloadPath && title)) {
      toast.error(t('notifications.copyFailed'))
      return
    }

    try {
      // Generate file path using downloadPath + title + ext
      const filePaths = buildFilePathCandidates(downloadPath, title, format, download.savedFileName)
      const success = await tryFileOperation(filePaths, (filePath) =>
        ipcServices.fs.copyFileToClipboard(filePath)
      )
      if (!success) {
        toast.error(t('notifications.copyFailed'))
        return
      }
      toast.success(t('notifications.videoCopied'))
    } catch (error) {
      logger.error('Failed to copy file to clipboard:', error)
      toast.error(t('notifications.copyFailed'))
    }
  }

  /** Remove the resolved file and its record even if another action already deleted the file. */
  const handleDeleteFile = async () => {
    try {
      if (!existingFilePath) {
        toast.error(t('notifications.removeFailed'))
        return
      }
      const deleted = await ipcServices.fs.deleteFile(existingFilePath, true)

      if (!deleted) {
        toast.error(t('notifications.removeFailed'))
        return
      }

      setFileExists(false)
      setExistingFilePath(null)
      if (
        isHistory ||
        download.status === 'completed' ||
        download.status === 'error' ||
        download.status === 'cancelled'
      ) {
        await ipcServices.history.removeHistoryItem(download.id)
      }
      removeHistory(download.id)
      removeDownload(download.id)
    } catch (error) {
      logger.error('Failed to delete file:', error)
      toast.error(t('notifications.removeFailed'))
    }
  }

  const handleDeleteRecord = async () => {
    try {
      if (
        isHistory ||
        download.status === 'completed' ||
        download.status === 'error' ||
        download.status === 'cancelled'
      ) {
        await ipcServices.history.removeHistoryItem(download.id)
      }
      removeHistory(download.id)
      removeDownload(download.id)
    } catch (error) {
      logger.error('Failed to remove record:', error)
      toast.error(t('notifications.removeFailed'))
    }
  }

  /**
   * Open the transcript page. Captions vs ASR is decided after the page loads.
   */
  const handleOpenTranscript = () => {
    // Remembered so the back button returns to this row instead of the top of the list.
    rememberDownloadListFocus(download.id)
    void navigate({
      to: '/downloads/$downloadId/transcript',
      params: { downloadId: download.id }
    })
  }

  /**
   * Open whatever "detail" means for this row: a collection has a folder of
   * files rather than one media page.
   */
  const handleOpenDetail = () => {
    if (download.collectionSummary) {
      void handleOpenFolder()
      return
    }
    handleOpenTranscript()
  }

  const playableInput = {
    ...playbackInput,
    filePath: contents.media ? (playbackInput.filePath ?? existingFilePath ?? null) : null
  }

  /**
   * Fly this row's cover onto the playback-bar playlist button.
   */
  const flyCoverToPlaylist = (): void => {
    const cover = coverRef.current
    const image = cover?.querySelector('img')
    flyCoverToPlaylistButton({
      from: cover?.getBoundingClientRect() ?? null,
      src:
        image?.currentSrc ||
        image?.src ||
        cachedThumbnail ||
        download.thumbnail ||
        localPoster ||
        null
    })
  }

  /**
   * Put this media first in the playlist and start playing it immediately.
   */
  const handlePlayNow = (): boolean => {
    if (!playableInput.filePath) {
      toast.error(t('transcript.mediaMissing'))
      return false
    }
    takePlaybackSession(playableInput)
    flyCoverToPlaylist()
    return true
  }

  /**
   * Queue this media from the context menu and confirm it with a cover fly.
   */
  const handleAddToPlaylist = (): void => {
    handlePlayNow()
  }

  const isPausedDownload = download.subStatus === 'paused' || download.internalStatus === 'paused'

  const getStatusIcon = () => {
    switch (download.status) {
      case 'completed':
        return null
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />
      case 'downloading':
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      case 'pending':
        if (isPausedDownload) {
          return <Pause className="h-4 w-4 text-muted-foreground" />
        }
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      case 'cancelled':
        return <X className="h-4 w-4 text-muted-foreground" />
      default:
        return null
    }
  }

  const getStatusText = () => {
    switch (download.status) {
      case 'completed':
        return t('download.completed')
      case 'error':
        return t('download.error')
      case 'downloading':
        return t('download.downloading')
      case 'processing':
        return t('download.processing')
      case 'pending':
        if (isPausedDownload) {
          return t('download.paused')
        }
        return t('download.downloadPending')
      case 'cancelled':
        return t('download.cancelled')
      default:
        return ''
    }
  }

  const statusIcon = getStatusIcon()
  const statusText = getStatusText()
  const progressInfo = download.progress
  const isInProgressStatus =
    download.status === 'downloading' ||
    download.status === 'processing' ||
    download.status === 'pending'
  const canPauseDownload =
    !(isHistory || isPausedDownload) &&
    (download.status === 'downloading' || download.status === 'processing')
  const canResumeDownload = !isHistory && isPausedDownload
  const isCompletedStatus = download.status === 'completed'
  const isTerminalStatus =
    download.status === 'completed' ||
    download.status === 'error' ||
    download.status === 'cancelled'
  const platform = resolveDownloadPlatform(download.url)
  const isLocalMedia = platform.key === LOCAL_DOWNLOAD_PLATFORM_KEY
  const transcriptListState = transcript?.listState ?? 'none'
  const canRetry = !isLocalMedia && canRetryDownload(download.status)
  const canPlayMedia =
    !download.collectionSummary && isCompletedStatus && Boolean(playableInput.filePath)
  const actionsAlwaysVisible = isInProgressStatus
  const hoverActionsClass = `flex items-center justify-end gap-0.5 transition-opacity ${
    actionsAlwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
  }`
  const showOpenFolderAction = Boolean(
    contents.media && download.title && (download.downloadPath || settings.downloadPath)
  )
  const showInlineProgress = isInProgressStatus
  const canCopyLink = Boolean(download.url) && !isLocalMedia
  const canOpenFile = !download.collectionSummary && isCompletedStatus && fileExists
  const canDeleteFile =
    !(download.collectionSummary || isLocalMedia) && isCompletedStatus && fileExists
  const platformLabel = downloadPlatformDisplayLabel(platform, {
    local: t('download.localSource'),
    other: t('download.otherSource')
  })
  // yt-dlp reports a chosen format; gallery-dl routes only ever report what
  // actually landed on disk, so fall back to that rather than showing nothing.
  const selectedFormatSize =
    download.selectedFormat?.filesize ??
    download.selectedFormat?.filesize_approx ??
    download.fileSize ??
    download.totalSize
  const inlineFileSize = formatFileSize(selectedFormatSize)
  const displayErrorMessage = getDownloadErrorGuidance(download.error) ?? download.error
  const cookieFailureKind = getCookieSetupFailureKind(download.error)
  const qualityLabel = getQualityLabel(download)
  const liveLog = download.ytDlpLog ?? ''
  const logContent = liveLog.trim().length > 0 ? liveLog : (savedLog ?? '')
  const hasLogContent = logContent.trim().length > 0
  const ytDlpCommand = download.ytDlpCommand?.trim()
  const hasYtDlpCommand = Boolean(ytDlpCommand)
  const canShowSheet = isInProgressStatus || hasLogContent || isTerminalStatus
  const isSelectedHistory = selectionEnabled && isSelected
  useEffect(() => {
    const wasOpen = lastSheetOpenRef.current
    lastSheetOpenRef.current = sheetOpen
    if (!sheetOpen || wasOpen) {
      return
    }
    setLogAutoScroll(true)
  }, [sheetOpen])

  useEffect(() => {
    if (!(sheetOpen && logAutoScroll && logContent)) {
      return
    }
    const container = logContainerRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [logAutoScroll, logContent, sheetOpen])

  // Load persisted logs for failed rows before feedback opens, or when viewing terminal logs.
  useEffect(() => {
    if (
      !((sheetOpen || download.status === 'error') && isTerminalStatus) ||
      liveLog.trim().length > 0 ||
      savedLog !== null
    ) {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const item = await ipcServices.history.getHistoryById(download.id)
        if (!cancelled) {
          setSavedLog(item?.ytDlpLog ?? '')
        }
      } catch {
        if (!cancelled) {
          setSavedLog('')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sheetOpen, isTerminalStatus, liveLog, savedLog, download.id, download.status])

  const handleLogScroll = () => {
    const container = logContainerRef.current
    if (!container) {
      return
    }
    const { scrollTop, scrollHeight, clientHeight } = container
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 24
    setLogAutoScroll(isNearBottom)
  }

  const openLogsSheet = () => {
    if (!canShowSheet) {
      return
    }
    setLogAutoScroll(true)
    setSheetOpen(true)
  }

  const metaItems: { key: string; node: ReactNode }[] = []
  if (download.status !== 'completed' && statusText) {
    metaItems.push({
      key: 'status',
      node: (
        <span
          className={`inline-flex items-center gap-1 ${download.status === 'error' ? 'text-destructive' : ''}`}
        >
          {statusIcon}
          {statusText}
        </span>
      )
    })
  }
  if (agentTasks?.length) {
    metaItems.push({
      key: 'agent-tasks',
      node: <AgentTaskIndicator aiSnapshot={agentTaskAiSnapshot} tasks={agentTasks} />
    })
  }
  if (!showInlineProgress) {
    metaItems.push({
      key: 'date',
      node: formatDateShort(
        timestamp,
        i18n.language,
        t('download.dateToday', 'Today'),
        t('download.dateYesterday', 'Yesterday')
      )
    })
  }
  if (qualityLabel && !showInlineProgress) {
    metaItems.push({ key: 'quality', node: qualityLabel })
  }
  if (inlineFileSize && !showInlineProgress) {
    metaItems.push({ key: 'size', node: inlineFileSize })
  }
  if (download.fileCount && download.fileCount > 1 && !showInlineProgress) {
    metaItems.push({
      key: 'file-count',
      node: t('history.fileCount', { count: download.fileCount })
    })
  }
  if (download.origin === 'agent' || download.origin === 'subscription') {
    metaItems.push({
      key: 'origin',
      node: (
        <TaskOriginBadge agentConversation={download.agentConversation} origin={download.origin} />
      )
    })
  }
  const sameCreationSource =
    transcript?.creation?.origin === download.origin &&
    transcript?.creation?.agentConversation?.downloadId ===
      download.agentConversation?.downloadId &&
    transcript?.creation?.agentConversation?.threadId === download.agentConversation?.threadId &&
    transcript?.creation?.agentConversation?.promptId === download.agentConversation?.promptId
  if (
    transcriptListState !== 'none' &&
    transcript?.creation &&
    transcript.creation.origin !== 'manual' &&
    !sameCreationSource
  ) {
    metaItems.push({ key: 'transcript-origin', node: <TaskOriginBadge {...transcript.creation} /> })
  }

  return (
    <ContextMenu onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger asChild disabled={compact}>
        {/* biome-ignore lint/a11y/useSemanticElements: composite row contains independent buttons and selection controls */}
        <div
          aria-current={isNowPlaying ? 'true' : undefined}
          aria-label={displayTitle}
          aria-pressed={selectionEnabled ? isSelected : undefined}
          className={`group relative w-full max-w-full overflow-hidden rounded-lg text-left transition-colors hover:bg-[color:var(--hover)] focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 ${compact ? 'cursor-pointer px-3 py-3' : 'mx-4 w-[calc(100%-2rem)]! px-2 py-2'} ${
            isSelectedHistory || isContextMenuOpen
              ? 'bg-[color:var(--active)] hover:bg-[color:var(--active)]'
              : ''
          }`}
          data-download-id={download.id}
          data-download-selectable={selectionEnabled ? 'true' : undefined}
          data-now-playing={isNowPlaying ? 'true' : undefined}
          onClick={(event) => {
            if (
              !(event.target instanceof Node && event.currentTarget.contains(event.target)) ||
              isListIgnoreTarget(event.target)
            ) {
              return
            }
            event.currentTarget.focus({ preventScroll: true })
            if (selectionEnabled && (event.metaKey || event.ctrlKey || event.shiftKey)) {
              onToggleSelect?.(download.id, {
                range: event.shiftKey,
                toggle: event.metaKey || event.ctrlKey
              })
              return
            }
            // Only the cover and the title open the item; the empty run of row
            // beside them is dead space so a stray click cannot navigate away.
            // Compact Agent Chat cards stay fully clickable.
            if (
              !(
                compact ||
                (event.target instanceof Element && event.target.closest(ACTIVATE_SELECTOR))
              )
            ) {
              return
            }
            handleOpenDetail()
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) {
              return
            }
            if (event.key === 'Enter' || (!selectionEnabled && event.key === ' ')) {
              event.preventDefault()
              handleOpenDetail()
            }
          }}
          role="button"
          tabIndex={selectionEnabled && !isTabStop ? -1 : 0}
        >
          <div className="flex w-full items-start gap-3">
            {/* Thumbnail */}
            <div
              className="relative z-20 h-[54px] w-24 shrink-0 overflow-hidden rounded-md bg-muted text-meta"
              data-download-activate=""
              data-download-transfer-cover=""
              ref={coverRef}
            >
              {selectionEnabled && (
                <div
                  className={`pointer-events-auto absolute top-1 left-1 z-30 rounded-md transition ${
                    isSelected || selectionActive
                      ? 'opacity-100'
                      : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
                  }`}
                >
                  <Checkbox
                    aria-label={t('history.selectItem')}
                    checked={Boolean(isSelected)}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleSelect?.(download.id, {
                        range: event.shiftKey,
                        toggle: !event.shiftKey || event.metaKey || event.ctrlKey
                      })
                    }}
                    onKeyDown={(event) => {
                      if (event.key === ' ') {
                        event.preventDefault()
                        onToggleSelect?.(download.id, {
                          range: event.shiftKey,
                          toggle: !event.shiftKey || event.metaKey || event.ctrlKey
                        })
                      }
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                  />
                </div>
              )}
              <RemoteImage
                alt={displayTitle}
                className="h-full w-full object-cover text-meta"
                fallbackIcon={
                  <DownloadPlatformIcon className="size-4 grayscale" domain={platform.domain} />
                }
                loadingIcon={
                  <DownloadPlatformIcon className="size-4 grayscale" domain={platform.domain} />
                }
                placeholderClassName="bg-muted text-meta"
                src={download.thumbnail || localPoster}
              />
              {isNowPlaying ? (
                <span
                  aria-hidden="true"
                  className="transcript-library-now-playing"
                  data-testid="transcript-library-now-playing"
                >
                  <TranscriptAudioEqualizer playing={playbackPlaying} />
                </span>
              ) : null}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex min-h-14 items-center gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  {download.collectionSummary && (
                    <SocialMediaStatus
                      completed={download.status === 'completed'}
                      onRefresh={() => {
                        void handleRetryDownload()
                      }}
                      summary={download.collectionSummary}
                    />
                  )}

                  <div
                    className={`flex min-w-0 items-center gap-1.5 ${isNowPlaying ? 'text-data' : ''}`}
                  >
                    <span
                      aria-label={platformLabel}
                      className="inline-flex size-4 shrink-0 items-center justify-center"
                      role="img"
                      title={platformLabel}
                    >
                      <DownloadPlatformIcon className="block size-4" domain={platform.domain} />
                    </span>
                    <p
                      className="min-w-0 cursor-pointer truncate font-medium text-sm hover:underline"
                      data-download-activate=""
                      title={download.url}
                    >
                      {displayTitle}
                    </p>
                  </div>
                  <DownloadItemMeta
                    items={metaItems}
                    leading={
                      contents.parts.length > 0 ? (
                        <DownloadContentStack notes={contents.notes} parts={contents.parts} />
                      ) : undefined
                    }
                  />
                </div>
                {showInlineProgress && (
                  <div className="ml-auto shrink-0 text-right text-[13px] text-muted-foreground tabular-nums">
                    <span>
                      {progressInfo?.percent === undefined
                        ? '—'
                        : `${Math.min(100, Math.max(0, progressInfo.percent)).toFixed(0)}%`}
                    </span>
                    <span className="mx-1.5">·</span>
                    <span>{progressInfo?.currentSpeed ?? download.speed ?? '—'}</span>
                    <span className="mx-1.5">·</span>
                    <span>
                      {t('download.etaValue', 'ETA {{eta}}', { eta: progressInfo?.eta ?? '—' })}
                    </span>
                  </div>
                )}
                <div
                  className={
                    compact
                      ? 'hidden'
                      : 'pointer-events-auto relative z-20 flex shrink-0 items-center justify-end gap-0.5 text-muted-foreground'
                  }
                >
                  {transcriptListState === 'failed' ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={t('transcript.retry')}
                          className="h-8 w-8 shrink-0 rounded-full"
                          onClick={(event) => {
                            event.stopPropagation()
                            void ipcServices.transcript.retry(download.id)
                          }}
                          size="icon"
                          variant="ghost"
                        >
                          <RotateCw className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('transcript.retry')}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  {canRetry ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={t('download.retry')}
                          className="h-8 w-8 shrink-0 rounded-full"
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleRetryDownload()
                          }}
                          size="icon"
                          variant="ghost"
                        >
                          <RotateCw className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('download.retry')}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  {canPlayMedia ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={t('transcript.player.play')}
                          className="h-8 w-8 shrink-0 rounded-full"
                          onClick={(event) => {
                            event.stopPropagation()
                            handlePlayNow()
                          }}
                          size="icon"
                          variant="ghost"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('transcript.player.play')}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  <div className={hoverActionsClass}>
                    {!isHistory && isInProgressStatus ? (
                      <>
                        {canPauseDownload && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                aria-label={t('download.pause')}
                                className="h-8 w-8 shrink-0 rounded-full"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void handlePause()
                                }}
                                size="icon"
                                variant="ghost"
                              >
                                <Pause className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t('download.pause')}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {canResumeDownload && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                aria-label={t('download.resume')}
                                className="h-8 w-8 shrink-0 rounded-full"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void handleResume()
                                }}
                                size="icon"
                                variant="ghost"
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t('download.resume')}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Button
                          aria-label={t('download.cancel')}
                          className="h-8 w-8 shrink-0 rounded-full"
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleCancel()
                          }}
                          size="icon"
                          variant="ghost"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={t('history.moreActions')}
                        className="h-8 w-8 shrink-0 rounded-full"
                        onClick={openContextMenuFromClick}
                        size="icon"
                        variant="ghost"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('history.moreActions')}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Progress */}
              {showInlineProgress && (
                <Progress
                  aria-label={t('agentChat.ui.progress')}
                  className="mt-1.5 h-1 w-full rounded-full bg-data-track [&_[data-slot=progress-indicator]]:bg-data"
                  value={Math.min(100, Math.max(0, progressInfo?.percent ?? 0))}
                />
              )}

              {/* Format-fallback hint: shown on completed rows when yt-dlp's
                  resolved format id does not contain the user-picked id (e.g.
                  user picked Bilibili 4K but only 1080p actually streamed). */}
              {download.status === 'completed' && didFallbackFromPick(download) && (
                <div className="flex flex-col gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
                  <span className="font-medium text-amber-600 text-xs dark:text-amber-400">
                    {t('download.formatFallbackTitle')}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t('download.formatFallbackHint', {
                      resolved: download.resolvedFormatId
                    })}
                  </span>
                </div>
              )}

              {/* Error message */}
              {download.status === 'error' && (
                <div className="flex flex-col gap-1.5">
                  {displayErrorMessage ? (
                    <p className="line-clamp-2 w-full overflow-hidden text-destructive text-xs">
                      {displayErrorMessage}
                    </p>
                  ) : null}
                  {cookieFailureKind ? (
                    <div className="pointer-events-auto">
                      <Button
                        className="h-7 px-2 text-[11px]"
                        onClick={(event) => {
                          event.stopPropagation()
                          setCookieSetupRequest({
                            downloadId: download.id,
                            failureKind: cookieFailureKind
                          })
                        }}
                        size="sm"
                      >
                        {t('download.cookiesSetupAction')}
                      </Button>
                    </div>
                  ) : null}
                  <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
                    <DownloadTroubleshootButton taskId={download.id} />
                    {canShowSheet && (
                      <Button
                        className="h-6 px-1.5 text-[10px]"
                        onClick={(event) => {
                          event.stopPropagation()
                          openLogsSheet()
                        }}
                        size="sm"
                        variant="outline"
                      >
                        {t('download.viewLogs')}
                      </Button>
                    )}
                    <FeedbackLinkButtons
                      appInfo={appInfo}
                      buttonClassName="h-6 gap-1 px-1.5 text-[10px] [&_svg]:size-3"
                      buttonSize="sm"
                      buttonVariant="outline"
                      error={download.error}
                      iconClassName="h-3 w-3"
                      includeAppInfo
                      issueTitle={DOWNLOAD_FEEDBACK_ISSUE_TITLE}
                      onLinkClick={(event) => event.stopPropagation()}
                      showGroupSeparator
                      sourceUrl={download.url}
                      stage="download"
                      task={download}
                      wrapperClassName="flex flex-wrap items-center gap-1.5"
                      ytDlpCommand={download.ytDlpCommand}
                      ytDlpLog={logContent}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {canShowSheet && (
            <Sheet onOpenChange={setSheetOpen} open={sheetOpen}>
              <SheetContent
                className="flex h-full min-h-0 w-full flex-col p-0 sm:max-w-lg"
                onClick={(event) => event.stopPropagation()}
                side="right"
              >
                <div className="flex h-full min-h-0 flex-col overflow-hidden">
                  <SheetHeader className="shrink-0 border-b px-6 pt-6 pb-4">
                    <SheetTitle className="line-clamp-2">{displayTitle}</SheetTitle>
                    <SheetDescription>{t('download.logsTab')}</SheetDescription>
                  </SheetHeader>
                  <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 py-4">
                    <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                      <span>
                        {isInProgressStatus ? t('download.logs.live') : t('download.logs.history')}
                      </span>
                      <div className="flex items-center gap-2">
                        {logAutoScroll ? null : (
                          <span className="text-muted-foreground/70">
                            {t('download.logs.scrollPaused')}
                          </span>
                        )}
                        <Button
                          disabled={!hasLogContent}
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(logContent)
                              toast.success(t('kernelPreparation.copied'))
                            } catch {
                              toast.error(t('notifications.copyFailed'))
                            }
                          }}
                          size="sm"
                          variant="outline"
                        >
                          <Copy aria-hidden="true" className="size-3.5" />
                          {t('kernelPreparation.copyLog')}
                        </Button>
                      </div>
                    </div>
                    {hasYtDlpCommand && (
                      <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                        <div className="font-medium text-[11px] text-muted-foreground">
                          {t('download.logs.command')}
                        </div>
                        <div className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">
                          {ytDlpCommand}
                        </div>
                      </div>
                    )}
                    <div className="min-h-0 flex-1 rounded-md border border-border/60 bg-muted/30">
                      <div
                        className="h-full overflow-y-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed"
                        onScroll={handleLogScroll}
                        ref={logContainerRef}
                      >
                        {hasLogContent ? logContent : t('download.logs.empty')}
                      </div>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {isSelected && selectionContextMenu ? (
          selectionContextMenu
        ) : (
          <DownloadRecordContextMenuItems
            canCopyLink={canCopyLink}
            canCopyToClipboard={canCopyToClipboard()}
            canDeleteFile={canDeleteFile}
            canDeleteRecord={!isInProgressStatus}
            canOpenFile={canOpenFile}
            canPauseDownload={canPauseDownload}
            canResumeDownload={canResumeDownload}
            canRetry={canRetry}
            canShowOpenFolder={showOpenFolderAction}
            isInProgressStatus={isInProgressStatus}
            onAddToPlaylist={handleAddToPlaylist}
            onCancel={() => {
              void handleCancel()
            }}
            onCopyLink={() => {
              void handleCopyLink()
            }}
            onCopyToClipboard={() => {
              void handleCopyToClipboard()
            }}
            onDeleteFile={() => {
              void handleDeleteFile()
            }}
            onDeleteRecord={() => {
              void handleDeleteRecord()
            }}
            onOpenDetail={handleOpenDetail}
            onOpenFile={() => {
              void handleOpenFile()
            }}
            onOpenFolder={() => {
              void handleOpenFolder()
            }}
            onOpenInBrowser={
              isBrowserOpenableUrl(download.url)
                ? () => {
                    void handleOpenInBrowser()
                  }
                : undefined
            }
            onPause={() => {
              void handlePause()
            }}
            onResume={() => {
              void handleResume()
            }}
            onRetry={() => {
              void handleRetryDownload()
            }}
            onTranscriptRetry={() => {
              void ipcServices.transcript.retry(download.id)
            }}
            showTranscriptRetry={transcriptListState === 'failed'}
            sourceUrl={download.url}
          />
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/**
 * One metadata line, with dots between the parts that are present.
 *
 * @param items Metadata fragments to join.
 * @param leading Fixed-width part shown first, separated by the same dot.
 */
function DownloadItemMeta({
  items,
  leading
}: {
  items: { key: string; node: ReactNode }[]
  leading?: ReactNode
}) {
  if (items.length === 0 && !leading) {
    return null
  }
  return (
    <div
      className="flex h-5 min-w-0 items-center overflow-hidden text-[13px] text-muted-foreground tabular-nums leading-none [&_img]:block [&_svg]:block"
      data-testid="download-item-meta"
    >
      {leading}
      {items.map((item, index) => (
        <span className="inline-flex h-4 min-w-0 items-center" key={item.key}>
          {index > 0 || leading ? (
            <span
              aria-hidden="true"
              className="mx-1.5 shrink-0 text-muted-foreground/40 leading-none"
            >
              ·
            </span>
          ) : null}
          <span className="inline-flex h-4 min-w-0 items-center truncate">{item.node}</span>
        </span>
      ))}
    </div>
  )
}

/** Label task provenance and link to the exact conversation that admitted it. */
function TaskOriginBadge({ origin, agentConversation }: Partial<TaskCreationMetadata>) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  if (origin === 'subscription') {
    return (
      <span className="text-[13px] text-muted-foreground">
        {t('download.createdBySubscription')}
      </span>
    )
  }
  if (origin !== 'agent') {
    return null
  }
  const className =
    'pointer-events-auto relative z-20 inline-flex rounded-sm text-muted-foreground text-[13px]'
  return agentConversation ? (
    <button
      aria-label={t('download.openSourceConversation')}
      className={`${className} hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      data-task-origin="agent"
      onClick={(event) => {
        event.stopPropagation()
        void navigate({
          to: '/downloads/$downloadId/transcript',
          params: { downloadId: agentConversation.downloadId },
          search: { tab: agentConversation.promptId, thread: agentConversation.threadId }
        })
      }}
      title={t('download.openSourceConversation')}
      type="button"
    >
      {t('download.createdByAgent')}
    </button>
  ) : (
    <span className={className}>{t('download.createdByAgent')}</span>
  )
}
