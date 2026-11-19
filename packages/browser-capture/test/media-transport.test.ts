import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Sink from "effect/Sink";
import { MediaTransportLayer } from "../src/MediaTransport.layer.js";
import { MediaTransport } from "../src/MediaTransport.service.js";

const trace: Array<unknown> = [];
const controllers: AbortController[] = [];
const controller = () => new AbortController();
let header: string | undefined = "3";
let status = 200;
let stalled = false;
const client = HttpClient.make((request, _url, signal) => {
  signal.addEventListener(
    "abort",
    () => {
      trace.push("released");
    },
    { once: true }
  );
  trace.push(["request", request.method, request.headers.referer]);
  if (stalled) return Effect.never;
  const headers: Record<string, string> = { "content-type": "video/mp4" };
  if (header !== undefined) headers["content-length"] = header;
  return Effect.succeed(
    HttpClientResponse.fromWeb(request, new Response(new Uint8Array([1, 2, 3]), { status, headers }))
  );
});
const fs = FileSystem.makeNoop({
  sink: () =>
    Sink.forEach((bytes: Uint8Array) =>
      Effect.sync(() => {
        trace.push(["write", ...bytes]);
      })
    ),
});
const dependencies = Layer.mergeAll(
  Layer.succeed(HttpClient.HttpClient, client),
  Layer.succeed(FileSystem.FileSystem, fs)
);
const layer = MediaTransportLayer.pipe(Layer.provide(dependencies));
describe("native media transport", () => {
  it.layer(layer)((it) => {
    it.effect("delivers progress before writing and preserves non-finite derived totals", () =>
      Effect.gen(function* () {
        trace.length = 0;
        header = "1e999";
        status = 200;
        stalled = false;
        const transport = yield* MediaTransport;
        const abort = controller();
        controllers.push(abort);
        const response = yield* transport.open(
          "https://synthetic.invalid/media",
          "https://onlyfans.com/",
          abort.signal
        );
        const result = yield* response.copy("/synthetic/out.part", abort.signal, {
          emit: (bytes, total) =>
            Effect.sync(() => {
              trace.push(["progress", bytes, total]);
            }),
        });
        expect(result).toEqual({ bytes: 3, total: Number.POSITIVE_INFINITY });
        expect(trace).toEqual([
          ["request", "GET", "https://onlyfans.com/"],
          ["progress", 3, Number.POSITIVE_INFINITY],
          ["write", 1, 2, 3],
          "released",
        ]);
        yield* response.release;
        expect(trace).toHaveLength(4);
      })
    );
    it.effect("releases an admitted response when its owner rejects status or MIME before copy", () =>
      Effect.gen(function* () {
        trace.length = 0;
        header = undefined;
        status = 403;
        stalled = false;
        const transport = yield* MediaTransport;
        const abort = controller();
        const response = yield* transport.open(
          "https://synthetic.invalid/media",
          "https://onlyfans.com/",
          abort.signal
        );
        expect(response.ok).toBe(false);
        expect(trace).not.toContain("released");
        yield* response.release;
        expect(trace).toEqual([["request", "GET", "https://onlyfans.com/"], "released"]);
      })
    );
    it.effect("closes the request scope if acquisition is interrupted", () =>
      Effect.gen(function* () {
        trace.length = 0;
        stalled = true;
        const transport = yield* MediaTransport;
        const abort = controller();
        const running = yield* Effect.forkScoped(
          transport.open("https://synthetic.invalid/media", "https://onlyfans.com/", abort.signal),
          { startImmediately: true }
        );
        yield* Fiber.interrupt(running);
        expect(trace).toEqual([["request", "GET", "https://onlyfans.com/"], "released"]);
        stalled = false;
      })
    );
    it.effect("releases body scope when a progress callback fails", () =>
      Effect.gen(function* () {
        trace.length = 0;
        header = "3";
        status = 200;
        stalled = false;
        const transport = yield* MediaTransport;
        const abort = controller();
        const response = yield* transport.open(
          "https://synthetic.invalid/media",
          "https://onlyfans.com/",
          abort.signal
        );
        const result = yield* Effect.exit(
          response.copy("/synthetic/out.part", abort.signal, { emit: () => Effect.die("callback sentinel") })
        );
        expect(result._tag).toBe("Failure");
        expect(trace).toEqual([["request", "GET", "https://onlyfans.com/"], "released"]);
      })
    );
  });
});
