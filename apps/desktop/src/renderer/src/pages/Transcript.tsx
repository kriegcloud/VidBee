import { AsrUpgradeDialog } from '@renderer/components/transcript/AsrUpgradeDialog'
import { SpeakerCountDialog } from '@renderer/components/transcript/SpeakerCountDialog'
import { TranscriptExportDialog } from '@renderer/components/transcript/TranscriptExportDialog'
import { fileNameFromPath } from '@renderer/components/transcript/TranscriptInfoPane'
import { TranscriptPlaybackSlot } from '@renderer/components/transcript/TranscriptPlaybackSlot'
import { TranscriptPlaybackStandby } from '@renderer/components/transcript/TranscriptPlaybackStandby'
import { TranscriptSidePanel } from '@renderer/components/transcript/TranscriptSidePanel'
import { TranscriptSourceSwitch } from '@renderer/components/transcript/TranscriptSourceSwitch'
import { TranscriptSpeakersPane } from '@renderer/components/transcript/TranscriptSpeakersPane'
import { Button } from '@renderer/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from '@renderer/components/ui/resizable'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { DesktopChromeContext, useTitleBar } from '@renderer/desktop-chrome'
import { useCachedThumbnail } from '@renderer/hooks/use-cached-thumbnail'
import { ipcEvents, ipcServices } from '@renderer/lib/ipc'
import { segmentAtTime } from '@renderer/lib/transcript-index'
import {
  isInProgressTranscript,
  isListedTranscript,
  resolveTranscriptWorkspaceView,
  shouldAutoStartAsr,
  transcriptProgressLabelKey
} from '@renderer/lib/transcript-library'
import { resolveMediaDurationMs } from '@renderer/lib/transcript-speakers'
import {
  type PartialTranscriptRow,
  speakersFromSegments,
  toPartialSegmentViews
} from '@renderer/lib/transcript-stream'
import { useTranscriptModelPrep } from '@renderer/store/transcript-models'
import {
  ensurePlaybackSessionAtom,
  playbackClockAtom,
  playbackControlsAtom,
  playbackPresentationAtom,
  playbackSessionAtom,
  releaseIdlePlaybackAtom,
  takePlaybackSessionAtom
} from '@renderer/store/transcript-playback'
import {
  type TranscriptSegmentView,
  type TranscriptSnapshotView,
  type TranscriptSpeakerView,
  upsertTranscriptAtom
} from '@renderer/store/transcripts'
import { buildPromptTranscriptText } from '@shared/ai-prompt-text'
import { useNavigate, useParams } from '@tanstack/react-router'
import { DragRegion, NoDrag } from '@vidbee/ui/components/ui/drag-region'
import { mediaKindFromName } from '@vidbee/ui/lib/ingest'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  Captions,
  ChevronLeft,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  Sparkles
} from 'lucide-react'
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import { type PanelImperativeHandle, useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import { toast } from 'sonner'
import { downloadRecordsAtom } from '../store/downloads'

const EMPTY_SEGMENTS: TranscriptSegmentView[] = []
const EMPTY_SPEAKERS: TranscriptSpeakerView[] = []
const WIDE_LAYOUT_QUERY = '(min-width: 1024px)'

/**
 * Track whether the transcript workspace has room for a side-by-side layout.
 *
 * @returns True when the window is at the `lg` breakpoint or wider.
 */
const useWideTranscriptLayout = (): boolean => {
  const [isWide, setIsWide] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(WIDE_LAYOUT_QUERY).matches
  )

  useEffect(() => {
    const media = window.matchMedia(WIDE_LAYOUT_QUERY)
    const sync = (): void => {
      setIsWide(media.matches)
    }
    sync()
    media.addEventListener('change', sync)
    return () => {
      media.removeEventListener('change', sync)
    }
  }, [])

  return isWide
}

interface TranscriptSplitProps {
  captions: ReactNode
  captionsRef: RefObject<PanelImperativeHandle | null>
  media: ReactNode
  onCaptionsResize: () => void
  orientation: 'horizontal' | 'vertical'
  resizeLabel: string
}

/**
 * Split the media player and transcript list with a draggable, collapsible handle.
 */
