import { cn } from '@renderer/lib/utils'
import {
  type PointerEvent as ReactPointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState
} from 'react'

const MAX_SCALE = 16
const WHEEL_STEP = 0.0015
const BUTTON_STEP = 1.4

export interface ZoomPanHandle {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  actualSize: () => void
}

interface ZoomPanImageProps {
  src: string
  /** Low-res image shown until the full image has decoded. */
  placeholderSrc?: string | null
  alt: string
  /** CSS rotation applied on top of zoom, for "rotate view" (not an edit). */
  viewRotation?: number
  className?: string
  /** Reports scale relative to natural pixels (1 = 100%). */
  onScaleChange?: (scale: number, isFit: boolean) => void
  onLoad?: (width: number, height: number) => void
  onError?: () => void
  ref?: Ref<ZoomPanHandle>
}

interface ViewState {
  scale: number
  x: number
  y: number
}

const clampOffset = (offset: number, scaledSize: number, viewportSize: number): number => {
  const limit = Math.max(0, (scaledSize - viewportSize) / 2)
  return Math.min(limit, Math.max(-limit, offset))
}

/**
 * Pan-and-zoom image surface: fit by default, cursor-anchored wheel zoom,
 * drag to pan, double-click toggles fit and 100%.
 */
export function ZoomPanImage({
  alt,
  className,
  onError,
  onLoad,
  onScaleChange,
  placeholderSrc,
  ref,
  src,
  viewRotation = 0
}: ZoomPanImageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [viewport, setViewport] = useState<{ width: number; height: number }>({
    height: 0,
    width: 0
  })
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 })
  const [isFit, setIsFit] = useState(true)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    view: ViewState
  } | null>(null)

  const quarterTurn = Math.abs(viewRotation / 90) % 2 === 1
  const box = natural
    ? quarterTurn
      ? { height: natural.width, width: natural.height }
      : natural
    : null

  const fitScale =
    box && viewport.width > 0
      ? Math.min(viewport.width / box.width, viewport.height / box.height, 1)
      : 1

  // Reset whenever the image changes; Omoide's lightbox kept stale zoom across images.
  // biome-ignore lint/correctness/useExhaustiveDependencies: src is the trigger, not a read.
  useLayoutEffect(() => {
    setNatural(null)
    setIsFit(true)
  }, [src])

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setViewport({ height: entry.contentRect.height, width: entry.contentRect.width })
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (isFit) {
      setView({ scale: fitScale, x: 0, y: 0 })
    }
  }, [fitScale, isFit])

  useEffect(() => {
    onScaleChange?.(view.scale, isFit)
  }, [isFit, onScaleChange, view.scale])

  const clampView = useCallback(
    (next: ViewState): ViewState => {
      if (!box) {
        return next
      }
      return {
        scale: next.scale,
        x: clampOffset(next.x, box.width * next.scale, viewport.width),
        y: clampOffset(next.y, box.height * next.scale, viewport.height)
      }
    },
    [box, viewport.height, viewport.width]
  )

  /** Zoom to `nextScale`, keeping the point under (px, py) — relative to center — fixed. */
  const zoomAt = useCallback(
    (nextScale: number, px = 0, py = 0) => {
      setView((current) => {
        const minScale = Math.min(fitScale, 1)
        const scale = Math.min(MAX_SCALE, Math.max(minScale, nextScale))
        const ratio = scale / current.scale
        return clampView({
          scale,
          x: px - (px - current.x) * ratio,
          y: py - (py - current.y) * ratio
        })
      })
      setIsFit(Math.abs(nextScale - fitScale) < 1e-3 || nextScale <= fitScale)
    },
    [clampView, fitScale]
  )

  useImperativeHandle(
    ref,
    () => ({
      actualSize: () => zoomAt(1),
      fit: () => setIsFit(true),
      zoomIn: () => zoomAt(view.scale * BUTTON_STEP),
      zoomOut: () => zoomAt(view.scale / BUTTON_STEP)
    }),
    [view.scale, zoomAt]
  )

  // Wheel must be non-passive to prevent page scroll; scope it to this surface only.
  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const px = event.clientX - rect.left - rect.width / 2
      const py = event.clientY - rect.top - rect.height / 2
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      setView((current) => {
        const factor = Math.exp(-delta * (event.ctrlKey ? WHEEL_STEP * 4 : WHEEL_STEP))
        const minScale = Math.min(fitScale, 1)
        const scale = Math.min(MAX_SCALE, Math.max(minScale, current.scale * factor))
        const ratio = scale / current.scale
        setIsFit(scale <= fitScale + 1e-3)
        return clampView({
          scale,
          x: px - (px - current.x) * ratio,
          y: py - (py - current.y) * ratio
        })
      })
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [clampView, fitScale])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isFit) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      view
    }
    setDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    setView(
      clampView({
        scale: drag.view.scale,
        x: drag.view.x + event.clientX - drag.startX,
        y: drag.view.y + event.clientY - drag.startY
      })
    )
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
      setDragging(false)
    }
  }

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (isFit) {
      // Jump to 100%, or 2× fit for images already smaller than the viewport.
      const target = fitScale < 1 ? 1 : fitScale * 2
      zoomAt(
        target,
        event.clientX - rect.left - rect.width / 2,
        event.clientY - rect.top - rect.height / 2
      )
    } else {
      setIsFit(true)
    }
  }

  const imageStyle = natural
    ? {
        height: natural.height,
        transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale}) rotate(${viewRotation}deg)`,
        transition: dragging ? 'none' : 'transform 90ms ease-out',
        width: natural.width
      }
    : undefined

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer surface; keyboard zoom is wired by the viewer.
    <div
      className={cn(
        'relative h-full w-full touch-none select-none overflow-hidden',
        isFit ? 'cursor-zoom-in' : dragging ? 'cursor-grabbing' : 'cursor-grab',
        className
      )}
      onDoubleClick={handleDoubleClick}
      onPointerCancel={endDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      ref={containerRef}
    >
      {placeholderSrc && !natural ? (
        <img
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-contain opacity-80 blur-[2px]"
          draggable={false}
          src={placeholderSrc}
        />
      ) : null}
      <img
        alt={alt}
        className={cn(
          'absolute top-1/2 left-1/2 max-w-none origin-center',
          natural ? 'opacity-100' : 'opacity-0'
        )}
        decoding="async"
        draggable={false}
        key={src}
        onError={onError}
        onLoad={(event) => {
          const image = event.currentTarget
          setNatural({ height: image.naturalHeight, width: image.naturalWidth })
          onLoad?.(image.naturalWidth, image.naturalHeight)
        }}
        src={src}
        style={imageStyle}
      />
    </div>
  )
}
