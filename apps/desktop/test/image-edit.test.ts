import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildFilter,
  centeredCrop,
  dragCrop,
  flipCrop,
  INITIAL_EDIT_STATE,
  isNeutralEdit,
  NEUTRAL_ADJUSTMENTS,
  type NormalizedRect,
  outputSize,
  rotateCrop
} from '../src/renderer/src/lib/image-edit'

const near = (actual: number, expected: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ''} ${actual} ≉ ${expected}`)

/** Pixel aspect of a normalized crop inside a frame of the given aspect. */
const pixelAspect = (crop: NormalizedRect, frameAspect: number) =>
  (crop.width * frameAspect) / crop.height

test('neutral adjustments produce no filter and a neutral edit', () => {
  assert.equal(buildFilter(NEUTRAL_ADJUSTMENTS), 'none')
  assert.ok(isNeutralEdit(INITIAL_EDIT_STATE))
  assert.equal(
    buildFilter({ ...NEUTRAL_ADJUSTMENTS, brightness: 120, blur: 4 }, 0.5),
    'brightness(120%) blur(2.00px)'
  )
})

test('centeredCrop fits the requested pixel ratio inside the frame', () => {
  for (const frameAspect of [16 / 9, 1, 9 / 16, 4 / 5]) {
    for (const ratio of [1, 4 / 5, 16 / 9, 9 / 16]) {
      const crop = centeredCrop(ratio, frameAspect)
      near(pixelAspect(crop, frameAspect), ratio, `frame ${frameAspect} ratio ${ratio}`)
      assert.ok(crop.width <= 1 + 1e-9 && crop.height <= 1 + 1e-9)
      near(crop.x, (1 - crop.width) / 2)
      near(crop.y, (1 - crop.height) / 2)
    }
  }
})

test('outputSize swaps for quarter turns and follows crop + resize', () => {
  assert.deepEqual(outputSize(4000, 3000, INITIAL_EDIT_STATE), { height: 3000, width: 4000 })
  assert.deepEqual(outputSize(4000, 3000, { ...INITIAL_EDIT_STATE, rotation: 90 }), {
    height: 4000,
    width: 3000
  })
  const cropped = { ...INITIAL_EDIT_STATE, crop: { height: 0.5, width: 0.5, x: 0, y: 0 } }
  assert.deepEqual(outputSize(4000, 3000, cropped), { height: 1500, width: 2000 })
  assert.deepEqual(outputSize(4000, 3000, { ...cropped, resizeWidth: 1000 }), {
    height: 750,
    width: 1000
  })
})

test('rotateCrop keeps the same image region through four turns', () => {
  const crop = { height: 0.3, width: 0.2, x: 0.1, y: 0.05 }
  let current: NormalizedRect | null = crop
  for (let turn = 0; turn < 4; turn++) {
    current = rotateCrop(current, true)
  }
  assert.ok(current)
  near(current.x, crop.x)
  near(current.y, crop.y)
  near(current.width, crop.width)
  near(current.height, crop.height)
  const back = rotateCrop(rotateCrop(crop, true), false)
  assert.ok(back)
  near(back.x, crop.x)
  near(back.y, crop.y)
})

test('clockwise rotateCrop maps the top-left corner to the top-right', () => {
  const rotated = rotateCrop({ height: 0.25, width: 0.5, x: 0, y: 0 }, true)
  assert.ok(rotated)
  near(rotated.x, 0.75)
  near(rotated.y, 0)
  near(rotated.width, 0.25)
  near(rotated.height, 0.5)
})

test('flipCrop mirrors along the requested axis', () => {
  const crop = { height: 0.2, width: 0.3, x: 0.1, y: 0.6 }
  const horizontal = flipCrop(crop, 'horizontal')
  assert.ok(horizontal)
  near(horizontal.x, 0.6)
  near(horizontal.y, crop.y)
  const vertical = flipCrop(crop, 'vertical')
  assert.ok(vertical)
  near(vertical.y, 0.2)
})

test('dragCrop free-form resize stays inside the frame', () => {
  const start = { height: 0.5, width: 0.5, x: 0.25, y: 0.25 }
  const grown = dragCrop(start, 'se', 1, 1, null, 1)
  near(grown.x + grown.width, 1)
  near(grown.y + grown.height, 1)
  const moved = dragCrop(start, 'move', 0.9, -0.9, null, 1)
  near(moved.x, 0.5)
  near(moved.y, 0)
})

test('dragCrop keeps a locked pixel ratio from every handle', () => {
  const frameAspect = 16 / 9
  const ratio = 4 / 5
  const start = centeredCrop(ratio, frameAspect)
  const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const
  for (const handle of handles) {
    for (const [dx, dy] of [
      [0.05, 0.05],
      [-0.05, -0.05],
      [0.4, -0.3]
    ] as const) {
      const next = dragCrop(start, handle, dx, dy, ratio, frameAspect)
      near(pixelAspect(next, frameAspect), ratio, `handle ${handle} (${dx},${dy})`)
      assert.ok(next.x >= -1e-9 && next.y >= -1e-9, `origin inside for ${handle}`)
      assert.ok(next.x + next.width <= 1 + 1e-9, `right edge inside for ${handle}`)
      assert.ok(next.y + next.height <= 1 + 1e-9, `bottom edge inside for ${handle}`)
    }
  }
})
