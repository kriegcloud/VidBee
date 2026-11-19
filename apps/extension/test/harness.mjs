import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import { Window } from 'happy-dom'
import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import * as JSX from 'react/jsx-runtime'
import { act } from 'react'
import { vi } from 'vitest'

export const revision = '0739410'
export const url = 'https://example.invalid/watch?v=a b&x=日本#part'
export const now = 1_700_000_000_000
const require = createRequire(import.meta.url)
const base = new URL('../', import.meta.url)
const sources = {}
const compiled = {}
export const clone = value => structuredClone(value)
export function source(entry, old = false) {
  const key = `${old}:${entry}`
  if (sources[key] !== undefined) return sources[key]
  if (!old) return sources[key] = readFileSync(new URL(entry, base), 'utf8')
  const frozen = readFileSync(new URL(`fixtures/${entry.split('/').at(-1)}.txt`, import.meta.url), 'utf8')
  // A relocated source archive has no git metadata. Frozen files remain the oracle there.
  try {
    const git = execFileSync('git', ['show', `${revision}:apps/extension/${entry}`], { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    if (git !== frozen) throw new Error('Frozen source disagrees with git')
    return sources[key] = git
  } catch (error) {
    if (error.message === 'Frozen source disagrees with git') throw error
    return sources[key] = frozen
  }
}
export const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
export async function flush() { for (let i = 0; i < 100; i++) await Promise.resolve() }
export class Harness {
  trace = []
  listeners = []
  messages = []
  navigation = []
  root = undefined
  constructor({ old = false, map, tab = url, info = { title: 'Fixture', duration: 60, formats: [] } } = {}) {
    this.old = old
    this.map = clone(map)
    this.tab = tab
    this.info = info
    this.window = new Window({ url: 'https://extension.invalid/popup.html', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableComputedStyleRendering: true } })
    this.window.document.body.innerHTML = '<div id="root"></div>'
    this.browser = {
      runtime: {
        getURL: value => `chrome-extension://fixture-id/${value}`,
        onMessage: { addListener: fn => { this.messageListener = fn; this.trace.push(['message:add']) } },
        sendMessage: message => { this.trace.push(['send', clone(message)]); return this.send?.(message) ?? Promise.resolve() }
      },
      tabs: { query: options => { this.trace.push(['query', clone(options)]); return this.query?.() ?? Promise.resolve(this.tab === undefined ? [] : [{ url: this.tab }]) } },
      action: { setIcon: options => { this.trace.push(['icon', clone(options)]); return this.icon?.(options) ?? Promise.resolve() } },
      storage: {
        local: {
          get: key => { this.trace.push(['get', key]); return (this.get?.() ?? Promise.resolve(this.map === undefined ? {} : { [key]: clone(this.map) })).then(value => { this.trace.push(['got', clone(value)]); return value }) },
          set: value => { this.trace.push(['set', clone(value)]); if (this.set) return this.set(value); this.map = clone(value.videoInfoCacheByUrl); return Promise.resolve() }
        },
        onChanged: {
          addListener: fn => { this.trace.push(['storage:add']); this.listeners.push(fn) },
          removeListener: fn => { this.trace.push(['storage:remove', this.listeners.indexOf(fn)]); this.listeners = this.listeners.filter(item => item !== fn) }
        }
      }
    }
    this.fetch = (target, options) => {
      this.trace.push(['fetch', target, { method: options.method, headers: clone(options.headers), body: options.body }])
      if (this.http) return this.http(target, options)
      return Promise.resolve(this.response(target.endsWith('/token') ? { token: 't +/日本' } : target.endsWith('/status') ? { ok: true } : this.info))
    }
  }
  response(data, status = 200) { return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(clone(data)) } }
  evaluate(text, filename, extra = {}) {
    const module = { exports: {} }
    const key = `${filename}:${text}`
    const code = compiled[key] ??= transformSync(text, { loader: filename.endsWith('tsx') ? 'tsx' : 'ts', format: 'cjs', jsx: 'automatic', target: 'es2022' }).code
    const fakeWindow = { set location(value) { throw new Error(`Unexpected window assignment: ${value}`) }, get location() { return extra.location } }
    const context = {
      module, exports: module.exports, browser: this.browser, chrome: this.browser,
      defineBackground: fn => fn(), fetch: this.fetch, AbortController, DOMException, Error, Date,
      setTimeout, clearTimeout, console,
      document: this.window.document, window: fakeWindow,
      require: name => {
        if (name.endsWith('.css')) return {}
        if (name === 'react') return React
        if (name === 'react/jsx-runtime') return JSX
        if (name === 'react-dom/client') return { ...ReactDOM, createRoot: node => { this.root = ReactDOM.createRoot(node); return this.root } }
        if (name === './App.tsx') return this.evaluate(source('entrypoints/popup/App.tsx', this.old), 'App.tsx', extra)
        throw new Error(`Unsupported entry dependency (network denied): ${name}`)
      }, ...extra
    }
    vm.runInNewContext(`"use strict";\n${code}`, context, { filename })
    return module.exports
  }
  background() { this.evaluate(source('entrypoints/background.ts', this.old), 'background.ts'); return this }
  message(message = { type: 'video-info:fetch', url: url }, sender = { tab: { id: 7 } }) { return this.messageListener(message, sender) }
  async popup() {
    vi.stubGlobal('window', this.window)
    vi.stubGlobal('document', this.window.document)
    vi.stubGlobal('navigator', this.window.navigator)
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const location = {}
    Object.defineProperty(location, 'href', { set: value => { this.navigation.push(value); if (this.navigationError) throw this.navigationError } })
    await act(async () => { this.evaluate(source('entrypoints/popup/main.tsx', this.old), 'main.tsx', { location }); await flush() })
    return this
  }
  async change(map, area = 'local') { await act(async () => { for (const fn of [...this.listeners]) fn({ videoInfoCacheByUrl: { newValue: map } }, area); await flush() }) }
  async click(text) { const button = [...this.window.document.querySelectorAll('button')].find(node => node.textContent === text); if (!button) throw new Error(`Missing button: ${text}`); await act(async () => { button.click(); await flush() }) }
  html() { return this.window.document.getElementById('root').innerHTML }
  async close() { if (this.root) await act(async () => this.root.unmount()); await this.window.happyDOM.abort() }
}
export function pure(old = false) {
  const text = source('entrypoints/popup/App.tsx', old).split('function App()')[0]
  const names = ['isValidHttpUrl', 'formatDuration', 'formatBytes', 'isVideoFormat', 'isAudioFormat', 'sanitizeError']
  const h = new Harness({ old })
  return h.evaluate(`${text}\nexport { ${names.join(',')} }`, 'pure.tsx')
}
export function outcome(fn) {
  try { return { value: fn() } } catch (error) { return { engine: true, name: error.name, message: error.message } }
}
