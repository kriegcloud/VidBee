import { appendFile, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'

/** Serve fixed transcription media in the offline namespace, with seek support. */
export async function startTranscriptionLoopback(runDir) {
  const files = Object.fromEntries(
    await Promise.all(
      ['speech.wav', 'silence.wav', 'captions.mkv'].map(async (name) => [
        name,
        await readFile(path.join(runDir, 'userdata/transcription-fixtures', name))
      ])
    )
  )
  const requests = []
  let writes = Promise.resolve()
  const server = createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname.slice(1)
    const data = files[name]
    const entry = { method: req.method, path: `/${name}`, range: req.headers.range ?? null }
    requests.push(entry)
    writes = writes.then(() =>
      appendFile(path.join(runDir, 'transcription-requests.jsonl'), `${JSON.stringify(entry)}\n`)
    )
    if (!data) {
      res.writeHead(404).end()
      return
    }
    let start = 0,
      end = data.length - 1
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range)
      if (!(match && (match[1] || match[2]))) {
        res.writeHead(416, { 'Content-Range': `bytes */${data.length}` }).end()
        return
      }
      start = match[1] ? Number(match[1]) : Math.max(0, data.length - Number(match[2]))
      end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end
      if (start > end || start >= data.length) {
        res.writeHead(416, { 'Content-Range': `bytes */${data.length}` }).end()
        return
      }
    }
    res.writeHead(req.headers.range ? 206 : 200, {
      'Content-Type': name.endsWith('.wav') ? 'audio/wav' : 'video/x-matroska',
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes',
      'Last-Modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
      ...(req.headers.range ? { 'Content-Range': `bytes ${start}-${end}/${data.length}` } : {})
    })
    res.end(req.method === 'HEAD' ? undefined : data.subarray(start, end + 1))
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
      await new Promise((resolve) => server.close(resolve))
      await writes
    }
  }
}
