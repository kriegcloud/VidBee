import { SHARE_CARD_WIDTH } from '@renderer/components/transcript/TranscriptShareCardChrome'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@renderer/components/ui/dialog'
import {
  captureShareImageBlob,
  copyShareImageBlob,
  waitForShareCard
} from '@renderer/lib/capture-prompt-share'
import { ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import { cn } from '@renderer/lib/utils'
import { Copy, Download, Loader2, Share2 } from 'lucide-react'
import { type ReactNode, type Ref, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

type ShareAction = 'copy' | 'download' | 'share'

const MAC_SHARE_UA = /Mac|darwin/i
/** Standalone pill chrome for each share-dialog action. */
const shareActionClassName =
  'h-10 w-full min-w-0 rounded-full border-border/70 bg-background/95 px-5 shadow-lg backdrop-blur-md'

interface TranscriptShareImageDialogProps {
  children: (cardRef: Ref<HTMLDivElement>) => ReactNode
  fileName: string
  onOpenChange: (open: boolean) => void
  open: boolean
}

/**
 * Preview a branded share card and copy, download, or share the PNG.
 *
 * Frameless overlay: the poster floats on the backdrop, with separate
 * action buttons centered underneath.
 *
 * @param props.children Render the capture target with the dialog's card ref.
 * @param props.fileName Suggested PNG name for download and the macOS share sheet.
 * @param props.onOpenChange Dialog open-state callback.
 * @param props.open Whether the preview is visible.
 */
export function TranscriptShareImageDialog({
  children,
  fileName,
  onOpenChange,
  open
}: TranscriptShareImageDialogProps) {
  const { t } = useTranslation()
  const cardRef = useRef<HTMLDivElement>(null)
  const blobRef = useRef<Blob | null>(null)
  const [busy, setBusy] = useState<ShareAction | null>(null)
  const [platform, setPlatform] = useState(() =>
    MAC_SHARE_UA.test(navigator.userAgent) ? 'darwin' : ''
  )
  const canNativeShare = platform === 'darwin'
  useEffect(() => {
    if (!open) {
      blobRef.current = null
      setBusy(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    void ipcServices.app
      .getPlatform()
      .then((value) => {
        if (!cancelled) {
          setPlatform(value)
        }
      })
      .catch((error) => {
        logger.warn(
          `Failed to read platform for share dialog: ${error instanceof Error ? error.message : String(error)}`
        )
      })
    return () => {
      cancelled = true
    }
  }, [open])

  /**
   * Rasterize the visible card once and reuse the PNG for later actions.
   */
  const getShareBlob = async (): Promise<Blob> => {
    if (blobRef.current) {
      return blobRef.current
    }
    const node = cardRef.current
    if (!node) {
      throw new Error('Share card is not mounted')
    }
    await waitForShareCard(node)
    const blob = await captureShareImageBlob(node)
    blobRef.current = blob
    return blob
  }

  /**
   * Run a share action while locking the footer buttons.
   *
   * @param action Which footer button is in progress.
   * @param run Action body.
   */
  const runAction = async (action: ShareAction, run: () => Promise<void>): Promise<void> => {
    if (busy) {
      return
    }
    setBusy(action)
    try {
      await run()
    } finally {
      setBusy(null)
    }
  }

  /**
   * Copy the PNG to the clipboard.
   */
  const handleCopy = (): void => {
    void runAction('copy', async () => {
      try {
        await copyShareImageBlob(await getShareBlob())
        toast.success(t('transcript.promptShared'))
      } catch (error) {
        logger.warn(
          `Failed to copy share image: ${error instanceof Error ? error.message : String(error)}`
        )
        toast.error(t('transcript.promptShareFailed'))
      }
    })
  }

  /**
   * Save the PNG through the native save dialog.
   */
  const handleDownload = (): void => {
    void runAction('download', async () => {
      try {
        const blob = await getShareBlob()
        const saved = await ipcServices.fs.saveBinaryFile({
          data: await blob.arrayBuffer(),
          defaultFileName: fileName
        })
        if (saved) {
          toast.success(t('transcript.promptShareSaved'))
        }
      } catch (error) {
        logger.warn(
          `Failed to save share image: ${error instanceof Error ? error.message : String(error)}`
        )
        toast.error(t('transcript.promptShareSaveFailed'))
      }
    })
  }

  /**
   * Open the macOS share sheet with the PNG.
   */
  const handleNativeShare = (): void => {
    void runAction('share', async () => {
      try {
        const blob = await getShareBlob()
        const shared = await ipcServices.fs.shareFile({
          data: await blob.arrayBuffer(),
          fileName
        })
        if (!shared) {
          toast.error(t('transcript.promptShareNativeFailed'))
        }
      } catch (error) {
        logger.warn(
          `Failed to open share sheet: ${error instanceof Error ? error.message : String(error)}`
        )
        toast.error(t('transcript.promptShareNativeFailed'))
      }
    })
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[90vh] w-auto max-w-none flex-col items-center gap-5 border-0 bg-transparent p-0 shadow-none outline-none sm:max-w-none"
        data-testid="transcript-share-image-dialog"
        showCloseButton={false}
        style={{ width: `min(${SHARE_CARD_WIDTH}px, calc(100% - 2rem))` }}
      >
        <DialogTitle className="sr-only">{t('transcript.promptShareTitle')}</DialogTitle>
        <div
          className="min-h-0 w-full overflow-auto rounded-md shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          data-testid="transcript-share-image-preview"
        >
          {children(cardRef)}
        </div>
        <div
          className={cn(
            'grid w-full shrink-0 gap-2',
            canNativeShare ? 'grid-cols-3' : 'grid-cols-2'
          )}
          data-testid="transcript-share-image-actions"
        >
          <Button
            className={shareActionClassName}
            data-testid="transcript-share-image-copy"
            disabled={Boolean(busy)}
            onClick={handleCopy}
            type="button"
            variant="outline"
          >
            {busy === 'copy' ? <Loader2 className="animate-spin" /> : <Copy />}
            {t('transcript.promptCopy')}
          </Button>
          <Button
            className={shareActionClassName}
            data-testid="transcript-share-image-download"
            disabled={Boolean(busy)}
            onClick={handleDownload}
            type="button"
            variant="outline"
          >
            {busy === 'download' ? <Loader2 className="animate-spin" /> : <Download />}
            {t('transcript.promptShareDownload')}
          </Button>
          {canNativeShare ? (
            <Button
              className={shareActionClassName}
              data-testid="transcript-share-image-native"
              disabled={Boolean(busy)}
              onClick={handleNativeShare}
              type="button"
              variant="outline"
            >
              {busy === 'share' ? <Loader2 className="animate-spin" /> : <Share2 />}
              {t('transcript.promptShareNative')}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
