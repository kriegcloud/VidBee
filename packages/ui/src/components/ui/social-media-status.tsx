import { Images } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './button'

interface CollectionSummary {
  posts: number
  images: number
  videos: number
  downloaded: number
  existing: number
  failed: number
  reason: 'exhausted' | 'limit' | 'incomplete'
}

export function SocialMediaStatus({
  summary,
  completed,
  onRefresh
}: {
  summary: CollectionSummary
  completed: boolean
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
      <Images aria-hidden="true" className="size-3.5" />
      <span>
        {t('socialMedia.counts', {
          posts: summary.posts,
          images: summary.images,
          videos: summary.videos,
          saved: summary.downloaded,
          existing: summary.existing,
          failed: summary.failed
        })}
      </span>
      {completed && (
        <span>
          {t(summary.reason === 'limit' ? 'socialMedia.limited' : 'socialMedia.exhausted')}
        </span>
      )}
      {completed && (
        <Button
          className="h-7 text-xs"
          onClick={(event) => {
            event.stopPropagation()
            onRefresh()
          }}
          size="sm"
          variant="ghost"
        >
          {t('socialMedia.refresh')}
        </Button>
      )}
    </div>
  )
}
