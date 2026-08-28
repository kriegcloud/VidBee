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
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle
} from '@renderer/components/ui/item'
import { ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import { transcriptMapAtom } from '@renderer/store/transcripts'
import {
  pickWhatsNewTranscriptId,
  WHATS_NEW_FEATURE_IDS,
  type WhatsNewFeatureId
} from '@shared/whats-new'
import { useNavigate } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { AudioLines, FileAudio, Sparkles, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const FEATURE_ICONS: Record<WhatsNewFeatureId, typeof AudioLines> = {
  localFiles: FileAudio,
  speakers: Users,
  summary: Sparkles,
  transcript: AudioLines
}

/**
 * Present the current What's New feature list.
 */
export function WhatsNewDialog({
  onOpenChange,
  onTry,
  open
}: {
  onOpenChange: (open: boolean) => void
  onTry: () => void
  open: boolean
}) {
  const { t } = useTranslation()
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('whatsNew.title')}</DialogTitle>
          <DialogDescription>{t('whatsNew.description')}</DialogDescription>
        </DialogHeader>
        <ItemGroup className="gap-2 overflow-visible rounded-none">
          {WHATS_NEW_FEATURE_IDS.map((id) => {
            const Icon = FEATURE_ICONS[id]
            return (
              <Item key={id} rounded="both" size="sm" variant="muted">
                <ItemMedia className="border-border bg-background" variant="icon">
                  <Icon aria-hidden />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t(`whatsNew.features.${id}.title`)}</ItemTitle>
                  <ItemDescription className="line-clamp-none">
                    {t(`whatsNew.features.${id}.description`)}
                  </ItemDescription>
                </ItemContent>
              </Item>
            )
          })}
        </ItemGroup>
        <DialogFooter className="sm:flex-col sm:justify-stretch">
          <Button className="w-full" onClick={onTry}>
            {t('whatsNew.tryIt')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Ask the main process whether this returning user should see What's New.
 */
export function WhatsNewHost() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const transcriptMap = useAtomValue(transcriptMapAtom)
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const shouldShow = await ipcServices.settings.shouldPromptWhatsNew()
        if (!cancelled && shouldShow) {
          setOpen(true)
        }
      } catch (error) {
        logger.error('Failed to check Whats New prompt', error)
      }
    }

    void check()
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Close the card and remember that this release has been seen.
   */
  const dismiss = () => {
    setOpen(false)
    void ipcServices.settings.markWhatsNewSeen().catch((error: unknown) => {
      logger.error('Failed to mark Whats New as seen', error)
    })
  }

  /**
   * Dismiss What's New, then open a finished or in-progress transcript.
   */
  const handleTry = () => {
    dismiss()
    const downloadId = pickWhatsNewTranscriptId(Object.values(transcriptMap))
    if (downloadId) {
      void navigate({
        params: { downloadId },
        to: '/downloads/$downloadId/transcript'
      })
      return
    }
    void navigate({ to: '/transcripts' })
  }

  /**
   * Close without navigating when the user dismisses the card.
   */
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setOpen(true)
      return
    }
    dismiss()
  }

  return <WhatsNewDialog onOpenChange={handleOpenChange} onTry={handleTry} open={open} />
}
