import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LIST_MARQUEE_EDGE_PX,
  listItemIdsInMarquee,
  listMarqueeGatedScrollStep,
  listMarqueeRect,
  listMarqueeScrollStep,
  listRectToLocal
} from '../../../packages/ui/src/lib/list-marquee'

/**
 * A row's box in client coordinates once the list has scrolled by `scrollTop`.
 * The list element and its rows move together, which is the whole point.
 */
const clientRow = (contentTop: number, height: number, scrollTop: number) => ({
  bottom: contentTop + height - scrollTop,
  left: 0,
  right: 800,
  top: contentTop - scrollTop
})

/** The list element's own client-space origin at a given scroll offset. */
const listOrigin = (scrollTop: number) => ({ left: 0, top: -scrollTop })

test('a marquee anchored in list-local space keeps the rows that scrolled away', () => {
  // Ten 100px rows; the viewport only ever shows about three of them.
  const rows = Array.from({ length: 10 }, (_, index) => ({
    id: `row-${index}`,
    contentTop: index * 100
  }))
  // Drag starts on row 0 and the list is scrolled to row 9 by the time it ends.
  const anchorLocalY = 10
  const scrollTop = 700
  const pointerClientY = 250
  const currentLocalY = pointerClientY - listOrigin(scrollTop).top

  const box = listMarqueeRect(0, anchorLocalY, 800, currentLocalY)
  const local = rows.map((row) => ({
    id: row.id,
    rect: listRectToLocal(clientRow(row.contentTop, 100, scrollTop), listOrigin(scrollTop))
  }))

  // Every row from the anchor down to the pointer, not just the visible window.
  assert.deepEqual(listItemIdsInMarquee(local, box), [
    'row-0',
    'row-1',
    'row-2',
    'row-3',
    'row-4',
    'row-5',
    'row-6',
    'row-7',
    'row-8',
    'row-9'
  ])
})

test('a row keeps the same list-local box no matter how far the list scrolled', () => {
  const unscrolled = listRectToLocal(clientRow(500, 96, 0), listOrigin(0))
  const scrolled = listRectToLocal(clientRow(500, 96, 420), listOrigin(420))
  assert.deepEqual(scrolled, unscrolled)
  assert.equal(unscrolled.top, 500)
})

test('edge auto-scroll only runs inside the edge bands, and ramps toward the edge', () => {
  const bounds = { bottom: 900, top: 100 }
  assert.equal(listMarqueeScrollStep(500, bounds), 0)
  assert.equal(listMarqueeScrollStep(100 + LIST_MARQUEE_EDGE_PX, bounds), 0)
  assert.equal(listMarqueeScrollStep(900 - LIST_MARQUEE_EDGE_PX, bounds), 0)

  const nearTop = listMarqueeScrollStep(110, bounds)
  const atTop = listMarqueeScrollStep(100, bounds)
  assert.ok(nearTop < 0 && atTop < nearTop, 'scrolls up faster closer to the top edge')

  const nearBottom = listMarqueeScrollStep(890, bounds)
  const atBottom = listMarqueeScrollStep(900, bounds)
  assert.ok(nearBottom > 0 && atBottom > nearBottom, 'scrolls down faster closer to the bottom')

  // Past the edge entirely (the pointer left the window) stays clamped.
  assert.equal(listMarqueeScrollStep(40, bounds), atTop)
  assert.equal(listMarqueeScrollStep(1200, bounds), atBottom)
})

/** Feed pointer samples through the gate the way the auto-scroll loop does. */
const replayGate = (samples: number[], bounds: { bottom: number; top: number }) => {
  let armed = false
  return samples.map((clientY) => {
    const result = listMarqueeGatedScrollStep(armed, clientY, bounds)
    armed = result.armed
    return result.step
  })
}

test('a long-press inside the bottom edge band does not auto-scroll until it leaves the band', () => {
  const bounds = { bottom: 900, top: 100 }
  // Held still on the last visible row, then a small wiggle that stays in the band.
  assert.deepEqual(replayGate([880, 880, 880, 870, 890], bounds), [0, 0, 0, 0, 0])
  // Same for the top band.
  assert.deepEqual(replayGate([110, 110, 120], bounds), [0, 0, 0])
})

test('after leaving the edge band, re-entering it scrolls', () => {
  const bounds = { bottom: 900, top: 100 }
  const steps = replayGate([880, 500, 880, 895], bounds)
  assert.equal(steps[0], 0, 'still disarmed while the press starts inside the band')
  assert.equal(steps[1], 0, 'outside the band there is nothing to scroll, but the gate arms')
  assert.equal(steps[2], listMarqueeScrollStep(880, bounds))
  assert.ok((steps[2] ?? 0) > 0 && (steps[3] ?? 0) > (steps[2] ?? 0))
  // Arming carries over to the opposite band too.
  assert.ok((replayGate([880, 500, 105], bounds)[2] ?? 0) < 0)
})

test('a gesture that starts outside the bands arms immediately', () => {
  const bounds = { bottom: 900, top: 100 }
  const first = listMarqueeGatedScrollStep(false, 500, bounds)
  assert.deepEqual(first, { armed: true, step: 0 })
  assert.ok(listMarqueeGatedScrollStep(first.armed, 890, bounds).step > 0)
})
