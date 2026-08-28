import { TranscriptPromptThinking } from '@renderer/components/transcript/TranscriptPromptThinking'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Response } from '@renderer/components/ui/response'
import { Textarea } from '@renderer/components/ui/textarea'
import { usePromptRun } from '@renderer/hooks/use-prompt-run'
import { cn } from '@renderer/lib/utils'
import { AI_PROMPT_SAMPLE_TRANSCRIPT, resolveAiPromptContent } from '@shared/ai-prompts'
import { isThinkingSameAsAnswer } from '@shared/ai-thinking'
import type { AiPrompt, AiPromptIconId, AiPromptWriteInput } from '@shared/ai-types'
import { Square } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AI_PROMPT_ICON_IDS, AiPromptIcon } from './ai-prompt-icon'

const SETTINGS_TEST_DOWNLOAD_ID = '__settings-prompt-test__'

interface AiPromptDialogProps {
  onDelete?: () => Promise<void>
  onOpenChange: (open: boolean) => void
  onSave: (input: AiPromptWriteInput) => Promise<void>
  open: boolean
  prompt?: AiPrompt | null
  saving?: boolean
}

/**
 * Dialog for creating or editing a transcript prompt, including a sample run.
 */
export function AiPromptDialog({
  onDelete,
  onOpenChange,
  onSave,
  open,
  prompt,
  saving = false
}: AiPromptDialogProps) {
  const { i18n, t } = useTranslation()
  const titleId = useId()
  const bodyId = useId()
  const sampleId = useId()
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState<AiPromptIconId>('sparkles')
  const [content, setContent] = useState('')
  const [sample, setSample] = useState(AI_PROMPT_SAMPLE_TRANSCRIPT)
  const testPromptId = prompt?.id ?? null
  const { run, start, stop } = usePromptRun(SETTINGS_TEST_DOWNLOAD_ID, open ? testPromptId : null)
  const running = run.status === 'running'
  const thinking = run.thinking?.trim() ?? ''
  const showThinking =
    running || (thinking.length > 0 && !isThinkingSameAsAnswer(thinking, run.text))
  useEffect(() => {
    if (!open) {
      return
    }
    setTitle(prompt?.title ?? '')
    setIcon(prompt?.icon ?? 'sparkles')
    setContent(prompt ? resolveAiPromptContent(prompt.content, i18n.language) : '')
    setSample(AI_PROMPT_SAMPLE_TRANSCRIPT)
  }, [i18n.language, open, prompt])

  const canSave = title.trim().length > 0 && content.trim().length > 0

  /**
   * Persist the prompt before a sample run so the main process has the latest text.
   */
  const persist = async (): Promise<AiPromptWriteInput> => {
    const input: AiPromptWriteInput = {
      id: prompt?.id,
      title: title.trim(),
      icon,
      content: content.trim(),
      enabled: prompt?.enabled
    }
    await onSave(input)
    return input
  }

  /**
   * Save without closing when the user only wanted to run a sample.
   */
  const handleSave = async (close: boolean): Promise<void> => {
    if (!canSave || saving) {
      return
    }
    await persist()
    if (close) {
      onOpenChange(false)
    }
  }

  /**
   * Save the current prompt, then stream a sample through the enabled provider.
   */
  const handleTest = async (): Promise<void> => {
    if (running) {
      await stop()
      return
    }
    await handleSave(false)
    if (prompt?.id) {
      await start(sample)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {prompt ? t('settings.ai.editPrompt') : t('settings.ai.addPrompt')}
          </DialogTitle>
          <DialogDescription>{t('settings.ai.promptDialogDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>{t('settings.ai.promptIcon')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {AI_PROMPT_ICON_IDS.map((id) => (
                <button
                  aria-label={id}
                  className={cn(
                    'inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border transition-colors duration-200',
                    icon === id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-transparent bg-muted text-muted-foreground hover:text-foreground'
                  )}
                  key={id}
                  onClick={() => setIcon(id)}
                  type="button"
                >
                  <AiPromptIcon icon={id} />
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={titleId}>{t('settings.ai.promptTitle')}</Label>
            <Input
              id={titleId}
              onChange={(event) => setTitle(event.currentTarget.value)}
              value={title}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={bodyId}>{t('settings.ai.promptBody')}</Label>
            <Textarea
              className="min-h-32"
              id={bodyId}
              onChange={(event) => setContent(event.currentTarget.value)}
              value={content}
            />
          </div>
          {prompt ? (
            <div className="grid gap-2 rounded-xl border bg-muted/30 p-4">
              <Label htmlFor={sampleId}>{t('settings.ai.testTitle')}</Label>
              <Input
                id={sampleId}
                onChange={(event) => setSample(event.currentTarget.value)}
                value={sample}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{t('settings.ai.testOutput')}</p>
                <Button onClick={() => void handleTest()} size="sm" type="button" variant="outline">
                  {running ? <Square /> : null}
                  {running ? t('settings.ai.testStop') : t('settings.ai.testRun')}
                </Button>
              </div>
              <div className="min-h-32 rounded-lg border bg-background p-3 text-sm">
                {showThinking || run.text ? (
                  <div className="flex flex-col gap-3">
                    {showThinking ? (
                      <TranscriptPromptThinking
                        running={running}
                        thinking={thinking}
                        thinkingMs={run.thinkingMs}
                      />
                    ) : null}
                    {run.text ? <Response isAnimating={running}>{run.text}</Response> : null}
                  </div>
                ) : (
                  <p className="text-muted-foreground">{t('settings.ai.testPlaceholder')}</p>
                )}
                {run.error ? <p className="mt-2 text-destructive text-sm">{run.error}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {prompt && onDelete ? (
            <Button
              className="text-destructive"
              onClick={() => void onDelete()}
              type="button"
              variant="ghost"
            >
              {t('settings.ai.deletePrompt')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              {t('settings.ai.cancel')}
            </Button>
            <Button
              disabled={!canSave || saving}
              onClick={() => void handleSave(true)}
              type="button"
            >
              {t('settings.ai.save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
