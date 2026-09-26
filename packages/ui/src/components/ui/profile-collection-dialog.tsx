import type { SocialMediaPreview } from '@vidbee/downloader-core/social-media'
import { Check, Image, Loader2, LockKeyhole } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CollectionProfile, ProfileCollection } from '../../lib/url-kind'
import { Button } from './button'
import { Checkbox } from './checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog'
import { DownloadPlatformIcon } from './download-platform-icon'
import { Input } from './input'

interface ProfileCollectionDialogProps {
  profile: CollectionProfile
  destination?: string
  onClose: () => void
  onDownload: (collection: ProfileCollection, destination: string) => Promise<unknown>
  onInspect?: (url: string) => Promise<{ preview: SocialMediaPreview }>
}

/** Shared profile picker. Counts are samples only, never a claim of full inventory. */
export function ProfileCollectionDialog({
  profile,
  destination,
  onClose,
  onDownload,
  onInspect
}: ProfileCollectionDialogProps) {
  const { t } = useTranslation()
  const id = useId()
  const [selected, setSelected] = useState(new Set([profile.selected]))
  const [queued, setQueued] = useState(new Set<string>())
  const [path, setPath] = useState(destination ?? '')
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, SocialMediaPreview>>({})
  const [error, setError] = useState('')
  const pending = profile.collections.filter(
    (item) => selected.has(item.key) && !queued.has(item.key)
  )
  const locked = busy || scanning !== null
  const start = async () => {
    setBusy(true)
    setError('')
    try {
      for (const item of pending) {
        await onDownload(item, path.trim())
        setQueued((previous) => new Set([...previous, item.key]))
      }
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('notifications.downloadFailed'))
    } finally {
      setBusy(false)
    }
  }
  const inspect = async (item: ProfileCollection) => {
    if (!onInspect) {
      return
    }
    setScanning(item.key)
    setError('')
    try {
      const result = await onInspect(item.url)
      setPreviews((previous) => ({ ...previous, [item.key]: result.preview }))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('notifications.downloadFailed'))
    } finally {
      setScanning(null)
    }
  }
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!(open || locked)) {
          onClose()
        }
      }}
      open
    >
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {profile.platform} · {t('socialMedia.categoriesLabel')}
          </DialogTitle>
          <DialogDescription>{t('socialMedia.available')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-muted">
              <DownloadPlatformIcon className="size-6" domain={profile.domain} />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">{profile.owner}</p>
              <p className="text-muted-foreground text-sm">{profile.platform}</p>
            </div>
          </div>
          <p className="text-muted-foreground text-sm">{t('profileCollections.countHint')}</p>
          <fieldset className="grid gap-2" disabled={locked}>
            <legend className="sr-only">{t('socialMedia.categoriesLabel')}</legend>
            {profile.collections.map((item) => (
              <div
                className="rounded-lg border bg-muted/5 transition-colors has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
                key={item.key}
              >
                <label
                  className="flex cursor-pointer items-center gap-3 p-4"
                  htmlFor={`${id}-${item.key}`}
                >
                  <Checkbox
                    checked={selected.has(item.key)}
                    disabled={locked || queued.has(item.key)}
                    id={`${id}-${item.key}`}
                    onCheckedChange={(checked) =>
                      setSelected((previous) => {
                        const next = new Set(previous)
                        if (checked === true) {
                          next.add(item.key)
                        } else {
                          next.delete(item.key)
                        }
                        return next
                      })
                    }
                  />
                  <Image aria-hidden className="size-4 text-muted-foreground" />
                  <span className="flex-1 font-medium">{t(item.labelKey)}</span>
                  {queued.has(item.key) ? (
                    <Check
                      aria-label={t('download.oneClickDownloadStarted')}
                      className="size-4 text-primary"
                    />
                  ) : (
                    item.requiresAuth && (
                      <LockKeyhole
                        aria-label={t('socialMedia.auth')}
                        className="size-4 text-muted-foreground"
                      />
                    )
                  )}
                </label>
                {onInspect && (
                  <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
                    <Button
                      disabled={locked}
                      onClick={() => {
                        void inspect(item)
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      {scanning === item.key && (
                        <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />
                      )}
                      {t('socialMedia.preview')}
                    </Button>
                    {previews[item.key] && (
                      <p className="text-muted-foreground text-xs" role="status">
                        {t('socialMedia.previewCounts', { ...previews[item.key] })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </fieldset>
          {profile.collections.some((item) => item.requiresAuth) && (
            <p className="text-muted-foreground text-xs">{t('socialMedia.auth')}</p>
          )}
          <label className="grid gap-2 text-sm" htmlFor={`${id}-path`}>
            {t('socialMedia.destination')}
            <Input
              disabled={locked}
              id={`${id}-path`}
              onChange={(event) => setPath(event.target.value)}
              value={path}
            />
          </label>
          {error && (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button disabled={locked} onClick={onClose} variant="ghost">
            {t('download.cancel')}
          </Button>
          <Button
            disabled={locked || pending.length === 0}
            onClick={() => {
              void start()
            }}
          >
            {busy && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            {t(busy ? 'socialMedia.starting' : 'instagramProfile.downloadSelected')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
