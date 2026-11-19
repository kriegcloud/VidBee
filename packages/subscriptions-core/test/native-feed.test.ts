import { assert, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Str from "effect/String";
import * as TestClock from "effect/testing/TestClock";
import { CheckCancellationLive } from "../src/CheckCancellation.layer.js";
import { CheckCancellation } from "../src/CheckCancellation.service.js";
import { FeedCancellationLive } from "../src/FeedCancellation.layer.js";
import { FeedCancellation } from "../src/FeedCancellation.service.js";
import { FeedHttpLayer } from "../src/FeedHttp.layer.js";
import { FeedHttp } from "../src/FeedHttp.service.js";
import { RssParserLive } from "../src/RssParser.driver.js";
import { RssParser } from "../src/RssParser.service.js";
import { SubscriptionDatesLive } from "../src/SubscriptionDates.driver.js";
import { SubscriptionDates } from "../src/SubscriptionDates.service.js";
import { layer as NativeDispatch } from "../src/SubscriptionDispatch.layer.js";
import { SubscriptionFeedLive } from "../src/SubscriptionFeed.layer.js";
import { SubscriptionFeed } from "../src/SubscriptionFeed.service.js";
import { FeedParseFailure, HostFailure } from "../src/Subscriptions.errors.js";
import { layer as NativeTimers } from "../src/SubscriptionTimers.layer.js";
import { SubscriptionTimers } from "../src/SubscriptionTimers.service.js";
import type { OwnedFeedCancellation } from "../src/FeedCancellation.service.js";
import type { Operation, ScheduledCommand } from "../src/SubscriptionTimers.service.js";

it.layer(FeedCancellationLive)((test) => {
  test.effect(
    "retains first falsy abort reasons and removes only owned subscriptions",
    Effect.fnUntraced(function* () {
      const cancellation = yield* FeedCancellation;
      for (const reason of [undefined, null, false, 0, ""]) {
        const owned = yield* cancellation.make;
        const events: unknown[] = [];
        const unsubscribe = yield* owned.token.subscribe({
          emit: (value) =>
            Effect.sync(() => {
              events.push(value);
            }),
        });
        yield* owned.abort(reason);
        yield* owned.abort("later");
        const checked = yield* owned.token.check.pipe(Effect.result);
        assert.strictEqual(checked._tag, "Failure");
        if (checked._tag === "Failure") assert.strictEqual(checked.failure._tag, "FeedCancelled");
        if (checked._tag === "Failure" && checked.failure._tag === "FeedCancelled")
          assert.strictEqual(checked.failure.reason, reason);
        assert.deepStrictEqual(events, [reason]);
        const removed = yield* unsubscribe;
        assert.strictEqual(removed, true);
        const removedAgain = yield* unsubscribe;
        assert.strictEqual(removedAgain, false);
        yield* owned.dispose;
        const snapshot = yield* owned.token.snapshot;
        assert.deepStrictEqual(snapshot, { aborted: true, reason });
      }
    })
  );
  test.effect(
    "supports synchronous ordered observers and unsubscription during delivery",
    Effect.fnUntraced(function* () {
      const cancellation = yield* FeedCancellation;
      const owned = yield* cancellation.make;
      const events: string[] = [];
      let removeSecond = Effect.succeed(false);
      yield* Effect.asVoid(
        owned.token.subscribe({
          emit: Effect.fnUntraced(function* () {
            events.push("first");
            yield* Effect.asVoid(removeSecond);
          }),
        })
      );
      removeSecond = yield* owned.token.subscribe({
        emit: () =>
          Effect.sync(() => {
            events.push("second");
          }),
      });
      yield* owned.abort("stop");
      assert.deepStrictEqual(events, ["first"]);
      yield* Effect.asVoid(
        owned.token.subscribe({
          emit: (reason) =>
            Effect.sync(() => {
              events.push(String(reason));
            }),
        })
      );
      assert.deepStrictEqual(events, ["first", "stop"]);
    })
  );
});
it.layer(CheckCancellationLive.pipe(Layer.provide(FeedCancellationLive)))((test) => {
  test.effect(
    "owns a profile cancellation with the no-argument abort reason",
    Effect.fnUntraced(function* () {
      const checks = yield* CheckCancellation;
      const token = yield* checks.make;
      const before = yield* token.aborted;
      assert.strictEqual(before, false);
      yield* token.cancel;
      const first = yield* token.cancellation.snapshot;
      yield* token.cancel;
      const second = yield* token.cancellation.snapshot;
      assert.strictEqual(first.reason, second.reason);
      assert.instanceOf(first.reason, DOMException);
      assert.strictEqual(first.reason.name, "AbortError");
      const after = yield* token.aborted;
      assert.strictEqual(after, true);
    })
  );
});

interface HarnessState {
  cancelFailure: HostFailure | undefined;
  duringParse: Effect.Effect<void, FeedParseFailure>;
  duringText: Operation<void>;
  readonly events: string[];
  raw: unknown;
  readonly requests: string[];
  readonly timers: ScheduledCommand[];
}
class Harness extends Context.Service<Harness, HarnessState>()(
  "@vidbee/subscriptions-core/test/native-feed.test/Harness"
) {}
const harness = Layer.sync(Harness, () => ({
  requests: [],
  events: [],
  timers: [],
  duringParse: Effect.void,
  duringText: Effect.void,
  raw: { title: "Feed", items: [] },
  cancelFailure: undefined,
}));
const makeHttp = Effect.fnUntraced(function* () {
  const state = yield* Harness;
  return FeedHttp.of({
    open: Effect.fnUntraced(function* (url, cancellation) {
      state.requests.push(url);
      yield* cancellation.check;
      if (url === "http://retry.test/feed")
        return yield* HostFailure.make({ original: "offline", legacyMessage: "offline" });
      return {
        url: url === "https://page.test/start" ? "https://page.test/landing/" : url,
        status: Str.endsWith("/status")(url) ? 503 : 200,
        text: Effect.andThen(
          state.duringText,
          Effect.andThen(
            cancellation.check,
            Effect.succeed(
              Str.endsWith("/start")(url)
                ? '<link rel="alternate" type="application/rss+xml" href="../bad"><link rel="alternate" type="application/atom+xml" href="../good">'
                : url
            )
          )
        ),
      };
    }),
  });
});
const makeParser = Effect.fnUntraced(function* () {
  const state = yield* Harness;
  return RssParser.of({
    parse: Effect.fnUntraced(function* (xml) {
      state.events.push("parse");
      yield* state.duringParse;
      if (Str.includes("<link")(xml) || Str.endsWith("/bad")(xml))
        return yield* FeedParseFailure.make({ original: xml, legacyMessage: "initial parse" });
      return state.raw;
    }),
  });
});
const makeTimers = Effect.fnUntraced(function* () {
  const state = yield* Harness;
  const after = Effect.fn("test.after")((ms: number, command: ScheduledCommand) =>
    Effect.sync(() => {
      assert.strictEqual(ms, 180_000);
      state.events.push("timer:start");
      state.timers.push(command);
      return Effect.suspend(() => {
        state.events.push("timer:cancel");
        return state.cancelFailure === undefined ? Effect.void : state.cancelFailure;
      });
    })
  );
  return SubscriptionTimers.of({ now: Effect.succeed(0), after, every: after });
});
const hosts = Layer.mergeAll(
  Layer.effect(FeedHttp, makeHttp()),
  Layer.effect(RssParser, makeParser()),
  Layer.effect(SubscriptionTimers, makeTimers())
).pipe(Layer.provideMerge(harness), Layer.merge(FeedCancellationLive));
const feeds = SubscriptionFeedLive.pipe(Layer.provideMerge(hosts));
it.layer(feeds)((test) => {
  test.effect(
    "clears attempt timeout before parsing, with permissive parser fields",
    Effect.fnUntraced(function* () {
      const state = yield* Harness;
      state.events.length = 0;
      state.raw = {
        title: 12,
        link: "https://feed.test",
        image: [],
        itunes: { image: false },
        items: [{ guid: { nested: true } }],
      };
      const feed = yield* SubscriptionFeed;
      const parsed = yield* feed.fetch("https://feed.test/feed");
      assert.deepStrictEqual(state.events, ["timer:start", "timer:cancel", "parse"]);
      assert.deepStrictEqual(parsed, {
        link: "https://feed.test",
        image: { url: undefined },
        itunes: { image: undefined },
        items: [{ guid: { nested: true } }],
      });
    })
  );
  test.effect(
    "retries only request failures over HTTPS and discovers serially against final page URL",
    Effect.fnUntraced(function* () {
      const state = yield* Harness;
      state.requests.length = 0;
      state.raw = { items: [] };
      const feed = yield* SubscriptionFeed;
      yield* feed.fetch("http://retry.test/feed");
      assert.deepStrictEqual(state.requests, ["http://retry.test/feed", "https://retry.test/feed"]);
      state.requests.length = 0;
      const probe = yield* feed.probe("https://page.test/start");
      assert.deepStrictEqual(state.requests, [
        "https://page.test/start",
        "https://page.test/bad",
        "https://page.test/good",
      ]);
      assert.deepStrictEqual(probe, { feed: { items: [] }, feedUrl: "https://page.test/good", discovered: true });
    })
  );
  test.effect(
    "caller reason wins after successful parse and owned cleanup leaves caller observers alive",
    Effect.fnUntraced(function* () {
      const state = yield* Harness;
      const cancellation = yield* FeedCancellation;
      const caller = yield* cancellation.make;
      const reason = { sentinel: "parse abort" };
      let observations = 0;
      yield* Effect.asVoid(
        caller.token.subscribe({
          emit: () =>
            Effect.sync(() => {
              observations++;
            }),
        })
      );
      state.duringParse = caller
        .abort(reason)
        .pipe(
          Effect.mapError((original) => FeedParseFailure.make({ original, legacyMessage: original.legacyMessage }))
        );
      const feed = yield* SubscriptionFeed;
      const result = yield* feed.fetch("http://feed.test/feed", caller.token).pipe(Effect.result);
      state.duringParse = Effect.void;
      assert.strictEqual(result._tag, "Failure");
      if (result._tag === "Failure") assert.strictEqual(result.failure._tag, "FeedCancelled");
      if (result._tag === "Failure" && result.failure._tag === "FeedCancelled")
        assert.strictEqual(result.failure.reason, reason);
      assert.strictEqual(observations, 1);
    })
  );
  test.effect(
    "timeout cancels body reading, cleans resources, and caller reason has priority",
    Effect.fnUntraced(function* () {
      const state = yield* Harness;
      const cancellation = yield* FeedCancellation;
      const feed = yield* SubscriptionFeed;
      const expire = Effect.fnUntraced(function* () {
        const timer = state.timers.at(-1);
        assert.isDefined(timer);
        if (timer !== undefined) yield* timer.run;
      });
      state.duringText = expire();
      state.events.length = 0;
      const timeout = yield* feed.fetch("https://feed.test/feed").pipe(Effect.result);
      assert.strictEqual(timeout._tag, "Failure");
      if (timeout._tag === "Failure") assert.strictEqual(timeout.failure._tag, "FeedRequestTimeout");
      assert.deepStrictEqual(state.events, ["timer:start", "timer:cancel"]);
      const caller = yield* cancellation.make;
      const reason = { sentinel: "caller wins timeout" };
      state.duringText = Effect.andThen(expire(), caller.abort(reason));
      const result = yield* feed.fetch("http://feed.test/feed", caller.token).pipe(Effect.result);
      state.duringText = Effect.void;
      assert.strictEqual(result._tag, "Failure");
      if (result._tag === "Failure") assert.strictEqual(result.failure._tag, "FeedCancelled");
      if (result._tag === "Failure" && result.failure._tag === "FeedCancelled")
        assert.strictEqual(result.failure.reason, reason);
    })
  );
  test.effect(
    "timeout cleanup failure replaces a request failure",
    Effect.fnUntraced(function* () {
      const state = yield* Harness;
      const feed = yield* SubscriptionFeed;
      const original = { sentinel: "clear timer" };
      state.cancelFailure = HostFailure.make({ original, legacyMessage: "clear timer" });
      const result = yield* feed.fetch("https://feed.test/status").pipe(Effect.result);
      state.cancelFailure = undefined;
      assert.strictEqual(result._tag, "Failure");
      if (result._tag === "Failure") assert.strictEqual(result.failure._tag, "HostFailure");
      if (result._tag === "Failure" && result.failure._tag === "HostFailure")
        assert.strictEqual(result.failure.original, original);
    })
  );
  test.effect(
    "pre-abort prevents timer/request creation and preserves undefined reason",
    Effect.fnUntraced(function* () {
      const state = yield* Harness;
      state.requests.length = 0;
      state.events.length = 0;
      const cancellation = yield* FeedCancellation;
      const caller = yield* cancellation.make;
      yield* caller.abort(undefined);
      const feed = yield* SubscriptionFeed;
      const result = yield* feed.fetch("http://feed.test/feed", caller.token).pipe(Effect.result);
      assert.strictEqual(result._tag, "Failure");
      assert.deepStrictEqual(state.requests, []);
      assert.deepStrictEqual(state.events, []);
    })
  );
});

it.layer(Layer.mergeAll(RssParserLive, SubscriptionDatesLive))((test) => {
  test.effect(
    "parses real XML custom fields and coerces raw dates",
    Effect.fnUntraced(function* () {
      const parser = yield* RssParser;
      const raw = yield* parser.parse(
        '<rss version="2.0" xmlns:yt="http://www.youtube.com/xml/schemas/2015"><channel><title>Feed</title><item><title>One</title><yt:videoId>video-one</yt:videoId></item></channel></rss>'
      );
      assert.propertyVal(raw, "title", "Feed");
      const dates = yield* SubscriptionDates;
      const iso = yield* dates.parse("2020-01-02T03:04:05Z");
      assert.strictEqual(iso, 1_577_934_245_000);
      const bool = yield* dates.parse(false);
      assert.strictEqual(bool, null);
      const coerced = yield* dates.parse({ toString: () => "2020-01-02T03:04:05Z" });
      assert.strictEqual(coerced, 1_577_934_245_000);
      assert.strictEqual((yield* dates.parse(Symbol("date")).pipe(Effect.result))._tag, "Failure");
    })
  );
});

let transportReleased = false;
let lastRequestHeaders: Readonly<Record<string, string>> = {};
const nativeClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) => {
    lastRequestHeaders = request.headers;
    const response = HttpClientResponse.fromWeb(request, new Response("unused", { status: 200 }));
    Object.defineProperty(response, "text", {
      value: Effect.never.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            transportReleased = true;
          })
        )
      ),
    });
    return Effect.succeed(response);
  })
);
const nativeHttp = FeedHttpLayer.pipe(Layer.provide(nativeClient), Layer.merge(FeedCancellationLive));
it.layer(nativeHttp)((test) => {
  test.effect(
    "native body cancellation interrupts owned transport and drops its observer",
    Effect.fnUntraced(function* () {
      transportReleased = false;
      const cancellation = yield* FeedCancellation;
      const owned: OwnedFeedCancellation = yield* cancellation.make;
      const http = yield* FeedHttp;
      let observerCount = 0;
      const token = {
        snapshot: owned.token.snapshot,
        check: owned.token.check,
        subscribe: (sink: import("../src/FeedCancellation.service.js").AbortNoticeSink) =>
          Effect.map(owned.token.subscribe(sink), (unsubscribe) => {
            observerCount++;
            return Effect.map(unsubscribe, (removed) => {
              observerCount--;
              return removed;
            });
          }),
      };
      const response = yield* http.open("https://feed.test/feed", token);
      assert.strictEqual(observerCount, 0);
      assert.strictEqual(lastRequestHeaders.accept, "*/*");
      assert.strictEqual(lastRequestHeaders.traceparent, undefined);
      const reading = yield* response.text.pipe(Effect.forkChild({ startImmediately: true }));
      assert.strictEqual(observerCount, 1);
      const reason = { sentinel: "body abort" };
      yield* owned.abort(reason);
      const result = yield* Fiber.join(reading).pipe(Effect.result);
      assert.strictEqual(result._tag, "Failure");
      if (result._tag === "Failure") assert.strictEqual(result.failure._tag, "FeedCancelled");
      if (result._tag === "Failure" && result.failure._tag === "FeedCancelled")
        assert.strictEqual(result.failure.reason, reason);
      assert.strictEqual(transportReleased, true);
      assert.strictEqual(observerCount, 0);
    })
  );
});

const deadlineFeeds = SubscriptionFeedLive.pipe(
  Layer.provideMerge(Layer.mergeAll(nativeHttp, RssParserLive, NativeTimers.pipe(Layer.provide(NativeDispatch))))
);
it.layer(deadlineFeeds)((test) => {
  test.effect(
    "native deadline interrupts body at the TestClock boundary",
    Effect.fnUntraced(function* () {
      transportReleased = false;
      const feed = yield* SubscriptionFeed;
      const pending = yield* feed
        .fetch("https://feed.test/feed")
        .pipe(Effect.result, Effect.forkChild({ startImmediately: true }));
      yield* TestClock.adjust(179_999);
      assert.strictEqual(transportReleased, false);
      yield* TestClock.adjust(1);
      const result = yield* Fiber.join(pending);
      assert.strictEqual(result._tag, "Failure");
      if (result._tag === "Failure") assert.strictEqual(result.failure._tag, "FeedRequestTimeout");
      assert.strictEqual(transportReleased, true);
    })
  );
});
