import { RegistryContext, useAtomValue } from "@effect/atom-react";
import * as BrowserRuntime from "@effect/platform-browser/BrowserRuntime";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as References from "effect/References";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { logFailure } from "../../src/Extension.diagnostics.js";
import { extensionBrowserLayer } from "../../src/ExtensionBrowser.layer.js";
import { ExtensionCacheLive } from "../../src/ExtensionCache.layer.js";
import { ExtensionHttpLive } from "../../src/ExtensionHttp.layer.js";
import { extensionNavigationLayer } from "../../src/ExtensionNavigation.driver.js";
import { memoMap, retryAtom } from "../../src/Popup.atoms.js";
import { PopupCallback, PopupControllerLive } from "../../src/PopupController.layer.js";
import { PopupController } from "../../src/PopupController.service.js";
import App, { PopupCommandsContext } from "./App.tsx";
import type * as Scope from "effect/Scope";

const root = document.getElementById("root");
if (root !== null) {
  const registry = AtomRegistry.make();
  const host = extensionBrowserLayer(browser);
  const services = Layer.mergeAll(
    host,
    ExtensionCacheLive.pipe(Layer.provide(host)),
    ExtensionHttpLive.pipe(Layer.provide([host, FetchHttpClient.layer])),
    extensionNavigationLayer((uri) => {
      window.location.href = uri;
    }),
    Layer.succeed(AtomRegistry.AtomRegistry, registry)
  );
  const callbacks = Layer.succeed(PopupCallback, {
    run: (effect) => {
      runtime.runFork(effect);
    },
  });
  const logging = Layer.mergeAll(
    Logger.layer([Logger.consoleStructured]),
    Layer.succeed(References.MinimumLogLevel, "All")
  );
  const app = PopupControllerLive.pipe(Layer.provide([services, callbacks, logging]));
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(app, Logger.layer([Logger.consoleStructured]), Layer.succeed(References.MinimumLogLevel, "All")),
    { memoMap }
  );
  const controller = runtime.runSync(PopupController);
  const dispatch =
    (scope: Scope.Scope) =>
    (effect: Effect.Effect<void, import("../../src/Extension.errors.js").ExtensionHostFailure>) => {
      runtime.runFork(effect.pipe(Effect.catchCause(logFailure), Effect.forkIn(scope, { startImmediately: true })));
    };
  function Session() {
    const retry = useAtomValue(retryAtom);
    useEffect(() => {
      const session = runtime.runSync(controller.beginSession(retry));
      return () => {
        runtime.runSync(session.release);
      };
    }, [retry]);
    return <App />;
  }
  const reactRoot = ReactDOM.createRoot(root);
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const command = dispatch(scope);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        reactRoot.unmount();
        registry.dispose();
      }).pipe(Effect.andThen(runtime.disposeEffect))
    );
    reactRoot.render(
      <React.StrictMode>
        <RegistryContext.Provider value={registry}>
          <PopupCommandsContext.Provider
            value={{
              download: () => command(controller.download),
              openClientAndRetry: () => command(controller.openClientAndRetry),
              retry: () => command(controller.retry),
            }}
          >
            <Session />
          </PopupCommandsContext.Provider>
        </RegistryContext.Provider>
      </React.StrictMode>
    );
    return yield* Effect.never;
  }).pipe(Effect.scoped, BrowserRuntime.runMain);
}
