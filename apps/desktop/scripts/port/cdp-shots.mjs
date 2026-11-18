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
const targets = await (
  await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(15_000) })
).json()
const page = targets.find((target) => target.type === 'page' && !target.url.startsWith('devtools'))
if (!page) {
  throw new Error('no page target')
}
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    reject(new Error('CDP socket open timed out'))
    socket.close()
  }, 15_000)
  socket.addEventListener(
    'open',
    () => {
      clearTimeout(timer)
      resolve()
    },
    { once: true }
  )
  socket.addEventListener(
    'error',
    (error) => {
      clearTimeout(timer)
      reject(error)
    },
    { once: true }
  )
})
let nextId = 0
const pending = new Map()
const problems = []
let currentRoute = 'boot'
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id !== undefined) {
    const command = pending.get(message.id)
    clearTimeout(command?.timer)
    if (message.error) {
      command?.reject(new Error(`CDP ${command.method}: ${JSON.stringify(message.error)}`))
    } else {
      command?.resolve(message)
    }
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
socket.addEventListener('close', () => {
  for (const command of pending.values()) {
    clearTimeout(command.timer)
    command.reject(new Error(`CDP ${command.method}: socket closed`))
  }
  pending.clear()
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    nextId += 1
    const id = nextId
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`CDP ${method}: command timed out`))
    }, 15_000)
    pending.set(id, { resolve, reject, method, timer })
    socket.send(JSON.stringify({ id, method, params }))
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
  if (!shot.result?.data) {
    throw new Error(`CDP screenshot missing for ${route}`)
  }
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(shot.result.data, 'base64'))
  summary.push({ route, text: text.result?.result?.value ?? '' })
}
writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ summary, problems }, null, 2))
socket.close()
process.stdout.write(`${JSON.stringify({ routes: summary.length, problems }, null, 2)}\n`)
process.exit(problems.length > 0 ? 1 : 0)
