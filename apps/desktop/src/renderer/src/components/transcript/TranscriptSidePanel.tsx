import { AiPromptIcon } from '@renderer/components/settings/ai-prompt-icon'
import { TranscriptCaptionsPane } from '@renderer/components/transcript/TranscriptCaptionsPane'
import { TranscriptProgressThinking } from '@renderer/components/transcript/TranscriptProgressThinking'
import { TranscriptPromptPane } from '@renderer/components/transcript/TranscriptPromptPane'
import { ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import {
  startTypedViewTransition,
  TRANSCRIPT_VT_TAB
} from '@renderer/lib/transcript-view-transition'
import { cn } from '@renderer/lib/utils'
import type { TranscriptSegmentView, TranscriptSpeakerView } from '@renderer/store/transcripts'
import type { AiPrompt, AiSettingsSnapshot } from '@shared/ai-types'
import { AlignLeft, Check, ChevronDown } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface TranscriptSidePanelProps {
  collapsed: boolean
  currentSegmentId: string | null
  currentTimeMs: number
  downloadId: string
  /** Worker/task error text when local ASR failed. */
  error?: string | null
  /** Local ASR ended in a failed task state. */
  failed?: boolean
  noSpeech: boolean
  noSpeechDetail: string
  /** Stop an in-flight local ASR run. */
  onCancel?: () => void
  /** Retry a failed local ASR run. */
  onRetry?: () => void
  onSeek: (seconds: number) => void
  ready: boolean
  resolveColorIndex: (speakerId: string | null) => number | null
  resolveSpeaker: (speakerId: string | null) => string
  running: boolean
  runningLabel: string
  /** Live transcription pipeline stage from the worker. */
  stage?: string | null
  /** Persisted stage timings so the clock survives navigation and restarts. */
  stageHistory?: Array<{ stage: string; startedAt: number }>
  segments: TranscriptSegmentView[]
  /** Speakers used when relabeling a caption. */
  speakers?: TranscriptSpeakerView[]
  /** Cached local cover URL printed on the share card. */
  sourceCover?: string | null
  /** Media duration for the share-card progress bar. */
  sourceDurationMs?: number
  /** Media title printed on the share card header. */
  sourceTitle?: string
  /** Typewriter incoming ASR lines. Off when viewing a finished caption track. */
  streamLive?: boolean
  transcriptText: string
}

/**
 * Translate a built-in prompt title, falling back to the stored English title.
 *
 * @param prompt Prompt record.
 * @param t i18n function.
 */
const promptLabel = (prompt: AiPrompt, t: (key: string) => string): string =>
  prompt.isPreset ? t(`settings.ai.presetPrompts.${prompt.id}.title`) : prompt.title

const PROMPT_MENU_ITEM_CLASS =
  'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-200 hover:bg-accent hover:text-accent-foreground'

/**
 * One row in the overflow prompt menu.
 *
 * @param props.active Whether this row is the current tab.
 * @param props.icon Leading icon.
 * @param props.label Visible label.
 * @param props.onSelect Activate this tab.
 */
function PromptMenuItem({
  active,
  icon,
  label,
  onSelect
}: {
  active: boolean
  icon: ReactNode
  label: string
  onSelect: () => void
}) {
  return (
    <button className={PROMPT_MENU_ITEM_CLASS} onClick={onSelect} role="menuitem" type="button">
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? <Check className="size-3.5 shrink-0" /> : null}
    </button>
  )
}

/**
 * Transcript captions plus a tab for each enabled prompt.
 */
