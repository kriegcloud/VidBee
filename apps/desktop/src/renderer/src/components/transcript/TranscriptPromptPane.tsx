import { TranscriptPromptGuidance } from '@renderer/components/transcript/TranscriptPromptGuidance'
import { TranscriptPromptShareCard } from '@renderer/components/transcript/TranscriptPromptShareCard'
import { TranscriptPromptThinking } from '@renderer/components/transcript/TranscriptPromptThinking'
import { TranscriptShareImageDialog } from '@renderer/components/transcript/TranscriptShareImageDialog'
import { Bubble, BubbleContent } from '@renderer/components/ui/bubble'
import { Button } from '@renderer/components/ui/button'
import { Message, MessageContent } from '@renderer/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from '@renderer/components/ui/message-scroller'
import { Response } from '@renderer/components/ui/response'
import { usePromptRun } from '@renderer/hooks/use-prompt-run'
import { shareImageFileName } from '@renderer/lib/capture-prompt-share'
import { isThinkingSameAsAnswer } from '@shared/ai-thinking'
import type { AiPrompt } from '@shared/ai-types'
import { ArrowDown, Copy, Loader2, RotateCw, Share2, Square } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

interface TranscriptPromptPaneProps {
  downloadId: string
  hasProvider: boolean
  prompt: AiPrompt
  providerLabel?: string | null
  ready: boolean
  settingsReady: boolean
  /** Cached local cover URL printed on the share card. */
  sourceCover?: string | null
  /** Media title printed on the share card header. */
  sourceTitle?: string | null
  transcriptText: string
}

/**
 * Wrap one transcript row: status text, streamed markdown, or guidance.
 *
 * @param children Row body.
 * @param messageId Stable id for scroll tracking.
 * @param scrollAnchor Whether this row starts a new turn.
 */
function PromptOutputItem({
  children,
  messageId,
  scrollAnchor = false
}: {
  children: ReactNode
  messageId: string
  scrollAnchor?: boolean
}) {
  return (
    <MessageScrollerItem messageId={messageId} scrollAnchor={scrollAnchor}>
      {children}
    </MessageScrollerItem>
  )
}

/**
 * Stream a prompt result in a chat scroller. The run lives in the main
 * process so leaving this page does not abort it.
 */
