import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import { logFailure } from "./Extension.diagnostics.js";
import { ExtensionRequestFailure } from "./Extension.errors.js";
import { decodeVideoInfoResponse, isRecord } from "./Extension.model.js";
import { ExtensionBackground } from "./ExtensionBackground.service.js";
import { ExtensionBrowser } from "./ExtensionBrowser.service.js";
import { ExtensionCache } from "./ExtensionCache.service.js";
import { ExtensionHttp } from "./ExtensionHttp.service.js";
import type { ExtensionError } from "./Extension.errors.js";
export const ExtensionBackgroundLive = Layer.effect(
  ExtensionBackground,
  Effect.gen(function* () {
    const browser = yield* ExtensionBrowser;
    const cache = yield* ExtensionCache;
    const http = yield* ExtensionHttp;
    const scope = yield* Effect.scope;
    const pending = MutableHashMap.empty<string, Deferred.Deferred<void, ExtensionError>>();
    const icon = Effect.fn("ExtensionBackground.icon")(function* (
      status: "default" | "loading" | "success",
      tabId?: number
    ) {
      const prefix = status === "default" ? "" : `icon-${status}-`;
      const path = {
        16: `icon/${prefix}16.png`,
        32: `icon/${prefix}32.png`,
        48: `icon/${prefix}48.png`,
        128: `icon/${prefix}128.png`,
      };
      yield* browser
        .setIcon(P.isTruthy(tabId) ? { path, tabId } : { path })
        .pipe(Effect.catchCause(logFailure), Effect.forkIn(scope, { startImmediately: true }));
    });
    const request = Effect.fn("ExtensionBackground.request")(function* (url: string) {
      let port: number | undefined;
      for (let candidate = 27100; candidate <= 27120; candidate += 1) {
        const found = yield* http.requestJson("GET", `http://127.0.0.1:${candidate}/status`, 800).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false)
        );
        if (found) {
          port = candidate;
          break;
        }
      }
      if (port === undefined)
        return yield* ExtensionRequestFailure.make({ message: "VidBeep app not found on localhost." });
      const base = `http://127.0.0.1:${port}`;
      const tokenBody = yield* http.requestJson("POST", `${base}/token`, 800);
      // Property observation is permissive; a null body fails at consumption.
      if (tokenBody === null || tokenBody === undefined)
        return yield* ExtensionRequestFailure.make({ message: "Failed to fetch video info." });
      const token = isRecord(tokenBody) ? tokenBody.token : undefined;
      if (!P.isTruthy(token))
        return yield* ExtensionRequestFailure.make({ message: "Failed to acquire token from VidBeep." });
      const target = yield* Effect.try({
        try: () => `${base}/video-info?url=${encodeURIComponent(url)}&token=${encodeURIComponent(String(token))}`,
        catch: (cause) =>
          ExtensionRequestFailure.make({
            message: cause instanceof Error ? cause.message : "Failed to fetch video info.",
          }),
      });
      const info = yield* http.requestJson("GET", target, 60_000);
      return yield* decodeVideoInfoResponse(info);
    });
    const work = Effect.fn("ExtensionBackground.work")(function* (url: string, tabId?: number) {
      const existing = yield* cache.readSelected(url, 300_000);
      if (existing?.status === "ready") {
        yield* icon("success", tabId);
        return;
      }
      yield* icon("loading", tabId);
      const pendingAt = yield* Clock.currentTimeMillis;
      yield* cache.save({ url, status: "pending", fetchedAt: pendingAt });
      yield* Effect.gen(function* () {
        const info = yield* request(url);
        const fetchedAt = yield* Clock.currentTimeMillis;
        yield* cache.save({ url, status: "ready", fetchedAt, info });
        yield* icon("success", tabId);
      }).pipe(
        Effect.catch((error) =>
          Effect.gen(function* () {
            const fetchedAt = yield* Clock.currentTimeMillis;
            const message = error._tag === "ExtensionBoundaryFailure" ? error.issue : error.message;
            yield* cache.save({ url, status: "error", fetchedAt, error: message });
            yield* icon("default", tabId);
          })
        )
      );
    });
    return ExtensionBackground.of({
      fetchAndCache: Effect.fn("ExtensionBackground.fetchAndCache")((url, tabId) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.suspend(() => {
            const existing = MutableHashMap.get(pending, url);
            if (O.isSome(existing)) return restore(Deferred.await(existing.value));
            const admitted = Deferred.makeUnsafe<void, ExtensionError>();
            MutableHashMap.set(pending, url, admitted);
            return restore(work(url, tabId)).pipe(
              Effect.onExit((exit) => Deferred.done(admitted, exit)),
              Effect.ensuring(
                Effect.sync(() => {
                  MutableHashMap.remove(pending, url);
                })
              )
            );
          })
        )
      ),
    });
  })
);
