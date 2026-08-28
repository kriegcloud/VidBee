import {
  CookiesSetupPanel,
  isCookieHealthReady
} from '@renderer/components/settings/CookiesSetupPanel'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import { type CookieSetupRequest, cookieSetupRequestAtom } from '@renderer/store/cookie-setup'
import { addDownloadAtom, downloadsArrayAtom } from '@renderer/store/downloads'
import {
  type CookieHealth,
  type CookieSetupFailureKind,
  unconfiguredCookieHealth
} from '@vidbee/downloader-core/cookie-setup'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

/**
 * Dialog copy for a classified cookie-setup failure.
 *
 * @param kind Failure kind from yt-dlp output.
 * @param t i18n function.
 */
const failureDescription = (
  kind: CookieSetupFailureKind,
  t: (key: string, options?: Record<string, string>) => string
): string => {
  switch (kind) {
    case 'macos-files-permission':
      return t('download.cookiesSetupMacFiles')
    case 'browser-locked':
      return t('download.cookiesSetupLocked')
    case 'browser-decrypt':
      return t('download.cookiesSetupDecrypt')
    case 'file-invalid':
      return t('download.cookiesSetupFileInvalid')
    case 'linux-keyring':
      return t('download.cookiesSetupKeyring')
    case 'stale':
      return t('download.cookiesSetupStale')
    default:
      return t('download.cookiesSetupNeeded')
  }
}

/**
 * Global cookies setup dialog opened from failed downloads.
 */
export function CookiesSetupDialog() {
  const { t } = useTranslation()
  const [request, setRequest] = useAtom(cookieSetupRequestAtom)
  const downloads = useAtomValue(downloadsArrayAtom)
  const addDownload = useSetAtom(addDownloadAtom)
  const [health, setHealth] = useState<CookieHealth | null>(null)
  const [retrying, setRetrying] = useState(false)
  const open = request !== null
  const canRetry =
    Boolean(request?.downloadId) && isCookieHealthReady(health ?? unconfiguredCookieHealth())

  /**
   * Close the dialog and drop the pending retry request.
   */
  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setRequest(null)
      setHealth(null)
    }
  }

  /**
   * Retry the download that triggered the wizard.
   *
   * @param current Request that opened the dialog.
   */
  const handleRetry = async (current: CookieSetupRequest): Promise<void> => {
    if (!current.downloadId) {
      setRequest(null)
      return
    }
    const download = downloads.find((item) => item.id === current.downloadId)
    if (!download?.url) {
      toast.error(t('errors.emptyUrl'))
      return
    }
    setRetrying(true)
    try {
      const retried = await ipcServices.download.retryDownload(download.id)
      if (!retried) {
        toast.info(t('notifications.downloadAlreadyQueued'))
        return
      }
      addDownload({
        ...download,
        error: undefined,
        progress: { percent: 0 },
        status: 'pending'
      })
      setRequest(null)
    } catch (error) {
      logger.error('[CookiesSetupDialog] Failed to retry download:', error)
      toast.error(t('notifications.downloadFailed'))
    } finally {
      setRetrying(false)
    }
  }

  /**
   * Open macOS Privacy → Files & Folders for browser cookie access.
   */
  const handleOpenFilesSettings = async (): Promise<void> => {
    try {
      const opened = await ipcServices.fs.openMacFilesAndFoldersSettings()
      if (!opened) {
        toast.error(t('settings.openLinkError'))
      }
    } catch (error) {
      logger.error('[CookiesSetupDialog] Failed to open Files & Folders settings:', error)
      toast.error(t('settings.openLinkError'))
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('download.cookiesSetupDialogTitle')}</DialogTitle>
          <DialogDescription>
            {request ? failureDescription(request.failureKind, t) : null}
          </DialogDescription>
        </DialogHeader>
        <CookiesSetupPanel onHealthChange={setHealth} />
        <DialogFooter>
          {request?.failureKind === 'macos-files-permission' ? (
            <Button onClick={() => void handleOpenFilesSettings()} variant="outline">
              {t('download.cookiesSetupOpenFilesSettings')}
            </Button>
          ) : null}
          <Button onClick={() => handleOpenChange(false)} variant="secondary">
            {t('download.cookiesSetupDone')}
          </Button>
          {request?.downloadId ? (
            <Button disabled={!canRetry || retrying} onClick={() => void handleRetry(request)}>
              {t('download.cookiesSetupRetry')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
