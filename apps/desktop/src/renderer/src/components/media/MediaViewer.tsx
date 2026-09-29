import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { ipcServices } from '@renderer/lib/ipc'
import { toLocalFileSrc } from '@renderer/lib/local-file-src'
import { isStillOrAnimated, useMediaThumbnail } from '@renderer/lib/media-inventory'
import { cn } from '@renderer/lib/utils'
import type { MediaAsset } from '@shared/types/media-assets'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FolderOpen,
  Info,
  Maximize,
  Pause,
  Pencil,
  Play,
  RotateCw,
  Trash2,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { type ZoomPanHandle, ZoomPanImage } from './ZoomPanImage'

const SLIDESHOW_INTERVAL_MS = 4000
const FILMSTRIP_TILE_PX = 56
const FILMSTRIP_GAP_PX = 4

/** Versioned local URL so an overwritten file is not served from Chromium's cache. */
export const assetSrc = (asset: MediaAsset): string =>
  `${toLocalFileSrc(asset.path)}?v=${Math.round(asset.mtimeMs)}`

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))

interface ViewerKeyActions {
  close?: () => void
  copy: () => void
  edit: () => void
  first: () => void
  last: () => void
  next: () => void
  previous: () => void
  rotate: () => void
  toggleInfo: () => void
  toggleSlideshow: () => void
  trash: () => void
  zoom: ZoomPanHandle | null
}

/**
 * Map a key to a viewer action. Embedded viewers (no `close`) leave Esc to the
 * page, which navigates back.
 */
const viewerKeyAction = (key: string, actions: ViewerKeyActions): (() => void) | null => {
  switch (key) {
    case '+':
    case '=':
      return () => actions.zoom?.zoomIn()
    case '-':
      return () => actions.zoom?.zoomOut()
    case '0':
      return () => actions.zoom?.fit()
    case '1':
      return () => actions.zoom?.actualSize()
    case 'ArrowLeft':
      return actions.previous
    case 'ArrowRight':
      return actions.next
    case 'Home':
      return actions.first
    case 'End':
      return actions.last
    case 'Delete':
      return actions.trash
    case 'Escape':
      return actions.close ?? null
    case ' ':
      return actions.toggleSlideshow
    case 'e':
      return actions.edit
    case 'i':
      return actions.toggleInfo
    case 'r':
      return actions.rotate
    default:
      return null
  }
}

interface ViewerButtonProps {
  label: string
  shortcut?: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  children: ReactNode
}

function ViewerButton({ active, children, disabled, label, onClick, shortcut }: ViewerButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'size-8 text-white/80 hover:bg-white/10 hover:text-white',
            active && 'bg-white/15 text-white'
          )}
          disabled={disabled}
          onClick={onClick}
          size="icon"
          variant="ghost"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {shortcut ? <span className="ml-2 text-muted-foreground">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  )
}

function FilmstripThumb({
  active,
  asset,
  index,
  onSelect
}: {
  active: boolean
  asset: MediaAsset
  index: number
  onSelect: (index: number) => void
}) {
  const thumbnail = useMediaThumbnail(asset, 256)
  return (
    <button
      aria-current={active}
      aria-label={asset.fileName}
      className={cn(
        'relative size-full overflow-hidden rounded-[5px] bg-white/5 opacity-55 outline-none transition-[opacity,box-shadow] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary',
        active && 'opacity-100 ring-2 ring-primary'
      )}
      onClick={() => onSelect(index)}
      type="button"
    >
      {thumbnail ? (
        <img
          alt=""
          className="size-full object-cover"
          decoding="async"
          draggable={false}
          src={thumbnail}
        />
      ) : null}
      {asset.kind === 'video' ? (
        <Play className="absolute top-1/2 left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 fill-white text-white drop-shadow" />
      ) : null}
    </button>
  )
}

