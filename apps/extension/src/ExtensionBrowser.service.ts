import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ExtensionHostFailure } from "./Extension.errors.js";
import type { CacheMap, CacheRootObservation } from "./Extension.model.js";
export interface IconOptions {
  readonly path: Readonly<Record<number, string>>;
  readonly tabId?: number | undefined;
}
export type StorageChanges = Readonly<Record<string, { readonly newValue?: unknown }>>;
export class ExtensionBrowser extends Context.Service<
  ExtensionBrowser,
  {
    readonly origin: Effect.Effect<string, ExtensionHostFailure>;
    readonly queryActiveTabs: Effect.Effect<readonly { readonly url?: string | undefined }[], ExtensionHostFailure>;
    readonly sendMessage: (command: {
      readonly type: "video-info:fetch";
      readonly url: string;
    }) => Effect.Effect<void, ExtensionHostFailure>;
    readonly readCacheRoot: Effect.Effect<CacheRootObservation, ExtensionHostFailure>;
    readonly writeCacheMap: (map: CacheMap) => Effect.Effect<void, ExtensionHostFailure>;
    readonly setIcon: (options: IconOptions) => Effect.Effect<void, ExtensionHostFailure>;
    readonly listenStorage: (
      listener: (changes: StorageChanges, area: string) => void
    ) => Effect.Effect<() => void, ExtensionHostFailure>;
    readonly listenMessages: (
      listener: (message: unknown, sender: { readonly tabId?: number | undefined }) => undefined
    ) => Effect.Effect<() => void, ExtensionHostFailure>;
  }
>()("vidbee-extension/ExtensionBrowser.service/ExtensionBrowser") {}
