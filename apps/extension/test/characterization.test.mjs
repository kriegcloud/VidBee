import { networkRefusals } from './network.mjs'
import { afterAll } from '@effect/vitest'
import { observations } from './entry-loader.mjs'
afterAll(() => expect(observations.current).toBeGreaterThan(0))
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest'
import { vi } from 'vitest'
import { act } from 'react'
import { readFileSync } from 'node:fs'
import { Harness, clone, deferred, flush, now, outcome, pure, url } from './harness.mjs'

let owned = []
const make = options => { const h = new Harness(options); owned.push(h); return h }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(now)
  vi.stubGlobal('fetch', () => { throw new Error('Real network prohibited') })
})
afterEach(async () => { expect(networkRefusals).toEqual([]); networkRefusals.length = 0; for (const h of owned) await h.close(); owned = []; vi.useRealTimers(); vi.unstubAllGlobals() })
const entry = (status = 'ready', info = { title: 'Fixture', formats: [] }, fetchedAt = now) => ({ url, status, fetchedAt, info })
const fetches = h => h.trace.filter(item => item[0] === 'fetch')
const writes = h => h.trace.filter(item => item[0] === 'set')

it('pins complete request, storage, icon and message ordering against git', async () => {
  const traces = []
  for (const old of [true, false]) {
    const h = make({ old }).background()
    expect(h.message()).toBeUndefined()
    expect(h.message({ type: 'ignored', url })).toBeUndefined()
    expect(h.message({ type: 'video-info:fetch', url: '' })).toBeUndefined()
    await flush()
    traces.push(h.trace)
  }
  expect(traces[1]).toEqual(traces[0])
  expect(traces[0]).toMatchSnapshot()
})

it.each([27100, 27110, 27120, null])('scans to %s, then stops; all failed ports exhaust', async port => {
  const h = make().background()
  h.http = target => Promise.resolve(h.response(target.endsWith('/status') ? false : target.endsWith('/token') ? { token: 7 } : {}, target.endsWith('/status') && Number(new URL(target).port) !== port ? 503 : 200))
  h.message(); await flush()
  expect(fetches(h).map(item => item.slice(1))).toMatchSnapshot()
  expect(writes(h)).toMatchSnapshot()
})

it.each([null, false, 0, 'status', [], {}, { ok: false }, 'malformed'])('accepts successful status body %j', async body => {
  const h = make().background()
  h.http = target => Promise.resolve(target.endsWith('/status') && body === 'malformed' ? { ok: true, status: 200, json: () => Promise.reject(new Error('bad JSON')) } : h.response(target.endsWith('/status') ? body : target.endsWith('/token') ? { token: 'x' } : {}))
  h.message(); await flush()
  expect(fetches(h)).toHaveLength(3)
  expect(h.map[url]).toEqual(entry('ready', {}))
})

it.each([{}, { token: '' }, { token: false }, { token: 0 }, null, { token: true }, { token: ['a', 'b'] }])('pins token truthiness and encoding %j', async token => {
  const h = make().background()
  h.http = target => Promise.resolve(h.response(target.endsWith('/token') ? token : {}))
  h.message(); await flush()
  expect({ requests: fetches(h), stored: h.map }).toMatchSnapshot()
})

it('pins all truthy/falsy HTTP error and details combinations', async () => {
  const results = []
  for (const error of [undefined, null, false, 0, '', 'failure', true, 7, [], {}]) {
    for (const details of [undefined, null, false, 0, '', 'detail', true, 7, [], {}]) {
      const h = make().background()
      h.http = target => Promise.resolve(h.response(target.endsWith('/token') ? { token: 'x' } : target.endsWith('/status') ? {} : { error, details }, target.includes('/video-info') ? 500 : 200))
      h.message(); await flush()
      results.push({ error, details, stored: h.map[url] })
    }
  }
  expect(results).toMatchSnapshot()
}, 60000)

it.each([new DOMException('abort', 'AbortError'), new Error('signal is aborted'), new Error('Failed to fetch'), new Error('other'), 'timeout'])('pins transport cause %s', async error => {
  const h = make().background()
  h.http = target => target.includes('/video-info') ? Promise.reject(error) : Promise.resolve(h.response(target.endsWith('/token') ? { token: 'x' } : {}))
  h.message(); await flush()
  expect(h.map).toMatchSnapshot()
})

