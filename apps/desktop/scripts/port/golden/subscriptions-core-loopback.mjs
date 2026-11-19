import { appendFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

/** Explicit XML routes run before the media server's generic fallback. */
export async function subscriptionsRoutes(runDir) {
  const directory = path.join(runDir, 'userdata/subscriptions-core-fixtures')
  const documents = Object.fromEntries(
    await Promise.all(
      [
        'rss-a.xml',
        'rss-b.xml',
        'auto.xml',
        'pending.xml',
        'atom.xml',
        'discovery.html',
        'invalid.xml',
        'failed-discovery.html'
      ].map(async (name) => [name, await readFile(path.join(directory, name), 'utf8')])
    )
  )
  await mkdir(path.join(runDir, 'subscriptions-core'), { recursive: true })
  const requests = []
  let writes = Promise.resolve()
  let revision = 'A'
  return {
    requests,
    revision: (next) => {
      revision = next
    },
    flush: () => writes,
    handle(request, response, url) {
      const name = url.pathname.replace('/subscriptions-core/', '')
      const document =
        name === 'rss.xml'
          ? `rss-${revision.toLowerCase()}.xml`
          : name === 'site/index.html'
            ? 'discovery.html'
            : name
      const candidate = /^candidate-\d\.xml$/.test(name)
      if (!(document in documents || candidate) && name !== 'redirect') {
        return false
      }
      if (requests.length >= 2000) {
        throw new Error('Subscription request log exceeded its bound')
      }
      const entry = {
        sequence: requests.length,
        method: request.method,
        path: url.pathname,
        revision: name === 'rss.xml' ? revision : null,
        status: null,
        completed: false
      }
      requests.push(entry)
      response.once('finish', () => {
        entry.status = response.statusCode
        entry.completed = true
        writes = writes.then(() =>
          appendFile(
            path.join(runDir, 'subscriptions-core/requests.jsonl'),
            `${JSON.stringify(entry)}\n`
          )
        )
      })
      if (name === 'redirect') {
        response
          .writeHead(302, { Location: '/subscriptions-core/site/index.html', 'Content-Length': 0 })
          .end()
      } else {
        const body = candidate
          ? 'Not a feed'
          : documents[document].replaceAll('{{ORIGIN}}', `http://${request.headers.host}`)
        response.writeHead(200, {
          'Content-Type': document.endsWith('.html')
            ? 'text/html; charset=utf-8'
            : 'application/xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
          'Last-Modified': 'Wed, 01 Jan 2025 00:00:00 GMT'
        })
        response.end(request.method === 'HEAD' ? undefined : body)
      }
      return true
    }
  }
}
