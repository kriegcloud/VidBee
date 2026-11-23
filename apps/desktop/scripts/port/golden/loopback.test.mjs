import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest'
import { startLoopback } from './loopback.mjs'
import { normalize } from './normalize.mjs'

let runDir
let server
const bytes = Buffer.from('0123456789abcdef')
beforeEach(async () => {
  runDir = await mkdtemp(path.join(process.cwd(), '.loopback-test-'))
  await mkdir(path.join(runDir, 'userdata/loopback-fixtures'), { recursive: true })
  await mkdir(path.join(runDir, 'userdata/golden-media'), { recursive: true })
  for (const name of ['video.mp4', 'audio.wav']) {
    await writeFile(path.join(runDir, 'userdata/loopback-fixtures', name), bytes)
  }
  await writeFile(path.join(runDir, 'userdata/golden-media/thumbnail.png'), bytes)
  server = await startLoopback(runDir)
})
afterEach(async () => {
  try {
    if (server) {
      await server.close()
    }
  } finally {
    await rm(runDir, { recursive: true, force: true })
  }
})

describe('offline loopback media server', () => {
  it('serves repeatable GET and HEAD metadata without sending a HEAD body', async () => {
    for (const [route, type] of [
      ['video.mp4', 'video/mp4'],
      ['audio.wav', 'audio/wav'],
      ['image.png', 'image/png']
    ]) {
      const response = await fetch(`${server.url}/${route}`)
      expect(response.headers.get('content-type')).toBe(type)
      expect(response.headers.get('content-length')).toBe('16')
      expect(response.headers.get('accept-ranges')).toBe('bytes')
      expect(response.headers.get('last-modified')).toBe('Wed, 01 Jan 2025 00:00:00 GMT')
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes)
    }
    const response = await fetch(`${server.url}/video.mp4`, { method: 'HEAD' })
    expect(response.headers.get('content-length')).toBe('16')
    expect(await response.text()).toBe('')
  })
  it('supports bounded, open-ended and suffix ranges; rejects invalid ranges', async () => {
    for (const [range, expected, contentRange] of [
      ['bytes=2-5', '2345', 'bytes 2-5/16'],
      ['bytes=12-', 'cdef', 'bytes 12-15/16'],
      ['bytes=-3', 'def', 'bytes 13-15/16']
    ]) {
      const response = await fetch(`${server.url}/video.mp4`, { headers: { range } })
      expect(response.status).toBe(206)
      expect(response.headers.get('content-range')).toBe(contentRange)
      expect(await response.text()).toBe(expected)
    }
    for (const range of ['bytes=20-', 'bytes=9-2', 'bytes=-', 'bytes=0-1,4-5']) {
      const response = await fetch(`${server.url}/video.mp4`, { headers: { range } })
      expect(response.status).toBe(416)
      expect(response.headers.get('content-range')).toBe('bytes */16')
      expect(await response.text()).toBe('')
    }
  })
  it('keeps error routes explicit and recovery controllable', async () => {
    for (const code of [404, 500]) {
      expect((await fetch(`${server.url}/${code}.mp4`)).status).toBe(code)
    }
    expect((await fetch(`${server.url}/429-cli.mp4`)).status).toBe(429)
    expect((await fetch(`${server.url}/recover.mp4`)).status).toBe(404)
    server.recover()
    expect(await (await fetch(`${server.url}/recover.mp4`)).text()).toBe(bytes.toString())
  })
  it('flushes stalled headers and permits aborting the body', async () => {
    const controller = new AbortController()
    const response = await fetch(`${server.url}/stall.mp4`, { signal: controller.signal })
    expect(response.status).toBe(200)
    const body = response.text()
    controller.abort()
    await expect(body).rejects.toThrow()
  })
  it('finishes throttled responses and records requests in arrival order', async () => {
    expect(await (await fetch(`${server.url}/slow.mp4`)).text()).toBe(bytes.toString())
    await fetch(`${server.url}/video.mp4`, { headers: { range: 'bytes=0-1' } })
    const expected = [
      { method: 'GET', path: '/slow.mp4', range: null },
      { method: 'GET', path: '/video.mp4', range: 'bytes=0-1' }
    ]
    expect(server.requests).toEqual(expected)
    await server.close()
    server = undefined
    const log = await readFile(path.join(runDir, 'loopback/requests.jsonl'), 'utf8')
    expect(
      log
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    ).toEqual(expected)
  })
  it('closes with active throttled and stalled connections', async () => {
    const response = await fetch(`${server.url}/slow.mp4`)
    await fetch(`${server.url}/stall.mp4`)
    await server.close()
    server = undefined
    await expect(response.text()).rejects.toThrow()
  })
  it('normalizes only loopback group ports and runtime retry timestamps', () => {
    expect(normalize({ nextRetryAt: 4_102_444_800_000, acquiredAt: 1_794_997_749_627 })).toEqual({
      nextRetryAt: 4_102_444_800_000,
      acquiredAt: '<timestamp>'
    })
    expect(
      normalize({
        groupKey: '127.0.0.1:1234',
        nextRetryAt: 1_794_997_749_627,
        attempt: 2,
        output: { size: 16 }
      })
    ).toEqual({
      groupKey: '127.0.0.1:<port>',
      nextRetryAt: '<timestamp>',
      attempt: 2,
      output: { size: 16 }
    })
    expect(normalize({ groupKey: 'other:1234', nextRetryAt: 1_735_689_600_000 })).toEqual({
      groupKey: 'other:1234',
      nextRetryAt: 1_735_689_600_000
    })
  })
})
