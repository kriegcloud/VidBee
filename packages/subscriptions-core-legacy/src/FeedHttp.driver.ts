import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { FeedHttp } from '@vidbee/subscriptions-core/FeedHttp.service'
import type { FeedCancellationToken } from '@vidbee/subscriptions-core/FeedCancellation.service'
import { RSS_FETCH_HEADERS } from '@vidbee/subscriptions-core/FeedHttp.layer'
import { promise, sync } from './Host.driver.js'

export const CallerFeedSignal = Context.Reference<AbortSignal | undefined>(
  '@vidbee/subscriptions-core-legacy/FeedHttp.driver/CallerFeedSignal',
  { defaultValue: () => undefined },
)
/** Separate fetch and text bridges retain the two original await boundaries. */
export const feedHttpHost = (signalFor: (token: FeedCancellationToken) => AbortSignal) => Layer.succeed(FeedHttp, {
  open: Effect.fnUntraced(function* (url: string, cancellation: FeedCancellationToken) {
    const caller = yield* CallerFeedSignal
    const timeoutSignal = signalFor(cancellation)
    const signal = caller ? AbortSignal.any([timeoutSignal, caller]) : timeoutSignal
    const response = yield* promise(() => { const fetchNow=globalThis.fetch; return fetchNow(url, {
      method: 'GET',
      redirect: 'follow',
      headers: RSS_FETCH_HEADERS,
      signal,
    }) })
    // The original response.ok check is retained, including supplied fake responses.
    yield* sync(() => {
      if (!response.ok) throw new Error(`Status code ${response.status}`)
    })
    return {
      url: response.url || url,
      status: response.status,
      ok: response.ok,
      text: promise(() => response.text()),
    }
  }),
})
