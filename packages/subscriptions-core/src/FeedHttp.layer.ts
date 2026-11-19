import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as Layer from "effect/Layer";
import { FeedHttp } from "./FeedHttp.service.js";
import { FeedCancelled, HostFailure } from "./Subscriptions.errors.js";
import type { FeedCancellationToken } from "./FeedCancellation.service.js";

export const RSS_FETCH_HEADERS = {
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};
const hostFailure = (original: unknown) =>
  HostFailure.make({ original, legacyMessage: original instanceof Error ? original.message : String(original) });
const withCancellation = Effect.fnUntraced(function* <A, E>(work: Effect.Effect<A, E>, token: FeedCancellationToken) {
  yield* token.check;
  const notice = yield* Deferred.make<never, FeedCancelled>();
  return yield* Effect.acquireUseRelease(
    token.subscribe({ emit: (reason) => Effect.asVoid(Deferred.fail(notice, FeedCancelled.make({ reason }))) }),
    () => Effect.raceFirst(work, Deferred.await(notice)),
    (unsubscribe) => Effect.asVoid(unsubscribe)
  );
});
/** Native transport deliberately retains Effect HTTP errors as the original host failure. */
const make = Effect.fnUntraced(function* () {
  const client = yield* HttpClient.HttpClient;
  return {
    open: Effect.fnUntraced(function* (url: string, cancellation: FeedCancellationToken) {
      const response = yield* withCancellation(
        client
          .get(url, { headers: RSS_FETCH_HEADERS })
          .pipe(
            Effect.provideService(FetchHttpClient.RequestInit, { redirect: "follow" }),
            Effect.provideService(HttpClient.TracerPropagationEnabled, false),
            Effect.mapError(hostFailure)
          ),
        cancellation
      );
      return {
        url: response.url || url,
        status: response.status,
        text: withCancellation(response.text.pipe(Effect.mapError(hostFailure)), cancellation),
      };
    }),
  };
});
export const FeedHttpLayer = Layer.effect(FeedHttp, make());
export const FeedHttpLive = FeedHttpLayer.pipe(Layer.provide(FetchHttpClient.layer));