function Filmstrip({
  assets,
  index,
  onSelect
}: {
  assets: readonly MediaAsset[]
  index: number
  onSelect: (index: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: assets.length,
    estimateSize: () => FILMSTRIP_TILE_PX + FILMSTRIP_GAP_PX,
    getScrollElement: () => scrollRef.current,
    horizontal: true,
    overscan: 8
  })

  useLayoutEffect(() => {
    // Glide between neighbours; jump when the target is far (e.g. Home/End).
    const visible = virtualizer.getVirtualItems()
    const near = visible.some((item) => Math.abs(item.index - index) <= 1)
    virtualizer.scrollToIndex(index, { align: 'center', behavior: near ? 'smooth' : 'auto' })
  }, [index, virtualizer])

  return (
    <div
      className="mx-auto max-w-full overflow-x-auto overflow-y-hidden px-3 py-2 [scrollbar-width:none]"
      ref={scrollRef}
    >
      <div
        className="relative mx-auto"
        style={{ height: FILMSTRIP_TILE_PX, width: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const asset = assets[item.index]
          if (!asset) {
            return null
          }
          return (
            <div
              className="absolute top-0 left-0"
              key={asset.id}
              style={{
                height: FILMSTRIP_TILE_PX,
                transform: `translateX(${item.start}px)`,
                width: FILMSTRIP_TILE_PX
              }}
            >
              <FilmstripThumb
                active={item.index === index}
                asset={asset}
                index={item.index}
                onSelect={onSelect}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface MediaViewerProps {
  assets: readonly MediaAsset[]
  index: number
  onIndexChange: (index: number) => void
  /** Omit for the embedded single-image layout, which has no close affordance. */
  onClose?: () => void
  onEdit: (asset: MediaAsset) => void
  onTrash: (asset: MediaAsset) => void
  onToggleInfo: () => void
  /** Reports decoded pixel size (keyed `id:mtimeMs`) for assets without inventory dimensions. */
  onDimensions?: (key: string, width: number, height: number) => void
  infoOpen: boolean
  /** Pause keyboard handling while a dialog (editor, confirm) is on top. */
  suspended?: boolean
  className?: string
}

/**
 * Full-bleed media viewer: zoom/pan for images, native playback for video,
 * filmstrip, slideshow, and per-file actions.
 */
export function MediaViewer({
  assets,
  className,
  index,
  infoOpen,
  onClose,
  onEdit,
  onDimensions,
  onIndexChange,
  onToggleInfo,
  onTrash,
  suspended = false
}: MediaViewerProps) {
  const { t } = useTranslation()
  const asset = assets[index] ?? null
  const zoomRef = useRef<ZoomPanHandle>(null)
  const [scale, setScale] = useState<{ value: number; fit: boolean }>({ fit: true, value: 1 })
  const [viewRotation, setViewRotation] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [failedId, setFailedId] = useState<string | null>(null)
  const placeholder = useMediaThumbnail(asset, 512)
  const count = assets.length
  const isImage = asset ? isStillOrAnimated(asset) : false

  const go = useCallback(
    (delta: number) => {
      if (count === 0) {
        return
      }
      onIndexChange((index + delta + count) % count)
    },
    [count, index, onIndexChange]
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the view rotation whenever the shown file changes.
  useEffect(() => {
    setViewRotation(0)
  }, [asset?.id])

  // Warm the decoder for neighbours so arrow-key navigation feels instant.
  useEffect(() => {
    if (count < 2) {
      return
    }
    const neighbours = [assets[(index + 1) % count], assets[(index - 1 + count) % count]]
    const images: HTMLImageElement[] = []
    for (const neighbour of neighbours) {
      if (neighbour && isStillOrAnimated(neighbour)) {
        const image = new Image()
        image.decoding = 'async'
        image.src = assetSrc(neighbour)
        images.push(image)
      }
    }
    return () => {
      for (const image of images) {
        image.src = ''
      }
    }
  }, [assets, count, index])

  // Slideshow: images advance on a timer; videos advance when they end.
  useEffect(() => {
    if (!(playing && isImage) || count < 2) {
      return
    }
    const timer = window.setTimeout(() => go(1), SLIDESHOW_INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [count, go, isImage, playing])

  const copyImage = useCallback(async () => {
    if (!(asset && isImage)) {
      return
    }
    try {
      await ipcServices.media.copyImageToClipboard(asset.path)
      toast.success(t('media.viewer.copied'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('media.viewer.copyFailed'))
    }
  }, [asset, isImage, t])

  useEffect(() => {
    if (suspended) {
      return
    }
    const handleKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || event.altKey) {
        return
      }
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        void copyImage()
        return
      }
      if (mod) {
        return
      }
      const handler = viewerKeyAction(event.key, {
        close: onClose,
        copy: () => undefined,
        edit: () => asset && isImage && onEdit(asset),
        first: () => onIndexChange(0),
        last: () => onIndexChange(count - 1),
        next: () => go(1),
        previous: () => go(-1),
        rotate: () => setViewRotation((value) => value + 90),
        toggleInfo: onToggleInfo,
        toggleSlideshow: () => setPlaying((value) => !value),
        trash: () => asset && onTrash(asset),
        zoom: zoomRef.current
      })
      if (handler) {
        // Space on a focused video should still toggle playback there.
        if (event.key === ' ' && event.target instanceof HTMLVideoElement) {
          return
        }
        event.preventDefault()
        handler()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [
    asset,
    copyImage,
    count,
    go,
    isImage,
    onClose,
    onEdit,
    onIndexChange,
    onToggleInfo,
    onTrash,
    suspended
  ])

  const handleScale = useCallback((value: number, fit: boolean) => {
    setScale({ fit, value })
  }, [])

  if (!asset) {
    return null
  }

  const failed = failedId === asset.id
  const src = assetSrc(asset)

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col bg-[#0b0b0c] text-white', className)}
      {...(onClose ? { 'aria-label': asset.fileName, 'aria-modal': true, role: 'dialog' } : {})}
    >
      <div className="flex h-11 shrink-0 items-center gap-1 px-2">
        {onClose ? (
          <ViewerButton label={t('media.viewer.close')} onClick={onClose} shortcut="Esc">
            <X className="size-4" />
          </ViewerButton>
        ) : null}
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate font-medium text-[13px] text-white/90">{asset.fileName}</p>
        </div>
        {count > 1 ? (
          <span className="px-2 text-white/55 text-xs tabular-nums">
            {index + 1} / {count}
          </span>
        ) : null}
        {isImage ? (
          <>
            <ViewerButton
              label={t('media.viewer.zoomOut')}
              onClick={() => zoomRef.current?.zoomOut()}
              shortcut="−"
            >
              <ZoomOut className="size-4" />
            </ViewerButton>
            <button
              className="h-8 min-w-14 rounded-md px-1.5 text-white/75 text-xs tabular-nums hover:bg-white/10"
              onClick={() => (scale.fit ? zoomRef.current?.actualSize() : zoomRef.current?.fit())}
              title={scale.fit ? t('media.viewer.actualSize') : t('media.viewer.fit')}
              type="button"
            >
              {Math.round(scale.value * 100)}%
            </button>
            <ViewerButton
              label={t('media.viewer.zoomIn')}
              onClick={() => zoomRef.current?.zoomIn()}
              shortcut="+"
            >
              <ZoomIn className="size-4" />
            </ViewerButton>
            <ViewerButton
              label={t('media.viewer.fit')}
              onClick={() => zoomRef.current?.fit()}
              shortcut="0"
            >
              <Maximize className="size-4" />
            </ViewerButton>
            <ViewerButton
              label={t('media.viewer.rotateView')}
              onClick={() => setViewRotation((value) => value + 90)}
              shortcut="R"
            >
              <RotateCw className="size-4" />
            </ViewerButton>
            <span className="mx-1 h-5 w-px bg-white/15" />
            <ViewerButton label={t('media.viewer.edit')} onClick={() => onEdit(asset)} shortcut="E">
              <Pencil className="size-4" />
            </ViewerButton>
            <ViewerButton
              label={t('media.viewer.copy')}
              onClick={() => void copyImage()}
              shortcut="Ctrl+C"
            >
              <Copy className="size-4" />
            </ViewerButton>
          </>
        ) : null}
        {count > 1 ? (
          <ViewerButton
            active={playing}
            label={playing ? t('media.viewer.pauseSlideshow') : t('media.viewer.playSlideshow')}
            onClick={() => setPlaying((value) => !value)}
            shortcut="Space"
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </ViewerButton>
        ) : null}
        <ViewerButton
          label={t('media.viewer.openExternal')}
          onClick={() => void ipcServices.fs.openFile(asset.path)}
        >
          <ExternalLink className="size-4" />
        </ViewerButton>
        <ViewerButton
          label={t('media.viewer.showInFolder')}
          onClick={() => void ipcServices.fs.openFileLocation(asset.path)}
        >
          <FolderOpen className="size-4" />
        </ViewerButton>
        <ViewerButton label={t('media.viewer.trash')} onClick={() => onTrash(asset)} shortcut="Del">
          <Trash2 className="size-4" />
        </ViewerButton>
        <ViewerButton
          active={infoOpen}
          label={t('media.viewer.info')}
          onClick={onToggleInfo}
          shortcut="I"
        >
          <Info className="size-4" />
        </ViewerButton>
      </div>

      <div className="relative min-h-0 flex-1">
        {failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="font-medium text-sm">{t('media.viewer.unsupportedTitle')}</p>
            <p className="max-w-sm text-white/60 text-xs">{t('media.viewer.unsupportedDetail')}</p>
            <Button
              onClick={() => void ipcServices.fs.openFile(asset.path)}
              size="sm"
              variant="secondary"
            >
              {t('media.viewer.openExternal')}
            </Button>
          </div>
        ) : isImage ? (
          <ZoomPanImage
            alt={asset.fileName}
            onError={() => setFailedId(asset.id)}
            onLoad={(width, height) => {
              if (!(asset.width && asset.height)) {
                onDimensions?.(`${asset.id}:${asset.mtimeMs}`, width, height)
              }
            }}
            onScaleChange={handleScale}
            placeholderSrc={placeholder}
            ref={zoomRef}
            src={src}
            viewRotation={viewRotation}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-4">
            {/* biome-ignore lint/a11y/useMediaCaption: downloaded media has no caption track here. */}
            <video
              autoPlay
              className={cn(
                'max-h-full max-w-full rounded-sm',
                asset.kind === 'audio' && 'w-full max-w-xl'
              )}
              controls
              key={asset.id}
              onEnded={() => (playing ? go(1) : undefined)}
              onError={() => setFailedId(asset.id)}
              playsInline
              poster={placeholder ?? undefined}
              preload="metadata"
              src={src}
            />
          </div>
        )}

        {count > 1 ? (
          <>
            <button
              aria-label={t('media.viewer.previous')}
              className="absolute top-1/2 left-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white/85 opacity-70 backdrop-blur-sm transition hover:bg-black/70 hover:opacity-100"
              onClick={() => go(-1)}
              type="button"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              aria-label={t('media.viewer.next')}
              className="absolute top-1/2 right-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white/85 opacity-70 backdrop-blur-sm transition hover:bg-black/70 hover:opacity-100"
              onClick={() => go(1)}
              type="button"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="shrink-0 border-white/10 border-t">
          <Filmstrip assets={assets} index={index} onSelect={onIndexChange} />
        </div>
      ) : null}
    </div>
  )
}
