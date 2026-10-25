export const LIST_MARQUEE_HOLD_MS = 200
export const LIST_MARQUEE_MOVE_PX = 4
export const LIST_MARQUEE_IGNORE_SELECTOR =
  'a, button, input, textarea, select, [role="checkbox"], [data-marquee-ignore]'

/**
 * True when a pointer target is a nested control that should not start a marquee
 * or activate the row.
 */
export const isListIgnoreTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false
  }
  return Boolean(target.closest(LIST_MARQUEE_IGNORE_SELECTOR))
}

export interface ListRect {
  bottom: number
  left: number
  right: number
  top: number
}

export interface ListMarquee {
  x1: number
  x2: number
  y1: number
  y2: number
}

/**
 * Axis-aligned box from two pointer corners.
 */
export const listMarqueeRect = (x1: number, y1: number, x2: number, y2: number): ListRect => ({
  bottom: Math.max(y1, y2),
  left: Math.min(x1, x2),
  right: Math.max(x1, x2),
  top: Math.min(y1, y2)
})

/**
 * Overlay style for a Finder-style selection rectangle.
 */
export const listMarqueeStyle = (
  marquee: ListMarquee
): ListRect & { height: number; width: number } => {
  const box = listMarqueeRect(marquee.x1, marquee.y1, marquee.x2, marquee.y2)
  return {
    ...box,
    height: Math.max(1, box.bottom - box.top),
    width: Math.max(1, box.right - box.left)
  }
}

/**
 * True when two axis-aligned boxes overlap.
 */
export const listRectsOverlap = (left: ListRect, right: ListRect): boolean =>
  left.left < right.right &&
  left.right > right.left &&
  left.top < right.bottom &&
  left.bottom > right.top

/**
 * Item ids whose rows intersect the marquee, in any order.
 */
export const listItemIdsInMarquee = (
  rows: Array<{ id: string; rect: ListRect }>,
  marquee: ListRect
): string[] => rows.filter((row) => listRectsOverlap(row.rect, marquee)).map((row) => row.id)

/** Distance from a scroller edge at which a marquee starts auto-scrolling. */
export const LIST_MARQUEE_EDGE_PX = 56
/** Pixels per frame at the very edge of the scroller. */
export const LIST_MARQUEE_EDGE_SPEED_PX = 20

/**
 * Auto-scroll step for a marquee pointer, in pixels per frame. Negative scrolls
 * up. Ramps from zero at the edge band's inner lip to full speed at the edge.
 *
 * @param clientY Pointer position.
 * @param bounds Scroller box in client coordinates.
 */
export const listMarqueeScrollStep = (
  clientY: number,
  bounds: { bottom: number; top: number }
): number => {
  const fromTop = clientY - bounds.top
  if (fromTop < LIST_MARQUEE_EDGE_PX) {
    const ratio = Math.min(1, Math.max(0, (LIST_MARQUEE_EDGE_PX - fromTop) / LIST_MARQUEE_EDGE_PX))
    return -Math.ceil(ratio * LIST_MARQUEE_EDGE_SPEED_PX)
  }
  const fromBottom = bounds.bottom - clientY
  if (fromBottom < LIST_MARQUEE_EDGE_PX) {
    const ratio = Math.min(
      1,
      Math.max(0, (LIST_MARQUEE_EDGE_PX - fromBottom) / LIST_MARQUEE_EDGE_PX)
    )
    return Math.ceil(ratio * LIST_MARQUEE_EDGE_SPEED_PX)
  }
  return 0
}

/** Distance a gesture must travel toward an edge before that edge may scroll. */
export const LIST_MARQUEE_ARM_PX = 16

/**
 * Gated auto-scroll for one marquee pointer sample. A long-press held still on
 * the last visible row sits inside an edge band, and must not scroll the list on
 * its own. The gate arms once the gesture shows intent: the pointer has crossed
 * the middle of the scroller, left the scroller box, or travelled
 * `LIST_MARQUEE_ARM_PX` toward the edge whose band it is in. Once armed, either
 * band scrolls as usual.
 *
 * @param armed Whether this gesture is already armed.
 * @param clientY Pointer position.
 * @param startClientY Where the gesture began.
 * @param bounds Scroller box in client coordinates.
 * @returns The updated armed flag and the step to apply this frame.
 */
export const listMarqueeGatedScrollStep = (
  armed: boolean,
  clientY: number,
  startClientY: number,
  bounds: { bottom: number; top: number }
): { armed: boolean; step: number } => {
  const step = listMarqueeScrollStep(clientY, bounds)
  const leftScroller = clientY < bounds.top || clientY > bounds.bottom
  const towardEdge = step > 0 ? clientY - startClientY : startClientY - clientY
  const nextArmed = armed || step === 0 || leftScroller || towardEdge >= LIST_MARQUEE_ARM_PX
  return { armed: nextArmed, step: nextArmed ? step : 0 }
}

/**
 * Shift a client-space box into coordinates local to the list element, so a
 * marquee anchored at the drag origin keeps pointing at the same rows while the
 * list scrolls underneath the pointer.
 *
 * @param rect Box in client coordinates.
 * @param origin The list element's client-space top-left.
 */
export const listRectToLocal = (
  rect: ListRect,
  origin: { left: number; top: number }
): ListRect => ({
  bottom: rect.bottom - origin.top,
  left: rect.left - origin.left,
  right: rect.right - origin.left,
  top: rect.top - origin.top
})
