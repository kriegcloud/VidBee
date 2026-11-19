import { networkRefusals } from './network.mjs'
import { afterAll, afterEach, beforeEach, expect, it } from '@effect/vitest'
import { vi } from 'vitest'
import { act } from 'react'
import { readFileSync } from 'node:fs'
import { Harness, deferred, flush, now, pure, url } from './harness.mjs'
import { source, hashes, gitSource, frozenOnly, observations } from './entry-loader.mjs'

let owned = []
const make = options => { const h = new Harness(options); owned.push(h); return h }
async function settle() { for (let i = 0; i < 10; i++) await flush() }
const entry = (status = 'ready', info = { title: 'Audit fixture', formats: [] }) => ({ url, status, fetchedAt: now, info })
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }); vi.setSystemTime(now)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => { expect(networkRefusals).toEqual([]); networkRefusals.length = 0; for (const h of owned) await h.close(); owned = []; vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })
afterAll(() => expect(observations.current).toBeGreaterThan(0))

it('frozen source SHA-256 manifest is enforced even without git history', () => {
  for (const entry of Object.keys(hashes)) expect(source(entry, true)).toBeTypeOf('string')
})
const historyPresent = Object.keys(hashes).every(entry => gitSource(entry) !== undefined)
it.skipIf(!historyPresent)(`frozen source equals git 0739410${historyPresent ? '' : ' (SKIPPED: baseline history unavailable; SHA-256 still checked)'}`, () => {
  for (const entry of Object.keys(hashes)) expect(source(entry, true)).toBe(gitSource(entry))
})

it.each(['VidBeep app not found on localhost.', 'connection refused', 'Request timed out.', 'VidBeep app not responding on this port.'])('connection classifier renders complete cached error %s', async error => {
  const results = []
  for (const old of [true, false]) {
    const h = await make({ old, map: { [url]: { ...entry('error'), error } } }).popup()
    results.push({ trace: h.trace, html: h.html() })
  }
  expect(results[1]).toEqual(results[0]); expect(results[0]).toMatchSnapshot()
})

it.each([undefined, null, false, 0, '', 7, {}, 'not a URL'])('message URL admission settles before complete observation: %j', async value => {
  const results = []
  for (const old of [true, false]) {
    const h = make({ old }).background()
    expect(h.message({ type: 'video-info:fetch', url: value })).toBeUndefined()
    await settle(); results.push(h.trace)
    if (!value) expect(h.trace).toEqual([['message:add']])
  }
  // Before the port: expect(results[1]).toEqual(results[0])
  expect(results[1]).toEqual(!frozenOnly && value && typeof value !== 'string' ? [['message:add']] : results[0])
  expect(results[0]).toMatchSnapshot()
})

it.each(['success', 'metadata failure', 'no ports'])('releases URL admission after %s, retaining icon/write order and target', async mode => {
  const results = []
  for (const old of [true, false]) {
    const h = make({ old }).background()
    h.http = target => Promise.resolve(h.response(target.endsWith('/token') ? { token: 'x' } : {}, mode === 'no ports' || mode === 'metadata failure' && target.includes('/video-info') ? 503 : 200))
    h.message(); await settle()
    const first = h.trace.length
    h.message(undefined, { tab: { id: 9 } }); await settle()
    expect(h.trace.length).toBeGreaterThan(first)
    if (mode === 'no ports') expect(h.trace.filter(t => t[0] === 'fetch')).toHaveLength(42)
    if (mode === 'success') expect(h.trace.filter(t => t[0] === 'fetch')).toHaveLength(3)
    results.push({ first, trace: h.trace, map: h.map })
  }
  expect(results[1]).toEqual(results[0]); expect(results[0]).toMatchSnapshot()
})

it.each([[27110, 'TypeError'], [null, 'TypeError'], [27110, 'Error'], [null, 'Error']])('discovery swallows rejected closed ports until %s (%s)', async (selected, kind) => {
  const results = []
  for (const old of [true, false]) {
    const h = make({ old }).background()
    h.http = target => target.endsWith('/status') && Number(new URL(target).port) !== selected
      ? Promise.reject(kind === 'TypeError' ? new TypeError('Failed to fetch') : new Error('Failed to fetch'))
      : Promise.resolve(h.response(target.endsWith('/token') ? { token: 'x' } : {}))
    h.message(); await settle(); results.push({ trace: h.trace, map: h.map })
  }
  expect(results[1]).toEqual(results[0]); expect(results[0]).toMatchSnapshot()
})
it.each(['http', 'transport'])('token %s failure does not resume scanning; default icon follows error save', async mode => {
  const results = []
  for (const old of [true, false]) {
    const h = make({ old }).background()
    h.http = target => target.endsWith('/token')
      ? mode === 'http' ? Promise.resolve(h.response({ error: 'token rejected' }, 500)) : Promise.reject(new Error('Failed to fetch'))
      : Promise.resolve(h.response({}))
    h.message(); await settle(); results.push({ trace: h.trace, map: h.map })
    expect(h.trace.filter(t => t[0] === 'fetch')).toHaveLength(2)
  }
  expect(results[1]).toEqual(results[0]); expect(results[0]).toMatchSnapshot()
})

