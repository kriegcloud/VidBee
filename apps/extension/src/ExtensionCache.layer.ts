import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as S from "effect/Schema";
import { ExtensionBoundaryFailure } from "./Extension.errors.js";
import { CacheMap, pruneCache, VideoInfoCacheEntry } from "./Extension.model.js";
import { ExtensionBrowser } from "./ExtensionBrowser.service.js";
import { ExtensionCache } from "./ExtensionCache.service.js";
export const ExtensionCacheLive = Layer.effect(
  ExtensionCache,
  Effect.gen(function* () {
    const browser = yield* ExtensionBrowser;
    const read = Effect.fn("ExtensionCache.read")(function* () {
      const root = yield* browser.readCacheRoot;
      if (!root.present) return {};
      return yield* S.decodeUnknownEffect(CacheMap)(root.value).pipe(
        Effect.mapError(() => ExtensionBoundaryFailure.make({ boundary: "storage", issue: "Invalid cache root" }))
      );
    });
    return ExtensionCache.of({
      readSelected: Effect.fn("ExtensionCache.readSelected")(function* (url, ttlMs) {
        const raw = yield* read();
        const now = yield* Clock.currentTimeMillis;
        const map = ttlMs === 300_000 ? pruneCache(now)(raw) : raw;
        const entry = S.decodeUnknownOption(VideoInfoCacheEntry)(map[url]);
        return O.isSome(entry) && now - entry.value.fetchedAt <= ttlMs ? entry.value : null;
      }),
      save: Effect.fn("ExtensionCache.save")(function* (entry) {
        const raw = yield* read();
        const now = yield* Clock.currentTimeMillis;
        const map = pruneCache(now)(raw);
        map[entry.url] = entry;
        yield* browser.writeCacheMap(map);
      }),
    });
  })
);
