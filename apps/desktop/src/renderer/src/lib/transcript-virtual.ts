import { observeElementRect, type Virtualizer } from '@tanstack/react-virtual'

export const CAPTION_LIST_OVERSCAN = 8
export const CAPTION_LIST_PADDING_PX = 16
export const CAPTION_ROW_CHAR_WIDTH_PX = 7
export const CAPTION_ROW_GAP_PX = 16
export const CAPTION_ROW_HEADER_PX = 24
export const CAPTION_ROW_H_INSET_PX = 60
export const CAPTION_ROW_LINE_PX = 22
export const CAPTION_LIST_ESTIMATE_WIDTH_PX = 520
export const CAPTION_LIST_INITIAL_RECT = { height: 640, width: CAPTION_LIST_ESTIMATE_WIDTH_PX }

type CaptionListVirtualizer = Virtualizer<HTMLDivElement, Element>

/**
 * Wrap width used to guess how many characters fit on a caption line.
 */
export const captionCharsPerLine = (listWidthPx = CAPTION_LIST_ESTIMATE_WIDTH_PX): number => {
  const contentWidth = Math.max(80, listWidthPx - CAPTION_ROW_H_INSET_PX)
  return Math.max(12, Math.round(contentWidth / CAPTION_ROW_CHAR_WIDTH_PX))
}

/**
 * Estimate a caption row height from text length so the first scroll is close.
 *
 * Prefer a slightly short guess: overshooting sends `scrollToIndex` to the
 * bottom of the list until rows measure, which is the visible hitch on enter.
 */
export const estimateCaptionRowHeight = (
  textLength: number,
  listWidthPx = CAPTION_LIST_ESTIMATE_WIDTH_PX
): number => {
  const lines = Math.max(1, Math.ceil(Math.max(0, textLength) / captionCharsPerLine(listWidthPx)))
  return CAPTION_ROW_HEADER_PX + lines * CAPTION_ROW_LINE_PX + CAPTION_ROW_GAP_PX
}

/**
 * Estimated scrollTop that vertically centers the caption at `index`.
 *
 * Matches the virtualizer's row-height guess so the first paint can already
 * mount the playing line instead of rendering the top (or bottom) first.
 */
export const estimateCaptionListOffset = (
  textLengths: readonly number[],
  index: number,
  viewportHeight: number,
  listWidthPx = CAPTION_LIST_ESTIMATE_WIDTH_PX
): number => {
  if (textLengths.length === 0 || viewportHeight <= 0) {
    return 0
  }
  const clamped = Math.min(Math.max(index, 0), textLengths.length - 1)
  let start = CAPTION_LIST_PADDING_PX
  let total = CAPTION_LIST_PADDING_PX
  let itemSize = 0
  for (const [rowIndex, length] of textLengths.entries()) {
    const size = estimateCaptionRowHeight(length, listWidthPx)
    if (rowIndex === clamped) {
      start = total
      itemSize = size
    }
    total += size
  }
  total += CAPTION_LIST_PADDING_PX
  const offset = start + itemSize / 2 - viewportHeight / 2
  const max = Math.max(0, total - viewportHeight)
  return Math.max(0, Math.min(max, Math.round(offset)))
}

/**
 * Keep a usable viewport while the captions scroller reports no layout yet.
 */
export const resolveCaptionListRect = (
  rect: { height: number; width: number },
  fallback = CAPTION_LIST_INITIAL_RECT
): { height: number; width: number } => ({
  height: rect.height > 0 ? rect.height : fallback.height,
  width: rect.width > 0 ? rect.width : fallback.width
})

/**
 * Observe the captions scroller without collapsing the list when height is 0.
 */
export const observeCaptionListRect = (
  instance: CaptionListVirtualizer,
  cb: (rect: { height: number; width: number }) => void
): ReturnType<typeof observeElementRect> =>
  observeElementRect(instance, (rect) => {
    cb(resolveCaptionListRect(rect, instance.options.initialRect ?? CAPTION_LIST_INITIAL_RECT))
  })

/**
 * Measure a caption row, falling back to the estimate when layout is still 0.
 */
export const measureCaptionRow = (
  element: Element,
  entry: ResizeObserverEntry | undefined,
  instance: CaptionListVirtualizer
): number => {
  const box = entry?.borderBoxSize?.[0]
  const measured = box ? Math.round(box.blockSize) : (element as HTMLElement).offsetHeight
  if (measured > 0) {
    return measured
  }
  const index = instance.indexFromElement(element)
  return instance.options.estimateSize(Number.isFinite(index) ? index : 0)
}
