// Isolate the old entrypoint's intentional unhandled rejections from Vitest.
// No browser, sockets, profile or real fetch is available in this VM.
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
const scenario = JSON.parse(process.argv[2])
const now = 1700000000000
const url = 'https://example.invalid/watch'
const trace = [], failures = []
let gets = 0, sets = 0
let map = scenario.map
process.on('unhandledRejection', error => failures.push({ engine: scenario.engine ?? false, name: error?.name, message: error?.message ?? String(error) }))
const copy = value => structuredClone(value)
const browser = {
  runtime: { getURL: () => 'chrome-extension://fixture-id/', onMessage: { addListener: listener => { globalThis.listener = listener } } },
  action: { setIcon: options => { trace.push(['icon', copy(options)]); return scenario.failure === 'icon' ? Promise.reject(new Error('icon runtime failure')) : Promise.resolve() } },
  storage: { local: {
    get: key => { trace.push(['get', key]); gets++; if (scenario.failure === 'read' && gets === 1) return Promise.reject(new Error('read runtime failure')); return Promise.resolve(map === undefined ? {} : { [key]: copy(map) }) },
    set: value => { trace.push(['set', copy(value)]); sets++; if (scenario.failure === 'pending' && sets === 1 || scenario.failure === 'ready' && sets === 2 || scenario.failure === 'error' && sets === 2) return Promise.reject(new Error('quota failure')); map = copy(value.videoInfoCacheByUrl); return Promise.resolve() }
  } }
}
const response = data => ({ ok: true, status: 200, json: () => Promise.resolve(data) })
const text = readFileSync(new URL('fixtures/background.ts.txt', import.meta.url), 'utf8')
const code = transformSync(text, { loader: 'ts', format: 'cjs' }).code
const module = { exports: {} }
vm.runInNewContext(`"use strict";\n${code}`, {
  browser, defineBackground: fn => fn(), module, exports: module.exports, Error, DOMException, AbortController,
  Date: class extends Date { static now() { return now } }, setTimeout, clearTimeout,
  fetch: (target, options) => { trace.push(['fetch', target, { method: options.method, headers: options.headers, body: options.body }]); if (scenario.failure === 'error' && target.includes('/video-info')) return Promise.reject(new Error('metadata failure')); return Promise.resolve(response(target.endsWith('/token') ? { token: 'x' } : {})) }
})
globalThis.listener({ type: 'video-info:fetch', url }, {})
for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve))
// JSON normally discards named array properties; preserve those boundary writes explicitly.
console.log(JSON.stringify({ trace, failures }, (key, value) => {
  if (!Array.isArray(value)) return value
  const named = Object.entries(value).filter(([name]) => !/^\d+$/.test(name))
  return named.length ? { $array: Array.from(value), $properties: Object.fromEntries(named) } : value
}))