it.each(['status', 'token', 'video-info'])('keeps %s deadline active through response body', async phase => {
  const h = make().background()
  let signal
  h.http = (target, options) => {
    if (target.includes(`/${phase}`)) {
      signal = options.signal
      return Promise.resolve({ ok: true, status: 200, json: () => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))) })
    }
    return Promise.resolve(h.response(target.endsWith('/token') ? { token: 'x' } : {}))
  }
  h.message(); await flush()
  await vi.advanceTimersByTimeAsync(phase === 'video-info' ? 59999 : 799)
  expect(signal.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1); await flush()
  expect(signal.aborted).toBe(true)
  expect({ requests: fetches(h), stored: h.map }).toMatchSnapshot()
})

it.each([-1, 0, 1, 300000, 300001])('background TTL age %s and raw unrelated preservation', async age => {
  const map = { [url]: entry('ready', {}, now - age), raw: { extra: 'preserved' }, old: { fetchedAt: now - 300001 } }
  const h = make({ map }).background(); h.message(); await flush()
  expect(h.trace).toMatchSnapshot()
})

it.each(['pending', 'error', 'ready'])('background cache status %s', async status => {
  const h = make({ map: { [url]: entry(status) } }).background(); h.message(); await flush()
  expect(h.trace).toMatchSnapshot()
})

it('deduplicates same URL using first tab, zero tab ID uses global icon, detached icon cannot block', async () => {
  const h = make().background(); const blocked = deferred(); h.icon = () => blocked.promise
  h.message(undefined, { tab: { id: 0 } }); h.message(undefined, { tab: { id: 8 } }); await flush()
  expect(fetches(h)).toHaveLength(3)
  expect(h.trace.filter(item => item[0] === 'icon')).toMatchSnapshot()
  blocked.resolve()
})

it('pins whole-map concurrent lost updates', async () => {
  const h = make().background()
  h.message(); h.message({ type: 'video-info:fetch', url: 'https://second.invalid/' }); await flush()
  expect(writes(h)).toMatchSnapshot()
})

it('permanent pure scalar matrix plus boundaries', () => {
  const results = []
  const values = [undefined, null, false, true, 0, 1, -1, NaN, '', '0', '1', '60', '1024', 'x', 59.49, 59.5, 3599.5, 1023, 1024, 1024 ** 4]
  const old = pure(true), current = pure()
  for (const name of Object.keys(old)) {
    for (const value of values) {
      const input = name === 'isVideoFormat' || name === 'isAudioFormat' ? { vcodec: value, acodec: 'aac' } : value
      const previous = outcome(() => old[name](input)), next = outcome(() => current[name](input))
      if (previous.engine) expect(next.engine).toBe(true)
      else expect(next).toEqual(previous)
      results.push({ name, input, ...(previous.engine ? { engine: true } : previous) })
    }
  }
  expect(results).toMatchSnapshot()
})

it('popup StrictMode listener ordering, no tab, invalid and lowercase URL policy', async () => {
  for (const tab of ['', 'about:blank', 'HTTPS://example.invalid', null, 'http://', url]) {
    const h = await make({ tab }).popup()
    expect({ tab, trace: h.trace, html: h.html() }).toMatchSnapshot()
    expect(h.listeners).toHaveLength(1)
    expect(h.trace.slice(0, 5)).toEqual([['storage:add'], ['query', { active: true, currentWindow: true }], ['storage:remove', 0], ['storage:add'], ['query', { active: true, currentWindow: true }]])
  }
})

it.each([-1, 3600000, 3600001])('popup TTL age %s', async age => {
  const h = await make({ map: { [url]: entry('ready', {}, now - age) } }).popup()
  expect({ trace: h.trace, html: h.html() }).toMatchSnapshot()
})

it('popup cache, notifications, deleted entries, retry bypass and final read after send failure', async () => {
  const h = await make({ map: { [url]: entry() } }).popup()
  expect(h.trace.some(item => item[0] === 'send')).toBe(false)
  await h.change({ [url]: { ...entry('error'), error: 'NETWORK is down' } })
  expect(h.html()).toMatchSnapshot('connection error')
  expect([...h.window.document.querySelectorAll('a')].map(a => [a.getAttribute('href'), a.target, a.rel])).toEqual([['https://vidbee.app', '_blank', 'noopener noreferrer']])
  await h.change({ [url]: entry('pending') }); expect(h.html()).toMatchSnapshot('pending')
  await h.change({}); await h.change(null); await h.change({ [url]: entry() }, 'sync')
  expect(h.html()).toMatchSnapshot('ignored removals')
  await h.change({ [url]: { ...entry('error'), error: 'disk full' } })
  h.send = () => Promise.reject(new Error('Failed to request metadata'))
  await h.click('Retry')
  expect({ trace: h.trace, html: h.html() }).toMatchSnapshot('retry final read')
})

