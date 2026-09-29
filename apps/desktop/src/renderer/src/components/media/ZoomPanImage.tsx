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

interface ShownImage {
  src: string
  width: number
  height: number
}

const FADE_MS = 150
const ZOOM_ANIMATION_MS = 160

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
  const incomingRef = useRef<HTMLImageElement>(null)
  const outgoingRef = useRef<HTMLImageElement>(null)
  // The image on screen. It only changes once the next one is fully decoded, so
  // navigation never blanks the stage or paints a half-loaded frame.
  const [shown, setShown] = useState<ShownImage | null>(null)
  // The previous frame, kept briefly (with its last transform) to cross-fade out.
  const [outgoing, setOutgoing] = useState<{ image: ShownImage; transform: string } | null>(null)
  // Transform transitions are opt-in (button / double-click zoom). Image swaps and
  // wheel ticks must never animate, or the new image "bounces" from the old zoom.
  const [animateZoom, setAnimateZoom] = useState(false)
  const natural = shown
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

  const onLoadRef = useRef(onLoad)
  const onErrorRef = useRef(onError)
  onLoadRef.current = onLoad
  onErrorRef.current = onError
  const transformRef = useRef('')
  const shownRef = useRef<ShownImage | null>(null)

  // Decode the next image off-screen, then swap it in at fit (Omoide's lightbox kept
  // stale zoom across images and flashed an empty stage while loading).
  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.decoding = 'async'
    image.src = src
    image
      .decode()
      .then(() => {
        if (cancelled) {
          return
        }
        const next = { height: image.naturalHeight, src, width: image.naturalWidth }
        const current = shownRef.current
        if (current && current.src !== src) {
          setOutgoing({ image: current, transform: transformRef.current })
        }
        shownRef.current = next
        setShown(next)
        setAnimateZoom(false)
        setIsFit(true)
        onLoadRef.current?.(next.width, next.height)
      })
      .catch(() => {
        if (!cancelled) {
          onErrorRef.current?.()
        }
      })
    return () => {
      cancelled = true
    }
  }, [src])

  // Cross-fade: new frame in, previous frame out, then drop the previous frame.
  useLayoutEffect(() => {
    if (!outgoing) {
      return
    }
    const fadeIn = incomingRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FADE_MS,
      easing: 'ease-out'
    })
    const fadeOut = outgoingRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FADE_MS,
      easing: 'ease-out',
      fill: 'forwards'
    })
    const timer = window.setTimeout(() => setOutgoing(null), FADE_MS)
    return () => {
      window.clearTimeout(timer)
      fadeIn?.cancel()
      fadeOut?.cancel()
    }
  }, [outgoing])

  useEffect(() => {
    if (!animateZoom) {
      return
    }
    const timer = window.setTimeout(() => setAnimateZoom(false), ZOOM_ANIMATION_MS)
    return () => window.clearTimeout(timer)
  }, [animateZoom])

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

  // While fitted, the view is derived during render, so a new image can never paint
  // at the previous image's scale for a frame.
  const effectiveView: ViewState = isFit ? { scale: fitScale, x: 0, y: 0 } : view
  const effectiveRef = useRef(effectiveView)
  effectiveRef.current = effectiveView

  useEffect(() => {
    onScaleChange?.(effectiveView.scale, isFit)
  }, [effectiveView.scale, isFit, onScaleChange])

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
    (nextScale: number, px = 0, py = 0, animate = true) => {
      setAnimateZoom(animate)
      setView(() => {
        const current = effectiveRef.current
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
      fit: () => {
        setAnimateZoom(true)
        setIsFit(true)
      },
      zoomIn: () => zoomAt(effectiveRef.current.scale * BUTTON_STEP),
      zoomOut: () => zoomAt(effectiveRef.current.scale / BUTTON_STEP)
    }),
    [zoomAt]
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
      setAnimateZoom(false)
      setView(() => {
        const current = effectiveRef.current
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
      view: effectiveView
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
      setAnimateZoom(true)
      setIsFit(true)
    }
  }

  const transform = `translate(-50%, -50%) translate(${effectiveView.x}px, ${effectiveView.y}px) scale(${effectiveView.scale}) rotate(${viewRotation}deg)`
  transformRef.current = transform

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
      {placeholderSrc && !shown ? (
        <img
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-contain opacity-80 blur-[2px]"
          draggable={false}
          src={placeholderSrc}
        />
      ) : null}
      {outgoing ? (
        <img
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 max-w-none origin-center"
          draggable={false}
          ref={outgoingRef}
          src={outgoing.image.src}
          style={{
            height: outgoing.image.height,
            transform: outgoing.transform,
            width: outgoing.image.width
          }}
        />
      ) : null}
      {shown ? (
        <img
          alt={alt}
          className="absolute top-1/2 left-1/2 max-w-none origin-center will-change-transform"
          draggable={false}
          key={shown.src}
          ref={incomingRef}
          src={shown.src}
          style={{
            height: shown.height,
            transform,
            transition:
              animateZoom && !dragging
                ? `transform ${ZOOM_ANIMATION_MS}ms cubic-bezier(0.2, 0, 0, 1)`
                : 'none',
            width: shown.width
          }}
        />
      ) : null}
    </div>
  )
}
