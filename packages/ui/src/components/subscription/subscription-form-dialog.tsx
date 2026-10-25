import {
  buildDefaultSubscriptionDirectory,
  sanitizeCommaList,
  sanitizeTemplateInput
} from '@vidbee/subscriptions-core/form'
import {
  CHECK_INTERVAL_PRESETS_MS,
  DEFAULT_FEED_CHECK_INTERVAL_MS,
  DEFAULT_SUBSCRIPTION_FILENAME_TEMPLATE,
  isProfilePlatform,
  PROFILE_SUBSCRIPTION_CATEGORIES,
  type ProfilePlatform,
  type SubscriptionDownloadPreferences,
  type SubscriptionRule
} from '@vidbee/subscriptions-core/types'
import { ChevronRight, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '../../lib/cn'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { Input } from '../ui/input'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle
} from '../ui/item'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Switch } from '../ui/switch'
import { WebmThumbnailNotice } from '../ui/webm-thumbnail-notice'

export interface SubscriptionFormData extends SubscriptionDownloadPreferences {
  url?: string
  keywords?: string[]
  tags?: string[]
  onlyDownloadLatest?: boolean
  autoDownload?: boolean
  downloadDirectory?: string
  namingTemplate?: string
  enabled?: boolean
  /** Profile subscriptions: followed categories. */
  categories?: string[]
  /** Null resets an edited subscription to the default interval. */
  checkIntervalMs?: number | null
}

/** Profile account detected from the URL by the host's resolver. */
interface DetectedProfile {
  platform: ProfilePlatform
  owner: string
  availableCategories: string[]
}

export const PROFILE_PLATFORM_LABELS: Record<ProfilePlatform, string> = {
  instagram: 'Instagram',
  threads: 'Threads',
  x: 'X',
  tiktok: 'TikTok',
  snapchat: 'Snapchat'
}

const DEFAULT_INTERVAL = 'default'
const HOUR_MS = 60 * 60 * 1000

/** Narrow the host's resolve result to a profile account, if it is one. */
const detectProfile = (resolved: unknown): DetectedProfile | null => {
  if (!resolved || typeof resolved !== 'object') {
    return null
  }
  const value = resolved as Record<string, unknown>
  if (
    value.sourceKind !== 'profile' ||
    typeof value.platform !== 'string' ||
    !isProfilePlatform(value.platform) ||
    !Array.isArray(value.availableCategories)
  ) {
    return null
  }
  return {
    platform: value.platform,
    owner: typeof value.profileOwner === 'string' ? value.profileOwner : '',
    availableCategories: value.availableCategories.filter(
      (entry): entry is string => typeof entry === 'string'
    )
  }
}

interface SubscriptionFormDialogProps {
  mode: 'add' | 'edit'
  subscription?: Pick<
    SubscriptionRule,
    | 'id'
    | 'title'
    | 'feedUrl'
    | 'keywords'
    | 'tags'
    | 'onlyDownloadLatest'
    | 'autoDownload'
    | 'downloadDirectory'
    | 'namingTemplate'
    | 'downloadType'
    | 'downloadQuality'
    | 'downloadContainer'
  > &
    Partial<
      Pick<
        SubscriptionRule,
        'sourceUrl' | 'sourceKind' | 'platform' | 'profileOwner' | 'categories' | 'checkIntervalMs'
      >
    >
  open: boolean
  /** Prefill an add dialog, e.g. from a profile mapper's Subscribe button. */
  initialUrl?: string
  initialCategories?: string[]
  /** False on hosts that cannot check profile accounts (the web app). */
  profileSourcesSupported?: boolean
  downloadPath: string
  downloadDefaults?: SubscriptionDownloadPreferences
  onlyLatestDefault: boolean
  supportsSubtitleDownloads?: boolean
  onSave: (data: SubscriptionFormData) => Promise<void>
  onClose: () => void
  onResolveFeed: (url: string) => Promise<unknown>
  onSelectDirectory?: () => Promise<string | null | undefined>
  onOpenRssDocs?: () => void | Promise<void>
}

