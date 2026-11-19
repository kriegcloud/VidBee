import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest'
import {
  assertTranscriptionCpuProviders,
  verifyTranscriptionCpuBuild
} from './transcription-cpu.mjs'
import { startTranscriptionLoopback } from './transcription-loopback.mjs'
import { normalizeTranscription } from './transcription-normalize.mjs'

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

describe('transcription CPU execution boundary', () => {
  it('requires the CPU-only build inventory and rejects execution-provider libraries', async () => {
    const directory = path.join(
      runDir,
      'resources/app.asar.unpacked/node_modules/sherpa-onnx-linux-x64'
    )
    await mkdir(directory, { recursive: true })
    for (const name of [
      'index.js',
      'libonnxruntime.so',
      'libsherpa-onnx-c-api.so',
      'libsherpa-onnx-cxx-api.so',
      'package.json',
      'sherpa-onnx.node'
    ]) {
      await writeFile(path.join(directory, name), '')
    }
    await expect(verifyTranscriptionCpuBuild(runDir)).resolves.toMatchObject({
      executionProviders: ['CPUExecutionProvider']
    })
    await writeFile(path.join(directory, 'libonnxruntime_providers_cuda.so'), '')
    await expect(verifyTranscriptionCpuBuild(runDir)).rejects.toThrow(
      'CPU build prerequisite failed'
    )
    await rm(path.join(directory, 'libonnxruntime_providers_cuda.so'))
    await writeFile(path.join(directory, 'alternate-provider.so'), '')
    await expect(verifyTranscriptionCpuBuild(runDir)).rejects.toThrow(
      'CPU build prerequisite failed'
    )
  })

  it('accepts silent tasks and CPU-only diagnostics but rejects every non-CPU list', () => {
    expect(() => assertTranscriptionCpuProviders({ log: 'compute.provider=cpu' })).not.toThrow()
    const cpu = 'Available providers: CPUExecutionProvider, . Fallback to cpu!'
    expect(() => assertTranscriptionCpuProviders({ tasks: [{ log: cpu }] })).not.toThrow()
    for (const log of [
      'Available providers: CUDAExecutionProvider, CPUExecutionProvider',
      `${cpu}\nAvailable providers: CUDAExecutionProvider`,
      'Available providers:'
    ]) {
      expect(() => assertTranscriptionCpuProviders({ log })).toThrow(
        'CPU provider prerequisite failed'
      )
    }
  })

  it('normalizes only named benchmark fields while preserving transcript and errors', () => {
    const value = {
      provider: 'cuda',
      log: 'compute.provider=cuda reason=accelerator-faster candidates=cuda,cpu\ncompute.probe=cuda ok=true durationMs=51.25 error=none',
      transcript: { text: 'compute.provider=cuda', durationMs: 6625, words: [], speaker: 'cuda' },
      error: 'compute.provider=cuda',
      attempt: 1,
      cloud: { provider: 'cloud' }
    }
    expect(normalizeTranscription(value)).toEqual({
      ...value,
      provider: '<provider>',
      log: 'compute.provider=<provider> reason=<benchmark-choice> candidates=cuda,cpu\ncompute.probe=<provider> ok=true durationMs=<probe-duration> error=none'
    })
    expect(
      normalizeTranscription({
        log: 'compute.probe=cuda ok=false durationMs=51.25 error=timeout durationMs=999'
      }).log
    ).toBe(
      'compute.probe=<provider> ok=false durationMs=<probe-duration> error=timeout durationMs=999'
    )
    expect(normalizeTranscription({ log: 'error=compute.provider=cuda' }).log).toBe(
      'error=compute.provider=cuda'
    )
    expect(value.provider).toBe('cuda')
    for (const reason of ['process-cache', 'in-flight-probe', 'accelerator-probes-failed']) {
      expect(
        normalizeTranscription({ log: `compute.provider=cpu reason=${reason} candidates=cuda,cpu` })
          .log
      ).toBe(`compute.provider=<provider> reason=${reason} candidates=cuda,cpu`)
    }
  })
})
