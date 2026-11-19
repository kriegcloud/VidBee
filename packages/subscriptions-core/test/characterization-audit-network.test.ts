import Parser from 'rss-parser'
import { afterEach, expect, it, vi } from '@effect/vitest'
import { RssParserFeedFetcher } from '@vidbee/subscriptions-core/feed-parser'

vi.setConfig({ testTimeout: 120000 })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const xml = '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>T</title><link>https://fixture.invalid/</link><description>D</description><itunes:image href="https://fixture.invalid/cover"/></channel></rss>'
const response = (body: string, url: string) => ({ ok: true, status: 200, url, text: async () => body })
it('probe skips page-self candidate and successful direct empty URL falls back to request', async () => {
  const calls: unknown[] = []
  vi.stubGlobal('fetch', async (...args: unknown[]) => {
    const url = String(args[0]); calls.push([url, args.length])
    return response(url.endsWith('/start') ? '<html><link rel=alternate type=application/rss+xml href="https://fixture.invalid/page"><link rel=alternate type=application/rss+xml href="/feed"></html>' : xml, url.endsWith('/start') ? 'https://fixture.invalid/page' : '')
  })
  const fetcher = new RssParserFeedFetcher()
  const discovered = await fetcher.probe('https://fixture.invalid/start')
  const direct = await fetcher.probe('https://fixture.invalid/feed')
  expect({ calls, discovered, direct }).toMatchSnapshot()
})
it('third-party parser permissive metadata mapping stays wide', async () => {
  vi.stubGlobal('fetch', async () => response(xml, ''))
  vi.spyOn(Parser.prototype, 'parseString').mockResolvedValue({ title: {}, link: 1, image: 'x', items: null })
  expect(await new RssParserFeedFetcher().fetch('https://fixture.invalid/feed')).toMatchSnapshot()
})
it('probe rejects with original initial third-party parser error identity', async () => {
  const original = Parser.prototype.parseString
  const reasons: unknown[] = []
  vi.spyOn(Parser.prototype, 'parseString').mockImplementation(function (this: Parser, xml) {
    return Reflect.apply(original, this, [xml]).catch((reason: unknown) => { reasons.push(reason); throw reason })
  })
  vi.stubGlobal('fetch', async (url: string) => response(url.endsWith('/start') ? '<html><link rel=alternate type=application/rss+xml href=/candidate></html>' : '<broken>', url))
  const failure = await new RssParserFeedFetcher().probe('https://fixture.invalid/start').catch((reason: unknown) => reason)
  expect(reasons).toHaveLength(2)
  expect(failure).toBe(reasons[0])
  expect(failure).not.toBe(reasons[1])
})
