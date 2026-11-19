import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ExtensionError } from "./Extension.errors.js";
import type { VideoInfoCacheEntry } from "./Extension.model.js";
export class ExtensionCache extends Context.Service<
  ExtensionCache,
  {
    readonly readSelected: (url: string, ttlMs: number) => Effect.Effect<VideoInfoCacheEntry | null, ExtensionError>;
    readonly save: (entry: VideoInfoCacheEntry) => Effect.Effect<void, ExtensionError>;
  }
>()("vidbee-extension/ExtensionCache.service/ExtensionCache") {}
