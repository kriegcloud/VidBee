import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'

/** A condition-based route smoke after successful items exist in the fixture. */
export async function subscriptionRenderer(runDir) {
  const pages = await (await fetch('http://127.0.0.1:9230/json')).json()
  const page = pages.find((entry) => entry.type === 'page' && !entry.url.startsWith('devtools'))
  if (!page) {
    throw new Error('No subscription renderer page')
  }
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  const pending = new Map()
  const problems = []
  let id = 0
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
      const request = pending.get(message.id)
      if (!request) {
        return
      }
      clearTimeout(request.timer)
      pending.delete(message.id)
      if (message.error) {
        request.reject(new Error(JSON.stringify(message.error)))
      } else {
        request.resolve(message.result)
      }
    } else if (
      message.method === 'Runtime.exceptionThrown' ||
      (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
    ) {
      problems.push(message)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const commandId = ++id
      const timer = setTimeout(() => {
        pending.delete(commandId)
        reject(new Error(`CDP timeout: ${method}`))
      }, 15_000)
      pending.set(commandId, { resolve, reject, timer })
      socket.send(JSON.stringify({ id: commandId, method, params }))
    })
  try {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    })
    await send('Runtime.enable')
    await send('Runtime.evaluate', { expression: 'location.hash = "#/subscriptions"' })
    const deadline = performance.now() + 30_000
    let text = ''
    while (performance.now() < deadline) {
      const result = await send('Runtime.evaluate', {
        expression: 'document.body.innerText',
        returnByValue: true
      })
      text = result.result.value
      if (text.includes('/subscriptions-core/site') && !text.includes('River retained')) {
        await send('Runtime.evaluate', {
          expression:
            "[...document.querySelectorAll('button')].find(button => button.textContent.includes('/subscriptions-core/site'))?.click()"
        })
      }
      if (text.includes('River retained')) {
        break
      }
      await delay(100)
    }
    await writeFile(path.join(runDir, 'subscriptions-core/renderer.txt'), text)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(
      path.join(runDir, 'subscriptions-core/renderer.png'),
      Buffer.from(shot.data, 'base64')
    )
    if (!text.includes('River retained') || problems.length) {
      throw new Error(
        `Subscription renderer did not show successful items: ${JSON.stringify(problems)}; ${text}`
      )
    }
    return { route: '#/subscriptions', successfulItemVisible: true, problems }
  } finally {
    socket.close()
    for (const request of pending.values()) {
      clearTimeout(request.timer)
    }
  }
}
