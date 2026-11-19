import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import { Window } from 'happy-dom'
import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import * as JSX from 'react/jsx-runtime'
const scenario = process.argv[2]
const storedError = scenario.startsWith('{') ? JSON.parse(scenario) : undefined
const trace = [], failures = []
const window = new Window({ url: 'https://extension.invalid/popup.html', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableIframePageLoading: true } })
Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })
window.document.body.innerHTML = '<div id="root"></div>'
process.on('unhandledRejection', error => failures.push({ name: error?.name, message: error?.message ?? String(error) }))
let root, reads = 0
const browser = {
  tabs: { query: options => { trace.push(['query', options]); return scenario === 'query' ? Promise.reject(new Error('tabs runtime failure')) : Promise.resolve([{ url: 'https://example.invalid/' }]) } },
  runtime: { sendMessage: message => { trace.push(['send', message]); return Promise.resolve() } },
  storage: {
    local: { get: key => { trace.push(['get', key]); reads++; return scenario === 'read' || scenario === 'final-read' && reads > 2 ? Promise.reject(new Error('storage runtime failure')) : Promise.resolve(storedError ? { videoInfoCacheByUrl: { 'https://example.invalid/': { url: 'https://example.invalid/', status: 'error', fetchedAt: 1700000000000, error: storedError.error } } } : {}) } },
    onChanged: { addListener: () => trace.push(['add']), removeListener: () => trace.push(['remove']) }
  }
}
const run = file => {
  const module = { exports: {} }
  const text = readFileSync(new URL(`fixtures/${file}.txt`, import.meta.url), 'utf8')
  const code = transformSync(text, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code
  vm.runInNewContext(`"use strict";\n${code}`, {
    module, exports: module.exports, browser, Error,
    Date: class extends Date { static now() { return 1700000000000 } },
    window: { location: { set href(value) { throw new Error(`Protocol assignment blocked: ${value}`) } } },
    document: window.document, setTimeout, clearTimeout,
    require: name => {
      if (name === 'react') return React
      if (name === 'react/jsx-runtime') return JSX
      if (name === 'react-dom/client') return { ...ReactDOM, createRoot: node => { root = ReactDOM.createRoot(node); return root } }
      if (name === './App.tsx') return run('App.tsx')
      if (name.endsWith('.css')) return {}
      throw new Error('Unexpected dependency; network denied')
    }
  })
  return module.exports
}
await React.act(async () => { run('main.tsx'); for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)) })
const html = window.document.getElementById('root').innerHTML
await React.act(async () => root.unmount())
await window.happyDOM.abort()
console.log(JSON.stringify({ trace, html, failures }))
