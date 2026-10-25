import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'
import {
  isListIgnoreTarget,
  LIST_MARQUEE_HOLD_MS,
  LIST_MARQUEE_MOVE_PX,
  type ListMarquee,
  listItemIdsInMarquee,
  listMarqueeGatedScrollStep,
  listMarqueeRect,
  listRectToLocal
} from './list-marquee'

interface ListMarqueePointer {
  /** Set once the pointer has been outside the edge bands; gates auto-scroll. */
  armed: boolean
  baseIds: string[]
  lastClientX: number
  lastClientY: number
  originX: number
  originY: number
  pointerId: number
  selecting: boolean
  startClientX: number
  startClientY: number
}

interface ListMarqueeGeometryRow {
  id: string
  rect: { bottom: number; left: number; right: number; top: number }
}

interface UseListMarqueeSelectionOptions {
  containerRef: RefObject<HTMLElement | null>
  enabled?: boolean
  /** When set, hit-testing uses these boxes instead of mounted DOM nodes. */
  geometryRows?: () => readonly ListMarqueeGeometryRow[]
  /** The scrolling ancestor, so a drag past the edge keeps reaching new rows. */
  getScrollElement?: () => HTMLElement | null
  itemAttr?: string
  selectableAttr?: string
  selectedIds: ReadonlySet<string>
  onSelectIds: (ids: string[]) => void
}

/**
 * Finder-style drag rectangle over a list. Hold or move to select; a plain
 * click is left to the item (so rows can navigate instead of selecting).
 *
 * The rectangle is anchored in coordinates local to the list element, which
 * scrolls with the rows. A drag that runs off the edge therefore keeps growing
 * over the rows that scroll into view instead of shedding the ones that leave.
 */
