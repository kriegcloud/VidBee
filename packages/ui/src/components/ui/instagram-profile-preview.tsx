import { AlertCircle, Image, Loader2, LockKeyhole, UserRound } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './button'
import { Checkbox } from './checkbox'
import { RemoteImage } from './remote-image'

export type InstagramProfileCategory = 'posts' | 'reels' | 'stories' | 'highlights' | 'tagged'

export interface InstagramCategoryPreview {
  category: InstagramProfileCategory
  state: 'cancelled' | 'unscanned' | 'ready' | 'empty' | 'auth-required' | 'unavailable'
  items?: { id: string; url: string; assetCount: number; title?: string; downloaded?: boolean }[]
  mappedAt?: number
  sourceCount: number
  assetCount: number
  errorCode?:
    | 'auth-required'
    | 'rate-limited'
    | 'not-found'
    | 'network'
    | 'binary-missing'
    | 'unavailable'
}

export interface InstagramProfilePreviewData {
  mapping?: { category: InstagramProfileCategory; state: 'queued' | 'running' }
  profile: {
    username: string
    displayName?: string
    avatarUrl?: string
    isPrivate?: boolean
  }
  categories: InstagramCategoryPreview[]
  totalSourceCount: number
  totalAssetCount: number
  complete: boolean
}

interface InstagramProfilePreviewProps {
  error: string | null
  inspection: InstagramProfilePreviewData | null
  loading: boolean
  selectedCategories: ReadonlySet<InstagramProfileCategory>
  onToggleCategory: (category: InstagramProfileCategory, selected: boolean) => void
  renderAvatar?: (url: string) => ReactNode
  onMapCategory?: (category: InstagramProfileCategory) => void
  mappingCategory?: InstagramProfileCategory | null
  onStopMapping?: () => void
  stopping?: boolean
  selectedItems?: ReadonlySet<string>
  onToggleItem?: (category: InstagramProfileCategory, id: string, selected: boolean) => void
}

const CATEGORY_KEYS: Record<InstagramProfileCategory, string> = {
  posts: 'instagramProfile.categories.posts',
  reels: 'instagramProfile.categories.reels',
  stories: 'instagramProfile.categories.stories',
  highlights: 'instagramProfile.categories.highlights',
  tagged: 'instagramProfile.categories.tagged'
}