export function TranscriptSidePanel({
  collapsed,
  currentSegmentId,
  currentTimeMs,
  downloadId,
  error = null,
  failed = false,
  noSpeech,
  noSpeechDetail,
  onCancel,
  onRetry,
  onSeek,
  ready,
  resolveColorIndex,
  resolveSpeaker,
  running,
  runningLabel,
  stage = null,
  stageHistory = [],
  segments,
  speakers,
  sourceCover,
  sourceDurationMs,
  sourceTitle,
  streamLive = running,
  transcriptText
}: TranscriptSidePanelProps) {
  const { t } = useTranslation()
  const tabsRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [snapshot, setSnapshot] = useState<AiSettingsSnapshot | null>(null)
  const [tab, setTab] = useState('transcript')
  const [menuOpen, setMenuOpen] = useState(false)

  /**
   * Load enabled prompts and the active provider.
   */
  const refresh = useCallback(async (): Promise<void> => {
    try {
      setSnapshot(await ipcServices.ai.getSnapshot())
    } catch (error) {
      logger.error('Failed to load AI prompts for transcript', error)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * Switch tab, close the overflow menu, and keep the chip in view.
   *
   * @param id Transcript tab or prompt id.
   */
  const selectTab = useCallback(
    (id: string): void => {
      if (id === tab) {
        setMenuOpen(false)
        return
      }
      startTypedViewTransition(() => {
        setTab(id)
        setMenuOpen(false)
      }, [TRANSCRIPT_VT_TAB])
      requestAnimationFrame(() => {
        tabsRef.current
          ?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      })
    },
    [tab]
  )

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    /**
     * Close the menu on outside click or Escape.
     *
     * @param event Pointer or keyboard event.
     */
    const onDismiss = (event: MouseEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') {
          setMenuOpen(false)
        }
        return
      }
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDismiss)
    document.addEventListener('keydown', onDismiss)
    return () => {
      document.removeEventListener('mousedown', onDismiss)
      document.removeEventListener('keydown', onDismiss)
    }
  }, [menuOpen])

  if (collapsed) {
    return null
  }

  const prompts = (snapshot?.prompts ?? []).filter((prompt) => prompt.enabled)
  const activePrompt = prompts.find((prompt) => prompt.id === tab) ?? null
  const settingsReady = snapshot !== null
  const hasProvider = Boolean(snapshot?.activeProviderId)
  const activeProvider = snapshot?.providers.find(
    (provider) => provider.id === snapshot.activeProviderId
  )
  const providerLabel = activeProvider ? `${activeProvider.name} · ${activeProvider.modelId}` : null
  return (
    <div className="flex h-full min-h-0 flex-col border-border/60 border-t bg-background lg:border-t-0 lg:border-l">
      <div className="relative shrink-0 border-border/60 border-b">
        <div className="overflow-x-auto px-4 pr-11">
          <div className="flex min-w-max items-end gap-1" ref={tabsRef}>
            <button
              className={cn(
                'cursor-pointer whitespace-nowrap px-3 py-3 font-medium text-sm transition-colors duration-200',
                tab === 'transcript'
                  ? 'border-primary border-b-2 text-foreground'
                  : 'border-transparent border-b-2 text-muted-foreground hover:text-foreground'
              )}
              data-tab-id="transcript"
              onClick={() => selectTab('transcript')}
              type="button"
            >
              {t('transcript.title')}
            </button>
            {prompts.map((prompt) => (
              <button
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap px-3 py-3 font-medium text-sm transition-colors duration-200',
                  tab === prompt.id
                    ? 'border-primary border-b-2 text-foreground'
                    : 'border-transparent border-b-2 text-muted-foreground hover:text-foreground'
                )}
                data-tab-id={prompt.id}
                key={prompt.id}
                onClick={() => selectTab(prompt.id)}
                type="button"
              >
                <AiPromptIcon className="size-3.5" icon={prompt.icon} />
                {promptLabel(prompt, t)}
              </button>
            ))}
          </div>
        </div>
        {prompts.length > 0 ? (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-stretch bg-gradient-to-l from-40% from-background to-transparent pl-6"
            ref={menuRef}
          >
            <button
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={t('transcript.promptMenu')}
              className="pointer-events-auto inline-flex h-full w-9 cursor-pointer items-center justify-center text-muted-foreground transition-colors duration-200 hover:bg-muted/70 hover:text-foreground"
              data-testid="transcript-prompt-menu"
              onClick={() => setMenuOpen((open) => !open)}
              type="button"
            >
              <ChevronDown
                className={cn('size-4 transition-transform duration-200', menuOpen && 'rotate-180')}
              />
            </button>
            {menuOpen ? (
              <div
                className="pointer-events-auto absolute top-full right-1 z-20 mt-1 max-h-72 min-w-52 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                data-testid="transcript-prompt-menu-list"
                role="menu"
              >
                <PromptMenuItem
                  active={tab === 'transcript'}
                  icon={<AlignLeft className="size-3.5 shrink-0" />}
                  label={t('transcript.title')}
                  onSelect={() => selectTab('transcript')}
                />
                <div className="my-1 h-px bg-border" />
                {prompts.map((prompt) => (
                  <PromptMenuItem
                    active={tab === prompt.id}
                    icon={<AiPromptIcon className="size-3.5 shrink-0" icon={prompt.icon} />}
                    key={prompt.id}
                    label={promptLabel(prompt, t)}
                    onSelect={() => selectTab(prompt.id)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col" data-vt="transcript-tab">
        {activePrompt ? (
          <div className="flex h-full min-h-0 flex-col">
            {running ? (
              <div className="shrink-0">
                <TranscriptProgressThinking
                  downloadId={downloadId}
                  running={running}
                  runningLabel={runningLabel}
                  stage={stage}
                  stageHistory={stageHistory}
                />
              </div>
            ) : null}
            <div className="min-h-0 flex-1">
              <TranscriptPromptPane
                downloadId={downloadId}
                hasProvider={hasProvider}
                prompt={activePrompt}
                providerLabel={providerLabel}
                ready={ready}
                settingsReady={settingsReady}
                sourceCover={sourceCover}
                sourceTitle={sourceTitle}
                transcriptText={transcriptText}
              />
            </div>
          </div>
        ) : (
          <TranscriptCaptionsPane
            collapsed={false}
            currentSegmentId={currentSegmentId}
            currentTimeMs={currentTimeMs}
            downloadId={downloadId}
            embedded
            error={error}
            failed={failed}
            noSpeech={noSpeech}
            noSpeechDetail={noSpeechDetail}
            onCancel={onCancel}
            onRetry={onRetry}
            onSeek={onSeek}
            ready={ready}
            resolveColorIndex={resolveColorIndex}
            resolveSpeaker={resolveSpeaker}
            running={running}
            runningLabel={runningLabel}
            segments={segments}
            sourceCover={sourceCover}
            sourceDurationMs={sourceDurationMs}
            sourceTitle={sourceTitle}
            speakers={speakers}
            stage={stage}
            stageHistory={stageHistory}
            streamLive={streamLive}
          />
        )}
      </div>
    </div>
  )
}
