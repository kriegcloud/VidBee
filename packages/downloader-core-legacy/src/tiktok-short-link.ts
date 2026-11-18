import * as Effect from 'effect/Effect'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientError from 'effect/http/HttpClientError'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import { runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import { expandTikTokShortLink as nativeExpand } from '../../downloader-core/src/tiktok-short-link.js'
import { argumentsRuntime, argumentError } from './arguments-runtime.js'
export { isTikTokShortLink } from '../../downloader-core/src/tiktok-short-link.js'
export type TikTokShortLinkFetch = (input: string, init: RequestInit) => Promise<Response>
export interface ExpandTikTokShortLinkOptions { fetch?: TikTokShortLinkFetch; timeoutMs?: number }
export const expandTikTokShortLink = (value: string, options: ExpandTikTokShortLinkOptions = {}): Promise<string> => {
  const client = HttpClient.make(request => Effect.tryPromise({
    try: () => (options.fetch ?? globalThis.fetch)(request.url, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': 'facebookexternalhit/1.1' }, signal: AbortSignal.timeout(options.timeoutMs ?? 10_000) }),
    catch: cause => new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request, cause }) })
  }).pipe(Effect.map(response => HttpClientResponse.fromWeb(request, response))))
  return runLegacyPromise(argumentsRuntime, nativeExpand(value, options.timeoutMs).pipe(Effect.provideService(HttpClient.HttpClient, client)), argumentError)
}
