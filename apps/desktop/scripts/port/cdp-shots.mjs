// Screenshot every main route of a running test instance over CDP and collect
// renderer console errors. Run inside the instance's network namespace:
//   nsenter -t <pid> -U -n --preserve-credentials node cdp-shots.mjs <out dir> [port]
// Exits 1 when a route logged a console error or an uncaught exception.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [outDir, port = '9230'] = process.argv.slice(2)
if (!outDir) {
  throw new Error('usage: cdp-shots.mjs <out dir> [port]')
}
mkdirSync(outDir, { recursive: true })
const routes = ['#/', '#/subscriptions', '#/chat', '#/settings', '#/about']
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((target) => target.type === 'page' && !target.url.startsWith('devtools'))
if (!page) {
  throw new Error('no page target')
}
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve)
  socket.addEventListener('error', reject)
})
let nextId = 0
const pending = new Map()
const problems = []
let currentRoute = 'boot'
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id !== undefined) {
    pending.get(message.id)?.(message)
    pending.delete(message.id)
    return
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails
    problems.push({
      route: currentRoute,
      kind: 'exception',
      text: details.exception?.description ?? details.text
    })
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    const text = message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ')
    problems.push({ route: currentRoute, kind: 'console.error', text })
  }
})
const send = (method, params = {}) =>
  new Promise((resolve) => {
    nextId += 1
    pending.set(nextId, resolve)
    socket.send(JSON.stringify({ id: nextId, method, params }))
  })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await send('Runtime.enable')
await send('Page.enable')
const summary = []
for (const route of routes) {
  currentRoute = route
  await send('Runtime.evaluate', { expression: `location.hash = ${JSON.stringify(route)}` })
  await sleep(3500)
  const text = await send('Runtime.evaluate', {
    expression: 'document.body.innerText.replace(/\\s+/g, " ").slice(0, 400)',
    returnByValue: true
  })
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const name = route === '#/' ? 'home' : route.slice(2)
  if (shot.result?.data) {
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(shot.result.data, 'base64'))
  }
  summary.push({ route, text: text.result?.result?.value ?? '' })
}
writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ summary, problems }, null, 2))
socket.close()
process.stdout.write(`${JSON.stringify({ routes: summary.length, problems }, null, 2)}\n`)
process.exit(problems.length > 0 ? 1 : 0)
