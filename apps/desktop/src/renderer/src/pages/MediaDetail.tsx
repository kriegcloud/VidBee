import { ImageEditor } from '@renderer/components/media/ImageEditor'
import { MediaConfirmDialog } from '@renderer/components/media/MediaConfirmDialog'
import { MediaGrid } from '@renderer/components/media/MediaGrid'
import { MediaInfoPanel } from '@renderer/components/media/MediaInfoPanel'
import { MediaViewer } from '@renderer/components/media/MediaViewer'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { useTitleBar } from '@renderer/desktop-chrome'
import { ipcServices } from '@renderer/lib/ipc'
import {
  forgetMediaThumbnails,
  isStillOrAnimated,
  useMediaInventory
} from '@renderer/lib/media-inventory'
import { cn } from '@renderer/lib/utils'
import type {
  EditedImageSaveMode,
  MediaAsset,
  MediaInventoryScope
} from '@shared/types/media-assets'
import { Navigate, useNavigate, useParams } from '@tanstack/react-router'
import { NoDrag } from '@vidbee/ui/components/ui/drag-region'
import { useAtomValue } from 'jotai'
import {
  ChevronLeft,
  FolderOpen,
  Grid2x2,
  Grid3x3,
  ImageOff,
  Loader2,
  PanelRight
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { downloadRecordsAtom } from '../store/downloads'
import { TranscriptPage } from './Transcript'

type KindFilter = 'all' | 'images' | 'videos'

const TILE_SIZES = { comfortable: 220, compact: 140 } as const
type TileDensity = keyof typeof TILE_SIZES

const INFO_STORAGE_KEY = 'vidbee.media.infoOpen'
const DENSITY_STORAGE_KEY = 'vidbee.media.density'

const readPreference = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const writePreference = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Preferences are a convenience; ignore storage failures.
  }
}

const sizeKey = (asset: MediaAsset): string => `${asset.id}:${asset.mtimeMs}`

const matchesFilter = (asset: MediaAsset, filter: KindFilter): boolean => {
  if (filter === 'images') {
    return isStillOrAnimated(asset)
  }
  if (filter === 'videos') {
    return asset.kind === 'video' || asset.kind === 'audio'
  }
  return true
}

/**
 * Gate on the transcript route: single audio/video files keep the transcript
 * experience; image, gallery, and mixed downloads go to the media page. This
 * runs before `TranscriptPage` mounts, so images never trigger ASR.
 */
export function TranscriptRouteGate() {
  const { downloadId } = useParams({ from: '/downloads/$downloadId/transcript' })
  const inventory = useMediaInventory(downloadId)

  if (inventory.status === 'loading') {
    return <DetailLoading />
  }
  const presentation = inventory.inventory?.presentation
  if (presentation === 'image' || presentation === 'gallery' || presentation === 'mixed') {
    return <Navigate params={{ downloadId }} replace to="/downloads/$downloadId" />
  }
  return <TranscriptPage />
}

function DetailLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

/**
 * Media-aware detail page for image, gallery, and mixed downloads.
 */
