import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import type { TranscriptSnapshotView } from '@renderer/store/transcripts'
import {
  DEFAULT_SPEAKER_COUNT,
  parseSpeakerCount,
  SPEAKER_COUNT_CHOICES,
  type SpeakerCount
} from '@vidbee/transcription/asr'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

/**
 * Pin a speaker count and re-label the existing transcript, captions or ASR.
 */
export function SpeakerCountDialog({
  currentCount,
  downloadId,
  onOpenChange,
  onUpdated,
  open
}: {
  currentCount: SpeakerCount | null | undefined
  downloadId: string
  onOpenChange: (open: boolean) => void
  onUpdated: (snapshot: TranscriptSnapshotView) => void
  open: boolean
}) {
  const { t } = useTranslation()
  const initial = parseSpeakerCount(currentCount, DEFAULT_SPEAKER_COUNT)
  const [selected, setSelected] = useState<SpeakerCount>(initial)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setSelected(parseSpeakerCount(currentCount, DEFAULT_SPEAKER_COUNT))
    }
  }, [currentCount, open])

  /**
   * Queue a speaker re-label with the chosen count. Caption or ASR text is kept.
   */
  const handleApply = async () => {
    setBusy(true)
    try {
      const next = await ipcServices.transcript.rediarize({
        downloadId,
        speakerCount: selected
      })
      onUpdated(next as TranscriptSnapshotView)
      onOpenChange(false)
    } catch (error) {
      logger.error('Failed to rediarize transcript', error)
      toast.error(error instanceof Error ? error.message : t('transcript.retryFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          setSelected(initial)
        }
        onOpenChange(next)
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('transcript.speakerCount.adjust')}</DialogTitle>
          <DialogDescription>{t('transcript.speakerCount.detail')}</DialogDescription>
        </DialogHeader>
        <Select
          disabled={busy}
          onValueChange={(value) => setSelected(parseSpeakerCount(value))}
          value={String(selected)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPEAKER_COUNT_CHOICES.map((choice) => (
              <SelectItem key={String(choice)} value={String(choice)}>
                {choice === 'auto'
                  ? t('transcript.speakerCount.auto')
                  : choice === 1
                    ? t('transcript.speakerCount.one')
                    : t('transcript.speakerCount.count', { count: choice })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            {t('transcript.export.close')}
          </Button>
          <Button disabled={busy} onClick={() => void handleApply()}>
            {t('transcript.speakerCount.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
