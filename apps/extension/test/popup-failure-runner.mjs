import { loadEntry, observations } from './entry-loader.mjs'
import { denyNetwork, requestOptions, networkRefusals } from './network.mjs'
denyNetwork()
const old = process.argv[3] === 'old'
import { Window } from 'happy-dom'
import * as React from 'react'
import { mock } from 'node:test'
const scenario = process.argv[2]
const storedError = scenario.startsWith('{') ? JSON.parse(scenario) : undefined
const trace = [], failures = [], navigation = []
if (storedError?.navigation) mock.timers.enable({ apis: ['setTimeout'], now: 1700000000000 })
const window = new Window({ url: 'https://extension.invalid/popup.html', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableIframePageLoading: true } })
denyNetwork(window)
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
const run = () => loadEntry('entrypoints/popup/main.tsx', { old, onRoot: value => { root = value }, context: {
  browser, Error, Date: class extends Date { static now() { return 1700000000000 } },
  window: { location: { set href(value) { navigation.push(value); throw new Error(`Protocol assignment blocked: ${value}`) } } },
  document: window.document, setTimeout, clearTimeout
} })
await React.act(async () => { run('main.tsx'); for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)) })
if (storedError?.navigation) {
  await React.act(async () => {
    const button = [...window.document.querySelectorAll('button')].find(node => node.textContent === 'Open Client')
    if (!button) throw new Error('Missing Open Client control')
    button.click()
    for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve))
    mock.timers.tick(2000)
    for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve))
  })
}
const html = window.document.getElementById('root').innerHTML
await React.act(async () => root.unmount())
await window.happyDOM.abort()
if (storedError?.navigation) mock.timers.reset()
console.log(JSON.stringify({ node: process.versions.node, currentObservations: observations.current, loggedFailures: observations.logged ?? 0, networkRefusals, trace, html, failures, ...(storedError?.navigation ? { navigation } : {}) }))
