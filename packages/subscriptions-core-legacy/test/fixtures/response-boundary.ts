import type { RssParserFeedFetcher } from '../../src/feed-parser.js'

export type ResponseBoundaryFetcher = Pick<RssParserFeedFetcher, 'fetch' | 'probe'>
export type ResponseBoundaryOutcome = { ok: true; value: unknown } | { ok: false; name: string; message: string }
export interface ResponseBoundaryRecord {
  readonly outcome: ResponseBoundaryOutcome
  /** Only OLD's flag determines whether the engine-error parity exception applies. */
  readonly engineFailure: boolean
}
const scalars = [['undefined', undefined], ['null', null], ['false', false], ['true', true], ['zero', 0], ['number', 503], ['NaN', NaN], ['empty', ''], ['string', '503']] as const
const xml = '<rss version="2.0"><channel><title>Fixture</title><description>Fixture</description></channel></rss>'
const snapshot = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_key, entry: unknown) => entry === undefined ? { $undefined: true } : typeof entry === 'number' && !Number.isFinite(entry) ? { $nonfinite: String(entry) } : entry))

/** Shared host/scenarios used by the unchanged OLD recorder and the NEW pinned-Node runner. */
export const runResponseBoundary = async (
  Constructor: new () => ResponseBoundaryFetcher,
): Promise<Record<string, ResponseBoundaryRecord>> => {
  const original = globalThis.fetch
  let response: unknown
  Reflect.set(globalThis, 'fetch', () => Promise.resolve(response))
  const records: Record<string, ResponseBoundaryRecord> = {}
  const fetcher = new Constructor()
  const capture = async (name: string, supplied: unknown, method: 'fetch' | 'probe' = 'fetch', outsideEngine = false): Promise<void> => {
    response = supplied
    let outcome: ResponseBoundaryOutcome
    try { outcome = { ok: true, value: snapshot(await fetcher[method]('https://fixture.invalid/feed')) } }
    catch (error) { outcome = { ok: false, name: error instanceof Error ? error.name : typeof error, message: error instanceof Error ? error.message : String(error) } }
    records[name] = { outcome, engineFailure: outsideEngine && !outcome.ok && ['TypeError', 'RangeError', 'URIError'].includes(outcome.name) }
  }
  try {
    // Full scalar product pins response.ok truthiness independently of response.status.
    for (const [okName, ok] of scalars) for (const [statusName, status] of scalars) {
      await capture(`ok:${okName}/status:${statusName}`, { ok, status, url: 'https://fixture.invalid/final', text: () => Promise.resolve(xml) })
    }
    for (const [statusName, status] of [['negative', -1], ['below-success', 199], ['success-low', 200], ['success-high', 299], ['above-success', 300], ['Infinity', Infinity], ['-Infinity', -Infinity]] as const) {
      for (const ok of [false, true]) await capture(`ok:${ok}/status:${statusName}`, { ok, status, url: '', text: () => Promise.resolve(xml) })
    }
    for (const [name, url] of scalars) for (const method of ['fetch', 'probe'] as const) {
      await capture(`url:${name}/${method}`, { ok: true, status: 200, url, text: () => Promise.resolve(xml) }, method)
    }
    for (const [name, text] of scalars) await capture(`text-method:${name}`, { ok: true, status: 200, url: '', text }, 'fetch', true)
    for (const [name, body] of scalars) await capture(`text-result:${name}`, { ok: true, status: 200, url: '', text: () => Promise.resolve(body) }, 'fetch', true)
    for (const [name, value] of scalars) await capture(`response-root:${name}`, value, 'fetch', true)
  } finally { globalThis.fetch = original }
  return records
}
