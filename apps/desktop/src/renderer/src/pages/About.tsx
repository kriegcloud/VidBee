import { useAppInfo } from '@renderer/components/feedback/FeedbackLinks'
import { DownloadEngineRow } from '@renderer/components/kernel/DownloadEngineRow'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { ItemSeparator } from '@renderer/components/ui/item'
import { FeedbackLinkButtons } from '@vidbee/ui/components/ui/feedback-link-buttons'
import { OTHER_PRODUCTS, OtherProductCard } from '@vidbee/ui/components/ui/other-product-card'
import { useAtomValue } from 'jotai'
import type { LucideIcon } from 'lucide-react'
import { Facebook, Github, Link as LinkIcon, Mail, MessageSquare, Twitter } from 'lucide-react'
import { Fragment, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { logger } from '../lib/logger'
import { buildLocalizedVidBeeUrl, withDesktopCampaignUtm, withDesktopUtm } from '../lib/url'
import { ytdlpKernelStatusAtom } from '../store/ytdlp-kernel'

interface AboutResource {
  icon: LucideIcon
  label: string
  description?: string
  actionLabel: string
  href?: string
  external?: boolean
  onClick?: () => void
}

const SUPPORT_EMAIL = 'team@vidbee.org'

/** Display application information for the current build. */
export function About() {
  const { t, i18n } = useTranslation()
  const kernelStatus = useAtomValue(ytdlpKernelStatusAtom)
  const appInfo = useAppInfo()
  const { appVersion } = appInfo
  const appVersionLabel = appVersion || '—'
  const websiteUrl = buildLocalizedVidBeeUrl('/', i18n.language)
  const changelogUrl = buildLocalizedVidBeeUrl('/changelog/', i18n.language)
  const shareTargetUrl = websiteUrl

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

  const aboutResources = useMemo<AboutResource[]>(
    () => [
      {
        icon: Mail,
        label: t('about.resources.contact'),
        description: t('about.resources.contactDescription'),
        actionLabel: SUPPORT_EMAIL,
        href: `mailto:${SUPPORT_EMAIL}`
      },
      {
        icon: LinkIcon,
        label: t('about.resources.website'),
        description: t('about.resources.websiteDescription'),
        actionLabel: t('about.actions.visit'),
        href: withDesktopUtm(websiteUrl),
        external: true
      }
    ],
    [t, websiteUrl]
  )

  return (
    <div className="h-full bg-background">
      <div className="container mx-auto max-w-5xl space-y-6 p-6">
        <Card>
          <CardContent className="p-0">
            <div className="space-y-4 px-6 pt-6 pb-4">
              <div className="flex items-center gap-4">
                <img alt="VidBeep" className="h-18 w-18 rounded-2xl" src="./app-icon.png" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <h2 className="font-semibold text-2xl leading-tight">{t('about.appName')}</h2>
                      <Badge variant="secondary">
                        {t('about.versionLabel', { version: appVersionLabel })}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild size="sm" variant="outline">
                        <a
                          aria-label={t('about.actions.openRepo')}
                          href="https://github.com/nexmoe/vidbee"
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Github className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>
                  </div>
                  <p className="text-muted-foreground text-sm">{t('about.description')}</p>
                </div>
              </div>
            </div>
            <ItemSeparator />
            <DownloadEngineRow
              actions={
                <Button asChild size="sm" variant="outline">
                  <a href={withDesktopUtm(changelogUrl)} rel="noreferrer" target="_blank">
                    {t('about.resources.changelog')}
                  </a>
                </Button>
              }
              status={kernelStatus}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {OTHER_PRODUCTS.map((product) => (
            <OtherProductCard
              description={t(`about.otherProducts.${product.id}.description`)}
              domain={product.domain}
              href={withDesktopCampaignUtm(product.url)}
              key={product.id}
              name={t(`about.otherProducts.${product.id}.name`)}
              visitLabel={t('about.actions.visit')}
            />
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('about.shareTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <p className="text-muted-foreground text-sm md:max-w-md">{t('about.shareSupport')}</p>
              <div className="flex flex-wrap gap-2">
                <Button className="gap-2" onClick={handleShareTwitter} size="sm" variant="outline">
                  <Twitter className="h-4 w-4" />
                  {t('about.shareActions.twitter')}
                </Button>
                <Button className="gap-2" onClick={handleShareFacebook} size="sm" variant="outline">
                  <Facebook className="h-4 w-4" />
                  {t('about.shareActions.facebook')}
                </Button>
                <Button
                  className="gap-2"
                  onClick={handleCopyShareLink}
                  size="sm"
                  variant="secondary"
                >
                  <LinkIcon className="h-4 w-4" />
                  {t('about.shareActions.copy')}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <p className="text-muted-foreground text-sm md:max-w-md">
                {t('about.followAuthorSupport')}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="gap-2"
                  onClick={() => openShareUrl('https://x.com/nexmoe')}
                  size="sm"
                  variant="outline"
                >
                  <Twitter className="h-4 w-4" />
                  {t('about.followAuthorActions.follow')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col">
              {/* Feedback section - merged into one row */}
              <div className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium leading-none">{t('about.resources.feedback')}</p>
                    <p className="text-muted-foreground text-sm">
                      {t('about.resources.feedbackDescription')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <FeedbackLinkButtons
                    appInfo={appInfo}
                    buttonClassName="gap-2"
                    iconClassName="h-4 w-4"
                    useSimpleGithubUrl={true}
                  />
                </div>
              </div>
              {aboutResources.map((resource) => {
                const Icon = resource.icon
                return (
                  <Fragment key={resource.label}>
                    <ItemSeparator />
                    <div className="flex items-center justify-between gap-4 px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium leading-none">{resource.label}</p>
                          {resource.description ? (
                            <p className="text-muted-foreground text-sm">{resource.description}</p>
                          ) : null}
                        </div>
                      </div>
                      {resource.href ? (
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={resource.href}
                            rel={resource.external ? 'noreferrer' : undefined}
                            target={resource.external ? '_blank' : undefined}
                          >
                            {resource.actionLabel}
                          </a>
                        </Button>
                      ) : (
                        <Button onClick={resource.onClick} size="sm" variant="outline">
                          {resource.actionLabel}
                        </Button>
                      )}
                    </div>
                  </Fragment>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
