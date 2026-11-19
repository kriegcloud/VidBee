import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { ExtensionBrowser } from "../src/ExtensionBrowser.service.js";
import { ExtensionHttpLive } from "../src/ExtensionHttp.layer.js";
import { ExtensionHttp } from "../src/ExtensionHttp.service.js";
import { HttpFixture, httpFixtureTransport } from "./HttpFixture.driver.js";

const browser = Layer.succeed(ExtensionBrowser, {
  origin: Effect.succeed("chrome-extension://fixture"),
  queryActiveTabs: Effect.succeed([]),
  sendMessage: Effect.fn("fixture.sendMessage")(() => Effect.void),
  readCacheRoot: Effect.succeed({ present: false, value: undefined }),
  writeCacheMap: Effect.fn("fixture.writeCacheMap")(() => Effect.void),
  setIcon: Effect.fn("fixture.setIcon")(() => Effect.void),
  listenStorage: Effect.fn("fixture.listenStorage")(() => Effect.succeed(() => {})),
  listenMessages: Effect.fn("fixture.listenMessages")(() => Effect.succeed(() => {})),
});
const live = ExtensionHttpLive.pipe(Layer.provideMerge([browser, httpFixtureTransport]));
it.layer(live)("native HTTP", (it) => {
  it.effect("bodyless POST has only the protocol header, with tracer propagation disabled", () =>
    Effect.gen(function* () {
      const state = yield* HttpFixture;
      const http = yield* ExtensionHttp;
      state.requests.length = 0;
      state.mode = "ok";
      state.status = 200;
      const value = yield* http.requestJson("POST", "http://fixture.invalid/token", 800);
      expect(value).toEqual({ token: "token" });
      expect(state.requests[0]?.url).toBe("http://fixture.invalid/token");
      expect(state.requests[0]?.options.headers).toEqual({ "x-vidbee-extension": "chrome-extension://fixture" });
      expect(state.requests[0]?.options.body).toBeUndefined();
      expect(state.requests[0]?.options.method).toBe("POST");
    })
  );
  it.effect("JSON failure becomes null before status handling; HTTP and transport errors are typed", () =>
    Effect.gen(function* () {
      const state = yield* HttpFixture;
      const http = yield* ExtensionHttp;
      state.mode = "invalid-json";
      state.status = 200;
      const invalid = yield* http.requestJson("GET", "http://fixture.invalid/status", 800);
      expect(invalid).toBeNull();
      state.mode = "http-error";
      state.status = 503;
      const failed = yield* Effect.result(http.requestJson("GET", "http://fixture.invalid/status", 800));
      expect(failed).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "ExtensionRequestFailure", message: "first\n\nsecond", status: 503 },
      });
      state.mode = "transport";
      const transport = yield* Effect.result(http.requestJson("GET", "http://fixture.invalid/status", 800));
      expect(transport).toMatchObject({
        _tag: "Failure",
        failure: { message: "VidBeep app not responding on this port." },
      });
    })
  );
  it.effect("acquisition deadline aborts fetch; body deadline observes status and releases its signal", () =>
    Effect.gen(function* () {
      const state = yield* HttpFixture;
      const http = yield* ExtensionHttp;
      state.mode = "acquire-block";
      state.status = 200;
      const acquire = yield* Effect.forkChild(
        Effect.exit(http.requestJson("GET", "http://fixture.invalid/status", 800)),
        { startImmediately: true }
      );
      yield* TestClock.adjust(800);
      const acquisition = yield* Fiber.join(acquire);
      expect(Exit.isFailure(acquisition)).toBe(true);
      state.mode = "body-block";
      const body = yield* Effect.forkChild(http.requestJson("GET", "http://fixture.invalid/status", 800), {
        startImmediately: true,
      });
      yield* Effect.yieldNow;
      yield* TestClock.adjust(800);
      const value = yield* Fiber.join(body);
      expect(value).toBeNull();
      expect(state.cancellations).toBeGreaterThanOrEqual(2);
    })
  );
  it.effect("caller interruption during body consumption aborts and releases the complete operation", () =>
    Effect.gen(function* () {
      const state = yield* HttpFixture;
      const http = yield* ExtensionHttp;
      const reached = yield* Deferred.make<void>();
      state.bodyStarted = () => {
        Deferred.doneUnsafe(reached, Effect.void);
      };
      state.mode = "body-block";
      state.status = 200;
      const before = state.cancellations;
      const request = yield* Effect.forkChild(http.requestJson("GET", "http://fixture.invalid/info", 60000), {
        startImmediately: true,
      });
      yield* Deferred.await(reached);
      yield* Fiber.interrupt(request);
      expect(state.cancellations).toBe(before + 1);
      expect(state.signals[state.signals.length - 1]?.aborted).toBe(true);
      yield* TestClock.adjust(60000);
      expect(state.cancellations).toBe(before + 1);
      state.bodyStarted = undefined;
    })
  );
  it.effect("caller interruption releases an in-flight request", () =>
    Effect.gen(function* () {
      const state = yield* HttpFixture;
      const http = yield* ExtensionHttp;
      state.mode = "acquire-block";
      const before = state.cancellations;
      const request = yield* Effect.forkChild(http.requestJson("GET", "http://fixture.invalid/status", 60000), {
        startImmediately: true,
      });
      yield* Fiber.interrupt(request);
      expect(state.cancellations).toBe(before + 1);
    })
  );
});

it.layer(live)("HTTP body coercion failure", (it) => {
  it.effect("JSON error objects with unusable coercion methods remain typed request failures", () =>
    Effect.gen(function* () {
      const state = yield* HttpFixture;
      const http = yield* ExtensionHttp;
      state.mode = "http-error";
      state.status = 503;
      state.body = '{"error":{"toString":null}}';
      const result = yield* Effect.result(http.requestJson("GET", "http://fixture.invalid/info", 800));
      expect(result).toMatchObject({ _tag: "Failure", failure: { _tag: "ExtensionRequestFailure" } });
    })
  );
});
