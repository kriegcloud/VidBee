import { TranscriptAudioEqualizer } from '@renderer/components/transcript/TranscriptAudioEqualizer'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { RemoteImage } from '@renderer/components/ui/remote-image'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { useHistorySync } from '@renderer/hooks/use-history-sync'
import { useImportLocalMedia } from '@renderer/hooks/use-import-local-media'
import { ipcEvents, ipcServices } from '@renderer/lib/ipc'
import {
  isListedTranscript,
  previewTranscriptText,
  sortTranscriptLibraryItems,
  titleFromSourcePath,
  transcriptLibraryStatusKey
} from '@renderer/lib/transcript-library'
import { isNowPlayingLibraryItem } from '@renderer/lib/transcript-playback'
import { cn } from '@renderer/lib/utils'
import { type DownloadRecord, downloadsArrayAtom } from '@renderer/store/downloads'
import { playbackPlayingAtom, playbackSessionAtom } from '@renderer/store/transcript-playback'
import {
  type TranscriptListState,
  type TranscriptSnapshotView,
  transcriptMapAtom
} from '@renderer/store/transcripts'
import { useNavigate } from '@tanstack/react-router'
import { DownloadEmptyState } from '@vidbee/ui/components/ui/download-empty-state'
import { IngestDropOverlay } from '@vidbee/ui/components/ui/ingest-drop-overlay'
import { useHomeIngest } from '@vidbee/ui/lib/use-home-ingest'
import { useAtomValue } from 'jotai'
import {
  AlertCircle,
  AudioLines,
  Captions,
  CheckCircle2,
  FileAudio,
  Loader2,
  Play,
  Plus,
  Sparkles,
  X
} from 'lucide-react'
import { type ReactNode, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

interface TranscriptLibraryItem {
  download: DownloadRecord | undefined
  listState: TranscriptListState
  preview: string
  recency: number
  snapshot: TranscriptSnapshotView
}

/**
 * Short timestamp matching the download list.
 *
 * @param timestamp Unix epoch milliseconds.
 */
const formatDateShort = (timestamp?: number): string => {
  if (!timestamp) {
    return ''
  }
  return new Date(timestamp).toLocaleString(undefined, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'numeric'
  })
}

/**
 * Resolve the best download record for a transcript snapshot.
 *
 * @param records All known download rows.
 * @returns A map keyed by download id.
 */
const indexDownloadsById = (records: DownloadRecord[]): Map<string, DownloadRecord> => {
  const map = new Map<string, DownloadRecord>()
  for (const record of records) {
    const existing = map.get(record.id)
    if (!existing || record.entryType === 'history') {
      map.set(record.id, record)
    }
  }
  return map
}

/**
 * Independent library of queued, running, and finished transcripts.
 */
