import {
  type SubscriptionFormData,
  SubscriptionFormDialog
} from '@renderer/components/subscription/SubscriptionFormDialog'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { RemoteImage } from '@renderer/components/ui/remote-image'
import { ScrollArea } from '@renderer/components/ui/scroll-area'

import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { ipcServices } from '@renderer/lib/ipc'
import { withDesktopUtm } from '@renderer/lib/url'
import { cn } from '@renderer/lib/utils'
import { type DownloadRecord, downloadsArrayAtom } from '@renderer/store/downloads'
import { settingsAtom } from '@renderer/store/settings'
import {
  createSubscriptionAtom,
  loadSubscriptionsAtom,
  refreshSubscriptionAtom,
  removeSubscriptionAtom,
  resolveFeedAtom,
  subscriptionsAtom,
  updateSubscriptionAtom
} from '@renderer/store/subscriptions'
import type {
  DownloadStatus,
  SubscriptionFeedItem,
  SubscriptionPlatform,
  SubscriptionRule
} from '@shared/types'
import { SUBSCRIPTION_DUPLICATE_FEED_ERROR } from '@shared/types'
import { DEFAULT_FEED_CHECK_INTERVAL_MS } from '@vidbee/subscriptions-core'
import {
  getSubscriptionFeedEntries,
  type SubscriptionFeedEntry
} from '@vidbee/subscriptions-core/feed-items'
import {
  getSubscriptionStatusMeta,
  resolveSubscriptionItemStatus
} from '@vidbee/subscriptions-core/status'
import { PROFILE_PLATFORM_LABELS } from '@vidbee/ui/components/subscription/subscription-form-dialog'
import { DownloadPlatformIcon } from '@vidbee/ui/components/ui/download-platform-icon'
import { SubscriptionVirtualGrid } from '@vidbee/ui/components/ui/subscription-virtual-grid'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  Copy,
  Download,
  Edit,
  ExternalLink,
  MoreHorizontal,
  Plus,
  Power,
  RefreshCw,
  Rss,
  Trash2
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { logger } from '../lib/logger'

type SubscriptionItemStatus = DownloadStatus | 'queued' | 'notQueued'

const PLATFORM_LABELS: Record<SubscriptionPlatform, string> = {
  ...PROFILE_PLATFORM_LABELS,
  youtube: 'YouTube',
  bilibili: 'Bilibili',
  custom: 'RSS'
}
const HOUR_MS = 60 * 60 * 1000

/** URL shape each platform accepts, shown in the empty state as reference. */
const PLATFORM_URL_EXAMPLES: Record<SubscriptionPlatform, string> = {
  youtube: 'youtube.com/@channel',
  bilibili: 'space.bilibili.com/uid',
  instagram: 'instagram.com/username',
  threads: 'threads.net/@username',
  x: 'x.com/username',
  tiktok: 'tiktok.com/@username',
  snapchat: 'snapchat.com/add/username',
  custom: ''
}
const PLATFORM_DOMAINS: Record<SubscriptionPlatform, string | null> = {
  youtube: 'youtube.com',
  bilibili: 'bilibili.com',
  instagram: 'instagram.com',
  threads: 'threads.net',
  x: 'x.com',
  tiktok: 'tiktok.com',
  snapchat: 'snapchat.com',
  custom: null
}

const POLL_INTERVAL_MS = 5000

const subscriptionItemStatusLabels: Record<SubscriptionItemStatus, string> = {
  notQueued: 'subscriptions.items.status.notQueued',
  queued: 'subscriptions.items.status.queued',
  pending: 'subscriptions.items.status.pending',
  downloading: 'subscriptions.items.status.downloading',
  processing: 'subscriptions.items.status.processing',
  completed: 'subscriptions.items.status.completed',
  error: 'subscriptions.items.status.error',
  cancelled: 'subscriptions.items.status.cancelled'
}

const getErrorMessage = (error: unknown): string | undefined => {
  if (!error) {
    return undefined
  }
  if (typeof error === 'string') {
    return error
  }
  if (typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      return error.message
    }
    if ('code' in error && typeof error.code === 'string') {
      return error.code
    }
    if ('error' in error) {
      const nested = (error as { error?: unknown }).error
      if (typeof nested === 'string') {
        return nested
      }
      if (nested && typeof nested === 'object' && 'message' in nested) {
        const nestedMessage = (nested as { message?: unknown }).message
        if (typeof nestedMessage === 'string') {
          return nestedMessage
        }
      }
    }
  }
  return undefined
}