export const InstagramProfilePreview = ({
  error,
  inspection,
  loading,
  selectedCategories,
  onToggleCategory,
  renderAvatar,
  onMapCategory,
  mappingCategory,
  onStopMapping,
  stopping,
  selectedItems,
  onToggleItem
}: InstagramProfilePreviewProps) => {
  const { t } = useTranslation()
  const categoryInputPrefix = useId()

  if (loading && !inspection) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div>
          <p className="font-medium">{t('instagramProfile.scanning')}</p>
          <p className="mt-1 text-muted-foreground text-sm">{t('instagramProfile.scanningHint')}</p>
        </div>
      </div>
    )
  }

  if (error && !inspection) {
    return (
      <div className="m-1 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div>
          <p className="font-medium">{t('instagramProfile.scanFailed')}</p>
          <p className="mt-1 break-words text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!inspection) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
        <UserRound className="h-10 w-10 text-muted-foreground/60" />
        <div>
          <p className="font-medium">{t('instagramProfile.emptyTitle')}</p>
          <p className="mt-1 max-w-sm text-muted-foreground text-sm">
            {t('instagramProfile.emptyHint')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="py-4">
      {error && (
        <p
          className="mb-3 rounded-lg border border-destructive/30 p-3 text-destructive text-sm"
          role="alert"
        >
          {error}
        </p>
      )}
      <div className="mb-4 flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
        {inspection.profile.avatarUrl ? (
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
            {renderAvatar?.(inspection.profile.avatarUrl) ?? (
              <RemoteImage
                alt=""
                className="h-full w-full object-cover"
                fallbackIcon={<UserRound className="h-6 w-6 text-muted-foreground" />}
                placeholderClassName="h-full w-full"
                src={inspection.profile.avatarUrl}
              />
            )}
          </div>
        ) : (
          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
            <UserRound className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {inspection.profile.displayName || `@${inspection.profile.username}`}
          </p>
          <p className="truncate text-muted-foreground text-sm">@{inspection.profile.username}</p>
        </div>
        <div className="text-right text-muted-foreground text-xs">
          <p>{t('instagramProfile.sourceTotal', { count: inspection.totalSourceCount })}</p>
          <p>{t('instagramProfile.assetTotal', { count: inspection.totalAssetCount })}</p>
        </div>
      </div>

      <p className="mb-3 text-muted-foreground text-sm">{t('instagramResume.savedHint')}</p>
      {loading && onStopMapping && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border p-3">
          <p className="text-sm" role="status">
            {t(
              inspection.mapping?.state === 'queued'
                ? 'instagramResume.queued'
                : 'instagramProfile.scanning'
            )}
          </p>
          <Button disabled={stopping} onClick={onStopMapping} variant="outline">
            {t(stopping ? 'instagramResume.stopping' : 'instagramResume.stop')}
          </Button>
        </div>
      )}
      {!inspection.complete && inspection.categories.some((category) => category.errorCode) && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>{t('instagramProfile.partialHint')}</span>
        </div>
      )}

      <div className="grid gap-2">
        {inspection.categories.map((summary) => {
          const selectable =
            (summary.state === 'ready' || Boolean(summary.items?.length)) &&
            summary.assetCount > 0 &&
            (!summary.items?.length || summary.items.some((item) => !item.downloaded))
          const checkboxId = `${categoryInputPrefix}-${summary.category}`
          return (
            <div className="rounded-lg border p-3" key={summary.category}>
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={
                    selectedCategories.has(summary.category) &&
                    selectedItems &&
                    summary.items?.some((item) => !(item.downloaded || selectedItems.has(item.id)))
                      ? 'indeterminate'
                      : selectedCategories.has(summary.category)
                  }
                  disabled={!selectable}
                  id={checkboxId}
                  onCheckedChange={(checked) =>
                    onToggleCategory(summary.category, checked === true)
                  }
                />
                <Image aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                <label className="min-w-0 flex-1 cursor-pointer font-medium" htmlFor={checkboxId}>
                  {t(CATEGORY_KEYS[summary.category])}
                </label>
                {onMapCategory && (
                  <Button
                    disabled={loading}
                    onClick={() => onMapCategory(summary.category)}
                    size="sm"
                    variant="outline"
                  >
                    {mappingCategory === summary.category && (
                      <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />
                    )}
                    {t(
                      summary.mappedAt || summary.errorCode
                        ? 'instagramResume.retry'
                        : 'instagramResume.map'
                    )}
                  </Button>
                )}
              </div>
              <p className="mt-2 text-muted-foreground text-xs" role="status">
                {loading && mappingCategory === summary.category
                  ? t(
                      inspection.mapping?.state === 'queued'
                        ? 'instagramResume.queued'
                        : 'instagramProfile.scanning'
                    )
                  : summary.state === 'cancelled'
                    ? t('instagramResume.stopped')
                    : summary.errorCode === 'rate-limited'
                      ? t('profileCollections.rateLimited')
                      : summary.state === 'unscanned'
                        ? t('instagramResume.unscanned')
                        : summary.state === 'empty' && summary.category === 'stories'
                          ? t('instagramResume.noStory')
                          : t(`instagramProfile.states.${summary.state}`)}
                {selectable &&
                  ` · ${t('instagramProfile.categoryCounts', { sources: summary.sourceCount, assets: summary.assetCount })}`}
              </p>
              {summary.items && summary.items.length > 0 && onToggleItem && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm">
                    {t('instagramResume.chooseItems', { count: summary.items.length })}
                  </summary>
                  <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
                    {summary.items.map((item, index) => (
                      <label
                        className="flex cursor-pointer items-start gap-2 rounded-md bg-muted/20 p-2 text-sm"
                        htmlFor={`${checkboxId}-item-${index}`}
                        key={item.id}
                      >
                        <Checkbox
                          checked={
                            selectedItems?.has(item.id) ?? selectedCategories.has(summary.category)
                          }
                          disabled={item.downloaded}
                          id={`${checkboxId}-item-${index}`}
                          onCheckedChange={(checked) =>
                            onToggleItem(summary.category, item.id, checked === true)
                          }
                        />
                        <span className="min-w-0 flex-1 break-words">
                          {item.title || `${t(CATEGORY_KEYS[summary.category])} ${index + 1}`}
                          <span className="block text-muted-foreground text-xs">
                            {item.downloaded
                              ? t('download.completed')
                              : t('instagramProfile.assetTotal', { count: item.assetCount })}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
