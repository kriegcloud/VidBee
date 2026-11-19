import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { FeedCancellation } from "./FeedCancellation.service.js";
import { FeedHttp } from "./FeedHttp.service.js";
import { discoverFeedUrls } from "./feed-parser.js";
import { RssParser } from "./RssParser.service.js";
import { SubscriptionFeed } from "./SubscriptionFeed.service.js";
import { withLegacyFinally } from "./SubscriptionFinally.js";
import {
  FeedCancelled,
  FeedHttpStatus,
  FeedRequestTimeout,
  FeedTraversalFailure,
  HostFailure,
} from "./Subscriptions.errors.js";
import { SubscriptionTimers } from "./SubscriptionTimers.service.js";
import type { InterpretableFeed } from "./Feed.model.js";
import type { FeedCancellationToken } from "./FeedCancellation.service.js";
import type { Operation, SubscriptionFailure } from "./SubscriptionTimers.service.js";

export const RSS_FETCH_TIMEOUT_MS = 180_000;
const RawRoot = S.Struct({
  items: S.Unknown.pipe(S.optional),
  title: S.Unknown.pipe(S.optional),
  link: S.Unknown.pipe(S.optional),
  image: S.Unknown.pipe(S.optional),
  itunes: S.Unknown.pipe(S.optional),
});
const traversalFailure = (original: unknown) =>
  FeedTraversalFailure.make({
    original,
    legacyMessage: original instanceof Error ? original.message : String(original),
  });
const interpret = Effect.fnUntraced(
  function* (raw: unknown) {
    const projected = yield* Effect.try({
      try: () => {
        if (raw === null || raw === undefined)
          throw new TypeError(`Cannot read properties of ${String(raw)} (reading 'items')`);
        const field = (key: string): unknown => (P.hasProperty(raw, key) ? raw[key] : undefined);
        return {
          items: field("items"),
          title: field("title"),
          link: field("link"),
          image: field("image"),
          itunes: field("itunes"),
        };
      },
      catch: traversalFailure,
    });
    const root = yield* S.decodeEffect(RawRoot)(projected);
    const feed: InterpretableFeed = { items: Arr.isArray(root.items) ? root.items : [] };
    if (typeof root.title === "string") feed.title = root.title;
    if (typeof root.link === "string") feed.link = root.link;
    if (root.image !== null && typeof root.image === "object") {
      const url = P.hasProperty(root.image, "url") ? root.image.url : undefined;
      feed.image = { url: typeof url === "string" ? url : undefined };
    }
    if (root.itunes !== null && typeof root.itunes === "object") {
      const image = P.hasProperty(root.itunes, "image") ? root.itunes.image : undefined;
      feed.itunes = { image: typeof image === "string" ? image : undefined };
    }
    return feed;
  },
  Effect.mapError((error) => (S.is(FeedTraversalFailure)(error) ? error : traversalFailure(error)))
);
const inactive: FeedCancellationToken = {
  snapshot: Effect.succeed({ aborted: false, reason: undefined }),
  check: Effect.void,
  subscribe: () => Effect.succeed(Effect.succeed(false)),
};