/** Statuses whose stored error text explains more than the status label. */
const PROBLEM_STATUSES: ReadonlySet<string> = new Set(['failed', 'rate-limited', 'auth-required'])

const isDuplicateFeedError = (error: unknown) => {
  const message = getErrorMessage(error)
  return Boolean(message?.includes(SUBSCRIPTION_DUPLICATE_FEED_ERROR))
}

/** Format feed dates using the application's locale and the screen's recency rules. */
function formatFeedDate(
  timestamp: number,
  locale: string,
  today: string,
  yesterday: string
): string {
  const date = new Date(timestamp)
  const now = new Date()
  const previousDay = new Date(now)
  previousDay.setDate(now.getDate() - 1)
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
  if (date.toDateString() === now.toDateString()) {
    return `${today} ${time}`
  }
  if (date.toDateString() === previousDay.toDateString()) {
    return `${yesterday} ${time}`
  }
  return date.getFullYear() === now.getFullYear()
    ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date)
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Render one subscription's selector and management actions. */
function SubscriptionTab({
  subscription,
  onRefresh,
  onRemove,
  onSelect,
  onUpdate,
  isActive
}: SubscriptionTabProps) {
  const { t, i18n } = useTranslation()
  const [editOpen, setEditOpen] = useState(false)
  const statusMeta = getSubscriptionStatusMeta(subscription.status, subscription.enabled)
  const statusDescription =
    PROBLEM_STATUSES.has(subscription.status) && subscription.lastError
      ? subscription.lastError
      : t(statusMeta.label)
  const newItems = subscription.items.filter((item) => !item.addedToQueue)
  const since = newItems.length ? Math.min(...newItems.map((item) => item.publishedAt)) : null
  const sinceLabel =
    since === null
      ? '—'
      : formatFeedDate(
          since,
          i18n.language,
          t('subscriptions.today', 'Today'),
          t('subscriptions.yesterday', 'Yesterday')
        )
  const minutesAgo =
    subscription.lastCheckedAt === undefined
      ? null
      : Math.max(0, Math.floor((Date.now() - subscription.lastCheckedAt) / 60_000))
  const lastCheckedLabel =
    minutesAgo === null
      ? '—'
      : new Intl.RelativeTimeFormat(i18n.language, { style: 'short' }).format(
          -Math.floor(
            minutesAgo >= 1440 ? minutesAgo / 1440 : minutesAgo >= 60 ? minutesAgo / 60 : minutesAgo
          ),
          minutesAgo >= 1440 ? 'day' : minutesAgo >= 60 ? 'hour' : 'minute'
        )
  const platformLabel = PLATFORM_LABELS[subscription.platform]

  const handleToggleEnabled = async (checked: boolean) => {
    await onUpdate({ enabled: checked })
  }

  const handleRefresh = async () => {
    await onRefresh()
    toast.success(t('subscriptions.notifications.refreshStarted'))
  }

  const handleRemove = async () => {
    await onRemove()
    toast.success(t('subscriptions.notifications.removed'))
  }

  const handleEdit = () => {
    setEditOpen(true)
  }

  return (
    <>
      <div className={cn('flex items-center gap-3 rounded-lg px-3 py-4', isActive && 'bg-muted')}>
        <button
          aria-pressed={isActive}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={onSelect}
          title={statusDescription}
          type="button"
        >
          <RemoteImage
            alt=""
            className={cn(
              'size-10 shrink-0 overflow-hidden object-cover',
              subscription.sourceKind === 'profile' ||
                (subscription.platform === 'youtube' &&
                  !subscription.sourceUrl.includes('playlist'))
                ? 'rounded-full'
                : 'rounded-md'
            )}
            src={subscription.coverUrl}
          />
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-sm">
                {subscription.title || t('subscriptions.labels.unknown')}
              </span>
              <span className="shrink-0 text-muted-foreground" title={platformLabel}>
                {subscription.platform === 'custom' ? (
                  <Rss aria-label={platformLabel} className="size-4" />
                ) : (
                  <DownloadPlatformIcon domain={PLATFORM_DOMAINS[subscription.platform]} />
                )}
              </span>
            </div>
            <p className="text-meta text-xs tabular-nums">
              {newItems.length > 0 ? (
                <>
                  <span className="text-data tabular-nums">
                    {new Intl.NumberFormat(i18n.language).format(newItems.length)}
                  </span>{' '}
                  {t('subscriptions.newSince', {
                    defaultValue: 'new since {{date}}',
                    date: sinceLabel
                  })}
                </>
              ) : (
                t('subscriptions.upToDate', 'Up to date')
              )}
            </p>
            {PROBLEM_STATUSES.has(subscription.status) ? (
              <p className="text-destructive text-xs">{statusDescription}</p>
            ) : null}
          </div>
        </button>
        <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs">
          {subscription.autoDownload
            ? t('subscriptions.autoDownloadOn', 'Auto-download on')
            : t('subscriptions.autoDownloadOff', 'Auto-download off')}
        </span>
        <span
          className="w-24 shrink-0 text-right text-meta text-xs tabular-nums"
          title={t('subscriptions.status.tooltip.updatedAt', { time: lastCheckedLabel })}
        >
          {lastCheckedLabel}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t('subscriptions.manage', {
                defaultValue: 'Manage {{name}}',
                name: subscription.title
              })}
              className="size-8 shrink-0"
              size="icon"
              variant="ghost"
            >
              <MoreHorizontal aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void handleRefresh()}>
              <RefreshCw className="size-4" />
              {t('subscriptions.actions.refresh')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleEdit}>
              <Edit className="size-4" />
              {t('subscriptions.actions.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleToggleEnabled(!subscription.enabled)}>
              <Power className="size-4" />
              {t(
                subscription.enabled
                  ? 'subscriptions.actions.disable'
                  : 'subscriptions.actions.enable'
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleRemove()} variant="destructive">
              <Trash2 className="size-4" />
              {t('subscriptions.actions.remove')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SubscriptionFormDialog
        mode="edit"
        onClose={() => setEditOpen(false)}
        onSave={async (data) => {
          if (await onUpdate(data)) {
            toast.success(t('subscriptions.notifications.updated'))
            setEditOpen(false)
          }
        }}
        open={editOpen}
        subscription={subscription}
      />
    </>
  )
}

/** Render all RSS items or the selected subscription's items. */
export function Subscriptions() {
  const { t } = useTranslation()
  const settings = useAtomValue(settingsAtom)
  const [subscriptions] = useAtom(subscriptionsAtom)
  const loadSubscriptions = useSetAtom(loadSubscriptionsAtom)
  const updateSubscription = useSetAtom(updateSubscriptionAtom)
  const removeSubscription = useSetAtom(removeSubscriptionAtom)
  const refreshSubscription = useSetAtom(refreshSubscriptionAtom)

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [platform, setPlatform] = useState<SubscriptionPlatform | null>(null)
  const [selectedTab, setSelectedTab] = useState<string | null>(null)
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    // Another host can update the shared database without a local IPC event.
    void loadSubscriptions()
    const timer = window.setInterval(() => {
      void loadSubscriptions()
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [loadSubscriptions])

  const sortedSubscriptions = useMemo(
    () =>
      [...subscriptions].sort(
        (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0)
      ),
    [subscriptions]
  )

  const resolveFeed = useSetAtom(resolveFeedAtom)
  /** Persist preferences before refreshing the feed in the background. */
  const handleUpdateSubscription = useCallback(
    async (id: string, data: SubscriptionRuleUpdateForm) => {
      const updatePayload: Parameters<typeof updateSubscription>[0]['data'] = {
        keywords: data.keywords,
        tags: data.tags,
        onlyDownloadLatest: data.onlyDownloadLatest,
        autoDownload: data.autoDownload,
        downloadType: data.downloadType,
        downloadQuality: data.downloadQuality,
        downloadContainer: data.downloadContainer,
        downloadDirectory: data.downloadDirectory,
        namingTemplate: data.namingTemplate,
        enabled: data.enabled,
        categories: data.categories,
        checkIntervalMs: data.checkIntervalMs
      }

      // If feed URL is provided, resolve it and include sourceUrl, feedUrl, and platform
      if (data.url) {
        try {
          const resolved = await resolveFeed(data.url)
          updatePayload.sourceUrl = resolved.sourceUrl
          updatePayload.feedUrl = resolved.feedUrl
          updatePayload.platform = resolved.platform
        } catch (error) {
          logger.error('Failed to resolve feed URL:', error)
          toast.error(t('subscriptions.notifications.resolveError'))
          return false
        }
      }

      try {
        await updateSubscription({ id, data: updatePayload })
      } catch (error) {
        logger.error('Failed to update subscription:', error)
        toast.error(
          isDuplicateFeedError(error)
            ? t('subscriptions.notifications.duplicateUrl')
            : t('subscriptions.notifications.createError')
        )
        return false
      }

      // Feed fetching must not delay dismissal after the preferences are persisted.
      void refreshSubscription(id).catch((error) => {
        logger.error('Failed to refresh saved subscription:', error)
      })
      return true
    },
    [refreshSubscription, updateSubscription, resolveFeed, t]
  )

  const createSubscription = useSetAtom(createSubscriptionAtom)

  const handleCreateSubscription = useCallback(
    async (data: SubscriptionFormData) => {
      if (!data.url) {
        toast.error(t('subscriptions.notifications.missingUrl'))
        return
      }

      try {
        await createSubscription({
          url: data.url,
          keywords: data.keywords?.join(', '),
          tags: data.tags?.join(', '),
          onlyDownloadLatest: data.onlyDownloadLatest,
          autoDownload: data.autoDownload,
          downloadType: data.downloadType,
          downloadQuality: data.downloadQuality,
          downloadContainer: data.downloadContainer,
          downloadDirectory: data.downloadDirectory,
          namingTemplate: data.namingTemplate,
          enabled: data.enabled,
          categories: data.categories,
          checkIntervalMs: data.checkIntervalMs ?? undefined
        })
        toast.success(t('subscriptions.notifications.created'))
        setAddDialogOpen(false)
      } catch (error) {
        logger.error('Failed to create subscription:', error)
        toast.error(
          isDuplicateFeedError(error)
            ? t('subscriptions.notifications.duplicateUrl')
            : t('subscriptions.notifications.createError')
        )
      }
    },
    [createSubscription, t]
  )

  const handleOpenRSSHubDocs = useCallback(async () => {
    try {
      await ipcServices.fs.openExternal(withDesktopUtm('https://vidbee.org/docs/rss/'))
    } catch (error) {
      logger.error('Failed to open RSS documentation:', error)
      toast.error(t('subscriptions.notifications.openLinkError'))
    }
  }, [t])

  const platforms = [...new Set(sortedSubscriptions.map((subscription) => subscription.platform))]
  const filteredSubscriptions =
    platform === null
      ? sortedSubscriptions
      : sortedSubscriptions.filter((subscription) => subscription.platform === platform)

  const displayedItems = useMemo(() => {
    const sources = sortedSubscriptions.filter(
      (subscription) =>
        (platform === null || subscription.platform === platform) &&
        (selectedTab === null || subscription.id === selectedTab)
    )
    return getSubscriptionFeedEntries(sources)
  }, [platform, selectedTab, sortedSubscriptions])

  useEffect(() => {
    if (
      platform !== null &&
      !sortedSubscriptions.some((subscription) => subscription.platform === platform)
    ) {
      setPlatform(null)
      setSelectedTab(null)
    }
  }, [platform, sortedSubscriptions])

  // Return to all items when the selected subscription is removed.
  useEffect(() => {
    if (selectedTab !== null && !sortedSubscriptions.some((s) => s.id === selectedTab)) {
      setSelectedTab(null)
    }
  }, [selectedTab, sortedSubscriptions])

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      {sortedSubscriptions.length === 0 ? null : (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-6 pt-4 pb-4">
          <fieldset
            aria-label={t('subscriptions.platformFilters', 'Filter subscriptions by platform')}
            className="flex flex-wrap gap-1"
          >
            {[null, ...platforms].map((value) => (
              <Button
                aria-pressed={platform === value}
                className={cn('h-8 gap-2', platform === value && 'bg-muted')}
                key={value ?? 'all'}
                onClick={() => {
                  setPlatform(value)
                  setSelectedTab(null)
                }}
                size="sm"
                variant="ghost"
              >
                {value === null ? t('subscriptions.allFilter', 'All') : PLATFORM_LABELS[value]}
                <span className="text-meta tabular-nums">
                  {value === null
                    ? sortedSubscriptions.length
                    : sortedSubscriptions.filter((subscription) => subscription.platform === value)
                        .length}
                </span>
              </Button>
            ))}
          </fieldset>
          <Button
            className="h-8 shrink-0 whitespace-nowrap bg-primary text-primary-foreground"
            onClick={() => setAddDialogOpen(true)}
            size="sm"
          >
            <Plus aria-hidden className="size-4" />
            {t('subscriptions.addAction', 'Add subscription')}
          </Button>
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1" viewportRef={setViewport}>
        <div className="space-y-6 px-6 pb-6">
          {sortedSubscriptions.length === 0 ? (
            <section className="mt-4 grid gap-8 rounded-xl bg-card p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                <h2 className="font-semibold text-base">
                  {t('subscriptions.emptyTitle', 'No subscriptions yet')}
                </h2>
                <p className="max-w-prose text-muted-foreground text-sm">
                  {t(
                    'subscriptions.emptyDescription',
                    'Follow a channel, playlist or feed and VidBeep downloads new items for you.'
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <Button
                    className="h-8 bg-primary text-primary-foreground"
                    onClick={() => setAddDialogOpen(true)}
                    size="sm"
                  >
                    <Plus aria-hidden className="size-4" />
                    {t('subscriptions.addAction', 'Add subscription')}
                  </Button>
                  <Button
                    className="h-auto p-0 text-muted-foreground"
                    onClick={() => void handleOpenRSSHubDocs()}
                    variant="link"
                  >
                    {t('subscriptions.rssHubLink', 'Use RSSHub feeds')}
                  </Button>
                </div>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 pt-6 text-sm">
                  <dt className="text-muted-foreground">
                    {t('subscriptions.checksLabel', 'Checks for new items')}
                  </dt>
                  <dd className="tabular-nums">
                    {t('subscriptions.everyHours', 'Every {{count}} hours', {
                      count: Math.round(DEFAULT_FEED_CHECK_INTERVAL_MS / HOUR_MS)
                    })}
                  </dd>
                  <dt className="text-muted-foreground">
                    {t('subscriptions.savesToLabel', 'Saves to')}
                  </dt>
                  <dd className="truncate" title={settings.downloadPath}>
                    {settings.downloadPath || '—'}
                  </dd>
                </dl>
              </div>
              <div>
                <h3 className="pb-2 font-medium text-muted-foreground text-sm">
                  {t('subscriptions.followableTitle', 'What you can follow')}
                </h3>
                <ul>
                  {(Object.keys(PLATFORM_URL_EXAMPLES) as SubscriptionPlatform[]).map((value) => (
                    <li className="flex h-10 items-center gap-3 text-sm" key={value}>
                      {PLATFORM_DOMAINS[value] ? (
                        <DownloadPlatformIcon domain={PLATFORM_DOMAINS[value]} />
                      ) : (
                        <Rss aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="w-24 shrink-0 font-medium">{PLATFORM_LABELS[value]}</span>
                      <span className="truncate text-muted-foreground">
                        {PLATFORM_URL_EXAMPLES[value] ||
                          t('subscriptions.anyFeedUrl', 'Any RSS or Atom feed URL')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : (
            <>
              <div className="rounded-xl bg-card px-3">
                {filteredSubscriptions.map((subscription) => (
                  <SubscriptionTab
                    isActive={subscription.id === selectedTab}
                    key={subscription.id}
                    onRefresh={() => refreshSubscription(subscription.id)}
                    onRemove={() => removeSubscription(subscription.id)}
                    onSelect={() =>
                      setSelectedTab(subscription.id === selectedTab ? null : subscription.id)
                    }
                    onUpdate={(data) => handleUpdateSubscription(subscription.id, data)}
                    subscription={subscription}
                  />
                ))}
              </div>
              <SubscriptionItems
                entries={displayedItems}
                key={`${platform ?? 'all'}:${selectedTab ?? 'all'}`}
                viewport={viewport}
              />
            </>
          )}
        </div>
      </ScrollArea>

      <SubscriptionFormDialog
        mode="add"
        onClose={() => setAddDialogOpen(false)}
        onSave={handleCreateSubscription}
        open={addDialogOpen}
      />
    </div>
  )
}

interface SubscriptionTabProps {
  subscription: SubscriptionRule
  isActive: boolean
  onRefresh: () => Promise<void>
  onRemove: () => Promise<void>
  onSelect: () => void
  onUpdate: (data: SubscriptionRuleUpdateForm) => Promise<boolean>
}

type SubscriptionRuleUpdateForm = SubscriptionFormData

/** Render a mixed feed while resolving download status and actions per source. */
function SubscriptionItems({
  entries,
  viewport
}: {
  entries: SubscriptionFeedEntry<SubscriptionRule>[]
  viewport: HTMLDivElement | null
}) {
  const { t, i18n } = useTranslation()
  const [visibleRange, setVisibleRange] = useState({ startIndex: 0, endIndex: 0 })
  const feedItems = useMemo(
    () => entries.slice(visibleRange.startIndex, visibleRange.endIndex).map((entry) => entry.item),
    [entries, visibleRange]
  )
  const downloads = useAtomValue(downloadsArrayAtom)
  const [historyStatusMap, setHistoryStatusMap] = useState<Record<string, DownloadStatus | null>>(
    {}
  )
  const historyRequests = useRef(
    new Map<string, Promise<{ downloadId: string; status: DownloadStatus | null }>>()
  )
  const downloadLookup = useMemo(() => {
    const map = new Map<string, DownloadRecord>()
    downloads.forEach((record) => {
      map.set(record.id, record)
    })
    return map
  }, [downloads])

  useEffect(() => {
    const queuedDownloadIds = Array.from(
      new Set(
        feedItems
          .filter((item) => item.addedToQueue && item.downloadId)
          .map((item) => item.downloadId as string)
      )
    )

    const missingIds = queuedDownloadIds.filter(
      (downloadId) => !downloadLookup.has(downloadId) && historyStatusMap[downloadId] === undefined
    )

    if (missingIds.length === 0) {
      return
    }

    let cancelled = false

    const fetchHistoryStatuses = async () => {
      try {
        const results = await Promise.all(
          missingIds.map((downloadId) => {
            let request = historyRequests.current.get(downloadId)
            if (!request) {
              /** Share lookups when scrolling or a download update replaces the visible window. */
              const fetchStatus = async () => {
                try {
                  const historyItem = await ipcServices.history.getHistoryById(downloadId)
                  return { downloadId, status: historyItem?.status ?? null }
                } catch (error) {
                  logger.error('Failed to fetch download history entry:', error)
                  return { downloadId, status: null }
                }
              }
              request = fetchStatus()
              historyRequests.current.set(downloadId, request)
            }
            return request
          })
        )

        if (cancelled) {
          return
        }

        setHistoryStatusMap((prev) => {
          let changed = false
          const next = { ...prev }

          for (const { downloadId, status } of results) {
            if (next[downloadId] === status) {
              continue
            }
            next[downloadId] = status
            changed = true
          }

          return changed ? next : prev
        })
      } catch (error) {
        logger.error('Failed to resolve download history statuses:', error)
      }
    }

    void fetchHistoryStatuses()

    return () => {
      cancelled = true
    }
  }, [feedItems, downloadLookup, historyStatusMap])

  const itemStatusLookup = useMemo(() => {
    const combined = new Map<string, { status: string }>()
    for (const [id, download] of downloadLookup) {
      combined.set(id, { status: download.status })
    }
    for (const [id, status] of Object.entries(historyStatusMap)) {
      if (status && !combined.has(id)) {
        combined.set(id, { status })
      }
    }
    return combined
  }, [downloadLookup, historyStatusMap])

  const handleOpenItem = async (url: string) => {
    try {
      await ipcServices.fs.openExternal(url)
    } catch (error) {
      logger.error('Failed to open subscription item link:', error)
      toast.error(t('subscriptions.notifications.openLinkError'))
    }
  }

  const handleCopyItemUrl = async (url: string) => {
    if (!(url && navigator.clipboard?.writeText)) {
      toast.error(t('notifications.copyFailed'))
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('notifications.urlCopied'))
    } catch (error) {
      logger.error('Failed to copy subscription item link:', error)
      toast.error(t('notifications.copyFailed'))
    }
  }

  /** Queue an item against its original subscription, including in the all view. */
  const handleQueueItem = useCallback(
    async (subscriptionId: string, item: SubscriptionFeedItem) => {
      if (item.addedToQueue) {
        toast.info(t('subscriptions.notifications.itemAlreadyQueued'))
        return
      }
      try {
        const queued = await ipcServices.subscriptions.queueItem(subscriptionId, item.id)
        if (queued) {
          toast.success(t('subscriptions.notifications.itemQueued'))
          return
        }
        toast.info(t('subscriptions.notifications.itemAlreadyQueued'))
      } catch (error) {
        logger.error('Failed to queue subscription item:', error)
        toast.error(t('subscriptions.notifications.queueError'))
      }
    },
    [t]
  )

  if (entries.length === 0) {
    return (
      <div className="rounded-xl bg-card p-6 text-muted-foreground text-sm">
        {t('subscriptions.items.empty')}
      </div>
    )
  }

  return (
    <SubscriptionVirtualGrid
      entries={entries}
      onVisibleRangeChange={setVisibleRange}
      renderEntry={({ subscription, item }) => {
        const itemStatus = resolveSubscriptionItemStatus(item, itemStatusLookup)
        const hasResolvedDownloadStatus =
          item.addedToQueue && itemStatus !== 'queued' && itemStatus !== 'notQueued'
        const badgeLabel = item.addedToQueue
          ? t('subscriptions.items.status.queued')
          : t('subscriptions.items.status.notQueued')
        const tooltipLabel = item.addedToQueue
          ? hasResolvedDownloadStatus
            ? t('subscriptions.items.tooltip.downloadStatus', {
                status: t(subscriptionItemStatusLabels[itemStatus])
              })
            : t('subscriptions.items.tooltip.downloadPending')
          : t('subscriptions.items.tooltip.notQueued')
        const badgeClass = item.addedToQueue
          ? 'bg-data-track text-data'
          : 'bg-card text-muted-foreground'
        return (
          <ContextMenu key={`${subscription.id}-${item.id}`}>
            <ContextMenuTrigger asChild>
              <article className="group transition-all">
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
                  {item.thumbnail ? (
                    <RemoteImage
                      alt={item.title}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      src={item.thumbnail}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                      {t('subscriptions.labels.noThumbnail')}
                    </div>
                  )}
                  <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-card py-1 pr-3 pl-1 font-medium text-muted-foreground text-xs">
                    {subscription.coverUrl ? (
                      <div className="h-6 w-6 overflow-hidden rounded-full">
                        <RemoteImage
                          alt={subscription.title || t('subscriptions.labels.unknown')}
                          className="h-full w-full object-cover"
                          src={subscription.coverUrl}
                        />
                      </div>
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs">
                        {(subscription.title || t('subscriptions.labels.unknown')).slice(0, 1)}
                      </div>
                    )}
                    <span className="max-w-40 truncate text-xs">
                      {subscription.title || t('subscriptions.labels.unknown')}
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-3 rounded bg-card px-2 py-1 text-meta text-xs tabular-nums">
                    {formatFeedDate(
                      item.publishedAt,
                      i18n.language,
                      t('subscriptions.today', 'Today'),
                      t('subscriptions.yesterday', 'Yesterday')
                    )}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        className={cn('absolute right-3 bottom-3 rounded-full text-xs', badgeClass)}
                        variant="secondary"
                      >
                        {badgeLabel}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>{tooltipLabel}</TooltipContent>
                  </Tooltip>
                </div>
                <div className="px-3 py-2">
                  <p
                    className="font-medium text-card-foreground text-sm leading-snug"
                    title={item.title}
                  >
                    {item.title}
                  </p>
                </div>
              </article>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                disabled={item.addedToQueue}
                onClick={() => void handleQueueItem(subscription.id, item)}
              >
                <Download className="h-4 w-4" />
                {t('subscriptions.items.actions.queue')}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => void handleOpenItem(item.url)}>
                <ExternalLink className="h-4 w-4" />
                {t('subscriptions.items.actions.open')}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={!item.url}
                onClick={() => void handleCopyItemUrl(item.url)}
              >
                <Copy className="h-4 w-4" />
                {t('subscriptions.items.actions.copyUrl')}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      }}
      viewport={viewport}
    />
  )
}