it('render ordering, duplicate IDs, thumbnails, audio/other count and all exact download URI bytes', async () => {
  const info = { title: 'Fixture title', thumbnail: 'https://image.invalid/cover.png', duration: 3599.5, formats: [
    { format_id: 'dup', ext: 'mp4', height: 720, vcodec: 'h264', filesize: 1024 },
    { format_id: 'dup', ext: 'webm', resolution: '1280x720', filesize_approx: 2048 },
    { format_id: '1080', height: 1080, filesize: 1024 ** 4 },
    { format_id: 'other-video', vcodec: 'h264' },
    { format_id: 'audio', acodec: 'aac', vcodec: 'none' },
    { format_id: 'hidden', acodec: 'none', vcodec: 'none' }
  ] }
  const traces = []
  for (const old of [true, false]) {
    const h = await make({ old, map: { [url]: entry('ready', info) } }).popup()
    await h.click('Download with VidBeep')
    traces.push({ html: h.html(), trace: h.trace, navigation: h.navigation })
  }
  expect(traces[1]).toEqual(traces[0]); expect(traces[0]).toMatchSnapshot()
})

it('Open Client assigns string only, waits exactly two fake seconds then retries', async () => {
  const h = await make({ map: { [url]: { ...entry('error'), error: 'Failed to fetch' } } }).popup()
  await h.click('Open Client'); expect(h.navigation).toEqual(['vidbee://'])
  const count = h.trace.length
  await act(async () => { await vi.advanceTimersByTimeAsync(1999) }); expect(h.trace).toHaveLength(count)
  await act(async () => { await vi.advanceTimersByTimeAsync(1); await flush() })
  expect(h.trace).toMatchSnapshot()
})

it('released StrictMode initialization continues after listener removal, with suspended query/send/read', async () => {
  const h = make(); const queries = [deferred(), deferred()]; let index = 0
  h.query = () => queries[index++].promise
  await h.popup(); expect(h.listeners).toHaveLength(1)
  await act(async () => { queries[1].resolve([{ url }]); await flush() })
  await act(async () => { queries[0].resolve([{ url: 'https://older.invalid/' }]); await flush() })
  expect(h.trace).toMatchSnapshot()
})

it('English locale resource and popup bootstrap HTML stay literal', () => {
  expect(JSON.parse(readFileSync(new URL('../public/_locales/en/messages.json', import.meta.url), 'utf8'))).toMatchSnapshot()
  expect(readFileSync(new URL('../entrypoints/popup/index.html', import.meta.url), 'utf8')).toMatchSnapshot()
})

it.each(['status', 'token', 'video-info'])('acquisition timeout for %s preserves string-reason fallback', async phase => {
  const h = make().background()
  h.http = (target, options) => target.includes(`/${phase}`)
    ? new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)))
    : Promise.resolve(h.response(target.endsWith('/token') ? { token: 'x' } : {}))
  h.message(); await flush()
  await vi.advanceTimersByTimeAsync(phase === 'status' ? 21 * 800 : phase === 'token' ? 800 : 60000)
  await flush()
  expect({ requests: fetches(h), stored: h.map }).toMatchSnapshot()
})

it('follows fetch redirect response without changing the requested URL or selecting another port', async () => {
  const h = make().background()
  h.http = target => Promise.resolve({ ...h.response(target.endsWith('/token') ? { token: 'x' } : {}), redirected: true, url: 'http://redirect.invalid/final' })
  h.message(); await flush()
  expect(fetches(h)).toMatchSnapshot()
})

it('pending storage settlement gates network, while delayed ready save gates success icon', async () => {
  const h = make().background(); const pending = deferred(), ready = deferred()
  let count = 0
  h.set = value => { h.map = clone(value.videoInfoCacheByUrl); return ++count === 1 ? pending.promise : ready.promise }
  h.message(); await flush(); expect(fetches(h)).toEqual([])
  expect(h.trace).toMatchSnapshot('pending write suspended')
  pending.resolve(); await flush()
  expect(h.trace).toMatchSnapshot('ready write suspended')
  ready.resolve(); await flush(); expect(h.trace).toMatchSnapshot('settled')
})

it('popup send failure still consumes the complete final cached error', async () => {
  const h = make(); let reads = 0
  h.send = () => Promise.reject('non-error')
  h.get = () => Promise.resolve(++reads <= 2 ? {} : { videoInfoCacheByUrl: { [url]: { url, status: 'error', fetchedAt: now, error: 'Final cache error' } } })
  await h.popup(); expect({ trace: h.trace, html: h.html() }).toMatchSnapshot()
})

