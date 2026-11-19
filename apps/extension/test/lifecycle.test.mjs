import { afterEach, beforeEach, expect, it } from '@effect/vitest'
import { act } from 'react'
import { vi } from 'vitest'
import { Harness, deferred, flush, now, url } from './harness.mjs'
import { networkRefusals } from './network.mjs'

let owned = []
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }); vi.setSystemTime(now) })
afterEach(async () => {
  expect(networkRefusals).toEqual([]); networkRefusals.length = 0
  for (const h of owned) await h.close()
  owned = []; vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals()
})
const make = options => { const h = new Harness(options); owned.push(h); return h }
async function pagehide(h, persisted) {
  await act(async () => {
    const event = new h.window.Event('pagehide')
    Object.defineProperty(event, 'persisted', { value: persisted })
    h.window.dispatchEvent(event)
    await flush()
  })
}
it('document pagehide cancels the launch delay, removes sessions and unmounts React; persisted pagehide retains them', async () => {
  const h = await make({ map: { [url]: { url, status: 'error', fetchedAt: now, error: 'network failure' } } }).popup()
  const html = h.html()
  await pagehide(h, true)
  expect(h.listeners).toHaveLength(1); expect(h.html()).toBe(html)
  await h.click('Open Client'); expect(h.navigation).toEqual(['vidbee://'])
  await pagehide(h, false)
  expect(h.listeners).toHaveLength(0); expect(h.html()).toBe('')
  const count = h.trace.length
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); await flush() })
  expect(h.trace).toHaveLength(count)
})
it('document closure cancels both StrictMode initializations while the browser query is suspended', async () => {
  const h = make(); const query = deferred(); h.query = () => query.promise
  await h.popup(); expect(h.listeners).toHaveLength(1)
  await pagehide(h, false); expect(h.listeners).toHaveLength(0)
  await act(async () => { query.resolve([{ url }]); await flush() })
  expect(h.trace.filter(item => item[0] === 'get' || item[0] === 'send')).toEqual([])
  expect(h.html()).toBe('')
})
it('worker runtime disposal removes its exact message listener and aborts in-flight requests before any ready write', async () => {
  const h = make(); let owner; let signal
  h.browser.runtime.onMessage.removeListener = listener => {
    expect(listener).toBe(h.messageListener)
    h.messageListener = undefined; h.trace.push(['message:remove'])
  }
  h.http = (_target, options) => {
    signal = options.signal
    const pending = deferred()
    signal.addEventListener('abort', () => pending.reject('owner closed'))
    return pending.promise
  }
  h.entry('entrypoints/background.ts', { captureBackground: runtime => { owner = runtime } })
  h.message(); await flush(); expect(signal).toBeDefined(); expect(signal.aborted).toBe(false)
  await owner.dispose(); await flush()
  expect(signal.aborted).toBe(true); expect(h.messageListener).toBeUndefined()
  expect(h.trace.filter(item => item[0] === 'message:remove')).toHaveLength(1)
  expect(h.trace.filter(item => item[0] === 'set')).toHaveLength(1)
})

it('detached worker failures log their causes at the original boundaries without exposing host message text', async () => {
  const { observations } = await import('./entry-loader.mjs')
  for (const failure of ['read', 'pending', 'error', 'icon']) {
    const h = make(); let sets = 0
    if (failure === 'read') h.get = () => Promise.reject(new Error('private-host-text'))
    if (failure === 'pending') h.set = () => Promise.reject(new Error('private-host-text'))
    if (failure === 'error') {
      h.http = target => target.includes('/video-info') ? Promise.reject(new Error('request failure')) : Promise.resolve(h.response(target.endsWith('/token') ? { token: 'x' } : {}))
      h.set = () => ++sets === 2 ? Promise.reject(new Error('private-host-text')) : Promise.resolve()
    }
    if (failure === 'icon') h.icon = () => Promise.reject(new Error('private-host-text'))
    const logged = observations.logged ?? 0, start = (observations.logMessages ?? []).length
    h.background(); h.message(); await flush()
    expect(observations.logged).toBeGreaterThan(logged)
    const messages = JSON.stringify((observations.logMessages ?? []).slice(start))
    expect(messages).toContain('ExtensionHostFailure'); expect(messages).not.toContain('private-host-text')
    const requests = h.trace.filter(item => item[0] === 'fetch')
    const icons = h.trace.filter(item => item[0] === 'icon')
    if (failure === 'read' || failure === 'pending') expect(requests).toEqual([])
    if (failure === 'read') expect(icons).toEqual([])
    if (failure === 'error') expect(icons).toHaveLength(1)
    if (failure === 'icon') expect(h.map[url].status).toBe('ready')
  }
})
it('popup initialization and notification failures log without inventing presentation, and navigation failure cannot retry', async () => {
  const { observations } = await import('./entry-loader.mjs')
  for (const failure of ['query', 'read', 'final-read']) {
    const h = make(); let reads = 0
    if (failure === 'query') h.query = () => Promise.reject(new Error('private-popup-text'))
    else h.get = () => failure === 'read' || ++reads > 2 ? Promise.reject(new Error('private-popup-text')) : Promise.resolve({})
    const logged = observations.logged ?? 0
    await h.popup(); expect(observations.logged).toBeGreaterThan(logged)
    expect(h.html()).toContain('Analyzing video...'); expect(h.html()).not.toContain('Something went wrong')
  }
  const h = await make({ map: { [url]: { url, status: 'ready', fetchedAt: now, info: { title: 'Retained', formats: [] } } } }).popup()
  const html = h.html(), logged = observations.logged ?? 0
  await h.change(1); expect(observations.logged).toBeGreaterThan(logged); expect(h.html()).toBe(html)
  const connection = await make({ map: { [url]: { url, status: 'error', fetchedAt: now, error: 'network failure' } } }).popup()
  connection.navigationError = new Error('private-navigation-text')
  const count = connection.trace.length, beforeLog = observations.logged ?? 0, beforeHtml = connection.html()
  await connection.click('Open Client'); expect(observations.logged).toBeGreaterThan(beforeLog)
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); await flush() })
  expect(connection.trace).toHaveLength(count); expect(connection.html()).toBe(beforeHtml)
})

it('worker runtime is warmed before synchronous message delivery during listener registration', async () => {
  const h = make(); const add = h.browser.runtime.onMessage.addListener; let owner
  h.browser.runtime.onMessage.addListener = listener => {
    add(listener)
    expect(listener({ type: 'video-info:fetch', url }, {})).toBeUndefined()
    h.trace.push(['registration:returned'])
  }
  h.browser.runtime.onMessage.removeListener = listener => { expect(listener).toBe(h.messageListener); h.messageListener = undefined }
  h.entry('entrypoints/background.ts', { captureBackground: runtime => { owner = runtime } })
  const before = h.trace.findIndex(item => item[0] === 'get'), returned = h.trace.findIndex(item => item[0] === 'registration:returned')
  expect(before).toBeGreaterThanOrEqual(0); expect(before).toBeLessThan(returned)
  await flush(); expect(h.map[url].status).toBe('ready')
  await owner.dispose()
})
