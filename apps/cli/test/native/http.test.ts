import { expect, layer } from "@effect/vitest";
import * as A from "effect/Array";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { CliAutomationLive } from "../../src/CliAutomation.layer.js";
import { CliAutomation } from "../../src/CliAutomation.service.js";
import { requestText } from "../../src/CliHttp.js";
import { fetchRegistry } from "../../src/local-info/upgrade.js";

const responses: { readonly status: number; readonly body: string }[] = [];
const requests: {
  readonly url: string;
  readonly method: string;
  readonly authorization: string | undefined;
  readonly traceparent: string | undefined;
}[] = [];
let aborted = 0;
let suspended = false;
let broken = false;
let reached: Deferred.Deferred<void> | undefined;
const client = HttpClient.make((request, url, signal) =>
  Effect.sync(() => {
    requests.push({
      url: String(url),
      method: request.method,
      authorization: request.headers.authorization,
      traceparent: request.headers.traceparent,
    });
    if (reached !== undefined) Deferred.doneUnsafe(reached, Effect.void);
    const response = responses.shift() ?? { status: 200, body: "null" };
    const body = broken
      ? new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new Error("fixture body broken"));
          },
        })
      : suspended
        ? new ReadableStream<Uint8Array>({
            start(controller) {
              signal.addEventListener("abort", () => {
                aborted++;
                controller.error(new Error("fixture body aborted"));
              });
            },
          })
        : response.body;
    return HttpResponse.fromWeb(request, new Response(body, { status: response.status, statusText: "Fixture" }));
  })
);
const http = Layer.succeed(HttpClient.HttpClient, client);
layer(Layer.mergeAll(http, CliAutomationLive.pipe(Layer.provide(http))))((it) => {
  it.effect("session token state renews once on 401 and preserves unchecked IDs", () =>
    Effect.gen(function* () {
      suspended = false;
      responses.push(
        { status: 200, body: '{"token":"first","expiresAt":99999999,"extra":1}' },
        { status: 401, body: "" },
        { status: 200, body: '{"token":"second","expiresAt":99999999}' },
        { status: 200, body: '{"id":false}' },
        { status: 200, body: '{"task":{"id":false,"status":"queued"}}' }
      );
      const automation = yield* CliAutomation;
      const session = yield* automation.make({ baseUrl: "http://fixture.invalid//" });
      const start = requests.length;
      const created = yield* session.add!({ input: { kind: "yt-dlp-forward", url: "https://example.invalid/v" } });
      expect(created.id).toBe(false);
      expect(A.map(A.drop(requests, start), (request) => request.authorization)).toEqual([
        undefined,
        "Bearer first",
        undefined,
        "Bearer second",
        "Bearer second",
      ]);
      expect(A.every(A.drop(requests, start), (request) => request.traceparent === undefined)).toBe(true);
    })
  );
  it.effect("supplied tokens skip handshake and a 401 retains the missing-token error", () =>
    Effect.gen(function* () {
      const automation = yield* CliAutomation;
      responses.push({ status: 401, body: "denied" });
      const session = yield* automation.make({
        baseUrl: "http://fixture.invalid",
        token: "supplied",
        skipHandshake: true,
      });
      const result = yield* session.stats.pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure.message).toBe("skipHandshake set but no token provided");
    })
  );
  it.effect("handshake rejects nonfinite expiry without erasing additional valid fields", () =>
    Effect.gen(function* () {
      const automation = yield* CliAutomation;
      const session = yield* automation.make({ baseUrl: "http://fixture.invalid" });
      responses.push({ status: 200, body: '{"token":"token","expiresAt":1e999}' });
      const invalid = yield* session.handshake.pipe(Effect.result);
      expect(invalid._tag).toBe("Failure");
      responses.push({ status: 200, body: '{"token":"token","expiresAt":123000,"additional":false}' });
      const valid = yield* session.handshake;
      expect(valid.additional).toBe(false);
    })
  );
  for (const mode of ["broken", "open"] as const) {
    it.effect(`registry rejects non-OK ${mode} body before reading or waiting for the deadline`, () =>
      Effect.gen(function* () {
        broken = mode === "broken";
        suspended = mode === "open";
        responses.push({ status: 503, body: "" });
        reached = yield* Deferred.make<void>();
        const running = yield* fetchRegistry.pipe(Effect.result, Effect.forkScoped);
        yield* Deferred.await(reached);
        yield* TestClock.adjust(1);
        const polled = yield* Effect.sync(() => running.pollUnsafe());
        yield* Fiber.interrupt(running);
        reached = undefined;
        expect(polled).toBeDefined();
        const result = yield* Fiber.join(running);
        broken = false;
        suspended = false;
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") expect(result.failure.message).toBe("registry responded 503");
      })
    );
  }
  it.effect("automation still consumes a non-OK body before interpreting status, as the old rawFetch did", () =>
    Effect.gen(function* () {
      const automation = yield* CliAutomation;
      const session = yield* automation.make({
        baseUrl: "http://fixture.invalid",
        token: "supplied",
        skipHandshake: true,
      });
      broken = true;
      responses.push({ status: 503, body: "" });
      const result = yield* session.stats.pipe(Effect.result);
      broken = false;
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure")
        expect(result.failure.message).toBe("automation request failed: fixture body broken");
    })
  );
  it.effect("deadline aborts during body consumption and preserves the body cause", () =>
    Effect.gen(function* () {
      suspended = true;
      reached = yield* Deferred.make<void>();
      const start = aborted;
      const running = yield* requestText(client, "GET", "http://fixture.invalid/held", {}, undefined, 123).pipe(
        Effect.result,
        Effect.forkScoped
      );
      yield* Deferred.await(reached);
      yield* TestClock.adjust(123);
      const result = yield* Fiber.join(running);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure.message).toBe("fixture body aborted");
      expect(aborted).toBe(start + 1);
      suspended = false;
      reached = undefined;
    })
  );
  it.effect("interruption releases an open response and cancels its deadline", () =>
    Effect.gen(function* () {
      suspended = true;
      reached = yield* Deferred.make<void>();
      const start = aborted;
      const running = yield* requestText(client, "GET", "http://fixture.invalid/held", {}, undefined, 30000).pipe(
        Effect.forkScoped
      );
      yield* Deferred.await(reached);
      yield* Fiber.interrupt(running);
      expect(aborted).toBe(start + 1);
      suspended = false;
      reached = undefined;
    })
  );
});
