import { networkRefusals } from './network.mjs'
import { afterAll } from '@effect/vitest'
import { observations } from './entry-loader.mjs'
afterAll(() => expect(observations.current).toBeGreaterThan(0))
import { afterEach, beforeEach, expect, it } from '@effect/vitest'
import { vi } from 'vitest'
import { act } from 'react'
import { Harness, clone, flush, now, url } from './harness.mjs'

let owned = []
const make = options => { const h = new Harness(options); owned.push(h); return h }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }); vi.setSystemTime(now)
  vi.stubGlobal('fetch', () => { throw new Error('Real network prohibited') })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => { expect(networkRefusals).toEqual([]); networkRefusals.length = 0; for (const h of owned) await h.close(); owned = []; vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

const values = [undefined, null, false, true, 0, 7, NaN, '', '0', '1', '60', '1024', 'x', [], {}, [1024]]
const sample = () => ({ title: 'Neighbor title', duration: 90, thumbnail: 'https://image.invalid/cover.png', extra: { untouched: true }, formats: [{ format_id: 'id', ext: 'mp4', height: 720, vcodec: 'h264', acodec: 'aac', filesize: 1024, extra: 1 }] })
async function observe(info, old) {
  const h = make({ old, info }).background(); h.message(); await flush()
  let failure
  try { await h.popup() } catch (error) { failure = { engine: true } }
  const result = { writes: h.trace.filter(item => item[0] === 'set'), html: h.html(), failure }
  await h.close(); h.root = undefined
  return result
}

it('per-field response-to-storage-to-render oracle; section 9 differences must stay case-specific', async () => {
  const cases = []
  for (const field of ['title', 'duration', 'thumbnail', 'formats']) {
    for (const value of values) { const info = sample(); info[field] = value; cases.push({ field, value, info }) }
  }
  for (const field of ['format_id', 'ext', 'format_note', 'resolution', 'width', 'height', 'fps', 'vcodec', 'acodec', 'filesize', 'filesize_approx', 'tbr']) {
    for (const value of values) { const info = sample(); info.formats[0][field] = value; cases.push({ field: `formats[0].${field}`, value, info }) }
  }
  // Remove competing classification signals so each substituted signal is observable.
  for (const field of ['vcodec', 'acodec', 'resolution', 'width', 'height']) {
    for (const value of values) {
      const info = sample(); info.formats = [{ format_id: 'signal', ext: 'mp4', [field]: value }]
      cases.push({ field: `isolated signal.${field}`, value, info })
    }
  }
  for (const root of [undefined, null, false, true, 0, 7, '', 'root', [], [null], {}]) cases.push({ field: 'root', value: root, info: root })
  for (const element of [null, false, true, 0, 7, '', 'format', [], {}]) { const info = sample(); info.formats.push(element); cases.push({ field: 'element', value: element, info }) }
  for (const [filesize, filesize_approx, height, resolution] of [[0, 2048, 0, '1280x720'], [1024, 2048, 1080, '1280x720'], [null, '1024', null, 'audio only']]) {
    const info = sample(); Object.assign(info.formats[0], { filesize, filesize_approx, height, resolution }); cases.push({ field: 'interacting pair', info })
  }
  const results = []
  for (const test of cases) {
    const previous = await observe(test.info, true), current = await observe(test.info, false)
    expect(current).toEqual(previous)
    results.push({ field: test.field, value: test.value, declaredChange: 'section 9 independent field/root/element decoding; retain old expectation beside future result', ...previous })
  }
  expect(results).toMatchSnapshot()
}, 120000)

it('selected historical entry matrix and popup status guards retain raw values', async () => {
  const cases = [undefined, null, false, true, 0, 7, '', 'entry', {}, { status: 'ready' }, { status: 'ready', info: {} }, { status: 'error' }, { status: 'pending' }]
  const valid = { url, status: 'ready', fetchedAt: now, info: { title: 'Stored', formats: [] } }
  for (const field of ['url', 'status', 'fetchedAt', 'info', 'error']) for (const value of values) cases.push({ ...valid, [field]: value })
  const results = []
  for (const entry of cases) {
    const h = make({ map: { [url]: entry, unrelated: { opaque: [1, null, 'raw'] } } })
    let failure
    try { await h.popup() } catch (error) { failure = { engine: true } }
    results.push({ entry, html: h.html(), trace: h.trace, failure, declaredChange: 'section 9 selected entry decode' })
    await h.close(); h.root = undefined
  }
  expect(results).toMatchSnapshot()
}, 120000)

it('popup storage root and notification roots do not substitute presentation state', async () => {
  const results = []
  for (const map of [undefined, null, false, 0, '', true, 1, 'x', [], [null]]) {
    const h = await make({ map }).popup()
    const before = h.html()
    await h.change(map)
    results.push({ map, before, after: h.html(), trace: h.trace, declaredChange: 'section 9 storage root decoder ends initialization' })
    await h.close(); h.root = undefined
  }
  expect(results).toMatchSnapshot()
})

it('retry while send/read suspended retains earlier initialization continuations', async () => {
  const h = await make({ map: { [url]: { url, status: 'error', fetchedAt: now, error: 'disk full' } } }).popup()
  const send = Promise.withResolvers()
  h.send = () => send.promise
  await h.click('Retry')
  await h.change({ [url]: { url, status: 'error', fetchedAt: now, error: 'try again' } })
  await h.click('Retry')
  const before = h.trace.length
  await act(async () => { send.resolve(); await flush() })
  expect({ before, trace: h.trace, html: h.html() }).toMatchSnapshot()
})
