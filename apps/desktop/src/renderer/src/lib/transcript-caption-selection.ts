import { formatClock } from '@renderer/lib/format-clock'
import type { TranscriptSegmentView } from '@renderer/store/transcripts'

export const CAPTION_SELECT_HOLD_MS = 200
export const CAPTION_SELECT_MOVE_PX = 4

export interface CaptionSelection {
  ids: string[]
}

export interface CaptionRect {
  bottom: number
  left: number
  right: number
  top: number
}

export interface CaptionMarquee {
  x1: number
  x2: number
  y1: number
  y2: number
}

export interface CaptionQuoteBlock {
  endMs: number
  speaker: string
  speakerId: string | null
  startMs: number
  text: string
}

export interface CaptionShareQuote {
  after: string
  before: string
  endMs: number
  quote: string
  startMs: number
}

/**
 * Axis-aligned box from two pointer corners.
 *
 * @param x1 First corner x.
 * @param y1 First corner y.
 * @param x2 Second corner x.
 * @param y2 Second corner y.
 */
export const captionMarqueeRect = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): CaptionRect => ({
  bottom: Math.max(y1, y2),
  left: Math.min(x1, x2),
  right: Math.max(x1, x2),
  top: Math.min(y1, y2)
})

/**
 * Overlay style for a Finder-style selection rectangle.
 *
 * @param marquee Pointer corners in overlay coordinates.
 */
export const captionMarqueeStyle = (
  marquee: CaptionMarquee
): CaptionRect & { height: number; width: number } => {
  const box = captionMarqueeRect(marquee.x1, marquee.y1, marquee.x2, marquee.y2)
  return {
    ...box,
    height: Math.max(1, box.bottom - box.top),
    width: Math.max(1, box.right - box.left)
  }
}

/**
 * True when two axis-aligned boxes overlap.
 *
 * @param left First box.
 * @param right Second box.
 */
export const captionRectsOverlap = (left: CaptionRect, right: CaptionRect): boolean =>
  left.left < right.right &&
  left.right > right.left &&
  left.top < right.bottom &&
  left.bottom > right.top

/**
 * Segment ids whose rows intersect the marquee, in any order.
 *
 * @param rows Visible caption rows with client rects.
 * @param marquee Marquee in the same coordinate space as the rows.
 */
export const captionSegmentIdsInMarquee = (
  rows: Array<{ id: string; rect: CaptionRect }>,
  marquee: CaptionRect
): string[] => rows.filter((row) => captionRectsOverlap(row.rect, marquee)).map((row) => row.id)

/**
 * Selected lines in document order, or null when nothing is selected.
 *
 * @param ids Hit segment ids, in any order.
 * @param segmentIds Segment ids in display order.
 */
export const captionSelectionFromSegmentIds = (
  ids: string[],
  segmentIds: string[]
): CaptionSelection | null => {
  const selected = new Set(ids)
  const ordered = segmentIds.filter((id) => selected.has(id))
  return ordered.length > 0 ? { ids: ordered } : null
}

/**
 * Keep the current selection and add newly hit lines.
 *
 * @param current Existing selection.
 * @param addedIds Newly hit segment ids.
 * @param segmentIds Segment ids in display order.
 */
export const mergeCaptionSelection = (
  current: CaptionSelection | null,
  addedIds: string[],
  segmentIds: string[]
): CaptionSelection | null =>
  captionSelectionFromSegmentIds([...(current?.ids ?? []), ...addedIds], segmentIds)

/**
 * True when this caption line is in the selection.
 *
 * @param selection Current selected lines.
 * @param segmentId Line to test.
 */
export const isCaptionSegmentSelected = (
  selection: CaptionSelection | null,
  segmentId: string
): boolean => Boolean(selection?.ids?.includes(segmentId))

/**
 * Add or drop one caption line in the selection.
 *
 * @param current Existing selection.
 * @param segmentId Line to toggle.
 * @param segmentIds Segment ids in display order.
 */
export const toggleCaptionSelection = (
  current: CaptionSelection | null,
  segmentId: string,
  segmentIds: string[]
): CaptionSelection | null => {
  if (isCaptionSegmentSelected(current, segmentId)) {
    return captionSelectionFromSegmentIds(
      (current?.ids ?? []).filter((id) => id !== segmentId),
      segmentIds
    )
  }
  return mergeCaptionSelection(current, [segmentId], segmentIds)
}

/**
 * Build quote blocks for the share card and copy text.
 *
 * Consecutive lines from the same speaker stay in one block.
 *
 * @param segments Caption lines in display order.
 * @param selection Selected lines.
 * @param resolveSpeaker Speaker label for a speaker id.
 */
export const buildCaptionQuoteBlocks = (
  segments: TranscriptSegmentView[],
  selection: CaptionSelection,
  resolveSpeaker: (speakerId: string | null) => string
): CaptionQuoteBlock[] => {
  const blocks: CaptionQuoteBlock[] = []
  for (const segment of segments) {
    if (!isCaptionSegmentSelected(selection, segment.id)) {
      continue
    }
    const text = segment.text.trim()
    if (!text) {
      continue
    }
    const previous = blocks.at(-1)
    if (previous && previous.speakerId === segment.speakerId) {
      previous.endMs = segment.endMs
      previous.text = `${previous.text}\n${text}`
      continue
    }
    blocks.push({
      endMs: segment.endMs,
      speaker: resolveSpeaker(segment.speakerId),
      speakerId: segment.speakerId,
      startMs: segment.startMs,
      text
    })
  }
  return blocks
}

/**
 * Quote plus neighboring lines for the cinematic share card.
 *
 * @param segments Caption lines in display order.
 * @param selection Selected lines.
 */
export const buildCaptionShareQuote = (
  segments: TranscriptSegmentView[],
  selection: CaptionSelection
): CaptionShareQuote | null => {
  const selected = segments.filter((segment) => isCaptionSegmentSelected(selection, segment.id))
  if (selected.length === 0) {
    return null
  }
  const firstIndex = segments.findIndex((segment) => segment.id === selected[0]?.id)
  const lastSelected = selected.at(-1)
  const lastIndex = lastSelected
    ? segments.findLastIndex((segment) => segment.id === lastSelected.id)
    : -1
  const quote = selected
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join('\n')
  if (!quote) {
    return null
  }
  return {
    after: lastIndex >= 0 ? (segments[lastIndex + 1]?.text.trim() ?? '') : '',
    before: firstIndex > 0 ? (segments[firstIndex - 1]?.text.trim() ?? '') : '',
    endMs: lastSelected?.endMs ?? selected[0]?.endMs ?? 0,
    quote,
    startMs: selected[0]?.startMs ?? 0
  }
}

/**
 * Plain-text form of selected caption quotes.
 *
 * @param blocks Quote blocks from the current selection.
 */
export const formatCaptionQuoteText = (blocks: CaptionQuoteBlock[]): string =>
  blocks
    .map((block) => `${block.speaker}  ${formatClock(block.startMs / 1000)}\n${block.text}`)
    .join('\n\n')