export const useListMarqueeSelection = ({
  containerRef,
  enabled = true,
  geometryRows,
  getScrollElement,
  itemAttr = 'data-download-id',
  selectableAttr = 'data-download-selectable',
  selectedIds,
  onSelectIds
}: UseListMarqueeSelectionOptions) => {
  const [marquee, setMarquee] = useState<ListMarquee | null>(null)
  const pointerRef = useRef<ListMarqueePointer | null>(null)
  const holdTimerRef = useRef<number | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const selectedIdsRef = useRef(selectedIds)
  const onSelectIdsRef = useRef(onSelectIds)
  const geometryRowsRef = useRef(geometryRows)
  const getScrollElementRef = useRef(getScrollElement)
  selectedIdsRef.current = selectedIds
  onSelectIdsRef.current = onSelectIds
  geometryRowsRef.current = geometryRows
  getScrollElementRef.current = getScrollElement

  /**
   * Cancel a pending long-press timer.
   */
  const clearHoldTimer = useCallback((): void => {
    if (holdTimerRef.current === null) {
      return
    }
    window.clearTimeout(holdTimerRef.current)
    holdTimerRef.current = null
  }, [])

  /**
   * Stop the edge auto-scroll loop.
   */
  const clearAutoScroll = useCallback((): void => {
    if (autoScrollFrameRef.current === null) {
      return
    }
    window.cancelAnimationFrame(autoScrollFrameRef.current)
    autoScrollFrameRef.current = null
  }, [])

  /**
   * Collect selectable row boxes in viewport coordinates.
   */
  const measureSelectableRows = useCallback((): Array<{
    id: string
    rect: { bottom: number; left: number; right: number; top: number }
  }> => {
    const provided = geometryRowsRef.current?.()
    if (provided) {
      return [...provided]
    }
    const container = containerRef.current
    if (!container) {
      return []
    }
    return [...container.querySelectorAll(`[${selectableAttr}]`)].flatMap((node) => {
      if (!(node instanceof HTMLElement)) {
        return []
      }
      const id = node.getAttribute(itemAttr)
      if (!id) {
        return []
      }
      const rect = node.getBoundingClientRect()
      return [
        {
          id,
          rect: { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top }
        }
      ]
    })
  }, [containerRef, itemAttr, selectableAttr])

  /**
   * Highlight rows whose boxes intersect the pointer marquee.
   */
  const updateMarqueeSelection = useCallback(
    (clientX: number, clientY: number): void => {
      const pointer = pointerRef.current
      const container = containerRef.current
      if (!(pointer && container)) {
        return
      }
      pointer.lastClientX = clientX
      pointer.lastClientY = clientY
      const scroller = getScrollElementRef.current?.()
      if (scroller && !pointer.armed) {
        pointer.armed = listMarqueeGatedScrollStep(
          false,
          clientY,
          scroller.getBoundingClientRect()
        ).armed
      }
      const listRect = container.getBoundingClientRect()
      const origin = { left: listRect.left, top: listRect.top }
      const currentX = clientX - origin.left
      const currentY = clientY - origin.top
      setMarquee({ x1: pointer.originX, x2: currentX, y1: pointer.originY, y2: currentY })
      // Both the box and the rows live in list-local space, so scrolling moves
      // them together and the anchor stays on the row it was dropped on.
      const box = listMarqueeRect(pointer.originX, pointer.originY, currentX, currentY)
      const rows = measureSelectableRows().map((row) => ({
        id: row.id,
        rect: listRectToLocal(row.rect, origin)
      }))
      const next = new Set(pointer.baseIds)
      for (const id of listItemIdsInMarquee(rows, box)) {
        next.add(id)
      }
      onSelectIdsRef.current(Array.from(next))
    },
    [containerRef, measureSelectableRows]
  )

  /**
   * Scroll the list while the pointer rests in a scroller edge band, growing the
   * marquee over each row that comes into view.
   */
  const runAutoScroll = useCallback((): void => {
    autoScrollFrameRef.current = null
    const pointer = pointerRef.current
    const scroller = getScrollElementRef.current?.()
    if (!(pointer?.selecting && scroller)) {
      return
    }
    const { armed, step } = listMarqueeGatedScrollStep(
      pointer.armed,
      pointer.lastClientY,
      scroller.getBoundingClientRect()
    )
    pointer.armed = armed
    if (step !== 0) {
      const before = scroller.scrollTop
      scroller.scrollTop = before + step
      if (scroller.scrollTop !== before) {
        updateMarqueeSelection(pointer.lastClientX, pointer.lastClientY)
      }
    }
    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
  }, [updateMarqueeSelection])

  /**
   * Start the Finder-style selection rectangle.
   */
  const beginMarquee = useCallback(
    (clientX: number, clientY: number): void => {
      const pointer = pointerRef.current
      const container = containerRef.current
      if (!pointer || pointer.selecting) {
        return
      }
      pointer.selecting = true
      pointer.baseIds = Array.from(selectedIdsRef.current)
      if (container && typeof container.setPointerCapture === 'function') {
        try {
          container.setPointerCapture(pointer.pointerId)
        } catch {
          // The pointer may already have been released.
        }
      }
      updateMarqueeSelection(clientX, clientY)
      clearAutoScroll()
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
    },
    [clearAutoScroll, containerRef, runAutoScroll, updateMarqueeSelection]
  )

  /**
   * Commit or cancel the current list pointer gesture.
   */
  const finishPointer = useCallback((): void => {
    clearHoldTimer()
    clearAutoScroll()
    const pointer = pointerRef.current
    const container = containerRef.current
    if (
      container &&
      pointer &&
      typeof container.hasPointerCapture === 'function' &&
      container.hasPointerCapture(pointer.pointerId)
    ) {
      container.releasePointerCapture(pointer.pointerId)
    }
    pointerRef.current = null
    setMarquee(null)
  }, [clearAutoScroll, clearHoldTimer, containerRef])

  // A wheel or trackpad scroll fires no pointermove, so re-run the hit test
  // against the rows that just moved under the anchored rectangle.
  useEffect(() => {
    if (!marquee) {
      return
    }
    const onScroll = () => {
      const pointer = pointerRef.current
      if (pointer?.selecting) {
        updateMarqueeSelection(pointer.lastClientX, pointer.lastClientY)
      }
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [marquee, updateMarqueeSelection])

  useEffect(() => clearAutoScroll, [clearAutoScroll])

  /**
   * Start a potential marquee unless the pointer landed on a control.
   */
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (!enabled || event.button !== 0) {
      return
    }
    if (isListIgnoreTarget(event.target)) {
      return
    }
    const container = containerRef.current
    const listRect = container?.getBoundingClientRect()
    if (!listRect) {
      return
    }
    clearHoldTimer()
    pointerRef.current = {
      armed: false,
      baseIds: Array.from(selectedIdsRef.current),
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      originX: event.clientX - listRect.left,
      originY: event.clientY - listRect.top,
      pointerId: event.pointerId,
      selecting: false,
      startClientX: event.clientX,
      startClientY: event.clientY
    }
    const startX = event.clientX
    const startY = event.clientY
    holdTimerRef.current = window.setTimeout(() => {
      beginMarquee(startX, startY)
    }, LIST_MARQUEE_HOLD_MS)
  }

  /**
   * Grow the selection rectangle after the pointer moves past the slop.
   */
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const pointer = pointerRef.current
    if (!(pointer && enabled)) {
      return
    }
    if (!pointer.selecting) {
      const distance = Math.hypot(
        event.clientX - pointer.startClientX,
        event.clientY - pointer.startClientY
      )
      if (distance < LIST_MARQUEE_MOVE_PX) {
        return
      }
      clearHoldTimer()
      beginMarquee(event.clientX, event.clientY)
      return
    }
    updateMarqueeSelection(event.clientX, event.clientY)
  }

  /**
   * True when the current gesture became a marquee (so the row click should not fire).
   */
  const didSelectWithMarquee = (): boolean => Boolean(pointerRef.current?.selecting)

  return {
    beginMarquee,
    didSelectWithMarquee,
    finishPointer,
    marquee,
    onPointerDown,
    onPointerMove
  }
}
