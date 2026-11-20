import { afterEach, expect, it } from '@effect/vitest'
import { vi } from 'vitest'
import { Harness, source } from './harness.mjs'
import { createRequests } from './http-oracle.entry.ts'
const owned = []
afterEach(async () => { for (const close of owned.splice(0)) await close(); vi.useRealTimers() })
const phrases = ['signal is aborted', 'Failed to fetch', 'ordinary failure']
const cases = [
  ...['signal is aborted', 'Failed to fetch', 'ordinary origin failure', 'Failed to fetch video info.'].map(error => ({ mode: 'origin', error })),
  { mode: 'origin', abort: true }, { mode: 'origin', nonError: true }, { mode: 'transport', nonError: true },
  { mode: 'transport' }, { mode: 'transport', error: 'signal is aborted' }, { mode: 'transport', error: 'ordinary failure' }, { mode: 'transport', abort: true }, { mode: 'headers' },
  { mode: 'body', status: 200 }, { mode: 'body', status: 500 },
  { mode: 'malformed', status: 200 },
  ...phrases.flatMap(phrase => ['error', 'details', 'both', 'neither'].map(field => ({
    mode: 'http', status: 500,
    body: { error: field === 'error' || field === 'both' ? phrase : 'error', details: field === 'details' || field === 'both' ? phrase : 'details' }
  }))),
  { mode: 'http', status: 500, body: { error: 'Failed to fetch', details: 'signal is aborted' } }
]
it.each(cases.flatMap(scenario => ['GET', 'POST'].map(method => ({ ...scenario, method }))))('frozen fetchJson failure coverage: %j', async scenario => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const results = []
  for (const old of [true, false]) {
    const h = new Harness({ old: true })
    owned.push(() => h.close())
    const failure = scenario.nonError ? 'host threw a scalar' : scenario.abort ? new DOMException('aborted', 'AbortError') : new TypeError(scenario.error ?? 'Failed to fetch')
    if (scenario.mode === 'origin') h.browser.runtime.getURL = () => { throw failure }
    const fetch = (_url, { signal }) => {
      if (scenario.mode === 'transport') return Promise.reject(failure)
      const suspended = () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
      if (scenario.mode === 'headers') return suspended()
      const response = {
        ok: scenario.status === 200, status: scenario.status,
        json: () => scenario.mode === 'body' ? suspended() : scenario.mode === 'malformed' ? Promise.reject(new SyntaxError('bad JSON')) : Promise.resolve(scenario.body)
      }
      if (old) return Promise.resolve(response)
      return Promise.resolve({ ...response, headers: new Headers(), arrayBuffer: () => response.json().then(body => new TextEncoder().encode(JSON.stringify(body)).buffer) })
    }
    let request
    if (old) {
      const text = source('entrypoints/background.ts', true)
      const api = h.evaluate(text.slice(text.indexOf('const fetchJson ='), text.indexOf('const findAvailablePort =')) + '\nexport { fetchJson }', 'request.ts', { fetch })
      request = api.fetchJson('http://fixture.invalid/info', 800, scenario.method)
    } else {
      const api = createRequests({ browser: h.browser, fetchImplementation: fetch }); owned.push(api.close)
      request = api.request(scenario.method, 'http://fixture.invalid/info', 800)
    }
    const result = request.then(value => ({ value }), error => ({ error: error instanceof Error ? error.message : 'Failed to fetch video info.' }))
    await vi.advanceTimersByTimeAsync(800)
    results.push(await result)
  }
  expect(results[1]).toEqual(results[0])
})
