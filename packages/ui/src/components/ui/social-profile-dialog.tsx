import { resolveSocialSource } from '@vidbee/downloader-core/social-media'
import type { SocialMappedProfile } from '@vidbee/downloader-core/social-media-service'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './button'
import { Checkbox } from './checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog'
import { Input } from './input'

interface Props {
  url: string
  destination?: string
  onClose: () => void
  getProfile: (url: string) => Promise<SocialMappedProfile>
  openLogin?: (url: string) => Promise<unknown>
  mapProfile: (url: string, category: string) => Promise<SocialMappedProfile>
  stopProfile: (url: string) => Promise<SocialMappedProfile>
  downloadItems: (
    url: string,
    category: string,
    ids: string[],
    destination?: string
  ) => Promise<{ count: number }>
}

/** Saved post references are mapped before any media download is queued. */
export function SocialProfileDialog({
  url,
  destination,
  onClose,
  getProfile,
  openLogin,
  mapProfile,
  stopProfile,
  downloadItems
}: Props) {
  const { t } = useTranslation()
  const inputId = useId()
  const getProfileRef = useRef(getProfile)
  getProfileRef.current = getProfile
  const source = resolveSocialSource(url)
  const [profile, setProfile] = useState<SocialMappedProfile | null>(null)
  const [category, setCategory] = useState(
    source?.categories.find((entry) => entry.key === source.category)?.key ??
      source?.categories[0]?.key ??
      'posts'
  )
  const [selected, setSelected] = useState(new Set<string>())
  const [directory, setDirectory] = useState(destination ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let disposed = false
    const refresh = async () => {
      try {
        const value = await getProfileRef.current(url)
        if (!disposed) {
          setProfile(value)
        }
      } catch (failure) {
        if (!disposed) {
          setError(failure instanceof Error ? failure.message : t('notifications.downloadFailed'))
        }
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 1500)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [t, url])

  const act = async (action: 'open' | 'map' | 'stop') => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (action === 'open') {
        await openLogin?.(url)
      } else if (action === 'map') {
        setProfile(await mapProfile(url, category))
      } else {
        setProfile(await stopProfile(url))
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('notifications.downloadFailed'))
    } finally {
      setBusy(false)
    }
  }
  const mapped = profile?.categories[category]
  const items = mapped?.items ?? []
  const mapping = mapped?.state === 'mapping'
  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id))
  const stateKey = {
    unscanned: 'instagramResume.unscanned',
    mapping: 'onlyFans.mapping',
    partial: 'onlyFans.partial',
    complete: 'instagramProfile.states.ready',
    'auth-required': 'instagramProfile.states.auth-required',
    error: 'instagramProfile.states.unavailable'
  } as const

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
      open
    >
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {source?.platform === 'x' ? 'X' : 'TikTok'} · {profile?.owner ?? source?.owner}
          </DialogTitle>
          <DialogDescription>{t('socialMedia.categoriesLabel')}</DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          {t(openLogin ? 'socialMedia.profileSessionHint' : 'socialMedia.auth')}
        </p>
        <div className="flex flex-wrap gap-2">
          {openLogin && (
            <Button disabled={busy || mapping} onClick={() => void act('open')} variant="outline">
              {t('onlyFans.openBrowser')}
            </Button>
          )}
          <Button
            disabled={busy}
            onClick={() => void act(mapping ? 'stop' : 'map')}
            variant="outline"
          >
            {t(mapping ? 'instagramResume.stop' : 'instagramResume.map')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {source?.categories.map((entry) => (
            <Button
              key={entry.key}
              onClick={() => {
                setCategory(entry.key)
                setSelected(new Set())
              }}
              size="sm"
              variant={category === entry.key ? 'default' : 'outline'}
            >
              {t(`socialMedia.categories.${entry.key}`)}
            </Button>
          ))}
        </div>
        <p aria-live="polite" className="text-muted-foreground text-sm" role="status">
          {mapped ? t(stateKey[mapped.state]) : t('download.loading')}
          {' · '}
          {t('instagramProfile.sourceTotal', { count: items.length })}
        </p>
        {(error || mapped?.error) && (
          <p className="break-words text-destructive text-sm" role="alert">
            {error || mapped?.error}
          </p>
        )}
        {notice && (
          <p className="text-sm" role="status">
            {notice}
          </p>
        )}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          <Button
            disabled={items.length === 0}
            onClick={() =>
              setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))
            }
            variant="outline"
          >
            {allSelected ? t('history.clearSelection') : t('history.selectAll')}
          </Button>
          {items.map((item) => (
            <label
              className="flex items-center gap-3 rounded-md border p-3 text-sm"
              htmlFor={`${inputId}-${item.id}`}
              key={item.id}
            >
              <Checkbox
                checked={selected.has(item.id)}
                id={`${inputId}-${item.id}`}
                onCheckedChange={(checked) =>
                  setSelected((previous) => {
                    const next = new Set(previous)
                    if (checked) {
                      next.add(item.id)
                    } else {
                      next.delete(item.id)
                    }
                    return next
                  })
                }
              />
              <span className="min-w-0 flex-1 truncate">
                {item.author} · {item.id}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {item.images} 🖼 · {item.videos} ▶
              </span>
            </label>
          ))}
        </div>
        <div className="shrink-0 space-y-3 border-t pt-3">
          <label className="grid gap-1 text-sm" htmlFor={`${inputId}-directory`}>
            {t('settings.downloadPath')}
            <Input
              id={`${inputId}-directory`}
              onChange={(event) => setDirectory(event.target.value)}
              value={directory}
            />
          </label>
          <Button
            className="w-full"
            disabled={busy || mapping || selected.size === 0}
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                const result = await downloadItems(
                  url,
                  category,
                  [...selected],
                  directory.trim() || undefined
                )
                setNotice(t('onlyFans.queued', { count: result.count }))
                setSelected(new Set())
              } catch (failure) {
                setError(
                  failure instanceof Error ? failure.message : t('notifications.downloadFailed')
                )
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('instagramProfile.downloadSelected')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