function TranscriptSplit({
  captions,
  captionsRef,
  media,
  onCaptionsResize,
  orientation,
  resizeLabel
}: TranscriptSplitProps) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `vidbee-transcript-${orientation}`,
    onlySaveAfterUserInteractions: true
  })
  const isHorizontal = orientation === 'horizontal'
  return (
    <ResizablePanelGroup
      className="min-h-0 flex-1"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      orientation={orientation}
    >
      <ResizablePanel
        className="min-h-0 min-w-0"
        defaultSize={isHorizontal ? '52%' : '38%'}
        id="transcript-media"
        minSize={isHorizontal ? '28%' : '22%'}
      >
        {media}
      </ResizablePanel>
      <ResizableHandle aria-label={resizeLabel} autoHide />
      <ResizablePanel
        className="min-h-0 min-w-0"
        collapsedSize="0px"
        collapsible
        defaultSize={isHorizontal ? '48%' : '62%'}
        id="transcript-captions"
        minSize={isHorizontal ? '24%' : '30%'}
        onResize={onCaptionsResize}
        panelRef={captionsRef}
      >
        {captions}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

interface TranscriptHeaderProps {
  backLabel: string
  canExport: boolean
  canForce: boolean
  canUpgrade: boolean
  captionsCollapsed: boolean
  collapseLabel: string
  expandLabel: string
  exportLabel: string
  failed: boolean
  onBack: () => void
  onExport: () => void
  onForce: () => void
  onRetry: () => void
  onToggleCaptions: () => void
  onUpgrade: () => void
  retryLabel: string
  sourceKind?: 'asr' | 'captions' | null
  sourceLabel?: string
  sourceSwitch?: ReactNode
  stillTranscribeLabel: string
  title: string
  upgradeLabel: string
}

/**
 * Caption / AI source mark: icon only, source name in a tooltip.
 */
function TranscriptSourceIcon({
  sourceKind,
  sourceLabel
}: Pick<TranscriptHeaderProps, 'sourceKind' | 'sourceLabel'>) {
  const icon =
    sourceKind === 'captions' ? (
      <Captions className="block size-4 text-muted-foreground" />
    ) : sourceKind === 'asr' ? (
      <Sparkles className="block size-4 text-violet-500" />
    ) : null
  if (!icon) {
    return null
  }
  if (!sourceLabel) {
    return (
      <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center">
        {icon}
      </span>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={sourceLabel}
          className="inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{sourceLabel}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Compact document header hosted in the window drag region.
 */
function TranscriptHeader({
  backLabel,
  canExport,
  canForce,
  canUpgrade,
  captionsCollapsed,
  collapseLabel,
  expandLabel,
  exportLabel,
  failed,
  onBack,
  onExport,
  onForce,
  onRetry,
  onToggleCaptions,
  onUpgrade,
  retryLabel,
  sourceKind,
  sourceLabel,
  sourceSwitch,
  stillTranscribeLabel,
  title,
  upgradeLabel
}: TranscriptHeaderProps) {
  return (
    <>
      <NoDrag className="inline-flex items-center">
        <Button
          aria-label={backLabel}
          className="h-8 w-8"
          onClick={onBack}
          size="icon"
          variant="ghost"
        >
          <ChevronLeft className="block size-4" />
        </Button>
      </NoDrag>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {!sourceSwitch && (sourceKind === 'captions' || sourceKind === 'asr') ? (
          <NoDrag className="inline-flex items-center">
            <TranscriptSourceIcon sourceKind={sourceKind} sourceLabel={sourceLabel} />
          </NoDrag>
        ) : null}
        <h1 className="truncate font-semibold text-sm leading-none">{title}</h1>
      </div>
      <NoDrag className="flex shrink-0 items-center gap-1.5">
        {sourceSwitch}
        {canExport ? (
          <>
            {canUpgrade ? (
              <Button onClick={onUpgrade} size="sm" variant="ghost">
                {upgradeLabel}
              </Button>
            ) : null}
            <Button onClick={onExport} size="sm" variant="outline">
              {exportLabel}
            </Button>
          </>
        ) : null}
        <Button
          aria-label={captionsCollapsed ? expandLabel : collapseLabel}
          className="h-8 w-8"
          onClick={onToggleCaptions}
          size="icon"
          type="button"
          variant="ghost"
        >
          {captionsCollapsed ? <PanelRightOpen /> : <PanelRightClose />}
        </Button>
        {failed ? (
          <Button onClick={onRetry} size="sm">
            <RotateCw />
            {retryLabel}
          </Button>
        ) : null}
        {canForce ? (
          <Button onClick={onForce} size="sm">
            <Sparkles />
            {stillTranscribeLabel}
          </Button>
        ) : null}
      </NoDrag>
    </>
  )
}

export function TranscriptPage() {
  const { downloadId } = useParams({ from: '/downloads/$downloadId/transcript' })
  const { t } = useTranslation()
  const navigate = useNavigate()
  const chrome = useContext(DesktopChromeContext)
  const isWide = useWideTranscriptLayout()
  const records = useAtomValue(downloadRecordsAtom)
  const upsert = useSetAtom(upsertTranscriptAtom)
  const modelPrep = useTranscriptModelPrep()
  const [snapshot, setSnapshot] = useState<TranscriptSnapshotView | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [speakerCountOpen, setSpeakerCountOpen] = useState(false)
  const [partials, setPartials] = useState<TranscriptSegmentView[]>(EMPTY_SEGMENTS)
  const [captionsCollapsed, setCaptionsCollapsed] = useState(false)
  const session = useAtomValue(playbackSessionAtom)
  const clock = useAtomValue(playbackClockAtom)
  const controls = useAtomValue(playbackControlsAtom)
  const ensureSession = useSetAtom(ensurePlaybackSessionAtom)
  const takeSession = useSetAtom(takePlaybackSessionAtom)
  const releaseIdle = useSetAtom(releaseIdlePlaybackAtom)
  const setPresentation = useSetAtom(playbackPresentationAtom)
  const hadListedTranscript = useRef(false)
  const captionsRef = usePanelRef()
  const syncCaptionsCollapsed = useCallback(() => {
    setCaptionsCollapsed(captionsRef.current?.isCollapsed() ?? false)
  }, [captionsRef])

  const toggleCaptions = useCallback(() => {
    const panel = captionsRef.current
    if (!panel) {
      return
    }
    if (panel.isCollapsed()) {
      panel.expand()
    } else {
      panel.collapse()
    }
    setCaptionsCollapsed(panel.isCollapsed())
  }, [captionsRef])

  const download = useMemo(() => {
    for (const record of records.values()) {
      if (record.id === downloadId) {
        return record
      }
    }
    return null
  }, [downloadId, records])

  const refresh = useCallback(async () => {
    let next = (await ipcServices.transcript.getForDownload(downloadId)) as TranscriptSnapshotView
    if (shouldAutoStartAsr(next)) {
      try {
        next = (await ipcServices.transcript.start({ downloadId })) as TranscriptSnapshotView
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('transcript.retryFailed'))
      }
    }
    if (isListedTranscript(next.listState)) {
      hadListedTranscript.current = true
    }
    setSnapshot(next)
    upsert(next)
  }, [downloadId, t, upsert])

  useEffect(() => {
    hadListedTranscript.current = false
    void refresh()
    const offUpdated = ipcEvents.on('transcript:updated', (...args: unknown[]) => {
      const next = args[0] as TranscriptSnapshotView
      if (next?.downloadTaskId !== downloadId) {
        return
      }
      if (isListedTranscript(next.listState)) {
        hadListedTranscript.current = true
      }
      setSnapshot(next)
      upsert(next)
      if (hadListedTranscript.current && next.listState === 'none') {
        void navigate({ to: '/transcripts' })
      }
    })
    const offPartial = ipcEvents.on('transcript:partial', (...args: unknown[]) => {
      const payload = args[0] as {
        downloadTaskId?: string
        segments?: PartialTranscriptRow[]
      }
      if (payload?.downloadTaskId !== downloadId || !payload.segments) {
        return
      }
      setPartials(toPartialSegmentViews(payload.segments))
    })
    return () => {
      ipcEvents.removeListener('transcript:updated', offUpdated as (...args: unknown[]) => void)
      ipcEvents.removeListener('transcript:partial', offPartial as (...args: unknown[]) => void)
    }
  }, [downloadId, navigate, refresh, upsert])

  useEffect(() => {
    if (!(snapshot?.listState && isInProgressTranscript(snapshot.listState))) {
      return
    }
    void ipcServices.transcript.getPartials(downloadId).then((rows) => {
      setPartials(toPartialSegmentViews(rows as PartialTranscriptRow[]))
    })
  }, [downloadId, snapshot?.listState])

  const committedSegments = snapshot?.record?.segments ?? EMPTY_SEGMENTS
  const selectedSourceKind =
    snapshot?.sources?.find((source) => source.selected)?.kind ?? snapshot?.sourceKind ?? null
  const viewingCaptions = selectedSourceKind === 'captions'
  const workspace = resolveTranscriptWorkspaceView({
    committed: committedSegments,
    hasRecord: Boolean(snapshot?.record),
    listState: snapshot?.listState ?? 'none',
    partials,
    rediarize: snapshot?.rediarize,
    viewingCaptions
  })
  const running = workspace.running
  const streamLive = workspace.streamLive
  const segments = workspace.segments
  const liveSpeakers = useMemo(() => speakersFromSegments(segments), [segments])
  const speakers =
    snapshot?.record?.speakers && snapshot.record.speakers.length > 0
      ? snapshot.record.speakers
      : liveSpeakers.length > 0
        ? liveSpeakers
        : EMPTY_SPEAKERS
  const speakerName = useCallback(
    (speakerId: string | null): string => {
      if (!speakerId) {
        return t('transcript.unknownSpeaker')
      }
      return (
        speakers.find((speaker) => speaker.id === speakerId || speaker.speakerKey === speakerId)
          ?.displayName ?? t('transcript.unknownSpeaker')
      )
    },
    [speakers, t]
  )
  const speakerColorIndex = useCallback(
    (speakerId: string | null): number | null => {
      if (!speakerId) {
        return null
      }
      return (
        speakers.find((speaker) => speaker.id === speakerId || speaker.speakerKey === speakerId)
          ?.sortIndex ?? null
      )
    },
    [speakers]
  )

  const mediaPath = snapshot?.sourceFilePath
    ? snapshot.sourceFilePath
    : download?.savedFileName && download.downloadPath
      ? `${download.downloadPath}/${download.savedFileName}`
      : null
  const isAudio =
    download?.type === 'audio' ||
    mediaKindFromName(mediaPath ?? '') === 'audio' ||
    mediaKindFromName(download?.savedFileName ?? '') === 'audio'
  const cachedThumbnail = useCachedThumbnail(download?.thumbnail)
  const currentTime = session?.downloadId === downloadId ? clock.currentTime : 0
  const duration = session?.downloadId === downloadId ? clock.duration : 0
  const durationMs = useMemo(
    () => resolveMediaDurationMs(duration * 1000, segments),
    [duration, segments]
  )
  const currentTimeMs = Math.round(currentTime * 1000)
  const currentSegment = useMemo(
    () => segmentAtTime(segments, currentTimeMs),
    [currentTimeMs, segments]
  )
  const title = download?.title ?? t('transcript.title')
  const subtitle = download?.channel ?? download?.uploader ?? null
  // Renderer CSP blocks remote covers (xyzcdn, etc.); only cached/local URLs are safe.
  const thumbnail = cachedThumbnail ?? null
  useEffect(() => {
    ensureSession({
      downloadId,
      filePath: mediaPath,
      isAudio,
      subtitle,
      thumbnail,
      title
    })
    return () => {
      releaseIdle(downloadId)
    }
  }, [downloadId, ensureSession, isAudio, mediaPath, releaseIdle, subtitle, thumbnail, title])

  const sessionInput = useMemo(
    () => ({
      downloadId,
      filePath: mediaPath,
      isAudio,
      subtitle,
      thumbnail,
      title
    }),
    [downloadId, isAudio, mediaPath, subtitle, thumbnail, title]
  )
  const ownsPlayer = session?.downloadId === downloadId
  const seek = useCallback(
    (seconds: number) => {
      if (ownsPlayer) {
        controls?.seek(seconds)
        return
      }
      takeSession({ ...sessionInput, seekTo: seconds })
    },
    [controls, ownsPlayer, sessionInput, takeSession]
  )

  const handlePlayThis = useCallback(() => {
    takeSession(sessionInput)
  }, [sessionInput, takeSession])

  const handleRetry = useCallback(async () => {
    try {
      const next = (await ipcServices.transcript.retry(downloadId)) as TranscriptSnapshotView
      setSnapshot(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('transcript.retryFailed'))
    }
  }, [downloadId, t])

  const handleForce = useCallback(async () => {
    try {
      const next = (await ipcServices.transcript.start({
        downloadId,
        force: true
      })) as TranscriptSnapshotView
      setSnapshot(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('transcript.retryFailed'))
    }
  }, [downloadId, t])

  const handleSelectSource = useCallback(
    async (key: string) => {
      try {
        const next = (await ipcServices.transcript.selectSource({
          downloadId,
          key
        })) as TranscriptSnapshotView
        setSnapshot(next)
        upsert(next)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('transcript.retryFailed'))
      }
    },
    [downloadId, t, upsert]
  )

  /**
   * Stop the in-flight local ASR run and return to captions when no AI transcript exists.
   */
  const handleCancel = useCallback(async () => {
    try {
      const next = (await ipcServices.transcript.cancel(downloadId)) as TranscriptSnapshotView
      setSnapshot(next)
      upsert(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('transcript.stopFailed'))
    }
  }, [downloadId, t, upsert])

  const handleBack = useCallback(() => {
    void navigate({ to: '/transcripts' })
  }, [navigate])

  const handleExport = useCallback(() => {
    setExportOpen(true)
  }, [])

  const noSpeech = snapshot?.listState === 'no-speech'
  const failed = snapshot?.listState === 'failed'
  const ready = workspace.ready
  const fromCaptions = viewingCaptions
  const sources = snapshot?.sources ?? []
  const sourceSwitch =
    sources.length > 1 ? (
      <TranscriptSourceSwitch onSelect={(key) => void handleSelectSource(key)} sources={sources} />
    ) : null

  const header = useMemo(
    () => (
      <TranscriptHeader
        backLabel={t('transcript.back')}
        canExport={Boolean(ready && segments.length > 0)}
        canForce={noSpeech}
        canUpgrade={Boolean(ready && segments.length > 0 && !fromCaptions && !running)}
        captionsCollapsed={captionsCollapsed}
        collapseLabel={t('transcript.collapsePanel')}
        expandLabel={t('transcript.expandPanel')}
        exportLabel={t('transcript.export.action')}
        failed={failed}
        onBack={handleBack}
        onExport={handleExport}
        onForce={() => void handleForce()}
        onRetry={() => void handleRetry()}
        onToggleCaptions={toggleCaptions}
        onUpgrade={() => setUpgradeOpen(true)}
        retryLabel={t('transcript.retry')}
        sourceKind={snapshot?.sourceKind}
        sourceLabel={
          fromCaptions
            ? t('transcript.sourceCaptions')
            : ready
              ? t('transcript.sourceAi')
              : undefined
        }
        sourceSwitch={sourceSwitch}
        stillTranscribeLabel={t('transcript.stillTranscribe')}
        title={title}
        upgradeLabel={t('transcript.qualityHint')}
      />
    ),
    [
      captionsCollapsed,
      failed,
      fromCaptions,
      handleBack,
      handleExport,
      handleForce,
      handleRetry,
      noSpeech,
      ready,
      running,
      segments.length,
      snapshot?.sourceKind,
      sourceSwitch,
      t,
      title,
      toggleCaptions
    ]
  )
  useTitleBar(header)
  const orientation = isWide ? 'horizontal' : 'vertical'
  const currentSpeakerId = currentSegment?.speakerId ?? null
  useEffect(() => {
    if (session?.downloadId !== downloadId) {
      return
    }
    setPresentation({
      currentSpeakerName: currentSpeakerId ? speakerName(currentSpeakerId) : null,
      currentSpeakerSortIndex: speakerColorIndex(currentSpeakerId)
    })
  }, [
    currentSpeakerId,
    downloadId,
    session?.downloadId,
    setPresentation,
    speakerColorIndex,
    speakerName
  ])

  const mediaPane = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div
        className={
          isAudio
            ? isWide
              ? 'min-h-0 w-full min-w-0 shrink-0'
              : 'min-h-0 min-w-0 flex-1'
            : 'min-h-0 w-full min-w-0 shrink overflow-hidden'
        }
      >
        {ownsPlayer || !session?.started ? (
          <TranscriptPlaybackSlot className="contents" slot="page" />
        ) : (
          <TranscriptPlaybackStandby
            isAudio={isAudio}
            onPlay={handlePlayThis}
            subtitle={subtitle}
            thumbnail={thumbnail}
            title={title}
          />
        )}
      </div>
      <TranscriptSpeakersPane
        canAdjustSpeakers={Boolean(ready && !isInProgressTranscript(snapshot?.listState ?? 'none'))}
        compact={!isWide}
        currentSpeakerId={currentSegment?.speakerId ?? null}
        currentTimeMs={currentTimeMs}
        durationMs={durationMs}
        info={{
          asrTier: snapshot?.asrTier ?? snapshot?.record?.asrTier,
          channel: download?.channel || download?.uploader || null,
          createdAt: snapshot?.record?.createdAt ?? snapshot?.updatedAt ?? null,
          durationMs: durationMs > 0 ? durationMs : (download?.duration ?? 0) * 1000,
          fileName: download?.savedFileName ?? fileNameFromPath(snapshot?.sourceFilePath),
          fileSize: download?.fileSize ?? null,
          language: snapshot?.record?.language ?? null,
          segmentCount: segments.length,
          sourceKind: snapshot?.sourceKind ?? null,
          speakerCount: speakers.length,
          url: download?.url ?? null
        }}
        onAdjustSpeakers={() => setSpeakerCountOpen(true)}
        onSeek={seek}
        resolveSpeaker={speakerName}
        segments={segments}
        speakers={speakers}
      />
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {chrome ? null : (
        <DragRegion className="flex h-12 items-center gap-2 border-border/60 border-b px-3">
          {header}
        </DragRegion>
      )}
      <TranscriptSplit
        captions={
          <TranscriptSidePanel
            collapsed={captionsCollapsed}
            currentSegmentId={currentSegment?.id ?? null}
            currentTimeMs={currentTimeMs}
            downloadId={downloadId}
            error={snapshot?.error ?? null}
            failed={failed}
            noSpeech={noSpeech}
            noSpeechDetail={t('transcript.noSpeechDetail')}
            onCancel={running ? () => void handleCancel() : undefined}
            onRetry={failed ? () => void handleRetry() : undefined}
            onSeek={seek}
            ready={Boolean(ready) || segments.length > 0}
            resolveColorIndex={speakerColorIndex}
            resolveSpeaker={speakerName}
            running={running}
            runningLabel={t(
              transcriptProgressLabelKey(
                snapshot?.listState,
                snapshot?.stage,
                modelPrep.ready,
                segments.length > 0
              )
            )}
            segments={segments}
            sourceCover={thumbnail}
            sourceDurationMs={durationMs}
            sourceTitle={download?.title ?? title}
            stage={
              snapshot?.listState === 'queued'
                ? 'queued'
                : snapshot?.listState === 'retry-scheduled'
                  ? 'retry-scheduled'
                  : snapshot?.stage
            }
            stageHistory={snapshot?.stageHistory ?? []}
            streamLive={streamLive}
            transcriptText={buildPromptTranscriptText(segments, speakerName)}
          />
        }
        captionsRef={captionsRef}
        key={orientation}
        media={mediaPane}
        onCaptionsResize={syncCaptionsCollapsed}
        orientation={orientation}
        resizeLabel={t('transcript.resizeHandle')}
      />
      <TranscriptExportDialog
        isAudio={isAudio}
        mediaPath={mediaPath}
        onOpenChange={setExportOpen}
        open={exportOpen}
        resolveSpeaker={speakerName}
        segments={committedSegments}
        title={title}
      />
      <AsrUpgradeDialog
        currentTier={snapshot?.asrTier}
        downloadId={downloadId}
        onOpenChange={setUpgradeOpen}
        onUpgraded={(next) => setSnapshot(next)}
        open={upgradeOpen}
      />
      <SpeakerCountDialog
        currentCount={snapshot?.speakerCount}
        downloadId={downloadId}
        onOpenChange={setSpeakerCountOpen}
        onUpdated={(next) => {
          setSnapshot(next)
          upsert(next)
        }}
        open={speakerCountOpen}
      />
    </div>
  )
}
