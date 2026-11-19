import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'

/** Own server: no changes to another lane's routes or default media behavior. */
export async function startBrowserCaptureLoopback(runDir) {
  const directory = path.join(runDir, 'browser-capture')
  await mkdir(directory, { recursive: true })
  const files = Object.fromEntries(
    await Promise.all(
      ['landscape', 'portrait', 'silent'].map(async (name) => [
        name,
        await readFile(path.join(runDir, 'userdata/browser-capture-fixtures', `${name}.mp4`))
      ])
    )
  )
  const requests = []
  let writes = Promise.resolve()
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    const entry = {
      method: request.method,
      path: url.pathname,
      range: request.headers.range ?? null
    }
    requests.push(entry)
    writes = writes.then(() =>
      appendFile(path.join(directory, 'requests.jsonl'), `${JSON.stringify(entry)}\n`)
    )
    writes.catch((error) => response.destroy(error))
    let data
    let type
    if (url.pathname === '/drm.mpd') {
      type = 'application/dash+xml'
      data = Buffer.from(
        `<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT24S" minBufferTime="PT1S"><Period><AdaptationSet mimeType="video/mp4" codecs="avc1.64001e"><ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"/><ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/><Representation id="1" bandwidth="100000" width="320" height="180"><BaseURL>/landscape.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>`
      )
    } else if (url.pathname.endsWith('.html')) {
      type = 'text/html; charset=utf-8'
      const name = url.pathname.slice(1, -5)
      data = Buffer.from(
        `<!doctype html><title>Synthetic ${name}</title><body style="margin:0;background:#2a004a">${name === 'no-video' ? '<p>Stationary synthetic page without video</p>' : `<video controls autoplay ${name === 'silent' ? 'muted' : ''} src="/${name.startsWith('drm') ? 'drm.mpd' : `${name}.mp4`}"></video>${name.startsWith('drm') ? '<script>document.querySelector("video").src="/silent.mp4"</script>' : ''}`}</body>`
      )
    } else {
      data = files[url.pathname.slice(1, -4)]
      type = 'video/mp4'
    }
    if (!data) {
      response.writeHead(404, { 'Content-Length': 0 }).end()
      return
    }
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
    response.end(request.method === 'HEAD' ? undefined : data.subarray(start, end + 1))
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: async () => {
      server.closeAllConnections()
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
      await writes
    }
  }
}
