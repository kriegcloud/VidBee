import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { describe, expect, it } from '@effect/vitest'
import { extensionIdentity, SKIP_LOAD, SKIP_POPUP } from './extension-browser.mjs'
import { countsExpression, instrument, until } from './extension-browser-cdp.mjs'
import {
  compareBrowserRecordings,
  REQUIRED_SCENARIOS,
  stableBrowserDocuments
} from './extension-browser-recordings.mjs'

it('derives the trusted identity from the actual manifest key and keeps exact skip text', async () => {
  const config = await readFile(
    new URL('../../../../extension/wxt.config.ts', import.meta.url),
    'utf8'
  )
  expect(extensionIdentity(/key: "([^"]+)"/.exec(config)[1])).toBe(
    'kpelcaehdkgleenlldpipjpoopnacehk'
  )
  expect(SKIP_LOAD).toBe(
    'SKIP extension browser proof: no available Chromium loads the unpacked extension'
  )
  expect(SKIP_POPUP).toBe(
    'SKIP extension browser proof: available Chromium cannot open the extension action popup'
  )
})

it('instruments a real API-shaped boundary without changing its receiver, arguments or returned Promise', async () => {
  const calls = []
  const result = Promise.resolve([{ url: 'http://127.0.0.1:1234/fixture' }])
  const event = () => ({ addListener() {}, removeListener() {} })
  const chrome = {
    tabs: {
      query(...args) {
        calls.push({ receiver: this, args })
        return result
      }
    },
    action: {
      setIcon(...args) {
        calls.push({ receiver: this, args })
        return result
      }
    },
    storage: { local: { get() {}, set() {}, remove() {}, clear() {} }, onChanged: event() },
    runtime: { id: 'synthetic', onMessage: event() },
    commands: { onCommand: event() }
  }
  const context = vm.createContext({
    chrome,
    addEventListener() {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  })
  vm.runInContext(instrument, context)
  const argument = { active: true, currentWindow: true }
  expect(chrome.tabs.query(argument)).toBe(result)
  expect(calls[0].receiver).toBe(chrome.tabs)
  expect(calls[0].args[0]).toBe(argument)
  await result
  expect(vm.runInContext('__extensionProof.queries[0].result[0].url', context)).toBe(
    'http://127.0.0.1:1234/fixture'
  )
  const listener = () => {}
  chrome.storage.onChanged.addListener(listener)
  expect(vm.runInContext(countsExpression, context).listeners.storage).toBe(1)
  chrome.storage.onChanged.removeListener(listener)
  expect(vm.runInContext(countsExpression, context).listeners.storage).toBe(0)
})

describe('five-run admission', () => {
  const complete = () => ({
    status: 'passed',
    recordings: REQUIRED_SCENARIOS.map((name) => ({ name, value: 1 }))
  })
  it('requires all five complete successful runs', () => {
    expect(() => stableBrowserDocuments([complete()])).toThrow('exactly five')
    expect(() =>
      stableBrowserDocuments([
        complete(),
        complete(),
        complete(),
        complete(),
        { status: 'skipped' }
      ])
    ).toThrow('Missing successful')
    const incomplete = complete()
    incomplete.recordings.pop()
    expect(() =>
      stableBrowserDocuments([complete(), complete(), complete(), complete(), incomplete])
    ).toThrow('Missing browser scenario')
  })
  it('keeps both unstable values and accepts only identical documents', () => {
    const runs = Array.from({ length: 5 }, complete)
    runs[4].recordings[0].value = 2
    const result = stableBrowserDocuments(runs)
    expect(result.stable).toHaveLength(REQUIRED_SCENARIOS.length - 1)
    expect(result.unstable[0]).toMatchObject({ before: { value: 1 }, after: { value: 2 } })
    expect(
      compareBrowserRecordings(
        { method: 'POST', headers: { Origin: 'real' } },
        { method: 'GET', headers: { Origin: 'wrong' } }
      )
    ).toHaveLength(2)
  })
})

it('fails a bounded condition rather than converting a scenario failure to a capability skip', async () => {
  await expect(until(() => false, 'wrong active tab', 1)).rejects.toThrow('wrong active tab')
})

it('observes the namespace selected by installed WXT when browser and chrome differ', async () => {
  const result = Promise.resolve([{ url: 'http://127.0.0.1:1234/selected' }])
  const chrome = { runtime: { id: 'same' }, tabs: { query: () => Promise.resolve([]) } }
  const browser = { runtime: { id: 'same' }, tabs: { query: () => result } }
  const context = vm.createContext({
    chrome,
    browser,
    addEventListener() {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  })
  vm.runInContext(instrument, context)
  expect(browser.tabs.query({ active: true, currentWindow: true })).toBe(result)
  await result
  expect(vm.runInContext('__extensionProof.queries[0].result[0].url', context)).toContain(
    '/selected'
  )
})

it('sends parameterless CDP commands and rejects outstanding work on transport close', async () => {
  const NativeWebSocket = globalThis.WebSocket
  const events = []
  class Socket {
    listeners = {}
    closed = false
    constructor() {
      queueMicrotask(() => this.emit('open', {}))
    }
    addEventListener(name, listener) {
      this.listeners[name] ??= []
      this.listeners[name].push(listener)
    }
    emit(name, event) {
      for (const listener of this.listeners[name] ?? []) {
        listener(event)
      }
    }
    send(text) {
      const message = JSON.parse(text)
      if (message.method === 'Target.getTargets') {
        queueMicrotask(() =>
          this.emit('message', {
            data: JSON.stringify({ id: message.id, result: { targetInfos: [] } })
          })
        )
      }
    }
    close() {
      if (!this.closed) {
        this.closed = true
        this.emit('close', {})
      }
    }
  }
  globalThis.WebSocket = Socket
  try {
    const { connectCdp } = await import('./extension-browser-cdp.mjs')
    const cdp = await connectCdp('ws://synthetic', (value) => events.push(value))
    expect(await cdp.send('Target.getTargets')).toEqual({ targetInfos: [] })
    const pending = cdp.send('Runtime.enable', {})
    cdp.close()
    await expect(pending).rejects.toThrow('CDP disconnected')
    expect(
      events.some((value) => value.direction === 'send' && value.method === 'Target.getTargets')
    ).toBe(true)
  } finally {
    globalThis.WebSocket = NativeWebSocket
  }
})

it('retains header casing, neighboring response fields and malformed timestamp values in browser comparison', async () => {
  const { normalizeBrowserObservation } = await import('./extension-browser-recordings.mjs')
  const value = {
    name: 'metadata-success',
    storage: { videoInfoCacheByUrl: { fixture: { fetchedAt: 0, info: { title: 'literal' } } } },
    requests: [
      {
        request: { method: 'POST', url: 'http://127.0.0.1:27100/token' },
        wireHeaders: { 'X-VidBee-Extension': 'literal', Origin: 'literal' },
        response: { status: 200 },
        body: { body: '{"neighbor":"retained"}' }
      }
    ],
    accessibility: {
      nodes: [
        {
          role: { value: 'StaticText' },
          name: { value: 'complete name', sources: [{ nativeSource: 'contents' }] }
        },
        { role: { value: 'InlineTextBox' }, name: { value: 'complete' } }
      ]
    }
  }
  const actual = normalizeBrowserObservation(value)
  expect(actual.storage.videoInfoCacheByUrl.fixture.fetchedAt).toBe(0)
  expect(actual.requests[0].headers).toEqual({ 'X-VidBee-Extension': 'literal', Origin: 'literal' })
  expect(actual.requests[0].response.body).toEqual({ neighbor: 'retained' })
  expect(actual.accessibility).toHaveLength(1)
  expect(actual.accessibility[0].name).toBe('complete name')
  expect(value.accessibility.nodes).toHaveLength(2)
})

it('adds real parser-readable dimensions only to the independent browser fixture', async () => {
  const { extensionBrowserFixture } = await import('./extension-browser-fixture.mjs')
  const template = '<video><source src="{{ORIGIN}}/phase8/video.mp4" type="video/mp4"></video>'
  expect(extensionBrowserFixture(template)).toBe(
    '<video><source width="320" height="180" label="180p" src="{{ORIGIN}}/phase8/video.mp4" type="video/mp4"></video>'
  )
  expect(template).not.toContain('label=')
  expect(() => extensionBrowserFixture('<video></video>')).toThrow('source is missing')
})
