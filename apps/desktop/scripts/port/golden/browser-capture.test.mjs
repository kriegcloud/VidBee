import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest'
import { profileFixtures } from './browser-capture-fixture.mjs'
import { startBrowserCaptureLoopback } from './browser-capture-loopback.mjs'

let runDir
let server
const bytes = Buffer.from('0123456789abcdef')
beforeEach(async () => {
  runDir = await mkdtemp(path.join(process.cwd(), '.browser-capture-test-'))
  await mkdir(path.join(runDir, 'userdata/browser-capture-fixtures'), { recursive: true })
  for (const name of ['landscape', 'portrait', 'silent']) {
    await writeFile(path.join(runDir, 'userdata/browser-capture-fixtures', `${name}.mp4`), bytes)
  }
  server = await startBrowserCaptureLoopback(runDir)
})
afterEach(async () => {
  try {
    await server?.close()
  } finally {
    await rm(runDir, { recursive: true, force: true })
  }
})

describe('browser capture fixtures', () => {
  it('serves DRM metadata to extraction and a clear source to browser JavaScript', async () => {
    const page = await (await fetch(`${server.url}/drm.html`)).text()
    expect(page).toContain('src="/drm.mpd"')
    expect(page).toContain('document.querySelector("video").src="/silent.mp4"')
    const manifest = await fetch(`${server.url}/drm.mpd`)
    expect(manifest.headers.get('content-type')).toBe('application/dash+xml')
    expect(await manifest.text()).toContain('ContentProtection')
    const silent = await (await fetch(`${server.url}/silent.html`)).text()
    expect(silent).toContain('muted')
    const stationary = await (await fetch(`${server.url}/no-video.html`)).text()
    expect(stationary).not.toContain('<video')
    expect((await fetch(`${server.url}/missing`)).status).toBe(404)
  })
  it('supports HEAD, fixed metadata and ranges without altering the body', async () => {
    const head = await fetch(`${server.url}/portrait.mp4`, { method: 'HEAD' })
    expect(head.headers.get('content-length')).toBe('16')
    expect(head.headers.get('last-modified')).toBe('Wed, 01 Jan 2025 00:00:00 GMT')
    expect(await head.text()).toBe('')
    for (const [range, expected] of [
      ['bytes=2-5', '2345'],
      ['bytes=13-', 'def'],
      ['bytes=-3', 'def']
    ]) {
      const response = await fetch(`${server.url}/portrait.mp4`, { headers: { range } })
      expect(response.status).toBe(206)
      expect(await response.text()).toBe(expected)
    }
    for (const range of ['bytes=20-', 'bytes=7-3', 'invalid']) {
      expect((await fetch(`${server.url}/portrait.mp4`, { headers: { range } })).status).toBe(416)
    }
    await server.close()
    server = undefined
    const requests = (await readFile(path.join(runDir, 'browser-capture/requests.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(JSON.parse)
    expect(requests[0]).toEqual({ method: 'HEAD', path: '/portrait.mp4', range: null })
    expect(requests).toHaveLength(7)
  })
  it('keeps all route identities distinct and inventories nonempty', () => {
    expect(profileFixtures).toHaveLength(13)
    expect(new Set(profileFixtures.map(([site, key]) => `${site}/${key}`)).size).toBe(13)
    expect(profileFixtures.filter(([site]) => site === 'fansly')).toHaveLength(1)
  })
})
