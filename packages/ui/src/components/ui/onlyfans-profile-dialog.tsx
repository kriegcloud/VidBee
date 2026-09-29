import type {
  OnlyFansCommand,
  OnlyFansDownload,
  OnlyFansProfile
} from '@vidbee/downloader-core/onlyfans-profile'
import { useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './button'
import { Checkbox } from './checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog'
import { Input } from './input'

interface Props {
  url: string
  destination: string
  onClose: () => void
  command: (input: OnlyFansCommand) => Promise<OnlyFansProfile>
  download: (input: OnlyFansDownload) => Promise<{ count: number }>
}

/** Shared profile controls; desktop IPC and web RPC supply the same contract. */
export function OnlyFansProfileDialog({ url, destination, onClose, command, download }: Props) {
  const { t } = useTranslation()
  const inputId = useId()
  const [profile, setProfile] = useState<OnlyFansProfile | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [category, setCategory] = useState<'photos' | 'videos'>('photos')
  const [directory, setDirectory] = useState(destination)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const refresh = useCallback(async () => {
    const value = await command({ url, action: 'get' })
    setProfile(value)
  }, [command, url])
  useEffect(() => {
    let disposed = false
    let pending = false
    const read = async () => {
      if (pending) {
        return
      }
      pending = true
      try {
        const value = await command({ url, action: 'get' })
        if (!disposed) {
          setProfile(value)
        }
      } catch (failure) {
        if (!disposed) {
          setError(failure instanceof Error ? failure.message : t('notifications.downloadFailed'))
        }
      } finally {
        pending = false
      }
    }
    void read()
    const timer = setInterval(() => {
      void read()
    }, 1500)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [command, url, t])
  const act = async (action: OnlyFansCommand['action']) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      setProfile(await command({ url, action, category }))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('notifications.downloadFailed'))
    } finally {
      setBusy(false)
    }
  }
  const items = profile?.items.filter((item) => item.category === category) ?? []
  const mapping = profile?.state === 'mapping'
  const stateLabels = {
    idle: 'instagramResume.unscanned',
    mapping: 'onlyFans.mapping',
    partial: 'onlyFans.partial',
    complete: 'instagramProfile.states.ready',
    'auth-required': 'instagramProfile.states.auth-required',
    error: 'instagramProfile.states.unavailable'
  }
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
          <DialogTitle>OnlyFans · @{profile?.username ?? ''}</DialogTitle>
          <DialogDescription>{t('onlyFans.sessionHint')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || mapping}
            onClick={() => {
              void act('open')
            }}
            variant="outline"
          >
            {t('onlyFans.openBrowser')}
          </Button>
          {(['photos', 'videos'] as const).map((value) => (
            <Button
              key={value}
              onClick={() => {
                setCategory(value)
                setSelected(new Set())
              }}
              variant={category === value ? 'default' : 'outline'}
            >
              {t(value === 'photos' ? 'profileCollections.photos' : 'onlyFans.videos')}
            </Button>
          ))}
          <Button
            disabled={busy}
            onClick={() => {
              void act(mapping ? 'stop' : 'map')
            }}
            variant="outline"
          >
            {t(mapping ? 'instagramResume.stop' : 'instagramResume.map')}
          </Button>
        </div>
        <p aria-live="polite" className="text-muted-foreground text-sm" role="status">
          {profile
            ? t(
                stateLabels[
                  profile.category && profile.category !== category && !mapping
                    ? 'idle'
                    : profile.state
                ]
              )
            : t('download.loading')}
          {' · '}
          {t('instagramProfile.sourceTotal', { count: items.length })}
        </p>
        {profile?.state === 'auth-required' && (
          <p className="text-sm">{t('onlyFans.sessionHint')}</p>
        )}
        {(error || profile?.error) && (
          <p className="break-words text-destructive text-sm" role="alert">
            {error || profile?.error}
          </p>
        )}
        {notice && (
          <p className="text-sm" role="status">
            {notice}
          </p>
        )}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          <Button
            disabled={!items.some((item) => item.state === 'available' && !item.downloaded)}
            onClick={() => {
              setSelected(
                new Set(
                  items
                    .filter((item) => item.state === 'available' && !item.downloaded)
                    .map((item) => item.id)
                )
              )
            }}
            variant="outline"
          >
            {t('history.selectAll')}
          </Button>
          {items.map((item) => (
            <label
              className="flex items-center gap-3 rounded-md border p-3 text-sm"
              htmlFor={`${inputId}-${item.id}`}
              key={item.id}
            >
              <Checkbox
                checked={selected.has(item.id)}
                disabled={item.state !== 'available'}
                id={`${inputId}-${item.id}`}
                onCheckedChange={(checked) => {
                  setSelected((previous) => {
                    const next = new Set(previous)
                    if (checked) {
                      next.add(item.id)
                    } else {
                      next.delete(item.id)
                    }
                    return next
                  })
                }}
              />
              <span className="min-w-0 flex-1">
                {item.postId} / {item.id}
              </span>
              <span className="text-muted-foreground">
                {item.downloaded
                  ? t('download.completed')
                  : item.state === 'available'
                    ? t('instagramProfile.states.ready')
                    : item.state === 'drm'
                      ? 'DRM'
                      : t('onlyFans.locked')}
              </span>
            </label>
          ))}
        </div>
        <div className="shrink-0 space-y-3 border-t pt-3">
          <label className="space-y-1 text-sm" htmlFor={inputId}>
            {t('settings.downloadPath')}
            <Input
              id={inputId}
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
                const result = await download({
                  url,
                  itemIds: [...selected],
                  customDownloadPath: directory.trim() || undefined
                })
                setNotice(
                  result.count
                    ? t('onlyFans.queued', { count: result.count })
                    : t('instagramResume.alreadySaved')
                )
                setSelected(new Set())
                await refresh()
              } catch (failure) {
                setError(
                  failure instanceof Error ? failure.message : t('notifications.downloadFailed')
                )
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('instagramProfile.downloadSelected')} ({selected.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
