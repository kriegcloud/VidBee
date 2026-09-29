import { formatMediaDuration } from '@renderer/lib/media-format'
import { thumbnailSizeFor, useMediaThumbnail } from '@renderer/lib/media-inventory'
import { cn } from '@renderer/lib/utils'
import type { MediaAsset } from '@shared/types/media-assets'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AudioLines, ImageOff, Play } from 'lucide-react'
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'

const GAP_PX = 6
const OVERSCAN_ROWS = 3

interface MediaTileProps {
  asset: MediaAsset
  index: number
  size: number
  active: boolean
  onOpen: (index: number) => void
}

/** Square cover-cropped tile; thumbnails are requested only once mounted. */
const MediaTile = memo(function MediaTile({ active, asset, index, onOpen, size }: MediaTileProps) {
  const thumbnail = useMediaThumbnail(asset, thumbnailSizeFor(size))
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(thumbnail) && !failed

  return (
    <button
      aria-label={asset.fileName}
      className={cn(
        'group relative overflow-hidden rounded-md bg-muted/40 outline-none ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-primary',
        active && 'ring-2 ring-primary'
      )}
      data-index={index}
      onClick={() => onOpen(index)}
      style={{ height: size, width: size }}
      title={asset.fileName}
      type="button"
    >
      {showImage ? (
        <img
          alt=""
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          src={thumbnail ?? undefined}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
          {thumbnail === undefined && !failed ? (
            <span className="h-full w-full animate-pulse bg-muted/60" />
          ) : asset.kind === 'audio' ? (
            <AudioLines className="size-6" />
          ) : (
            <ImageOff className="size-6" />
          )}
        </span>
      )}
      {asset.kind === 'video' ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            <Play className="ml-0.5 size-4 fill-current" />
          </span>
        </span>
      ) : null}
      {asset.kind === 'video' && asset.durationMs ? (
        <span className="pointer-events-none absolute right-1.5 bottom-1.5 rounded bg-black/65 px-1.5 py-0.5 font-medium text-[10px] text-white tabular-nums">
          {formatMediaDuration(asset.durationMs)}
        </span>
      ) : null}
      {asset.kind === 'animated' ? (
        <span className="pointer-events-none absolute top-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 font-semibold text-[10px] text-white uppercase tracking-wide">
          {asset.ext}
        </span>
      ) : null}
    </button>
  )
})

interface MediaGridProps {
  assets: readonly MediaAsset[]
  /** Target tile edge in CSS px; the grid stretches tiles to fill each row. */
  tileSize: number
  activeId?: string | null
  onOpen: (index: number) => void
}

/**
 * Virtualized square grid. Only visible rows (plus overscan) are mounted, so a
 * 2,000-image profile costs the same as a 40-image post.
 */
export function MediaGrid({ activeId, assets, onOpen, tileSize }: MediaGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(entry.contentRect.width)
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const { columns, cell } = useMemo(() => {
    const usable = Math.max(0, width)
    const count = Math.max(1, Math.floor((usable + GAP_PX) / (tileSize + GAP_PX)))
    return { cell: Math.floor((usable - GAP_PX * (count - 1)) / count), columns: count }
  }, [tileSize, width])

  const rowCount = Math.ceil(assets.length / columns)
  const virtualizer = useVirtualizer({
    count: rowCount,
    estimateSize: () => cell + GAP_PX,
    getScrollElement: () => scrollRef.current,
    overscan: OVERSCAN_ROWS
  })

  // Row height changes with column count; re-measure instead of keeping stale offsets.
  // biome-ignore lint/correctness/useExhaustiveDependencies: cell is the trigger for re-measuring.
  useLayoutEffect(() => {
    virtualizer.measure()
  }, [cell, virtualizer])

  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 pt-3 pb-6" ref={scrollRef}>
      {width > 0 ? (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => {
            const start = row.index * columns
            const rowAssets = assets.slice(start, start + columns)
            return (
              <div
                className="absolute top-0 left-0 flex w-full"
                key={row.key}
                style={{ gap: GAP_PX, transform: `translateY(${row.start}px)` }}
              >
                {rowAssets.map((asset, offset) => (
                  <MediaTile
                    active={asset.id === activeId}
                    asset={asset}
                    index={start + offset}
                    key={asset.id}
                    onOpen={onOpen}
                    size={cell}
                  />
                ))}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