it('popup no-tab and bootstrap without root', async () => {
  const h = make(); h.query = () => Promise.resolve([])
  await h.popup(); expect(h.html()).toMatchSnapshot('no tab')
  const empty = make(); empty.window.document.body.innerHTML = ''
  await empty.popup(); expect(empty.trace).toEqual([]); expect(empty.root).toBeUndefined()
})

it('startup has no UA or locale dependency; locale message APIs are never called', async () => {
  const results = []
  for (const [userAgent, language] of [['Fixture Chromium', 'en-US'], ['Fixture Firefox', 'ja-JP']]) {
    const h = make({ map: { [url]: entry() } }); Object.defineProperties(h.window.navigator, { userAgent: { value: userAgent }, language: { value: language } })
    h.browser.i18n = { getMessage: () => { throw new Error('Unexpected locale lookup') } }
    await h.popup(); results.push({ html: h.html(), trace: h.trace })
  }
  expect(results[0]).toEqual(results[1]); expect(results[0]).toMatchSnapshot()
})

it('pure classification substitutions include every codec, dimension and resolution field', () => {
  const old = pure(true), current = pure(), results = []
  for (const field of ['vcodec', 'acodec', 'resolution', 'width', 'height']) {
    for (const value of [undefined, null, false, true, 0, 7, NaN, '', 'none', '1280x720']) {
      const format = { [field]: value }
      const previous = { video: old.isVideoFormat(format), audio: old.isAudioFormat(format) }
      expect({ video: current.isVideoFormat(format), audio: current.isAudioFormat(format) }).toEqual(previous)
      results.push({ field, value, ...previous })
    }
  }
  expect(results).toMatchSnapshot()
})

it.each([null, false, 7, 'error', 'malformed'])('non-2xx response body %j falls back to exact status error', async body => {
  const h = make().background()
  h.http = target => {
    if (!target.includes('/video-info')) return Promise.resolve(h.response(target.endsWith('/token') ? { token: 'x' } : {}))
    return Promise.resolve(body === 'malformed' ? { ok: false, status: 500, json: () => Promise.reject(new Error('bad JSON')) } : h.response(body, 500))
  }
  h.message(); await flush()
  expect(h.map[url]).toEqual({ url, status: 'error', fetchedAt: now, error: 'Request failed: 500' })
})

it('message ingress keeps discriminator and URL truthiness without URL grammar validation', async () => {
  const h = make().background()
  expect(() => h.message(null)).toThrow()
  for (const value of [undefined, null, false, 0, '']) expect(h.message({ type: 'video-info:fetch', url: value })).toBeUndefined()
  await flush(); expect(h.trace).toEqual([['message:add']])
  expect(fetches(h)).toEqual([])
  h.message({ type: 'video-info:fetch', url: 'not a URL' }, {})
  await flush(); expect(fetches(h).at(-1)[1]).toBe('http://127.0.0.1:27100/video-info?url=not%20a%20URL&token=t%20%2B%2F%E6%97%A5%E6%9C%AC')
})

it('stable equal-size sorting preserves source order within descending height groups', async () => {
  const info = { formats: [
    { format_id: 'tie-first', height: 720, filesize: 1024 },
    { format_id: 'higher', height: 1080 },
    { format_id: 'tie-second', resolution: '1280x720', filesize_approx: 1024 },
    { format_id: 'no-height', vcodec: 'h264' }
  ] }
  const h = await make({ map: { [url]: entry('ready', info) } }).popup()
  expect([...h.window.document.querySelectorAll('tbody tr')].map(row => row.firstChild.textContent)).toEqual(['higher', 'tie-first', 'tie-second', 'no-height'])
  expect([...h.window.document.querySelectorAll('.group-title')].map(node => node.textContent)).toEqual(['1080p', '720p', 'Other'])
})

it('pins the exact synchronous idle render before popup mount effects', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { createElement } = await import('react')
  const { source } = await import('./harness.mjs')
  const h = make()
  const App = h.evaluate(source('entrypoints/popup/App.tsx'), 'App.tsx').default
  expect(renderToStaticMarkup(createElement(App))).toBe('<link rel="preload" as="image" href="/icon/128.png"/><div class="app"><header><div class="brand"><img alt="" class="brand-icon" height="32" src="/icon/128.png" width="32"/><h1>VidBeep</h1></div><span class="status-indicator"><div class="status-dot"></div> Idle</span></header></div>')
  expect(h.trace).toEqual([])
})
