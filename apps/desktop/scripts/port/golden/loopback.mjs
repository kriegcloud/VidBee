import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { phase8Routes } from './phase8-loopback.mjs'
import { subscriptionsRoutes } from './subscriptions-core-loopback.mjs'

/** Serve only generated fixtures in the worker's offline network namespace. */
export async function startLoopback(runDir, { subscriptions = false, phase8 = false } = {}) {
  const subscriptionRoutes = subscriptions ? await subscriptionsRoutes(runDir) : undefined
  const phase8Route = phase8 ? await phase8Routes(runDir) : undefined
  const fixtures = path.join(runDir, 'userdata/loopback-fixtures')
  const files = {
    video: { data: await readFile(path.join(fixtures, 'video.mp4')), type: 'video/mp4' },
    audio: { data: await readFile(path.join(fixtures, 'audio.wav')), type: 'audio/wav' },
    image: {
      data: await readFile(path.join(runDir, 'userdata/golden-media/thumbnail.png')),
      type: 'image/png'
    }
  }
  const requests = []
  let logWrites = Promise.resolve()
  const timers = new Set()
  let recover = false
  await mkdir(path.join(runDir, 'loopback'), { recursive: true })
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (subscriptionRoutes?.handle(request, response, url)) {
      return
    }
    const entry = {
      method: request.method,
      path: url.pathname,
      range: request.headers.range ?? null
    }
    requests.push(entry)
    logWrites = logWrites.then(() =>
      appendFile(path.join(runDir, 'loopback/requests.jsonl'), `${JSON.stringify(entry)}\n`)
    )
    logWrites.catch((error) => response.destroy(error))
    if (url.pathname.startsWith('/404') || (url.pathname.startsWith('/recover') && !recover)) {
      response.writeHead(404, { 'Content-Length': 0 }).end()
      return
    }
    if (url.pathname === '/429-cli.mp4') {
      response.writeHead(429, { 'Content-Length': 0 }).end()
      return
    }
    if (url.pathname.startsWith('/500')) {
      response.writeHead(500, { 'Content-Length': 0 }).end()
      return
    }
    if (phase8Route?.(request, response, url)) {
      return
    }
    const key = url.pathname.endsWith('.wav')
      ? 'audio'
      : url.pathname.endsWith('.png')
        ? 'image'
        : 'video'
    const { data, type } = files[key]
    let start = 0
    let end = data.length - 1
    const range = request.headers.range
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!(match && (match[1] || match[2]))) {
        response.writeHead(416, { 'Content-Range': `bytes */${data.length}` }).end()
        return
      }
      start = match[1] ? Number(match[1]) : Math.max(0, data.length - Number(match[2]))
      end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end
      if (start > end || start >= data.length) {
        response.writeHead(416, { 'Content-Range': `bytes */${data.length}` }).end()
        return
      }
    }
    response.writeHead(range ? 206 : 200, {
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Last-Modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
      'Accept-Ranges': 'bytes',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${data.length}` } : {})
    })
    if (request.method === 'HEAD') {
      response.end()
    } else if (url.pathname.startsWith('/stall')) {
      response.flushHeaders()
    } else if (url.pathname.startsWith('/slow')) {
      response.flushHeaders()
      let offset = start
      const timer = setInterval(() => {
        const next = Math.min(
          offset + (url.pathname.startsWith('/slow-cli-') ? 128 : 1024),
          end + 1
        )
        response.write(data.subarray(offset, next))
        offset = next
        if (offset > end) {
          response.end()
        }
      }, 50)
      timers.add(timer)
      response.once('close', () => {
        clearInterval(timer)
        timers.delete(timer)
      })
    } else {
      response.end(data.subarray(start, end + 1))
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    subscriptions: subscriptionRoutes,
    recover: () => {
      recover = true
    },
    close: async () => {
      for (const timer of timers) {
        clearInterval(timer)
      }
      server.closeAllConnections()
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
      await logWrites
      await subscriptionRoutes?.flush()
    }
  }
}