/**
 * Add or edit an RSS subscription, including auto-download options.
 */
export function SubscriptionFormDialog({
  mode,
  subscription,
  open,
  initialUrl,
  initialCategories,
  profileSourcesSupported = true,
  downloadPath,
  downloadDefaults,
  onlyLatestDefault,
  supportsSubtitleDownloads = false,
  onSave,
  onClose,
  onResolveFeed,
  onSelectDirectory,
  onOpenRssDocs
}: SubscriptionFormDialogProps) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [keywords, setKeywords] = useState('')
  const [tags, setTags] = useState('')
  const [onlyLatest, setOnlyLatest] = useState(false)
  const [autoDownload, setAutoDownload] = useState(true)
  const [downloadType, setDownloadType] =
    useState<Required<SubscriptionDownloadPreferences>['downloadType']>('video')
  const [downloadQuality, setDownloadQuality] =
    useState<Required<SubscriptionDownloadPreferences>['downloadQuality']>('best')
  const [downloadContainer, setDownloadContainer] =
    useState<Required<SubscriptionDownloadPreferences>['downloadContainer']>('auto')
  const [downloadDirectory, setDownloadDirectory] = useState('')
  const [namingTemplate, setNamingTemplate] = useState('')
  const [detectingFeed, setDetectingFeed] = useState(false)
  const [profile, setProfile] = useState<DetectedProfile | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [checkInterval, setCheckInterval] = useState<string>(DEFAULT_INTERVAL)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const feedResolutionRef = useRef<{ url: string; promise: Promise<unknown> } | null>(null)
  const detectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevDefaultPathRef = useRef(buildDefaultSubscriptionDirectory(downloadPath))
  const urlInputId = useId()
  const advancedOptionsId = useId()
  const downloadTypeId = useId()
  const downloadQualityId = useId()
  const downloadContainerId = useId()
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false)
  const initializedFormRef = useRef<string | null>(null)
  const defaultDownloadType = downloadDefaults?.downloadType ?? 'video'
  const defaultDownloadQuality = downloadDefaults?.downloadQuality ?? 'best'
  const defaultDownloadContainer = downloadDefaults?.downloadContainer ?? 'auto'
  const isProfileSubscription = subscription?.sourceKind === 'profile'
  // Profile subscriptions store a synthetic feed URL; editing shows the account URL.
  const feedUrl = isProfileSubscription ? subscription?.sourceUrl : subscription?.feedUrl
  const intervalId = useId()
  const categoriesId = useId()
  const intervalChoices = [...CHECK_INTERVAL_PRESETS_MS].map(String)
  if (checkInterval !== DEFAULT_INTERVAL && !intervalChoices.includes(checkInterval)) {
    // Keep an interval set elsewhere (automation API) selectable.
    intervalChoices.push(checkInterval)
  }

  /** Toggle one category, keeping the platform's display order. */
  const toggleCategory = (category: string, checked: boolean) => {
    setCategories((current) =>
      checked
        ? (profile?.availableCategories ?? []).filter(
            (entry) => entry === category || current.includes(entry)
          )
        : current.filter((entry) => entry !== category)
    )
  }

  /** Share detection and save validation for the same URL during one form session. */
  const resolveFeedOnce = useCallback(
    (sourceUrl: string) => {
      if (feedResolutionRef.current?.url === sourceUrl) {
        return feedResolutionRef.current.promise
      }
      const promise = onResolveFeed(sourceUrl)
      feedResolutionRef.current = { url: sourceUrl, promise }
      void promise.catch(() => {
        if (feedResolutionRef.current?.promise === promise) {
          feedResolutionRef.current = null
        }
      })
      return promise
    },
    [onResolveFeed]
  )

  useLayoutEffect(() => {
    if (!open) {
      initializedFormRef.current = null
      return
    }
    const formKey = mode === 'edit' ? subscription?.id : 'add'
    if (formKey && initializedFormRef.current === formKey) {
      return
    }
    initializedFormRef.current = formKey ?? null
    feedResolutionRef.current = null

    setAdvancedOptionsOpen(false)
    setDownloadType(
      (mode === 'edit' ? subscription?.downloadType : undefined) ?? defaultDownloadType
    )
    setDownloadQuality(
      (mode === 'edit' ? subscription?.downloadQuality : undefined) ?? defaultDownloadQuality
    )
    setDownloadContainer(
      (mode === 'edit' ? subscription?.downloadContainer : undefined) ?? defaultDownloadContainer
    )

    setCheckInterval(
      mode === 'edit' && subscription?.checkIntervalMs
        ? String(subscription.checkIntervalMs)
        : DEFAULT_INTERVAL
    )
    if (mode === 'edit' && subscription?.sourceKind === 'profile' && subscription.platform) {
      setProfile(
        detectProfile({
          sourceKind: 'profile',
          platform: subscription.platform,
          profileOwner: subscription.profileOwner,
          availableCategories: isProfilePlatform(subscription.platform)
            ? [...PROFILE_SUBSCRIPTION_CATEGORIES[subscription.platform]]
            : []
        })
      )
      setCategories(subscription.categories ?? [])
    } else {
      setProfile(null)
      setCategories(initialCategories ?? [])
    }

    if (mode === 'edit' && subscription) {
      setUrl(
        subscription.sourceKind === 'profile'
          ? (subscription.sourceUrl ?? '')
          : subscription.feedUrl
      )
      setKeywords(subscription.keywords.join(', '))
      setTags(subscription.tags.join(', '))
      setOnlyLatest(subscription.onlyDownloadLatest)
      setAutoDownload(subscription.autoDownload !== false)
      setDownloadDirectory(subscription.downloadDirectory || '')
      setNamingTemplate(subscription.namingTemplate || '')
      return
    }

    setUrl(initialUrl ?? '')
    setKeywords('')
    setTags('')
    setOnlyLatest(onlyLatestDefault)
    setAutoDownload(true)
    setDownloadDirectory(buildDefaultSubscriptionDirectory(downloadPath))
    setNamingTemplate(DEFAULT_SUBSCRIPTION_FILENAME_TEMPLATE)
  }, [
    open,
    mode,
    subscription,
    onlyLatestDefault,
    downloadPath,
    defaultDownloadType,
    defaultDownloadQuality,
    defaultDownloadContainer,
    initialUrl,
    initialCategories
  ])

  useEffect(() => {
    if (mode !== 'add') {
      return
    }
    const newPath = buildDefaultSubscriptionDirectory(downloadPath)
    setDownloadDirectory((prev) => {
      if (!prev || prev === prevDefaultPathRef.current) {
        return newPath
      }
      return prev
    })
    prevDefaultPathRef.current = newPath
  }, [downloadPath, mode])

  useEffect(() => {
    if (mode === 'add') {
      setOnlyLatest(onlyLatestDefault)
    }
  }, [onlyLatestDefault, mode])

  useEffect(() => {
    setDetectingFeed(false)
    if (!open || saving || !url.trim()) {
      return
    }

    if (mode === 'edit' && url.trim() === feedUrl) {
      return
    }

    if (detectTimeout.current) {
      clearTimeout(detectTimeout.current)
    }

    let cancelled = false
    detectTimeout.current = setTimeout(async () => {
      setDetectingFeed(true)
      try {
        const detected = detectProfile(await resolveFeedOnce(url.trim()))
        if (!cancelled) {
          setProfile(detected)
          setCategories((current) => {
            const offered = detected?.availableCategories ?? []
            const kept = current.filter((category) => offered.includes(category))
            // Follow everything until the user narrows it down.
            return kept.length > 0 ? kept : offered
          })
        }
      } catch {
        if (!cancelled) {
          setProfile(null)
        }
        // Detection is best-effort; save still validates.
      } finally {
        if (!cancelled) {
          setDetectingFeed(false)
        }
      }
    }, 500)

    return () => {
      cancelled = true
      if (detectTimeout.current) {
        clearTimeout(detectTimeout.current)
      }
    }
  }, [open, saving, url, resolveFeedOnce, mode, feedUrl])

  /** Choose a download directory using the host's picker. */
  const handleSelectDirectory = async () => {
    if (!onSelectDirectory) {
      return
    }
    try {
      const path = await onSelectDirectory()
      if (path) {
        setDownloadDirectory(path)
      }
    } catch {
      toast.error(t('subscriptions.notifications.directoryError'))
    }
  }

  /** Open RSS setup documentation using the host's link handler. */
  const handleOpenRSSHubDocs = async () => {
    if (!onOpenRssDocs) {
      return
    }
    try {
      await onOpenRssDocs()
    } catch {
      toast.error(t('subscriptions.notifications.openLinkError'))
    }
  }

  /** Validate the feed and persist this subscription's download preferences. */
  const handleSave = async () => {
    if (savingRef.current) {
      return
    }
    if (mode === 'add' && !url.trim()) {
      toast.error(t('subscriptions.notifications.missingUrl'))
      return
    }

    if (profile && categories.length === 0) {
      toast.error(t('subscriptions.profile.noCategories'))
      return
    }
    if (profile && !profileSourcesSupported) {
      toast.error(t('subscriptions.profile.desktopOnly'))
      return
    }

    const formData: SubscriptionFormData = {
      keywords: sanitizeCommaList(keywords),
      tags: sanitizeCommaList(tags),
      onlyDownloadLatest: onlyLatest,
      autoDownload,
      downloadType,
      downloadQuality,
      downloadContainer,
      downloadDirectory: downloadDirectory || undefined,
      namingTemplate: namingTemplate || undefined
    }
    if (profile) {
      formData.categories = categories
    }
    if (checkInterval !== DEFAULT_INTERVAL) {
      formData.checkIntervalMs = Number(checkInterval)
    } else if (mode === 'edit' && subscription?.checkIntervalMs) {
      formData.checkIntervalMs = null
    }

    savingRef.current = true
    setSaving(true)
    try {
      if (url.trim() && (mode === 'add' || (mode === 'edit' && url.trim() !== feedUrl))) {
        try {
          await resolveFeedOnce(url.trim())
          formData.url = url.trim()
        } catch {
          toast.error(t('subscriptions.notifications.resolveError'))
          return
        }
      }

      await onSave(formData)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const titleKey = mode === 'add' ? 'subscriptions.add.title' : 'subscriptions.edit.title'
  const descriptionKey =
    mode === 'add' ? 'subscriptions.add.description' : 'subscriptions.edit.description'
  const saveButtonKey = mode === 'add' ? 'subscriptions.actions.add' : 'subscriptions.actions.save'

  return (
    <Dialog onOpenChange={(isOpen) => !isOpen && onClose()} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' && subscription
              ? t(titleKey, { name: subscription.title })
              : t(titleKey)}
          </DialogTitle>
          <DialogDescription>{t(descriptionKey)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={urlInputId}>{t('subscriptions.fields.url')}</Label>
              <span aria-live="polite" className="text-muted-foreground text-xs">
                {detectingFeed ? t('subscriptions.detecting') : null}
              </span>
            </div>
            <Input
              id={urlInputId}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.instagram.com/username"
              readOnly={mode === 'edit' && isProfileSubscription}
              value={url}
            />
            {mode === 'add' && !url.trim() && (
              <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2">
                <p className="flex-1 text-muted-foreground text-xs">
                  {t('subscriptions.rssHub.hint')}
                </p>
                <Button
                  className="h-5 w-5 shrink-0 p-0"
                  onClick={() => void handleOpenRSSHubDocs()}
                  size="sm"
                  title={t('subscriptions.rssHub.openDocs')}
                  variant="ghost"
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          {profile && (
            <fieldset className="space-y-3 rounded-md border px-3 py-3">
              <legend className="px-1 font-medium text-sm">
                {t('subscriptions.profile.account', {
                  platform: PROFILE_PLATFORM_LABELS[profile.platform],
                  owner: profile.owner
                })}
              </legend>
              {!profileSourcesSupported && (
                <p className="text-amber-600 text-xs">{t('subscriptions.profile.desktopOnly')}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button
                  onClick={() => setCategories(profile.availableCategories)}
                  size="sm"
                  variant={
                    categories.length === profile.availableCategories.length
                      ? 'secondary'
                      : 'outline'
                  }
                >
                  {t('subscriptions.profile.all')}
                </Button>
                {profile.availableCategories.map((category) => (
                  <div className="flex items-center gap-2" key={category}>
                    <Checkbox
                      checked={categories.includes(category)}
                      id={`${categoriesId}-${category}`}
                      onCheckedChange={(checked) => toggleCategory(category, checked === true)}
                    />
                    <Label className="cursor-pointer" htmlFor={`${categoriesId}-${category}`}>
                      {t(`subscriptions.profile.categories.${category}`)}
                    </Label>
                  </div>
                ))}
              </div>
              {categories.includes('stories') && (
                <p className="text-muted-foreground text-xs">
                  {t('subscriptions.profile.storiesHint')}
                </p>
              )}
            </fieldset>
          )}
          <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
            <Label htmlFor={intervalId}>{t('subscriptions.fields.checkInterval')}</Label>
            <Select onValueChange={setCheckInterval} value={checkInterval}>
              <SelectTrigger className="w-48" id={intervalId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_INTERVAL}>
                  {t('subscriptions.fields.checkIntervalDefault', {
                    count: DEFAULT_FEED_CHECK_INTERVAL_MS / HOUR_MS
                  })}
                </SelectItem>
                {intervalChoices.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t('subscriptions.fields.checkIntervalHours', {
                      count: Math.round((Number(value) / HOUR_MS) * 10) / 10
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('subscriptions.fields.customDirectory')}</Label>
            <div className="flex gap-2">
              <Input readOnly value={downloadDirectory} />
              <Button
                disabled={!onSelectDirectory}
                onClick={() => void handleSelectDirectory()}
                variant="secondary"
              >
                {t('subscriptions.actions.selectDirectory')}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
              <p className="text-sm">{t('subscriptions.fields.autoDownload')}</p>
              <Switch
                checked={autoDownload}
                label=""
                onToggle={() => setAutoDownload((current) => !current)}
              />
            </div>
            {autoDownload && !profile ? (
              <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
                <p className="text-sm">{t('subscriptions.fields.onlyLatest')}</p>
                <Switch
                  checked={onlyLatest}
                  label=""
                  onToggle={() => setOnlyLatest((current) => !current)}
                />
              </div>
            ) : null}
          </div>
          <div
            aria-hidden={!advancedOptionsOpen}
            className={cn(
              'grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
              advancedOptionsOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            )}
            data-state={advancedOptionsOpen ? 'open' : 'closed'}
            inert={!advancedOptionsOpen}
          >
            <div className={cn('min-h-0', !advancedOptionsOpen && 'pointer-events-none')}>
              <div className="space-y-3 border-t pt-4">
                {/* Profile items download in their original format; only tags apply. */}
                {!profile && (
                  <ItemGroup>
                    <Item variant="muted">
                      <ItemContent className="min-w-48">
                        <ItemTitle>
                          <Label htmlFor={downloadTypeId}>
                            {t('subscriptions.downloadOptions.type')}
                          </Label>
                        </ItemTitle>
                        <ItemDescription className="line-clamp-none">
                          {t(
                            downloadType === 'subtitles'
                              ? 'subscriptions.downloadOptions.subtitlesDescription'
                              : 'subscriptions.downloadOptions.typeDescription'
                          )}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="ml-auto">
                        <Select
                          onValueChange={(value) => setDownloadType(value as typeof downloadType)}
                          value={downloadType}
                        >
                          <SelectTrigger className="w-44" id={downloadTypeId}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="video">{t('download.video')}</SelectItem>
                            <SelectItem value="audio">{t('download.audio')}</SelectItem>
                            {supportsSubtitleDownloads && (
                              <SelectItem value="subtitles">
                                {t('advancedOptions.subtitles')}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </ItemActions>
                    </Item>
                    {downloadType !== 'subtitles' && (
                      <>
                        <ItemSeparator />
                        <Item variant="muted">
                          <ItemContent className="min-w-48">
                            <ItemTitle>
                              <Label htmlFor={downloadQualityId}>
                                {t('subscriptions.downloadOptions.quality')}
                              </Label>
                            </ItemTitle>
                            <ItemDescription className="line-clamp-none">
                              {t('subscriptions.downloadOptions.qualityDescription')}
                            </ItemDescription>
                          </ItemContent>
                          <ItemActions className="ml-auto">
                            <Select
                              onValueChange={(value) =>
                                setDownloadQuality(value as typeof downloadQuality)
                              }
                              value={downloadQuality}
                            >
                              <SelectTrigger className="w-44" id={downloadQualityId}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(['best', 'good', 'normal', 'bad', 'worst'] as const).map(
                                  (quality) => (
                                    <SelectItem key={quality} value={quality}>
                                      {t(
                                        downloadType === 'audio'
                                          ? `subscriptions.downloadOptions.audioQualityOptions.${quality}`
                                          : `settings.oneClickQualityOptions.${quality}`
                                      )}
                                    </SelectItem>
                                  )
                                )}
                              </SelectContent>
                            </Select>
                          </ItemActions>
                        </Item>
                      </>
                    )}
                    {downloadType === 'video' && (
                      <>
                        <ItemSeparator />
                        <Item variant="muted">
                          <ItemContent className="min-w-48">
                            <ItemTitle>
                              <Label htmlFor={downloadContainerId}>
                                {t('subscriptions.downloadOptions.container')}
                              </Label>
                            </ItemTitle>
                            <ItemDescription className="line-clamp-none">
                              {t('subscriptions.downloadOptions.containerDescription')}
                            </ItemDescription>
                            <WebmThumbnailNotice container={downloadContainer} />
                          </ItemContent>
                          <ItemActions className="ml-auto">
                            <Select
                              onValueChange={(value) =>
                                setDownloadContainer(value as typeof downloadContainer)
                              }
                              value={downloadContainer}
                            >
                              <SelectTrigger className="w-44" id={downloadContainerId}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(['auto', 'mp4', 'mkv', 'webm', 'original'] as const).map(
                                  (container) => (
                                    <SelectItem key={container} value={container}>
                                      {t(`settings.oneClickContainerOptions.${container}`)}
                                    </SelectItem>
                                  )
                                )}
                              </SelectContent>
                            </Select>
                          </ItemActions>
                        </Item>
                      </>
                    )}
                  </ItemGroup>
                )}
                {!profile && (
                  <div className="space-y-2">
                    <Label>{t('subscriptions.fields.keywords')}</Label>
                    <Input onChange={(event) => setKeywords(event.target.value)} value={keywords} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>{t('subscriptions.fields.tags')}</Label>
                  <Input onChange={(event) => setTags(event.target.value)} value={tags} />
                </div>
                {downloadType !== 'subtitles' && !profile && (
                  <div className="space-y-2">
                    <Label>{t('subscriptions.fields.namingTemplate')}</Label>
                    <Input
                      onChange={(event) =>
                        setNamingTemplate(sanitizeTemplateInput(event.target.value))
                      }
                      value={namingTemplate}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={advancedOptionsOpen}
                id={advancedOptionsId}
                onCheckedChange={(checked) => setAdvancedOptionsOpen(checked === true)}
              />
              <Label className="cursor-pointer" htmlFor={advancedOptionsId}>
                {t('advancedOptions.title')}
              </Label>
            </div>
            <div className="ml-auto flex gap-2">
              {mode === 'add' && (
                <Button onClick={onClose} variant="outline">
                  {t('download.cancel')}
                </Button>
              )}
              <Button aria-busy={saving} disabled={saving} onClick={() => void handleSave()}>
                <span className="inline-grid place-items-center">
                  <span className={cn('col-start-1 row-start-1', saving && 'opacity-0')}>
                    {t(saveButtonKey)}
                  </span>
                  {saving && (
                    <Loader2
                      aria-hidden="true"
                      className="col-start-1 row-start-1 size-4 animate-spin motion-reduce:animate-none"
                    />
                  )}
                </span>
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
