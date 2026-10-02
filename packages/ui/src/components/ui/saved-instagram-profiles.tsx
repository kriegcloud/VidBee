import { FolderOpen, Loader2, Search } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './button'
import { Input } from './input'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

interface SavedProfile {
  mapping?: { state: 'queued' | 'running' }
  inspectionId: string
  profile: { username: string; profileUrl: string }
  totalAssetCount: number
}

export function SavedInstagramProfiles({
  loadProfiles,
  onSelect
}: {
  loadProfiles: () => Promise<SavedProfile[]>
  onSelect: (url: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [profiles, setProfiles] = useState<SavedProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const listId = useId()
  const filteredProfiles = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    if (!search) {
      return profiles
    }
    return profiles.filter(({ profile }) =>
      `${profile.username} ${profile.profileUrl}`.toLocaleLowerCase().includes(search)
    )
  }, [profiles, query])

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const selectProfile = (profile: SavedProfile) => {
    setOpen(false)
    onSelect(profile.profile.profileUrl)
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setProfiles(await loadProfiles())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('instagramProfile.scanFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setQuery('')
          setActiveIndex(0)
          void load()
        }
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <Button variant="outline">
          <FolderOpen aria-hidden className="size-4" />
          {t('instagramResume.savedProfiles')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-1"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <div className="relative p-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-activedescendant={
              filteredProfiles.length > 0 && !loading && !error
                ? `${listId}-${Math.min(activeIndex, filteredProfiles.length - 1)}`
                : undefined
            }
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={open}
            className="pl-8"
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
              listRef.current?.scrollTo({ top: 0 })
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && filteredProfiles.length > 0) {
                event.preventDefault()
                setActiveIndex((index) => (index + 1) % filteredProfiles.length)
              } else if (event.key === 'ArrowUp' && filteredProfiles.length > 0) {
                event.preventDefault()
                setActiveIndex(
                  (index) => (index - 1 + filteredProfiles.length) % filteredProfiles.length
                )
              } else if (
                event.key === 'Enter' &&
                !loading &&
                !error &&
                filteredProfiles.length > 0
              ) {
                event.preventDefault()
                selectProfile(filteredProfiles[Math.min(activeIndex, filteredProfiles.length - 1)])
              }
            }}
            placeholder={t('instagramResume.searchSavedProfiles')}
            ref={inputRef}
            role="combobox"
            value={query}
          />
        </div>
        <div
          aria-label={t('instagramResume.savedProfiles')}
          className="max-h-72 overflow-y-auto"
          id={listId}
          ref={listRef}
          role="listbox"
        >
          {loading ? (
            <div
              aria-label={t('download.loading')}
              className="flex justify-center p-4"
              role="status"
            >
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : error ? (
            <p className="p-3 text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : profiles.length === 0 ? (
            <p className="p-3 text-muted-foreground text-sm">
              {t('instagramResume.noSavedProfiles')}
            </p>
          ) : filteredProfiles.length === 0 ? (
            <p className="p-3 text-muted-foreground text-sm">
              {t('instagramResume.noMatchingProfiles')}
            </p>
          ) : (
            filteredProfiles.map((profile, index) => (
              <button
                aria-selected={index === activeIndex}
                className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                data-active={index === activeIndex}
                id={`${listId}-${index}`}
                key={profile.inspectionId}
                onClick={() => selectProfile(profile)}
                onMouseEnter={() => setActiveIndex(index)}
                ref={(element) => {
                  optionRefs.current[index] = element
                }}
                role="option"
                type="button"
              >
                <span className="min-w-0 flex-1 truncate">@{profile.profile.username}</span>
                <span className="shrink-0 text-muted-foreground text-xs">
                  {profile.mapping
                    ? t(
                        profile.mapping.state === 'queued'
                          ? 'instagramResume.queued'
                          : 'instagramProfile.scanning'
                      )
                    : t('instagramProfile.assetTotal', { count: profile.totalAssetCount })}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