export function TranscriptPromptPane({
  downloadId,
  hasProvider,
  prompt,
  providerLabel,
  ready,
  settingsReady,
  sourceCover,
  sourceTitle,
  transcriptText
}: TranscriptPromptPaneProps) {
  const { t } = useTranslation()
  const { hydrated, run, start, stop } = usePromptRun(downloadId, prompt.id)
  const autoStarted = useRef(false)
  const autoStartKey = useRef(`${downloadId}:${prompt.id}`)
  const [shareOpen, setShareOpen] = useState(false)
  const running = run.status === 'running'
  const promptTitle = prompt.isPreset
    ? t(`settings.ai.presetPrompts.${prompt.id}.title`)
    : prompt.title
  const nextAutoStartKey = `${downloadId}:${prompt.id}`
  if (autoStartKey.current !== nextAutoStartKey) {
    autoStartKey.current = nextAutoStartKey
    autoStarted.current = false
  }

  useEffect(() => {
    if (
      autoStarted.current ||
      !settingsReady ||
      !hydrated ||
      !hasProvider ||
      !ready ||
      !transcriptText.trim()
    ) {
      return
    }
    if (run.status !== 'idle') {
      return
    }
    autoStarted.current = true
    void start(transcriptText)
  }, [hasProvider, hydrated, ready, run.status, settingsReady, start, transcriptText])

  /**
   * Copy the current Markdown result.
   */
  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(run.text)
      toast.success(t('transcript.promptCopied'))
    } catch {
      toast.error(t('transcript.copyFailed'))
    }
  }

  /**
   * Open the share-image preview dialog for the current prompt result.
   */
  const handleShare = (): void => {
    if (!(run.text.trim() && !running)) {
      return
    }
    setShareOpen(true)
  }

  if (!settingsReady) {
    return (
      <p className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
        <Loader2 className="size-3.5 animate-spin" />
        {t('transcript.promptLoading')}
      </p>
    )
  }

  if (!hasProvider) {
    return (
      <div className="p-4">
        <TranscriptPromptGuidance errorCode="no-provider" providerLabel={providerLabel} />
      </div>
    )
  }

  const hasPromptOutput = Boolean(run.text.trim()) || run.status === 'running'
  if (!((ready && transcriptText.trim()) || hasPromptOutput)) {
    return (
      <div className="p-4">
        <TranscriptPromptGuidance errorCode="empty-transcript" />
      </div>
    )
  }

  const thinking = run.thinking?.trim() ?? ''
  const showThinking =
    running || (thinking.length > 0 && !isThinkingSameAsAnswer(thinking, run.text))
  const showGuidance = run.status === 'error' || (run.status === 'completed' && !run.text.trim())
  const guidanceCode = run.errorCode ?? (showGuidance ? 'empty-output' : null)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-border/60 border-b px-4 py-2">
        {running ? (
          <Button onClick={() => void stop()} size="sm" type="button" variant="outline">
            <Square />
            {t('transcript.promptStop')}
          </Button>
        ) : (
          <Button
            disabled={!transcriptText.trim()}
            onClick={() => void start(transcriptText)}
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCw />
            {t('transcript.promptRerun')}
          </Button>
        )}
        <Button
          disabled={!run.text}
          onClick={() => void handleCopy()}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Copy />
          {t('transcript.promptCopy')}
        </Button>
        <Button
          disabled={!run.text.trim() || running}
          onClick={handleShare}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Share2 />
          {t('transcript.promptShare')}
        </Button>
      </div>
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport aria-label={t('transcript.promptOutput')}>
            <MessageScrollerContent className="gap-4 p-5 text-sm leading-relaxed">
              {showThinking ? (
                <PromptOutputItem messageId="thinking" scrollAnchor={!run.text}>
                  <TranscriptPromptThinking
                    running={running}
                    thinking={thinking}
                    thinkingMs={run.thinkingMs}
                  />
                </PromptOutputItem>
              ) : null}
              {run.text ? (
                <PromptOutputItem messageId="result" scrollAnchor>
                  <Message>
                    <MessageContent>
                      <Bubble className="max-w-full" variant="ghost">
                        <BubbleContent className="w-full max-w-none">
                          <Response className="transcript-prompt-markdown" isAnimating={running}>
                            {run.text}
                          </Response>
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </PromptOutputItem>
              ) : null}
              {!(running || run.text) && run.status === 'idle' ? (
                <PromptOutputItem messageId="empty">
                  <p className="text-muted-foreground">{t('transcript.promptEmpty')}</p>
                </PromptOutputItem>
              ) : null}
              {run.status === 'aborted' && !run.text ? (
                <PromptOutputItem messageId="aborted">
                  <p className="text-muted-foreground">{t('transcript.promptAborted')}</p>
                </PromptOutputItem>
              ) : null}
              {showGuidance && guidanceCode ? (
                <PromptOutputItem messageId="guidance">
                  <TranscriptPromptGuidance
                    error={run.error}
                    errorCode={guidanceCode}
                    onRetry={() => void start(transcriptText)}
                    providerLabel={providerLabel}
                  />
                </PromptOutputItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton>
            <ArrowDown />
            <span className="sr-only">{t('transcript.promptScrollToEnd')}</span>
          </MessageScrollerButton>
        </MessageScroller>
      </MessageScrollerProvider>
      <TranscriptShareImageDialog
        fileName={shareImageFileName(sourceTitle)}
        onOpenChange={setShareOpen}
        open={shareOpen}
      >
        {(cardRef) =>
          run.text ? (
            <TranscriptPromptShareCard
              cardRef={cardRef}
              coverSrc={sourceCover}
              markdown={run.text}
              promptTitle={promptTitle}
              sourceTitle={sourceTitle}
              tagline={t('transcript.promptShareTagline')}
            />
          ) : null
        }
      </TranscriptShareImageDialog>
    </div>
  )
}
