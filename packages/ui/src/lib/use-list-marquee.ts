import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'
import {
  isListIgnoreTarget,
  LIST_MARQUEE_MOVE_PX,
  type ListMarquee,
  listItemIdsInMarquee,
  listMarqueeGatedScrollStep,
  listMarqueeRect,
  listRectToLocal
} from './list-marquee'

interface ListMarqueePointer {
  /** Set once the gesture shows intent to reach an edge; gates auto-scroll. */
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
  /** Static alternative to `getScrollElement`. */
  scrollElement?: HTMLElement | null
}

/**
 * Finder-style drag rectangle over a list. Drag rows or background to replace
 * the selection, or hold Cmd/Ctrl to add to it; a plain click is left to the
 * item (so rows can navigate instead of selecting).
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
  onSelectIds,
  scrollElement
}: UseListMarqueeSelectionOptions) => {
  const [marquee, setMarquee] = useState<ListMarquee | null>(null)
  const pointerRef = useRef<ListMarqueePointer | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const controlPointerRef = useRef(false)
  const onSelectIdsRef = useRef(onSelectIds)
  const geometryRowsRef = useRef(geometryRows)
  const getScrollElementRef = useRef(getScrollElement)
  const scrollElementRef = useRef(scrollElement)
  onSelectIdsRef.current = onSelectIds
  geometryRowsRef.current = geometryRows
  getScrollElementRef.current = getScrollElement
  scrollElementRef.current = scrollElement

  /** Resolve the scrolling ancestor used for edge auto-scroll. */
  const resolveScroller = useCallback(
    (): HTMLElement | null => getScrollElementRef.current?.() ?? scrollElementRef.current ?? null,
    []
  )

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

  /** Collect selectable row boxes in viewport coordinates. */
  const measureSelectableRows = useCallback((): ListMarqueeGeometryRow[] => {
    const provided = geometryRowsRef.current?.()
    if (provided) {
      return [...provided]
    }
    const container = containerRef.current
    if (!container) {
      return []
    }
    return [...container.querySelectorAll(`[${selectableAttr}="true"]`)].flatMap((node) => {
      if (!(node instanceof HTMLElement)) {
        return []
      }
      const id = node.getAttribute(itemAttr)
      if (!id) {
        return []
      }
      const rect = node.getBoundingClientRect()
      return [
        { id, rect: { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top } }
      ]
    })
  }, [containerRef, itemAttr, selectableAttr])

  /** Keep the rectangle and hit-testing anchored to the same content position while scrolling. */
  const updateMarqueeSelection = useCallback(
    (clientX: number, clientY: number): void => {
      const pointer = pointerRef.current
      const container = containerRef.current
      if (!(pointer && container)) {
        return
      }
      pointer.lastClientX = clientX
      pointer.lastClientY = clientY
      const scroller = resolveScroller()
      if (scroller && !pointer.armed) {
        pointer.armed = listMarqueeGatedScrollStep(
          false,
          clientY,
          pointer.startClientY,
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
      const hits = listItemIdsInMarquee(rows, box)
      onSelectIdsRef.current([...new Set([...pointer.baseIds, ...hits])])
    },
    [containerRef, measureSelectableRows, resolveScroller]
  )

  /**
   * Scroll the list while the pointer rests in a scroller edge band, growing the
   * marquee over each row that comes into view.
   */
  const runAutoScroll = useCallback((): void => {
    autoScrollFrameRef.current = null
    const pointer = pointerRef.current
    const scroller = resolveScroller()
    if (!(pointer?.selecting && scroller)) {
      return
    }
    const { armed, step } = listMarqueeGatedScrollStep(
      pointer.armed,
      pointer.lastClientY,
      pointer.startClientY,
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
  }, [resolveScroller, updateMarqueeSelection])

  /** Capture an actual drag; holding the mouse still never starts selection. */
  const beginMarquee = useCallback(
    (clientX: number, clientY: number): void => {
      const pointer = pointerRef.current
      const container = containerRef.current
      if (!(pointer && container) || pointer.selecting) {
        return
      }
      pointer.selecting = true
      suppressClickRef.current = true
      container.focus({ preventScroll: true })
      if (typeof container.setPointerCapture === 'function') {
        try {
          container.setPointerCapture(pointer.pointerId)
        } catch {
          // Window listeners still clean up when pointer capture is unavailable.
        }
      }
      updateMarqueeSelection(clientX, clientY)
      clearAutoScroll()
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
    },
    [clearAutoScroll, containerRef, runAutoScroll, updateMarqueeSelection]
  )

  /** Finish a drag while retaining its click guard until the synthesized click is consumed. */
  const finishPointer = useCallback((): void => {
    clearAutoScroll()
    const pointer = pointerRef.current
    const container = containerRef.current
    if (!pointer) {
      return
    }
    pointerRef.current = null
    if (container?.hasPointerCapture?.(pointer.pointerId)) {
      container.releasePointerCapture(pointer.pointerId)
    }
    setMarquee(null)
  }, [clearAutoScroll, containerRef])

  useEffect(() => {
    /** A fresh pointer gesture must not inherit an unconsumed release click guard. */
    const resetClickGuard = (): void => {
      suppressClickRef.current = false
      controlPointerRef.current = false
    }
    window.addEventListener('pointerdown', resetClickGuard, true)
    window.addEventListener('pointerup', finishPointer)
    window.addEventListener('pointercancel', finishPointer)
    window.addEventListener('blur', finishPointer)
    return () => {
      window.removeEventListener('pointerdown', resetClickGuard, true)
      window.removeEventListener('pointerup', finishPointer)
      window.removeEventListener('pointercancel', finishPointer)
      window.removeEventListener('blur', finishPointer)
      finishPointer()
    }
  }, [finishPointer])

  // A wheel or trackpad scroll fires no pointermove, so re-run the hit test
  // against the rows that just moved under the anchored rectangle.
  useEffect(() => {
    if (!marquee) {
      return
    }
    const onScroll = (): void => {
      const pointer = pointerRef.current
      if (pointer?.selecting) {
        updateMarqueeSelection(pointer.lastClientX, pointer.lastClientY)
      }
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [marquee, updateMarqueeSelection])

  useEffect(() => clearAutoScroll, [clearAutoScroll])

  /** Prepare a mouse drag over rows or background without hijacking controls or touch scrolling. */
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (
      !enabled ||
      event.button !== 0 ||
      event.pointerType === 'touch' ||
      isListIgnoreTarget(event.target)
    ) {
      return
    }
    const listRect = containerRef.current?.getBoundingClientRect()
    if (!listRect) {
      return
    }
    controlPointerRef.current = event.ctrlKey
    pointerRef.current = {
      armed: false,
      baseIds: event.metaKey || event.ctrlKey ? Array.from(selectedIds) : [],
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      originX: event.clientX - listRect.left,
      originY: event.clientY - listRect.top,
      pointerId: event.pointerId,
      selecting: false,
      startClientX: event.clientX,
      startClientY: event.clientY
    }
  }

  /** Grow the selection after deliberate movement and prevent native text dragging. */
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const pointer = pointerRef.current
    if (!(pointer && enabled) || event.pointerId !== pointer.pointerId) {
      return
    }
    if (pointer.selecting) {
      updateMarqueeSelection(event.clientX, event.clientY)
    } else {
      const distance = Math.hypot(
        event.clientX - pointer.startClientX,
        event.clientY - pointer.startClientY
      )
      if (distance < LIST_MARQUEE_MOVE_PX) {
        return
      }
      beginMarquee(event.clientX, event.clientY)
    }
    event.preventDefault()
  }

  /** Prevent the release click from navigating a row or clearing the completed selection. */
  const onClickCapture = (event: ReactMouseEvent<HTMLElement>): void => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
    }
  }

  /** Keep native Control-click menus from taking over a primary-button selection gesture. */
  const onContextMenuCapture = (event: ReactMouseEvent<HTMLElement>): void => {
    if ((event.ctrlKey && controlPointerRef.current) || pointerRef.current?.selecting) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  /** Report a completed drag independently of pointerup cleanup. */
  const didSelectWithMarquee = (): boolean => suppressClickRef.current

  return {
    beginMarquee,
    didSelectWithMarquee,
    finishPointer,
    marquee,
    onClickCapture,
    onContextMenuCapture,
    onPointerDown,
    onPointerMove
  }
}
