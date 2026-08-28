/**
 * Thin adapter around `rss-parser`. Exposes a `FeedFetcher` interface so
 * tests and hosts can substitute an in-memory parser, and ships a default
 * implementation that hits the network exactly once per call (or twice when
 * an `http://` URL is retried as `https://`).
 *
 * Fetch uses global `fetch` (Node 18+) rather than rss-parser's `parseURL`
 * so we can send browser-like headers, follow redirects, and let the runtime
 * decompress gzip/br. rss-parser is used only to parse the XML body.
 */
import Parser from 'rss-parser'
import type { ParsedFeed, ParsedFeedItem } from './types'

export interface FeedFetcher {
  fetch(feedUrl: string): Promise<ParsedFeed>
}

const customFields = {
  item: [
    ['yt:videoId', 'youtubeId'],
    ['media:thumbnail', 'mediaThumbnail'],
    ['media:content', 'mediaContent'],
    ['enclosure', 'enclosure'],
    ['content:encoded', 'contentEncoded'],
    ['description', 'description']
  ] as Array<[string, string]>
}

/**
 * Permissive browser-like headers. rss-parser's defaults (`User-Agent:
 * rss-parser`, `Accept: application/rss+xml`) cause HTTP 406/403 on hosts
 * such as Ximalaya that negotiate on Accept or block non-browser agents.
 */
const RSS_FETCH_HEADERS: Record<string, string> = {
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
}

/** Large podcast feeds (e.g. Ximalaya ~4MB) need more than rss-parser's 60s. */
const RSS_FETCH_TIMEOUT_MS = 180_000

/**
 * Map a parsed rss-parser output onto the host-neutral `ParsedFeed` shape.
 *
 * @param raw rss-parser `parseString` / `parseURL` result
 */
const toParsedFeed = (raw: Parser.Output<ParsedFeedItem>): ParsedFeed => {
  const feed: ParsedFeed = {
    items: Array.isArray(raw.items) ? raw.items : []
  }
  if (typeof raw.title === 'string') {
    feed.title = raw.title
  }
  if (typeof raw.link === 'string') {
    feed.link = raw.link
  }
  if (raw.image && typeof raw.image === 'object') {
    feed.image = { url: typeof raw.image.url === 'string' ? raw.image.url : undefined }
  }
  if (raw.itunes && typeof raw.itunes === 'object') {
    feed.itunes = {
      image: typeof raw.itunes.image === 'string' ? raw.itunes.image : undefined
    }
  }
  return feed
}

/**
 * Rewrite `http://` to `https://` so a failed cleartext fetch can be retried.
 *
 * @param feedUrl URL the user subscribed with
 */
const toHttpsUrl = (feedUrl: string): string | null => {
  if (!/^http:\/\//i.test(feedUrl)) {
    return null
  }
  return feedUrl.replace(/^http:\/\//i, 'https://')
}

/**
 * GET a feed URL with permissive headers, following redirects.
 *
 * @param feedUrl Absolute HTTP(S) feed URL
 */
const fetchFeedBody = async (feedUrl: string): Promise<string> => {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, RSS_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(feedUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: RSS_FETCH_HEADERS,
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(`Status code ${response.status}`)
    }
    return await response.text()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${RSS_FETCH_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch feed XML, retrying `http://` as `https://` when the first attempt fails.
 *
 * @param feedUrl Absolute HTTP(S) feed URL
 */
const fetchFeedXml = async (feedUrl: string): Promise<string> => {
  try {
    return await fetchFeedBody(feedUrl)
  } catch (error) {
    const httpsUrl = toHttpsUrl(feedUrl)
    if (!httpsUrl) {
      throw error
    }
    return await fetchFeedBody(httpsUrl)
  }
}

/**
 * Default fetcher backed by `fetch` + `rss-parser`. Lazily constructs the
 * underlying parser so unused fetchers pay no startup cost.
 */
export class RssParserFeedFetcher implements FeedFetcher {
  private parser: Parser<Record<string, never>, ParsedFeedItem> | null = null

  /**
   * Download and parse one RSS/Atom feed URL.
   *
   * @param feedUrl Absolute HTTP(S) feed URL
   */
  async fetch(feedUrl: string): Promise<ParsedFeed> {
    if (!this.parser) {
      this.parser = new Parser<Record<string, never>, ParsedFeedItem>({
        customFields,
        headers: RSS_FETCH_HEADERS,
        timeout: RSS_FETCH_TIMEOUT_MS,
        maxRedirects: 20,
        defaultRSS: 2
      })
    }
    const xml = await fetchFeedXml(feedUrl)
    const raw = await this.parser.parseString(xml)
    return toParsedFeed(raw)
  }
}
