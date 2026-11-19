import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as P from "effect/Predicate";
import * as References from "effect/References";
import * as Scope from "effect/Scope";
import { logFailure } from "./Extension.logging.js";
import { isRecord } from "./Extension.model.js";
import { ExtensionBackgroundLive } from "./ExtensionBackground.layer.js";
import { ExtensionBackground } from "./ExtensionBackground.service.js";
import { extensionBrowserLayer } from "./ExtensionBrowser.layer.js";
import { ExtensionBrowser } from "./ExtensionBrowser.service.js";
import { ExtensionCacheLive } from "./ExtensionCache.layer.js";
import { ExtensionHttpLive } from "./ExtensionHttp.layer.js";
import type { browser as browserApi } from "wxt/browser";

class BackgroundOwner extends Context.Service<BackgroundOwner, { readonly scope: Scope.Scope }>()(
  "vidbee-extension/Background.entry/BackgroundOwner"
) {}
const ownerLayer = Layer.effect(
  BackgroundOwner,
  Effect.map(Effect.scope, (scope) => ({ scope }))
);
export const startBackground = ({
  browser,
  fetchImplementation,
  clock,
}: {
  readonly browser: typeof browserApi;
  readonly fetchImplementation?: typeof globalThis.fetch;
  readonly clock?: Clock.Clock;
}) => {
  const host = extensionBrowserLayer(browser);
  const cache = ExtensionCacheLive.pipe(Layer.provide(host));
  const transport =
    fetchImplementation === undefined
      ? FetchHttpClient.layer
      : FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchImplementation)));
  const http = ExtensionHttpLive.pipe(Layer.provide([host, transport]));
  const app = ExtensionBackgroundLive.pipe(Layer.provide([host, cache, http]));
  const logging = Layer.mergeAll(
    Logger.layer([Logger.consoleStructured]),
    Layer.succeed(References.MinimumLogLevel, "All")
  );
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(app, host, ownerLayer, logging, Layer.succeed(Clock.Clock, clock ?? Clock.Clock.defaultValue()))
  );
  // Warm the complete runtime before the browser can synchronously re-enter it.
  const background = runtime.runSync(ExtensionBackground);
  const browserService = runtime.runSync(ExtensionBrowser);
  const owner = runtime.runSync(BackgroundOwner);
  runtime.runSync(
    Effect.gen(function* () {
      const remove = yield* browserService.listenMessages((message, sender) => {
        if (message === null || message === undefined) throw TypeError("Invalid message");
        if (
          isRecord(message) &&
          message.type === "video-info:fetch" &&
          P.isString(message.url) &&
          P.isTruthy(message.url)
        ) {
          runtime.runFork(
            background
              .fetchAndCache(message.url, sender.tabId)
              .pipe(Effect.catchCause(logFailure), Effect.forkIn(owner.scope, { startImmediately: true }))
          );
        }
        return undefined;
      });
      yield* Scope.addFinalizer(owner.scope, Effect.sync(remove));
    }).pipe(Effect.uninterruptible)
  );
  return runtime;
};