const make = Effect.fnUntraced(function* () {
  const http = yield* FeedHttp;
  const parser = yield* RssParser;
  const cancellations = yield* FeedCancellation;
  const timers = yield* SubscriptionTimers;
  const timingOption = yield* Effect.serviceOption(LegacyTiming);
  const timing = O.getOrUndefined(timingOption) ?? { turn: (_point: string) => Effect.void };
  const body = Effect.fnUntraced(function* (url: string, caller: FeedCancellationToken) {
    yield* caller.check;
    const recover = Effect.fnUntraced(function* (failure: SubscriptionFailure) {
      yield* caller.check;
      const original = S.is(FeedCancelled)(failure)
        ? failure.reason
        : S.is(HostFailure)(failure)
          ? failure.original
          : failure;
      if (original instanceof Error && original.name === "AbortError")
        return yield* FeedRequestTimeout.make({
          timeoutMs: RSS_FETCH_TIMEOUT_MS,
          legacyMessage: `Request timed out after ${RSS_FETCH_TIMEOUT_MS}ms`,
        });
      return yield* failure;
    });
    const request = Effect.fnUntraced(function* (token: FeedCancellationToken) {
      const response = yield* http.open(url, token);
      const accepted = response.ok ?? (response.status >= 200 && response.status <= 299);
      if (!accepted)
        return yield* FeedHttpStatus.make({ status: response.status, legacyMessage: `Status code ${response.status}` });
      const text = yield* response.text;
      return { body: text, url: response.url || url };
    });
    return yield* Effect.acquireUseRelease(
      cancellations.make,
      (owned) =>
        Effect.acquireUseRelease(
          caller.subscribe({ emit: owned.abort }),
          () =>
            Effect.acquireUseRelease(
              timers.after(RSS_FETCH_TIMEOUT_MS, {
                run: owned.abort(new DOMException("This operation was aborted", "AbortError")),
              }),
              // Capture request failure so a throwing timer cleanup keeps JavaScript finally precedence.
              () => request(owned.token).pipe(Effect.catch(recover), Effect.exit),
              (cancel) => cancel
            ).pipe(Effect.flatten),
          (unsubscribe) => Effect.asVoid(unsubscribe)
        ),
      (owned) => owned.dispose
    );
  });
  const xml = Effect.fnUntraced(function* (url: string, caller: FeedCancellationToken) {
    const recover = Effect.fnUntraced(function* (failure: SubscriptionFailure) {
      yield* caller.check;
      if (!/^http:\/\//i.test(url)) return yield* failure;
      return yield* body(Str.replace(/^http:\/\//i, "https://")(url), caller).pipe(
        withLegacyFinally(timing.turn("feed:xml:retry-body"))
      );
    });
    return yield* body(url, caller).pipe(withLegacyFinally(timing.turn("feed:xml:body")), Effect.catch(recover));
  });
  const fetch = Effect.fnUntraced(function* (url: string, cancellation: FeedCancellationToken = inactive) {
    const response = yield* xml(url, cancellation).pipe(withLegacyFinally(timing.turn("feed:fetch:xml")));
    const feed = yield* Effect.flatMap(parser.parse(response.body), interpret).pipe(
      withLegacyFinally(timing.turn("feed:fetch:parse"))
    );
    yield* cancellation.check;
    return feed;
  });
  const probe = Effect.fnUntraced(function* (
    url: string,
    cancellation: FeedCancellationToken = inactive,
    candidateFetch?: (url: string, fallback: Operation<InterpretableFeed>) => Operation<InterpretableFeed>
  ) {
    const response = yield* xml(url, cancellation).pipe(withLegacyFinally(timing.turn("feed:probe:xml")));
    const recover = Effect.fnUntraced(function* (initialFailure: SubscriptionFailure) {
      yield* cancellation.check;
      for (const candidate of discoverFeedUrls(response.body, response.url)) {
        if (candidate === response.url) continue;
        const result = yield* (
          candidateFetch === undefined
            ? fetch(candidate, cancellation)
            : candidateFetch(candidate, fetch(candidate, cancellation))
        ).pipe(withLegacyFinally(timing.turn("feed:probe:candidate")), Effect.result);
        if (result._tag === "Success") return { feed: result.success, feedUrl: candidate, discovered: true };
        yield* cancellation.check;
      }
      return yield* initialFailure;
    });
    return yield* Effect.flatMap(parser.parse(response.body), interpret).pipe(
      withLegacyFinally(timing.turn("feed:probe:parse")),
      Effect.flatMap((feed) => Effect.as(cancellation.check, { feed, feedUrl: response.url, discovered: false })),
      Effect.catch(recover)
    );
  });
  return { fetch, probe };
});
export const SubscriptionFeedLive = Layer.effect(SubscriptionFeed, make());
