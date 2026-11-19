import Parser from 'rss-parser'
import { afterEach, expect, it, vi } from 'vitest'
import { discoverFeedUrls, RssParserFeedFetcher } from '@vidbee/subscriptions-core-legacy/feed-parser'
import { normalizeFeedItems } from '@vidbee/subscriptions-core-legacy/feed-items'


vi.setConfig({ testTimeout: 120000 })
const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Fixture feed</title><link>https://fixture.invalid/home</link><description>Fixture</description><image><url>https://fixture.invalid/cover.png</url><title>Cover</title><link>https://fixture.invalid/</link></image><item><guid>entry</guid><title>Episode</title><link>https://fixture.invalid/entry</link><pubDate>Wed, 01 Jan 2020 00:00:00 GMT</pubDate><itunes:image href="https://fixture.invalid/episode.png"/><media:thumbnail url="https://fixture.invalid/media.png"/><enclosure url="https://fixture.invalid/audio.mp3" type="audio/mpeg" length="123"/></item></channel></rss>`
const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><link href="https://fixture.invalid/home"/><entry><id>tag:fixture:1</id><title>Entry</title><link href="https://fixture.invalid/1"/><updated>2020-01-01T01:00:00+01:00</updated><summary>Summary</summary></entry></feed>`
const response = (body: string, url = 'https://fixture.invalid/final', status = 200) => ({ ok: status >= 200 && status < 300, status, url, text: async () => body })
const install = (handler: (url: string, options: RequestInit) => unknown) => {
  const calls: unknown[] = []
  vi.stubGlobal('fetch', (url: string, options: RequestInit) => {
    const signal = options.signal
    expect(signal).toBeInstanceOf(AbortSignal)
    calls.push([url, { ...options, signal: { aborted: signal?.aborted, reason: signal?.reason } }])
    return handler(url, options)
  })
  return calls
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks() })
it.each([['RSS/podcast/media', rss], ['Atom', atom]])('complete parser and normalization payload: %s', async (_name, xml) => {
  const calls = install(async () => response(xml))
  const fetcher = new RssParserFeedFetcher()
  const feed = await fetcher.fetch('https://fixture.invalid/feed')
  expect({ calls, feed, normalized: normalizeFeedItems(feed.items, { now: () => 99 }), probe: await fetcher.probe('https://fixture.invalid/feed') }).toMatchSnapshot()
})
it('discovery exact attribute protocol credentials entity dedupe cap and order behavior', () => {
  expect(discoverFeedUrls(`<LINK REL='alternate other' TYPE='Application/RSS+XML' HREF='../one?a=1&amp;b=2'><link rel=alternate type=application/rss+xml href='../one?a=1&amp;b=2'><link rel=alternate type=application/atom+xml href='https://user:pass@fixture.invalid/no'><link rel=alternate type=application/rss+xml href='file:///no'><link rel=alternate type=application/rss+xml href='//fixture.invalid/two'><link rel=alternate type=application/atom+xml href='/three'><link rel=alternate type=application/rss+xml href='/four'>`, 'https://fixture.invalid/path/page')).toEqual(['https://fixture.invalid/one?a=1&b=2', 'https://fixture.invalid/two', 'https://fixture.invalid/three'])
})
it('probe candidates use redirected page base and retain candidate URL even after feed redirect', async () => {
  const page = `<html><link rel="alternate" type="application/rss+xml" href="/bad"><link rel="alternate" type="application/atom+xml" href="/feed"></html>`
  const calls = install(async (url) => response(url.endsWith('/start') ? page : url.endsWith('/bad') ? 'not XML' : atom, url.endsWith('/start') ? 'https://redirect.invalid/page' : 'https://fixture.invalid/redirected-feed'))
  const result = await new RssParserFeedFetcher().probe('https://fixture.invalid/start')
  expect({ calls, result }).toMatchSnapshot()
})
it('unsuccessful candidates preserve the initial parse rejection, direct XML failure never retries HTTPS', async () => {
  const calls = install(async () => response('<not-closed>'))
  await expect(new RssParserFeedFetcher().fetch('http://fixture.invalid/feed')).rejects.toMatchSnapshot()
  expect(calls).toHaveLength(1)
  const failed = install(async (url) => response(url.endsWith('/start') ? '<html><link rel=alternate type=application/rss+xml href=/candidate></html>' : '<other>'))
  await expect(new RssParserFeedFetcher().probe('https://fixture.invalid/start')).rejects.toMatchSnapshot()
  expect(failed).toHaveLength(2)
})
it('HTTP status and body/fetch failure retry exact shape and original failure identity', async () => {
  for (const failure of [new Error('body-sentinel'), { body: 'sentinel' }, false, null]) {
    const calls = install(async () => ({ ...response(''), text: () => Promise.reject(failure) }))
    await expect(new RssParserFeedFetcher().fetch('http://fixture.invalid/feed')).rejects.toBe(failure)
    expect(calls).toMatchSnapshot()
  }
  const calls = install(async () => response('', '', 503))
  await expect(new RssParserFeedFetcher().fetch('https://fixture.invalid/feed')).rejects.toEqual(new Error('Status code 503'))
  expect(calls).toMatchSnapshot()
})
it('HTTPS retry can succeed after failed HTTP request; timeout cleared before parse', async () => {
  vi.useFakeTimers()
  const calls = install(async (url) => { if (url.startsWith('http:')) throw new Error('network'); return response(rss) })
  const feed = await new RssParserFeedFetcher().fetch('http://fixture.invalid/feed')
  expect({ calls, feed }).toMatchSnapshot()
  expect(vi.getTimerCount()).toBe(0)
})
for (const reason of [new Error('caller'), 'caller', 0, false, null]) it(`caller abort reason survives before request: ${String(reason)}`, async () => {
  const controller = new AbortController(); controller.abort(reason)
  const calls = install(() => { throw new Error('must not fetch') })
  await expect(new RssParserFeedFetcher().fetch('http://fixture.invalid/feed', controller.signal)).rejects.toBe(reason)
  expect(calls).toEqual([])
})
it('abort during body wins over body failure and suppresses HTTPS retry; caller controller remains borrowed', async () => {
  const controller = new AbortController(); const reason = { caller: 'body-abort' }
  const calls = install(async (_url, options) => ({ ...response(''), text: () => { controller.abort(reason); expect(options.signal?.aborted).toBe(true); return Promise.reject(new Error('body failure')) } }))
  await expect(new RssParserFeedFetcher().fetch('http://fixture.invalid/feed', controller.signal)).rejects.toBe(reason)
  expect(calls).toHaveLength(1); expect(controller.signal.reason).toBe(reason)
})
it('timeout is converted at request/body catch, caller reason takes precedence', async () => {
  vi.useFakeTimers()
  const calls = install((_url, options) => new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(options.signal?.reason))))
  const pending = new RssParserFeedFetcher().fetch('https://fixture.invalid/feed')
  const observed = pending.catch((error: unknown) => error)
  await vi.advanceTimersByTimeAsync(180000)
  expect(await observed).toEqual(new Error('Request timed out after 180000ms'))
  expect(calls).toHaveLength(1); expect(vi.getTimerCount()).toBe(0)
})
it('AbortError conversion depends on Error instance/name and is independent of elapsed time', async () => {
  for (const failure of [Object.assign(new Error('fake'), { name: 'AbortError' }), { name: 'AbortError', message: 'object' }]) {
    install(() => Promise.reject(failure))
    const pending = new RssParserFeedFetcher().fetch('https://fixture.invalid/feed')
    if (failure instanceof Error) await expect(pending).rejects.toEqual(new Error('Request timed out after 180000ms'))
    else await expect(pending).rejects.toBe(failure)
  }
})

it('request timeout is already cleared while successful parsing is suspended', async () => {
  const { deferred, turns } = await import('./fixtures/api-host')
  vi.useFakeTimers()
  const parsing = deferred<Parser.Output<Record<string, never>>>()
  let signal: AbortSignal | null | undefined
  install(async (_url, options) => { signal = options.signal; return response(rss) })
  vi.spyOn(Parser.prototype, 'parseString').mockImplementation(() => parsing.promise)
  const pending = new RssParserFeedFetcher().fetch('https://fixture.invalid/feed')
  await turns()
  expect(vi.getTimerCount()).toBe(0)
  await vi.advanceTimersByTimeAsync(180001)
  expect(signal?.aborted).toBe(false)
  parsing.resolve({ title: 'parsed after deadline', items: [] })
  expect(await pending).toEqual({ title: 'parsed after deadline', items: [] })
})
