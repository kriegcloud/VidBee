import { AlertCircle, Image, Loader2, LockKeyhole, UserRound } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from './checkbox'
import { RemoteImage } from './remote-image'

export type InstagramProfileCategory = 'posts' | 'reels' | 'stories' | 'highlights' | 'tagged'

export interface InstagramCategoryPreview {
  category: InstagramProfileCategory
  state: 'ready' | 'empty' | 'auth-required' | 'unavailable'
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
  renderAvatar
}: InstagramProfilePreviewProps) => {
  const { t } = useTranslation()
  const categoryInputPrefix = useId()

  if (loading) {
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

  if (error) {
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
    <div className="min-h-0 flex-1 overflow-y-auto py-4">
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

      {!inspection.complete && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>{t('instagramProfile.partialHint')}</span>
        </div>
      )}

      <div className="grid gap-2">
        {inspection.categories.map((summary) => {
          const selectable = summary.state === 'ready' && summary.assetCount > 0
          const checkboxId = `${categoryInputPrefix}-${summary.category}`
          return (
            <label
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                selectable ? 'cursor-pointer hover:bg-muted/30' : 'cursor-not-allowed opacity-60'
              }`}
              htmlFor={checkboxId}
              key={summary.category}
            >
              <Checkbox
                checked={selectedCategories.has(summary.category)}
                disabled={!selectable}
                id={checkboxId}
                onCheckedChange={(checked) => {
                  onToggleCategory(summary.category, checked === true)
                }}
              />
              <Image className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 font-medium">
                {t(CATEGORY_KEYS[summary.category])}
              </span>
              <span className="text-right text-muted-foreground text-xs">
                {selectable
                  ? t('instagramProfile.categoryCounts', {
                      sources: summary.sourceCount,
                      assets: summary.assetCount
                    })
                  : t(`instagramProfile.states.${summary.state}`)}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