it('byte unit labels and precision boundaries remain exact', () => {
  const values = [102350, 102399, 102400, 1048575, 1048576, 104857600, 157286400]
  const previous = values.map(pure(true).formatBytes), current = values.map(pure().formatBytes)
  expect(current).toEqual(previous)
  expect(previous).toEqual(['100.0 KB', '100.0 KB', '100 KB', '1024 KB', '1.0 MB', '100 MB', '150 MB'])
})

it('malformed notification entries keep complete UI or fail without invented transitions', async () => {
  const entries = [{ status: 'ready' }, { status: 'ready', info: null }, { status: 'error' }, { status: 'error', error: '' }, { status: 'error', error: 7 }, { status: 'unknown' }]
  const results = [], expected = []
  for (const old of [true, false]) {
    const side = []
    for (const next of entries) {
      const h = await make({ old, map: { [url]: entry() } }).popup()
      await h.change({ [url]: entry('pending') })
      const pendingHtml = h.html()
      let failure
      try { await h.change({ [url]: next }) } catch { failure = { engine: true } }
      side.push({ next, failure, html: h.html(), trace: h.trace })
      if (old) expected.push({ next, failure: undefined, html: pendingHtml, trace: h.trace })
    }
    results.push(side)
  }
  // Before the port: expect(results[1]).toEqual(results[0])
  expect(results[1]).toEqual(frozenOnly ? results[0] : expected)
  expect(results[0]).toMatchSnapshot()
})

it('released StrictMode initialization overwrites the visible title and navigation URL', async () => {
  const results = []
  for (const old of [true, false]) {
    const older = 'https://older.invalid/'
    const h = make({ old, map: { [url]: entry(), [older]: { ...entry('ready', { title: 'Released initialization wins', formats: [] }), url: older } } })
    const queries = [deferred(), deferred()]; let index = 0
    h.query = () => queries[index++].promise
    await h.popup()
    await act(async () => { queries[1].resolve([{ url }]); await settle() })
    expect(h.html()).toContain('Audit fixture')
    await act(async () => { queries[0].resolve([{ url: older }]); await settle() })
    expect(h.html()).toContain('Released initialization wins')
    await h.click('Download with VidBeep')
    expect(h.navigation).toEqual([`vidbee://download?url=${encodeURIComponent(older)}`])
    results.push({ trace: h.trace, html: h.html(), navigation: h.navigation })
  }
  expect(results[1]).toEqual(results[0]); expect(results[0]).toMatchSnapshot()
})

it('final popup unmount removes the exact surviving listener', async () => {
  const results = []
  for (const old of [true, false]) {
    const h = await make({ old }).popup()
    expect(h.listeners).toHaveLength(1)
    await h.close(); h.root = undefined
    expect(h.listeners).toEqual([])
    expect(h.trace.at(-1)).toEqual(['storage:remove', 0])
    results.push(h.trace)
  }
  expect(results[1]).toEqual(results[0]); expect(results[0]).toMatchSnapshot()
})

it('complete WXT manifest pins trusted key, permissions and locale identity', () => {
  const h = make()
  const config = h.evaluate(readFileSync(new URL('../wxt.config.ts', import.meta.url), 'utf8'), 'wxt.config.ts', {
    require: name => { if (name === 'wxt') return { defineConfig: config => config }; throw new Error(`Unexpected config dependency: ${name}`) }
  }).default
  expect(config).toMatchSnapshot()
})


it.each(['error-ready', 'ready-error'])('cached branch preserves the opposite field across released initialization: %s', async order => {
  const results = []
  for (const old of [true, false]) {
    const older = 'https://older.invalid/'
    const ready = { url, status: 'ready', fetchedAt: now, info: { title: 'Retained info', formats: [] } }
    const error = { url, status: 'error', fetchedAt: now, error: 'Retained error' }
    const [first, last] = order === 'error-ready' ? [error, ready] : [ready, error]
    const h = make({ old, map: { [url]: first, [older]: { ...last, url: older } } })
    const queries = [deferred(), deferred()]; let index = 0
    h.query = () => queries[index++].promise
    await h.popup()
    await act(async () => { queries[1].resolve([{ url }]); await settle() })
    await act(async () => { queries[0].resolve([{ url: older }]); await settle() })
    results.push(h.html())
  }
  expect(results[1]).toEqual(results[0])
  expect(results[0]).toContain('Retained error')
})


it.each(['ready', 'error'])('frozen cached %s branch writes only its own field and loading', status => {
  const text = source('entrypoints/popup/App.tsx', true)
  const start = text.indexOf('      if (cached && !shouldBypassCache)')
  const end = text.indexOf('      try {', start)
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start)
  const info = { title: 'Retained info', formats: [] }
  const state = { info, error: 'Retained error', loading: true }, writes = []
  const h = make({ old: true })
  const api = h.evaluate(`export const cachedHit = () => { ${text.slice(start, end)} }`, 'cached.ts', {
    cached: { status, info, error: 'Retained error' }, shouldBypassCache: false,
    sanitizeError: pure(true).sanitizeError,
    setInfo: value => { state.info = value; writes.push(['info', value]) },
    setError: value => { state.error = value; writes.push(['error', value]) },
    setLoading: value => { state.loading = value; writes.push(['loading', value]) }
  })
  api.cachedHit()
  expect(state).toEqual({ info, error: 'Retained error', loading: false })
  expect(writes).toEqual([[status === 'ready' ? 'info' : 'error', status === 'ready' ? info : 'Retained error'], ['loading', false]])
})
