import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@effect/vitest'
import { capture } from './capture.mjs'
import { auditDns } from './dns-audit.mjs'
import { startLoopback } from './loopback.mjs'
import { differences } from './normalize.mjs'
import { buildPhase8Fixture } from './phase8-fixture.mjs'
import { normalizeExtensionMetadata } from './phase8-normalize.mjs'
import { phase8Prerequisites } from './phase8-prerequisites.mjs'

describe('extension-format-user-agent', () => {
  it('changes only the exact format header, preserves siblings and ordering, and still detects other differences', () => {
    const input = {
      response: {
        body: {
          http_headers: { 'User-Agent': 'outer' },
          formats: [
            { format_id: 'second', http_headers: { 'User-Agent': 'random-1', Accept: 'literal' } },
            { format_id: 'first', http_headers: { 'User-Agent': 'random-2', Referer: 'literal' } }
          ]
        }
      },
      other: { 'User-Agent': 'outside' }
    }
    const actual = normalizeExtensionMetadata(input)
    expect(input.response.body.formats[0].http_headers['User-Agent']).toBe('random-1')
    expect(actual).toEqual({
      response: {
        body: {
          http_headers: { 'User-Agent': 'outer' },
          formats: [
            {
              format_id: 'second',
              http_headers: { 'User-Agent': '<user-agent>', Accept: 'literal' }
            },
            {
              format_id: 'first',
              http_headers: { 'User-Agent': '<user-agent>', Referer: 'literal' }
            }
          ]
        }
      },
      other: { 'User-Agent': 'outside' }
    })
    const changed = structuredClone(input)
    changed.response.body.formats[0].http_headers.Accept = 'different'
    expect(differences(actual, normalizeExtensionMetadata(changed))).toHaveLength(1)
    changed.response.body.formats.reverse()
    expect(differences(actual, normalizeExtensionMetadata(changed)).length).toBeGreaterThan(1)
  })
})
describe('bounded CLI process capture', () => {
  it('collects large pretty/probe-shaped output through pipe closure', async () => {
    const script = `const text=JSON.stringify({probe:'x'.repeat(2000000)},null,2);process.stdout.write(text);process.stderr.write('y'.repeat(2000000));`
    const result = await capture(process.execPath, ['-e', script])
    expect(result.code).toBe(0)
    expect(result.signal).toBe(null)
    expect(JSON.parse(result.stdout).probe.length).toBe(2_000_000)
    expect(result.stderr.length).toBe(2_000_000)
  })
  it('records signal termination separately from exit status', async () => {
    const result = await capture(process.execPath, ['-e', `process.kill(process.pid,'SIGTERM')`])
    expect(result.code).toBe(null)
    expect(result.signal).toBe('SIGTERM')
  })
  it('bounds descendant-held pipes after the parent exits', async () => {
    const script = `require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore',1,2]});process.exit(0)`
    await expect(
      capture(process.execPath, ['-e', script], { timeoutMs: 3000 })
    ).rejects.toMatchObject({
      message: expect.stringContaining('capture timed out'),
      code: 0,
      signal: null
    })
  })
  it('rejects spawn failures', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'g8-capture-'))
    try {
      await expect(capture(path.join(directory, 'absent'), [])).rejects.toThrow('ENOENT')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

it('reports one clear prerequisite skip without launching', async () => {
  expect(await phase8Prerequisites('/nonexistent-build', '/nonexistent-cli')).toBe(
    'SKIP phase 8 goldens: missing prerequisite nonexistent-cli'
  )
})

it('serves actual HTML with local media and thumbnail, fixed types and byte ranges', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'g8-route-'))
  let server
  try {
    const profile = path.join(directory, 'userdata')
    await mkdir(path.join(profile, 'loopback-fixtures'), { recursive: true })
    await mkdir(path.join(profile, 'golden-media'), { recursive: true })
    await writeFile(path.join(profile, 'loopback-fixtures/video.mp4'), 'video-bytes')
    await writeFile(path.join(profile, 'loopback-fixtures/audio.wav'), 'audio-bytes')
    await writeFile(path.join(profile, 'golden-media/thumbnail.png'), 'png-bytes')
    await buildPhase8Fixture(profile)
    server = await startLoopback(directory, { phase8: true })
    const response = await fetch(`${server.url}/phase8/page.html`)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const html = await response.text()
    expect(html).toContain(`${server.url}/phase8/video.mp4`)
    expect(html).toContain(`${server.url}/phase8/thumbnail.png`)
    expect(html).not.toContain('{{ORIGIN}}')
    const thumbnail = await fetch(`${server.url}/phase8/thumbnail.png`)
    expect(thumbnail.headers.get('content-type')).toBe('image/png')
    expect(await thumbnail.text()).toBe('png-bytes')
    const media = await fetch(`${server.url}/phase8/video.mp4`, { headers: { range: 'bytes=2-4' } })
    expect(media.status).toBe(206)
    expect(await media.text()).toBe('deo')
  } finally {
    await server?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('checks DNS readiness/selftest and rejects a hostname outside the earlier-lane union', async () => {
  const work = await mkdtemp(path.join(tmpdir(), 'g8-dns-'))
  try {
    await mkdir(path.join(work, 'run'))
    const log = path.join(work, 'run/dns.log')
    await writeFile(
      log,
      '# dns-logger ready\n00:00:00 type=1 selftest.dns-logger.invalid\n00:00:00 type=1 github.com\n'
    )
    await auditDns(work, ['run'])
    await writeFile(
      log,
      '# dns-logger ready\n00:00:00 type=1 selftest.dns-logger.invalid\n00:00:00 type=1 unapproved.invalid\n'
    )
    await expect(auditDns(work, ['run'])).rejects.toThrow('Unexpected DNS names')
  } finally {
    await rm(work, { recursive: true, force: true })
  }
})