export function MediaDetailPage() {
  const { downloadId } = useParams({ from: '/downloads/$downloadId' })
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [scope, setScope] = useState<MediaInventoryScope>('download')
  const { error, inventory, reload, status } = useMediaInventory(downloadId, scope)
  const records = useAtomValue(downloadRecordsAtom)
  const [filter, setFilter] = useState<KindFilter>('all')
  const [density, setDensity] = useState<TileDensity>(() =>
    readPreference(DENSITY_STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable'
  )
  const [infoOpen, setInfoOpen] = useState(() => readPreference(INFO_STORAGE_KEY) !== 'false')
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<MediaAsset | null>(null)
  const [trashTarget, setTrashTarget] = useState<MediaAsset | null>(null)
  const [decodedSizes, setDecodedSizes] = useState<
    Record<string, { width: number; height: number }>
  >({})
  // Keyed by id + mtime: an in-place overwrite keeps the id but must not keep the old size.
  const handleDimensions = useCallback((key: string, width: number, height: number) => {
    setDecodedSizes((current) =>
      current[key] ? current : { ...current, [key]: { height, width } }
    )
  }, [])

  const download = useMemo(() => {
    for (const record of records.values()) {
      if (record.id === downloadId) {
        return record
      }
    }
    return null
  }, [downloadId, records])

  const assets = inventory?.assets ?? []
  const isMixed = Boolean(inventory && inventory.presentation === 'mixed')
  const visible = useMemo(
    () => (isMixed ? assets.filter((asset) => matchesFilter(asset, filter)) : assets),
    [assets, filter, isMixed]
  )
  const single = inventory?.presentation === 'image'
  const viewerIndex = viewerId ? visible.findIndex((asset) => asset.id === viewerId) : -1
  const viewerOpen = viewerIndex >= 0 || (single && visible.length > 0)
  const activeIndex = single ? 0 : viewerIndex
  const focusedBase =
    (viewerOpen ? visible[activeIndex] : null) ??
    visible.find((asset) => asset.id === selectedId) ??
    (single ? visible[0] : null) ??
    null
  const focusedAsset =
    focusedBase && !focusedBase.width && decodedSizes[sizeKey(focusedBase)]
      ? { ...focusedBase, ...decodedSizes[sizeKey(focusedBase)] }
      : focusedBase

  const toggleInfo = useCallback(() => {
    setInfoOpen((value) => {
      writePreference(INFO_STORAGE_KEY, String(!value))
      return !value
    })
  }, [])

  const changeDensity = useCallback((next: TileDensity) => {
    setDensity(next)
    writePreference(DENSITY_STORAGE_KEY, next)
  }, [])

  const openAt = useCallback(
    (index: number) => {
      const asset = visible[index]
      if (asset) {
        setViewerId(asset.id)
        setSelectedId(asset.id)
      }
    },
    [visible]
  )

  const closeViewer = useCallback(() => {
    setViewerId(null)
  }, [])

  const handleBack = useCallback(() => {
    void navigate({ to: '/' })
  }, [navigate])

  // Esc on the grid (or the embedded single image) goes home; the overlay viewer owns its own Esc and I.
  const overlayOpen = viewerOpen && !single
  useEffect(() => {
    if (overlayOpen || editing || trashTarget) {
      return
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        handleBack()
      } else if (
        !viewerOpen &&
        event.key === 'i' &&
        !(event.ctrlKey || event.metaKey || event.altKey)
      ) {
        const target = event.target
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
          toggleInfo()
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [editing, handleBack, overlayOpen, toggleInfo, trashTarget, viewerOpen])

  const handleTrash = useCallback(
    async (asset: MediaAsset) => {
      try {
        await ipcServices.media.trashAsset({ downloadId, path: asset.path })
        forgetMediaThumbnails(asset.path)
        toast.success(t('media.trashed', { name: asset.fileName }))
        // Step to the neighbour so the viewer stays open on the next item.
        const index = visible.findIndex((item) => item.id === asset.id)
        const neighbour = visible[index + 1] ?? visible[index - 1] ?? null
        setViewerId((current) => (current === asset.id ? (neighbour?.id ?? null) : current))
        reload()
      } catch (trashError) {
        toast.error(trashError instanceof Error ? trashError.message : t('media.trashFailed'))
      }
    },
    [downloadId, reload, t, visible]
  )

  const handleSaved = useCallback(
    (path: string, mode: EditedImageSaveMode) => {
      setEditing(null)
      if (mode === 'overwrite') {
        forgetMediaThumbnails(path)
      }
      reload()
    },
    [reload]
  )

  const title = download?.title || inventory?.assets[0]?.fileName || t('media.untitled')
  const counts = inventory?.counts
  const imageCount = counts ? counts.image + counts.animated : 0
  const videoCount = counts ? counts.video + counts.audio : 0

  const header = useMemo(
    () => (
      <>
        <NoDrag className="inline-flex items-center">
          <Button
            aria-label={t('transcript.back')}
            className="h-8 w-8"
            onClick={handleBack}
            size="icon"
            variant="ghost"
          >
            <ChevronLeft className="block size-4" />
          </Button>
        </NoDrag>
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="truncate font-semibold text-sm leading-none">{title}</h1>
          {counts ? (
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {[
                imageCount > 0 ? t('media.counts.images', { count: imageCount }) : null,
                videoCount > 0 ? t('media.counts.videos', { count: videoCount }) : null
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : null}
        </div>
        <NoDrag className="inline-flex items-center gap-1">
          {inventory?.folderScopeAvailable ? (
            <fieldset className="mr-1 inline-flex rounded-md border p-0.5">
              {(['download', 'folder'] as const).map((value) => (
                <button
                  aria-pressed={scope === value}
                  className={cn(
                    'h-6 rounded-[5px] px-2.5 text-muted-foreground text-xs transition hover:text-foreground',
                    scope === value && 'bg-accent text-foreground'
                  )}
                  key={value}
                  onClick={() => {
                    setViewerId(null)
                    setScope(value)
                  }}
                  type="button"
                >
                  {t(`media.scope.${value}`)}
                </button>
              ))}
            </fieldset>
          ) : null}
          {isMixed ? (
            <fieldset className="mr-1 inline-flex rounded-md border p-0.5">
              {(['all', 'images', 'videos'] as const).map((value) => (
                <button
                  aria-pressed={filter === value}
                  className={cn(
                    'h-6 rounded-[5px] px-2.5 text-muted-foreground text-xs transition hover:text-foreground',
                    filter === value && 'bg-accent text-foreground'
                  )}
                  key={value}
                  onClick={() => setFilter(value)}
                  type="button"
                >
                  {t(`media.filter.${value}`)}
                </button>
              ))}
            </fieldset>
          ) : null}
          {single ? null : (
            <HeaderIconButton
              label={
                density === 'compact' ? t('media.density.comfortable') : t('media.density.compact')
              }
              onClick={() => changeDensity(density === 'compact' ? 'comfortable' : 'compact')}
            >
              {density === 'compact' ? (
                <Grid2x2 className="size-4" />
              ) : (
                <Grid3x3 className="size-4" />
              )}
            </HeaderIconButton>
          )}
          {inventory?.rootDirectory ? (
            <HeaderIconButton
              label={t('media.viewer.showInFolder')}
              onClick={() => void ipcServices.fs.openFile(inventory.rootDirectory as string)}
            >
              <FolderOpen className="size-4" />
            </HeaderIconButton>
          ) : null}
          <HeaderIconButton active={infoOpen} label={t('media.viewer.info')} onClick={toggleInfo}>
            <PanelRight className="size-4" />
          </HeaderIconButton>
        </NoDrag>
      </>
    ),
    [
      changeDensity,
      counts,
      density,
      filter,
      handleBack,
      imageCount,
      infoOpen,
      inventory?.folderScopeAvailable,
      inventory?.rootDirectory,
      isMixed,
      scope,
      single,
      t,
      title,
      toggleInfo,
      videoCount
    ]
  )
  useTitleBar(header)

  if (status === 'loading') {
    return <DetailLoading />
  }
  if (inventory?.presentation === 'av') {
    return <Navigate params={{ downloadId }} replace to="/downloads/$downloadId/transcript" />
  }
  if (
    status === 'error' ||
    !inventory ||
    inventory.presentation === 'missing' ||
    assets.length === 0
  ) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <ImageOff className="size-8 text-muted-foreground" />
        <p className="font-medium text-sm">{t('media.missingTitle')}</p>
        <p className="max-w-sm text-muted-foreground text-xs">
          {error ?? t('media.missingDetail')}
        </p>
        <div className="flex gap-2">
          <Button onClick={reload} size="sm" variant="outline">
            {t('media.retry')}
          </Button>
          {download?.downloadPath ? (
            <Button
              onClick={() => void ipcServices.fs.openFile(download.downloadPath as string)}
              size="sm"
              variant="outline"
            >
              {t('media.viewer.showInFolder')}
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="relative min-w-0 flex-1">
        {single ? null : (
          <MediaGrid
            activeId={selectedId}
            assets={visible}
            onOpen={openAt}
            tileSize={TILE_SIZES[density]}
          />
        )}
        {viewerOpen ? (
          <MediaViewer
            assets={visible}
            className={single ? 'h-full' : 'absolute inset-0 z-20'}
            index={activeIndex}
            infoOpen={infoOpen}
            onClose={single ? undefined : closeViewer}
            onDimensions={handleDimensions}
            onEdit={setEditing}
            onIndexChange={(index) => {
              const asset = visible[index]
              if (asset) {
                setViewerId(asset.id)
                setSelectedId(asset.id)
              }
            }}
            onToggleInfo={toggleInfo}
            onTrash={setTrashTarget}
            suspended={Boolean(editing || trashTarget)}
          />
        ) : null}
      </div>
      {infoOpen ? (
        <aside className="w-80 shrink-0 border-l bg-background">
          <MediaInfoPanel asset={focusedAsset} download={download} inventory={inventory} />
        </aside>
      ) : null}
      {editing ? (
        <ImageEditor asset={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />
      ) : null}
      <MediaConfirmDialog
        cancelLabel={t('media.editor.cancel')}
        confirmLabel={t('media.trashConfirm')}
        description={t('media.trashDescription', { name: trashTarget?.fileName ?? '' })}
        destructive
        onConfirm={() => {
          if (trashTarget) {
            void handleTrash(trashTarget)
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setTrashTarget(null)
          }
        }}
        open={trashTarget !== null}
        title={t('media.trashTitle')}
      />
    </div>
  )
}

function HeaderIconButton({
  active,
  children,
  label,
  onClick
}: {
  active?: boolean
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          aria-pressed={active}
          className={cn('h-8 w-8', active && 'bg-accent')}
          onClick={onClick}
          size="icon"
          variant="ghost"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
