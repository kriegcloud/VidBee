import type { SocialMediaOptions, SocialMediaPreview } from '@vidbee/downloader-core/social-media'
import {
  DEFAULT_SOCIAL_MEDIA_OPTIONS,
  resolveSocialSource,
  SocialMediaOptionsSchema
} from '@vidbee/downloader-core/social-media'
import type { SocialMediaDownloadRequest } from '@vidbee/downloader-core/social-media-service'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog'
import { Input } from './input'

interface SocialMediaDialogProps {
  url: string
  destination?: string
  onClose: () => void
  onDownload: (request: SocialMediaDownloadRequest) => Promise<unknown>
  onVideoOptions: (url: string) => void
  onInspect: (url: string) => Promise<{ preview: SocialMediaPreview }>
}

/** Identical collection controls on desktop and web; hosts provide only I/O. */
export function SocialMediaDialog({
  url,
  destination,
  onClose,
  onDownload,
  onVideoOptions,
  onInspect
}: SocialMediaDialogProps) {
  const { t } = useTranslation()
  const id = useId()
  const source = resolveSocialSource(url)
  const [options, setOptions] = useState<SocialMediaOptions>({ ...DEFAULT_SOCIAL_MEDIA_OPTIONS })
  const [categories, setCategories] = useState<string[]>([])
  const [path, setPath] = useState(destination ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<SocialMediaPreview | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const supported = source && source.kind !== 'unsupported'
  const setFlag = (
    key: 'authorOnly' | 'expandThreads' | 'linkedMedia' | 'slideshowAudio',
    checked: boolean
  ) => {
    setOptions((previous) => ({ ...previous, [key]: checked }))
  }
  const start = async () => {
    setBusy(true)
    setError('')
    try {
      const parsed = SocialMediaOptionsSchema.parse(options)
      await onDownload({
        url,
        options: parsed,
        categories: categories.length ? categories : undefined,
        customDownloadPath: path.trim() || undefined
      })
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('notifications.downloadFailed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!(open || busy)) {
          onClose()
        }
      }}
      open
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('socialMedia.title')}</DialogTitle>
          <DialogDescription className="break-all">{url}</DialogDescription>
        </DialogHeader>
        {supported ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void start()
            }}
          >
            <p className="rounded-md bg-muted p-3 text-sm">{t('socialMedia.quality')}</p>
            <p className="text-muted-foreground text-xs">{t('socialMedia.available')}</p>
            {source.requiresAuth && <p className="text-sm">{t('socialMedia.auth')}</p>}
            <div className="space-y-2">
              <Button
                disabled={busy || previewBusy}
                onClick={async () => {
                  setPreviewBusy(true)
                  setError('')
                  try {
                    setPreview((await onInspect(url)).preview)
                  } catch (failure) {
                    setError(
                      failure instanceof Error ? failure.message : t('notifications.downloadFailed')
                    )
                  } finally {
                    setPreviewBusy(false)
                  }
                }}
                type="button"
                variant="outline"
              >
                {t('socialMedia.preview')}
                {previewBusy ? '…' : ''}
              </Button>
              {preview && (
                <p className="text-sm" role="status">
                  {t('socialMedia.previewCounts', { ...preview })}
                </p>
              )}
            </div>
            <fieldset className="space-y-4" disabled={busy}>
              <label className="grid gap-1 text-sm" htmlFor={`${id}-media`}>
                {t('socialMedia.media')}
                <select
                  className="h-9 rounded-md border bg-background px-3"
                  id={`${id}-media`}
                  onChange={(event) =>
                    setOptions({
                      ...options,
                      media: SocialMediaOptionsSchema.parse({ media: event.target.value }).media
                    })
                  }
                  value={options.media}
                >
                  <option value="all">{t('socialMedia.all')}</option>
                  <option value="images">{t('socialMedia.images')}</option>
                  <option value="videos">{t('socialMedia.videos')}</option>
                </select>
              </label>
              {source.supportsThread && (
                <label className="grid gap-1 text-sm" htmlFor={`${id}-scope`}>
                  {t('socialMedia.scope')}
                  <select
                    className="h-9 rounded-md border bg-background px-3"
                    id={`${id}-scope`}
                    onChange={(event) =>
                      setOptions({
                        ...options,
                        scope: event.target.value === 'thread' ? 'thread' : 'post'
                      })
                    }
                    value={options.scope}
                  >
                    <option value="post">{t('socialMedia.post')}</option>
                    <option value="thread">{t('socialMedia.thread')}</option>
                  </select>
                </label>
              )}
              {source.kind === 'profile' && (
                <fieldset className="flex flex-wrap gap-3">
                  <legend className="mb-2 text-sm">{t('socialMedia.categoriesLabel')}</legend>
                  {source.categories.map((category) => (
                    <label className="flex items-center gap-2 text-sm" key={category.key}>
                      <input
                        checked={
                          categories.length
                            ? categories.includes(category.key)
                            : category.key ===
                              (source.platform === 'x'
                                ? 'tweets'
                                : source.platform === 'reddit'
                                  ? 'submitted'
                                  : 'posts')
                        }
                        onChange={(event) => {
                          const current = categories.length
                            ? categories
                            : [
                                source.platform === 'x'
                                  ? 'tweets'
                                  : source.platform === 'reddit'
                                    ? 'submitted'
                                    : 'posts'
                              ]
                          const next = event.target.checked
                            ? [...current, category.key]
                            : current.filter((key) => key !== category.key)
                          if (next.length) {
                            setCategories(next)
                          }
                        }}
                        type="checkbox"
                      />
                      {t(`socialMedia.categories.${category.key}`)}
                    </label>
                  ))}
                </fieldset>
              )}
              {source.platform !== 'tiktok' && source.kind !== 'image' && (
                <>
                  {source.kind !== 'post' && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        checked={options.expandThreads}
                        onChange={(event) => setFlag('expandThreads', event.target.checked)}
                        type="checkbox"
                      />
                      {t('socialMedia.expandThreads')}
                    </label>
                  )}
                  {(options.scope === 'thread' || options.expandThreads) && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        checked={options.authorOnly}
                        onChange={(event) => setFlag('authorOnly', event.target.checked)}
                        type="checkbox"
                      />
                      {t('socialMedia.authorOnly')}
                    </label>
                  )}
                </>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={options.linkedMedia}
                  onChange={(event) => setFlag('linkedMedia', event.target.checked)}
                  type="checkbox"
                />
                {t('socialMedia.linkedMedia')}
              </label>
              {source.platform === 'tiktok' && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    checked={options.slideshowAudio}
                    onChange={(event) => setFlag('slideshowAudio', event.target.checked)}
                    type="checkbox"
                  />
                  {t('socialMedia.audio')}
                </label>
              )}
              <div className="grid grid-cols-3 gap-3">
                <label className="grid gap-1 text-sm" htmlFor={`${id}-max`}>
                  {t('socialMedia.limit')}
                  <Input
                    id={`${id}-max`}
                    max={1_000_000}
                    min={1}
                    onChange={(event) =>
                      setOptions({
                        ...options,
                        maxPosts: event.target.value ? Number(event.target.value) : undefined
                      })
                    }
                    placeholder="∞"
                    type="number"
                    value={options.maxPosts ?? ''}
                  />
                </label>
                <label className="grid gap-1 text-sm" htmlFor={`${id}-since`}>
                  {t('socialMedia.since')}
                  <Input
                    id={`${id}-since`}
                    onChange={(event) =>
                      setOptions({ ...options, since: event.target.value || undefined })
                    }
                    type="date"
                    value={options.since ?? ''}
                  />
                </label>
                <label className="grid gap-1 text-sm" htmlFor={`${id}-until`}>
                  {t('socialMedia.until')}
                  <Input
                    id={`${id}-until`}
                    onChange={(event) =>
                      setOptions({ ...options, until: event.target.value || undefined })
                    }
                    type="date"
                    value={options.until ?? ''}
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm" htmlFor={`${id}-path`}>
                {t('socialMedia.destination')}
                <Input
                  id={`${id}-path`}
                  onChange={(event) => setPath(event.target.value)}
                  value={path}
                />
              </label>
            </fieldset>
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              {source.kind === 'post' && source.category !== 'photo' && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    onClose()
                    onVideoOptions(url)
                  }}
                  type="button"
                  variant="ghost"
                >
                  {t('socialMedia.videoOptions')}
                </Button>
              )}
              <Button disabled={busy || previewBusy} type="submit">
                {t(busy ? 'socialMedia.starting' : 'socialMedia.download')}
              </Button>
            </div>
          </form>
        ) : (
          <p role="alert">{t('socialMedia.unsupported')}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
