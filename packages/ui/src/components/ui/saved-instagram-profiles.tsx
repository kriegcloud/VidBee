import { FolderOpen, Loader2, Search } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './button'
import { Input } from './input'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

const REFRESH_INTERVAL_MS = 4000
const ACTIVE_FILTER = 'active'
const ALL_FILTER = 'all'

export interface SavedProfile {
  mapping?: { state: 'queued' | 'running' }
  inspectionId: string
  /** Stable site key used by the site filter, e.g. `instagram` or `onlyfans`. */
  platform: string
  /** Human readable site name shown beside the username. */
  platformLabel: string
  profile: { username: string; profileUrl: string }
  totalAssetCount: number
}

const isActive = (profile: SavedProfile) => profile.mapping !== undefined

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
  const [siteFilter, setSiteFilter] = useState<string>(ALL_FILTER)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const listId = useId()

  const activeCount = useMemo(() => profiles.filter(isActive).length, [profiles])

  const sites = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>()
    for (const profile of profiles) {
      const entry = counts.get(profile.platform)
      if (entry) {
        entry.count += 1
      } else {
        counts.set(profile.platform, { label: profile.platformLabel, count: 1 })
      }
    }
    return [...counts.entries()]
      .map(([platform, entry]) => ({ platform, ...entry }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [profiles])

  const filteredProfiles = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    const matching = profiles.filter((profile) => {
      if (siteFilter === ACTIVE_FILTER) {
        if (!isActive(profile)) {
          return false
        }
      } else if (siteFilter !== ALL_FILTER && profile.platform !== siteFilter) {
        return false
      }
      if (!search) {
        return true
      }
      return `${profile.profile.username} ${profile.platformLabel} ${profile.profile.profileUrl}`
        .toLocaleLowerCase()
        .includes(search)
    })
    // Surface the profiles that are mapping right now without reordering the rest.
    return [...matching.filter(isActive), ...matching.filter((profile) => !isActive(profile))]
  }, [profiles, query, siteFilter])

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const selectProfile = (profile: SavedProfile) => {
    setOpen(false)
    onSelect(profile.profile.profileUrl)
  }

  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true)
      }
      setError(null)
      try {
        setProfiles(await loadProfiles())
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : t('instagramProfile.scanFailed'))
      } finally {
        if (!silent) {
          setLoading(false)
        }
      }
    },
    [loadProfiles, t]
  )

  // Hold the latest loader so a re-rendered parent cannot keep resetting the timer below.
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])

  // Keep the mapping indicators honest while the dropdown stays open.
  useEffect(() => {
    if (!open) {
      return
    }
    const timer = setInterval(() => {
      void loadRef.current(true)
    }, REFRESH_INTERVAL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [open])

  const resetActive = () => {
    setActiveIndex(0)
    listRef.current?.scrollTo({ top: 0 })
  }

  const filterChipClass = (selected: boolean) =>
    `shrink-0 cursor-pointer rounded-full border px-2 py-0.5 text-xs transition-colors ${
      selected
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    }`

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setQuery('')
          setSiteFilter(ALL_FILTER)
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
        className="w-96 p-1"
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
              resetActive()
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
        {sites.length > 1 || activeCount > 0 ? (
          <fieldset
            aria-label={t('instagramResume.filterBySite')}
            className="m-0 flex min-w-0 flex-wrap gap-1 border-0 px-1 pt-0 pb-1"
          >
            <button
              aria-pressed={siteFilter === ALL_FILTER}
              className={filterChipClass(siteFilter === ALL_FILTER)}
              onClick={() => {
                setSiteFilter(ALL_FILTER)
                resetActive()
              }}
              type="button"
            >
              {t('instagramResume.allSites')} {profiles.length}
            </button>
            {activeCount > 0 ? (
              <button
                aria-pressed={siteFilter === ACTIVE_FILTER}
                className={filterChipClass(siteFilter === ACTIVE_FILTER)}
                onClick={() => {
                  setSiteFilter(ACTIVE_FILTER)
                  resetActive()
                }}
                type="button"
              >
                {t('instagramResume.mappingNow')} {activeCount}
              </button>
            ) : null}
            {sites.map((site) => (
              <button
                aria-pressed={siteFilter === site.platform}
                className={filterChipClass(siteFilter === site.platform)}
                key={site.platform}
                onClick={() => {
                  setSiteFilter(site.platform)
                  resetActive()
                }}
                type="button"
              >
                {site.label} {site.count}
              </button>
            ))}
          </fieldset>
        ) : null}
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
                <span className="shrink-0 rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground uppercase tracking-wide">
                  {profile.platformLabel}
                </span>
                {profile.mapping ? (
                  <span className="flex shrink-0 items-center gap-1 text-primary text-xs">
                    <Loader2 aria-hidden className="size-3 animate-spin" />
                    {t(
                      profile.mapping.state === 'queued'
                        ? 'instagramResume.queued'
                        : 'instagramResume.mappingNow'
                    )}
                  </span>
                ) : (
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {t('instagramProfile.assetTotal', { count: profile.totalAssetCount })}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
