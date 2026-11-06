import { useAppInfo } from '@renderer/components/feedback/FeedbackLinks'
import { DownloadEngineRow } from '@renderer/components/kernel/DownloadEngineRow'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { ItemSeparator } from '@renderer/components/ui/item'
import { Progress } from '@renderer/components/ui/progress'
import { Switch } from '@renderer/components/ui/switch'
import { FeedbackLinkButtons } from '@vidbee/ui/components/ui/feedback-link-buttons'
import { OTHER_PRODUCTS } from '@vidbee/ui/components/ui/other-product-card'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ExternalLink, Facebook, Github, Link as LinkIcon, RefreshCw, Twitter } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ipcEvents, ipcServices } from '../lib/ipc'
import { logger } from '../lib/logger'
import { buildLocalizedVidBeeUrl, withDesktopCampaignUtm, withDesktopUtm } from '../lib/url'
import { updateAvailableAtom, updateReadyAtom } from '../store/update'
import { ytdlpKernelStatusAtom } from '../store/ytdlp-kernel'

const SUPPORT_EMAIL = 'team@vidbee.org'

type LatestVersionState =
  | { status: 'available'; version: string }
  | { status: 'uptodate'; version: string }
  | { status: 'error'; error?: string }
  | null

/** Display application information and updates for the current distribution. */
export function About() {
  const { t, i18n } = useTranslation()
  const [updateReady] = useAtom(updateReadyAtom)
  const [updateAvailableState] = useAtom(updateAvailableAtom)
  const setUpdateAvailable = useSetAtom(updateAvailableAtom)
  const kernelStatus = useAtomValue(ytdlpKernelStatusAtom)
  const appInfo = useAppInfo()
  const { appVersion } = appInfo
  const appVersionLabel = appVersion || '—'
  const [latestVersionState, setLatestVersionState] = useState<LatestVersionState>(null)
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState<number | null>(null)
  const [isStoreManaged, setIsStoreManaged] = useState<boolean | null>(null)
  const websiteUrl = buildLocalizedVidBeeUrl('/', i18n.language)
  const downloadUrl = buildLocalizedVidBeeUrl('/download/', i18n.language)
  const changelogUrl = buildLocalizedVidBeeUrl('/changelog/', i18n.language)
  const shareTargetUrl = websiteUrl

  useEffect(() => {
    let isActive = true

    /** Resolve the update owner before exposing application update actions. */
    const loadUpdateOwner = async () => {
      try {
        const storeManaged = await ipcServices.update.isStoreManaged()
        if (isActive) {
          setIsStoreManaged(storeManaged)
        }
      } catch (error) {
        logger.error('Failed to determine application update owner:', error)
      }
    }

    void loadUpdateOwner()
    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (!updateAvailableState.available) {
      return
    }

    setLatestVersionState({
      status: 'available',
      version: updateAvailableState.version ?? ''
    })
  }, [updateAvailableState.available, updateAvailableState.version])

  // Listen for update events only in About page
  useEffect(() => {
    if (!window?.api) {
      return
    }

    const handleUpdateAvailable = (rawInfo: unknown) => {
      const info = (rawInfo ?? {}) as { version?: string }
      const versionLabel = info.version ?? ''

      // Update will be downloaded automatically because autoDownload is enabled in main process
      toast.success(i18n.t('about.notifications.updateAvailable', { version: versionLabel }))
      setLatestVersionState({
        status: 'available',
        version: versionLabel
      })
      setUpdateAvailable({
        available: true,
        version: versionLabel
      })
      // Reset download progress when new update is available
      setUpdateDownloadProgress(0)
    }

    const handleUpdateDownloadProgress = (rawProgress: unknown) => {
      const progress = (rawProgress ?? {}) as { percent?: number }
      if (typeof progress?.percent === 'number') {
        setUpdateDownloadProgress(progress.percent)
      }
    }

    const handleUpdateDownloaded = () => {
      // Clear progress when download is complete
      setUpdateDownloadProgress(null)
    }

    ipcEvents.on('update:available', handleUpdateAvailable)
    ipcEvents.on('update:download-progress', handleUpdateDownloadProgress)
    ipcEvents.on('update:downloaded', handleUpdateDownloaded)

    return () => {
      ipcEvents.removeListener('update:available', handleUpdateAvailable)
      ipcEvents.removeListener('update:download-progress', handleUpdateDownloadProgress)
      ipcEvents.removeListener('update:downloaded', handleUpdateDownloaded)
    }
  }, [i18n, setUpdateAvailable])

  const handleGoToDownload = () => {
    openShareUrl(withDesktopUtm(downloadUrl))
  }

  const handleRestartToUpdate = () => {
    void ipcServices.update.quitAndInstall()
  }

  const handleCheckForUpdates = async () => {
    try {
      toast.info(t('about.notifications.checkingUpdates'))
      const result = await ipcServices.update.checkForUpdates()

      if (result.available) {
        toast.success(t('about.notifications.updateAvailable', { version: result.version }))
        setLatestVersionState({
          status: 'available',
          version: result.version ?? ''
        })
        setUpdateAvailable({
          available: true,
          version: result.version
        })
      } else if (result.error) {
        toast.error(t('about.notifications.updateError', { error: result.error }))
        setLatestVersionState({
          status: 'error',
          error: result.error
        })
      } else {
        toast.success(t('about.notifications.noUpdatesAvailable'))
        setLatestVersionState({
          status: 'uptodate',
          version: result.version ?? appVersionLabel
        })
        setUpdateAvailable({
          available: false,
          version: undefined
        })
      }
    } catch (error) {
      logger.error('Failed to check for updates:', error)
      toast.error(t('about.notifications.updateError', { error: 'Unknown error' }))
      setLatestVersionState({
        status: 'error'
      })
    }
  }

  const shareLinks = useMemo(() => {
    const encodedUrl = encodeURIComponent(shareTargetUrl)
    const encodedText = encodeURIComponent(`${t('about.description')} @nexmoe`)

    return {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`
    }
  }, [shareTargetUrl, t])

  const openShareUrl = useCallback((url: string) => {
    if (typeof window === 'undefined') {
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])

  const handleShareTwitter = () => {
    openShareUrl(shareLinks.twitter)
  }

  const handleShareFacebook = () => {
    openShareUrl(shareLinks.facebook)
  }

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareTargetUrl)
      toast.success(t('notifications.urlCopied'))
    } catch (error) {
      logger.error('Failed to copy share link:', error)
      toast.error(t('notifications.copyFailed'))
    }
  }

  const latestVersionStatusKey = latestVersionState
    ? `about.latestVersionStatus.${latestVersionState.status}`
    : null
  const latestVersionStatusClass =
    latestVersionState?.status === 'available'
      ? 'text-primary'
      : latestVersionState?.status === 'error'
        ? 'text-destructive'
        : 'text-muted-foreground'
  const latestVersionStatusText = latestVersionStatusKey ? t(latestVersionStatusKey) : null
  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto max-w-5xl space-y-6 px-6 pt-6 pb-6">
        <Card className="rounded-xl border-0 bg-card shadow-none">
          <CardContent className="p-0">
            <div className="space-y-4 p-6">
              <div className="flex flex-wrap items-center gap-4">
                <img alt="" className="size-12 rounded-xl" src="./app-icon.png" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h2 className="font-semibold text-xl">VidBeep</h2>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {appVersionLabel}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm">{t('about.description')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isStoreManaged ? (
                    <Button asChild className="h-8" size="sm">
                      <a
                        href="https://apps.microsoft.com/detail/9MVHDX4ZBPHS"
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Microsoft Store
                      </a>
                    </Button>
                  ) : (
                    <Button
                      className="h-8 bg-primary text-primary-foreground"
                      disabled={isStoreManaged === null}
                      onClick={
                        updateReady.ready
                          ? handleRestartToUpdate
                          : latestVersionState?.status === 'available'
                            ? handleGoToDownload
                            : () => void handleCheckForUpdates()
                      }
                      size="sm"
                    >
                      <RefreshCw aria-hidden className="size-4" />
                      {updateReady.ready
                        ? t('about.notifications.restartNowAction')
                        : latestVersionState?.status === 'available'
                          ? t('about.actions.goToDownload')
                          : t('about.actions.checkUpdates')}
                    </Button>
                  )}
                  <Button asChild className="size-8" size="icon" variant="ghost">
                    <a
                      aria-label={t('about.actions.openRepo')}
                      href="https://github.com/nexmoe/vidbee"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <Github aria-hidden className="size-4" />
                    </a>
                  </Button>
                </div>
              </div>
              {latestVersionStatusText ? (
                <p aria-live="polite" className={`text-sm ${latestVersionStatusClass}`}>
                  {latestVersionStatusText}
                </p>
              ) : null}
              {updateDownloadProgress === null ? null : (
                <div className="space-y-2">
                  <div className="flex justify-between text-muted-foreground text-sm">
                    <span>{t('about.downloadingUpdate')}</span>
                    <span className="tabular-nums">{updateDownloadProgress.toFixed(1)}%</span>
                  </div>
                  <Progress className="h-2 [&>div]:bg-data" value={updateDownloadProgress} />
                </div>
              )}
            </div>
            <ItemSeparator />
            <div className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="space-y-1">
                <p className="font-medium text-sm">{t('about.autoUpdateTitle')}</p>
                <p className="text-muted-foreground text-sm">
                  {isStoreManaged
                    ? t('about.microsoftStoreUpdateDescription')
                    : t('about.autoUpdateDescription')}
                </p>
              </div>
              {isStoreManaged === false ? (
                <Switch
                  aria-label={t('about.autoUpdateTitle')}
                  checked
                  disabled
                  label=""
                  onToggle={() => undefined}
                  size="compact"
                />
              ) : null}
            </div>
            <ItemSeparator />
            <DownloadEngineRow
              actions={
                <Button asChild size="sm" variant="ghost">
                  <a href={withDesktopUtm(changelogUrl)} rel="noopener noreferrer" target="_blank">
                    {t('about.releaseNotes', 'Release notes')}
                  </a>
                </Button>
              }
              status={kernelStatus}
            />
          </CardContent>
        </Card>

        <Card className="rounded-xl border-0 bg-card shadow-none">
          <CardContent className="p-6">
            <h2 className="mb-2 font-semibold text-base">
              {t('about.helpAndFeedback', 'Help and feedback')}
            </h2>
            <div className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="space-y-1">
                <p className="font-medium text-sm">
                  {t('about.feedbackAndIssues', 'Feedback & issues')}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t('about.resources.feedbackDescription')}
                </p>
              </div>
              <FeedbackLinkButtons
                appInfo={appInfo}
                buttonClassName="gap-2"
                buttonVariant="ghost"
                iconClassName="size-4"
                useSimpleGithubUrl
              />
            </div>
            <ItemSeparator />
            <div className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="space-y-1">
                <p className="font-medium text-sm">{t('about.emailSupport', 'Email support')}</p>
                <p className="text-muted-foreground text-sm">
                  {t('about.resources.contactDescription')}
                </p>
              </div>
              <Button asChild size="sm" variant="ghost">
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
              </Button>
            </div>
            <ItemSeparator />
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <div className="space-y-1">
                <p className="font-medium text-sm">
                  {t('about.officialWebsite', 'Official website')}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t('about.resources.websiteDescription')}
                </p>
              </div>
              <Button asChild size="sm" variant="ghost">
                <a href={withDesktopUtm(websiteUrl)} rel="noopener noreferrer" target="_blank">
                  {t('about.actions.visit')}
                  <ExternalLink aria-hidden className="size-4" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <section className="px-6">
          <h2 className="mb-2 font-medium text-muted-foreground text-sm">
            {t('about.moreFromDeveloper', 'More from the developer')}
          </h2>
          {OTHER_PRODUCTS.map((product) => (
            <div className="flex items-center justify-between gap-4 py-3" key={product.id}>
              <div className="space-y-1">
                <p className="font-medium text-sm">{t(`about.otherProducts.${product.id}.name`)}</p>
                <p className="text-muted-foreground text-sm">
                  {t(`about.otherProducts.${product.id}.description`)}
                </p>
              </div>
              <Button asChild className="shrink-0" size="sm" variant="ghost">
                <a
                  href={withDesktopCampaignUtm(product.url)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {t('about.actions.visit')}
                  <ExternalLink aria-hidden className="size-4" />
                </a>
              </Button>
            </div>
          ))}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-border/50 border-t pt-4">
            <p className="font-medium text-muted-foreground text-sm">
              {t('about.shareVidBeep', 'Share VidBeep')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleShareTwitter} size="sm" variant="ghost">
                <Twitter aria-hidden className="size-4" />
                {t('about.shareActions.twitter')}
              </Button>
              <Button onClick={handleShareFacebook} size="sm" variant="ghost">
                <Facebook aria-hidden className="size-4" />
                {t('about.shareActions.facebook')}
              </Button>
              <Button onClick={() => void handleCopyShareLink()} size="sm" variant="ghost">
                <LinkIcon aria-hidden className="size-4" />
                {t('about.shareActions.copy')}
              </Button>
              <Button
                onClick={() => openShareUrl('https://x.com/nexmoe')}
                size="sm"
                variant="ghost"
              >
                {t('about.followAuthorActions.follow')}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
