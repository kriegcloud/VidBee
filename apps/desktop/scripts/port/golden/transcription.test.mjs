import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest'
import { startTranscriptionLoopback } from './transcription-loopback.mjs'

let runDir
let server
const bytes = Buffer.from('0123456789abcdef')

beforeEach(async () => {
  runDir = await mkdtemp(path.join(process.cwd(), '.transcription-test-'))
  const fixtures = path.join(runDir, 'userdata/transcription-fixtures')
  await mkdir(fixtures, { recursive: true })
  for (const name of ['speech.wav', 'silence.wav', 'captions.mkv']) {
    await writeFile(path.join(fixtures, name), bytes)
  }
  server = await startTranscriptionLoopback(runDir)
})

afterEach(async () => {
  try {
    await server?.close()
  } finally {
    await rm(runDir, { recursive: true, force: true })
  }
})

describe('transcription loopback public media contract', () => {
  it('retains bytes and fixed metadata across repeat GET and HEAD', async () => {
    for (const name of ['speech.wav', 'silence.wav', 'captions.mkv']) {
      for (const method of ['GET', 'GET', 'HEAD']) {
        const response = await fetch(`${server.url}/${name}`, { method })
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe(
          name.endsWith('.wav') ? 'audio/wav' : 'video/x-matroska'
        )
        expect(response.headers.get('content-length')).toBe('16')
        expect(response.headers.get('last-modified')).toBe('Wed, 01 Jan 2025 00:00:00 GMT')
        expect(response.headers.get('accept-ranges')).toBe('bytes')
        expect(Buffer.from(await response.arrayBuffer())).toEqual(
          method === 'HEAD' ? Buffer.alloc(0) : bytes
        )
      }
    }
  })

  it('supports bounded, open and suffix byte ranges including ranged HEAD', async () => {
    for (const [range, body, contentRange] of [
      ['bytes=2-5', '2345', 'bytes 2-5/16'],
      ['bytes=12-', 'cdef', 'bytes 12-15/16'],
      ['bytes=-3', 'def', 'bytes 13-15/16'],
      ['bytes=14-99', 'ef', 'bytes 14-15/16']
    ]) {
      for (const method of ['GET', 'HEAD']) {
        const response = await fetch(`${server.url}/speech.wav`, {
          method,
          headers: { range }
        })
        expect(response.status).toBe(206)
        expect(response.headers.get('content-range')).toBe(contentRange)
        expect(response.headers.get('content-length')).toBe(String(body.length))
        expect(await response.text()).toBe(method === 'HEAD' ? '' : body)
      }
    }
  })

  it('rejects invalid ranges and unknown routes', async () => {
    for (const range of ['bytes=20-', 'bytes=9-2', 'bytes=-', 'bytes=-0', 'bytes=0-1,4-5']) {
      const response = await fetch(`${server.url}/silence.wav`, { headers: { range } })
      expect(response.status).toBe(416)
      expect(response.headers.get('content-range')).toBe('bytes */16')
      expect(await response.text()).toBe('')
    }
    expect((await fetch(`${server.url}/missing.wav`)).status).toBe(404)
  })

  it('retains ordered method, path and range request evidence', async () => {
    await fetch(`${server.url}/captions.mkv`, { method: 'HEAD' })
    await fetch(`${server.url}/speech.wav`, { headers: { range: 'bytes=0-1' } })
    expect(server.requests).toEqual([
      { method: 'HEAD', path: '/captions.mkv', range: null },
      { method: 'GET', path: '/speech.wav', range: 'bytes=0-1' }
    ])
  })
})
