import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fetchThumbnail, writeThumbnailAtomically } from '../src/main/lib/thumbnail-download'

test('thumbnail streaming limits, deadlines and concurrency', async (t) => {
  let active = 0
  let peak = 0
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'image/png')
    if (request.url === '/length') {
      response.setHeader('Content-Length', '10000')
      response.end('x')
      return
    }
    if (request.url === '/stream') {
      response.write('x'.repeat(80))
      response.end('x'.repeat(80))
      return
    }
    if (request.url === '/empty') {
      response.end()
      return
    }
    if (request.url === '/html') {
      response.setHeader('Content-Type', 'text/html')
      response.end('error')
      return
    }
    if (request.url === '/stall') {
      response.writeHead(200)
      response.flushHeaders()
      return
    }
    active++
    peak = Math.max(peak, active)
    setTimeout(() => {
      active--
      response.end('image')
    }, 20)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}`
  for (const route of ['/length', '/stream', '/empty', '/html']) {
    await assert.rejects(fetchThumbnail(url + route, { maxBytes: 100 }))
  }
  await assert.rejects(fetchThumbnail(`${url}/stall`, { timeoutMs: 30 }))
  const images = await Promise.all(Array.from({ length: 12 }, () => fetchThumbnail(`${url}/ok`)))
  assert.equal(peak, 4)
  assert.ok(images.every((image) => image.buffer.toString() === 'image'))
})

test('thumbnail cache publishes complete files and cleans failed staging files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vidbee-thumbnail-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const target = join(root, 'image.png')
  await writeThumbnailAtomically(target, Buffer.from('complete'))
  assert.equal(await readFile(target, 'utf8'), 'complete')
  await mkdir(join(root, 'directory'))
  await assert.rejects(writeThumbnailAtomically(join(root, 'directory'), Buffer.from('data')))
  assert.deepEqual((await readdir(root)).sort(), ['directory', 'image.png'])
})
