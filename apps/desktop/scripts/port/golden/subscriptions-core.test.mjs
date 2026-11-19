import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest'
import { startLoopback } from './loopback.mjs'
import { normalizeSubscriptionClocks } from './subscriptions-core-cases.mjs'
import { buildSubscriptionsFixture } from './subscriptions-core-fixture.mjs'

let directory
let server
beforeEach(async () => {
  directory = await mkdtemp(path.join(process.cwd(), '.subscriptions-test-'))
  const profile = path.join(directory, 'userdata')
  await mkdir(path.join(profile, 'loopback-fixtures'), { recursive: true })
  await mkdir(path.join(profile, 'golden-media'), { recursive: true })
  for (const file of ['video.mp4', 'audio.wav']) {
    await writeFile(path.join(profile, 'loopback-fixtures', file), 'media')
  }
  await writeFile(path.join(profile, 'golden-media/thumbnail.png'), 'image')
  await buildSubscriptionsFixture(profile)
  server = await startLoopback(directory, { subscriptions: true })
})
afterEach(async () => {
  try {
    if (server) {
      await server.close()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
describe('synthetic subscription routes', () => {
  it('serves fixed absolute RSS/Atom links and explicit media types before fallback', async () => {
    for (const route of ['rss.xml', 'auto.xml', 'atom.xml']) {
      const response = await fetch(`${server.url}/subscriptions-core/${route}`)
      expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8')
      const body = await response.text()
      expect(body).toContain(server.url)
      expect(body).not.toContain('{{ORIGIN}}')
      expect(body).toContain('2025')
    }
    expect(await (await fetch(`${server.url}/subscriptions-core/cover.png`)).text()).toBe('image')
  })
  it('changes only the selected revision, retaining one identity and adding/removing one', async () => {
    const before = await (await fetch(`${server.url}/subscriptions-core/rss.xml`)).text()
    server.subscriptions.revision('B')
    const after = await (await fetch(`${server.url}/subscriptions-core/rss.xml`)).text()
    expect(before).toContain('manual-retained')
    expect(after).toContain('manual-retained')
    expect(before).toContain('manual-dropped')
    expect(after).not.toContain('manual-dropped')
    expect(after).toContain('manual-newer')
    expect(await (await fetch(`${server.url}/subscriptions-core/auto.xml`)).text()).toContain(
      'automatic-dropped'
    )
  })
  it('redirects to relative discovery links and retains invalid/duplicate/capped candidates', async () => {
    const response = await fetch(`${server.url}/subscriptions-core/redirect`)
    expect(response.url).toBe(`${server.url}/subscriptions-core/site/index.html`)
    expect(response.headers.get('content-type')).toContain('text/html')
    const html = await response.text()
    expect(html).toContain('../rss.xml')
    expect(html).toContain('javascript:invalid')
    expect(html).toContain('user:secret@127.0.0.1')
    const failed = await (
      await fetch(`${server.url}/subscriptions-core/failed-discovery.html`)
    ).text()
    expect(failed).toContain('candidate-4.xml')
    expect(await (await fetch(`${server.url}/subscriptions-core/candidate-1.xml`)).text()).toBe(
      'Not a feed'
    )
  })
  it('records completed requests and flushes the bounded log on close', async () => {
    await (await fetch(`${server.url}/subscriptions-core/rss.xml`)).text()
    server.subscriptions.revision('B')
    await fetch(`${server.url}/subscriptions-core/rss.xml`, { method: 'HEAD' })
    await server.close()
    const entries = JSON.parse(
      `[${(await readFile(path.join(directory, 'subscriptions-core/requests.jsonl'), 'utf8')).trim().split('\n').join(',')}]`
    )
    expect(
      entries.map(({ method, revision, status, completed }) => ({
        method,
        revision,
        status,
        completed
      }))
    ).toEqual([
      { method: 'GET', revision: 'A', status: 200, completed: true },
      { method: 'HEAD', revision: 'B', status: 200, completed: true }
    ])
    server = undefined
  })
  it('normalizes only named check clocks and keeps feed dates/statuses/errors', () => {
    expect(
      normalizeSubscriptionClocks({
        lastCheckedAt: 1_795_000_000_000,
        lastSuccessAt: null,
        publishedAt: 1_735_819_200_000,
        latestVideoPublishedAt: 1_735_819_200_000,
        status: 'failed',
        lastError: 'parser-error'
      })
    ).toEqual({
      lastCheckedAt: '<timestamp>',
      lastSuccessAt: null,
      publishedAt: 1_735_819_200_000,
      latestVideoPublishedAt: 1_735_819_200_000,
      status: 'failed',
      lastError: 'parser-error'
    })
  })
})