export function TranscriptsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const transcriptMap = useAtomValue(transcriptMapAtom)
  const downloads = useAtomValue(downloadsArrayAtom)
  const { importMediaPaths, pickAndImportMedia } = useImportLocalMedia()
  useHistorySync()
  const items = useMemo(() => {
    const downloadById = indexDownloadsById(downloads)
    const rows: TranscriptLibraryItem[] = []
    for (const snapshot of Object.values(transcriptMap)) {
      if (!isListedTranscript(snapshot.listState)) {
        continue
      }
      const download = downloadById.get(snapshot.downloadTaskId)
      rows.push({
        download,
        listState: snapshot.listState,
        preview:
          snapshot.listState === 'failed'
            ? previewTranscriptText([{ text: snapshot.error ?? '' }])
            : previewTranscriptText(snapshot.record?.segments ?? []),
        recency: snapshot.updatedAt ?? download?.completedAt ?? download?.createdAt ?? 0,
        snapshot
      })
    }

    return sortTranscriptLibraryItems(rows)
  }, [downloads, transcriptMap])

  const openTranscript = useCallback(
    (downloadId: string) => {
      void navigate({
        params: { downloadId },
        to: '/downloads/$downloadId/transcript'
      })
    },
    [navigate]
  )

  const goToDownloads = useCallback(() => {
    void navigate({ to: '/' })
  }, [navigate])

  const { dropKind, isDragging } = useHomeIngest({
    enabled: true,
    onMediaPaths: importMediaPaths,
    onUnsupported: () => {
      toast.error(t('notifications.unsupportedDrop'))
    },
    onUrls: () => {
      toast.error(t('notifications.unsupportedDrop'))
    },
    readClipboardPaths: () => ipcServices.fs.readClipboardFilePaths(),
    resolveFilePath: (file) => ipcEvents.getPathForFile(file)
  })

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="z-50 bg-background px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <p className="flex min-w-0 items-center gap-2 text-muted-foreground text-sm">
            <Badge variant="secondary">{t('transcript.library.experimentalBadge')}</Badge>
            <span className="min-w-0 truncate">{t('transcript.library.experimentalHint')}</span>
          </p>
          <Button
            className="shrink-0 rounded-full"
            onClick={() => {
              void pickAndImportMedia()
            }}
            type="button"
          >
            <Plus className="h-4 w-4" />
            {t('transcript.library.addMedia')}
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="w-full pb-4">
          {items.length === 0 ? (
            <div className="px-6 py-4">
              <DownloadEmptyState
                action={
                  <Button onClick={goToDownloads} size="sm" variant="outline">
                    {t('transcript.library.goToDownloads')}
                  </Button>
                }
                hint={t('transcript.library.emptyHint')}
                message={t('transcript.library.empty')}
              />
            </div>
          ) : (
            <ul>
              {items.map((item) => (
                <TranscriptLibraryRow
                  item={item}
                  key={item.snapshot.downloadTaskId}
                  onOpen={openTranscript}
                />
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>

      <IngestDropOverlay
        description={t('transcript.library.dropDescription')}
        kind={dropKind}
        mediaTitle={t('download.ingestDropMedia')}
        mixedTitle={t('download.ingestDropMedia')}
        urlTitle={t('download.ingestDropMedia')}
        visible={isDragging}
      />
    </div>
  )
}

interface TranscriptLibraryRowProps {
  item: TranscriptLibraryItem
  onOpen: (downloadId: string) => void
}

/**
 * Status icon matching the download list: spinner, check, or error.
 *
 * @param listState Compact transcript status.
 * @param sourceKind Caption vs ASR origin.
 */
const transcriptStatusIcon = (
  listState: TranscriptListState,
  sourceKind?: 'asr' | 'captions' | null
): ReactNode => {
  switch (listState) {
    case 'completed':
      return sourceKind === 'captions' ? (
        <Captions className="h-4 w-4 text-muted-foreground" />
      ) : (
        <Sparkles className="h-4 w-4 text-violet-500" />
      )
    case 'no-speech':
      return <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-destructive" />
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />
    case 'queued':
    case 'retry-scheduled':
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    case 'cancelled':
      return <X className="h-4 w-4 text-muted-foreground" />
    default:
      return null
  }
}

/**
 * One clickable transcript row aligned with the download list.
 */
function TranscriptLibraryRow({ item, onOpen }: TranscriptLibraryRowProps) {
  const { t } = useTranslation()
  const session = useAtomValue(playbackSessionAtom)
  const title =
    item.download?.title?.trim() ||
    item.snapshot.title?.trim() ||
    titleFromSourcePath(item.snapshot.sourceFilePath) ||
    t('transcript.library.untitled')
  const statusLabel = t(transcriptLibraryStatusKey(item.listState, item.snapshot.sourceKind))
  const timestamp =
    item.download?.completedAt ?? item.download?.createdAt ?? item.snapshot.updatedAt
  const timestampLabel = formatDateShort(timestamp)
  const preview = item.listState === 'completed' || item.listState === 'failed' ? item.preview : ''
  const statusIcon = transcriptStatusIcon(item.listState, item.snapshot.sourceKind)
  const downloadId = item.snapshot.downloadTaskId
  const isNowPlaying = isNowPlayingLibraryItem(session, downloadId)
  return (
    <li>
      <button
        aria-current={isNowPlaying ? 'true' : undefined}
        aria-label={t('transcript.library.open', { title })}
        className="group relative w-full max-w-full overflow-hidden px-6 py-2 text-left transition-colors"
        data-now-playing={isNowPlaying ? 'true' : undefined}
        onClick={() => onOpen(downloadId)}
        type="button"
      >
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:gap-3">
          <div className="pointer-events-none relative z-20 aspect-video h-14 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-background/60">
            <RemoteImage
              alt={title}
              className="h-full w-full object-cover"
              fallbackIcon={
                item.download?.type === 'audio' ? (
                  <FileAudio className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )
              }
              src={item.download?.thumbnail}
            />
            {isNowPlaying ? <TranscriptLibraryNowPlayingOverlay /> : null}
          </div>
          <div className="min-w-0 max-w-full flex-1 overflow-hidden">
            <div className="flex h-14 w-full flex-col justify-center gap-1.5">
              <p className={cn('line-clamp-1 font-medium text-sm', isNowPlaying && 'text-primary')}>
                {title}
              </p>
              <div className="flex w-full min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                {isNowPlaying ? <AudioLines className="h-4 w-4 text-primary" /> : statusIcon}
                <span
                  className={cn(
                    'shrink-0',
                    isNowPlaying && 'font-medium text-primary',
                    !isNowPlaying && item.listState === 'failed' && 'text-destructive',
                    !isNowPlaying && item.listState === 'running' && 'font-medium text-foreground'
                  )}
                >
                  {isNowPlaying ? t('transcript.player.nowPlaying') : statusLabel}
                </span>
                {timestampLabel ? (
                  <>
                    <span className="shrink-0 text-muted-foreground/60">•</span>
                    <span className="shrink-0 truncate">{timestampLabel}</span>
                  </>
                ) : null}
                {preview ? (
                  <>
                    <span className="shrink-0 text-muted-foreground/60">•</span>
                    <span className="min-w-0 truncate">{preview}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </button>
    </li>
  )
}

/**
 * Thumbnail overlay for the library row that owns the now-playing session.
 */
function TranscriptLibraryNowPlayingOverlay(): ReactNode {
  const playing = useAtomValue(playbackPlayingAtom)
  return (
    <span aria-hidden="true" className="transcript-library-now-playing">
      <TranscriptAudioEqualizer playing={playing} />
    </span>
  )
}
