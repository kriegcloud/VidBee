import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { extensionBrowserLayer } from "../src/ExtensionBrowser.layer.js";
import { ExtensionHttpLive } from "../src/ExtensionHttp.layer.js";
import { ExtensionHttp } from "../src/ExtensionHttp.service.js";
import type { BrowserHost } from "../src/ExtensionBrowser.driver.js";
export const createRequests = ({
  browser,
  fetchImplementation,
}: {
  readonly browser: BrowserHost;
  readonly fetchImplementation: typeof globalThis.fetch;
}) => {
  const transport = FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchImplementation))
  );
  const runtime = ManagedRuntime.make(
    ExtensionHttpLive.pipe(Layer.provide([extensionBrowserLayer(browser), transport]))
  );
  return {
    request: (method: "GET" | "POST", url: string, deadline: number) =>
      runtime.runPromise(Effect.flatMap(ExtensionHttp, (http) => http.requestJson(method, url, deadline))),
    close: () => runtime.dispose(),
  };
};
