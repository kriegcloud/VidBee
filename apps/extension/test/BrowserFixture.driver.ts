import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeBrowserDriver } from "../src/ExtensionBrowser.driver.js";
import { ExtensionBrowser } from "../src/ExtensionBrowser.service.js";
import type { BrowserHost, MessageListener, StorageListener } from "../src/ExtensionBrowser.driver.js";
export interface BrowserState {
  block: boolean;
  blockedOperation: string;
  readonly calls: unknown[];
  fail: string;
  readonly messages: MessageListener[];
  pending: ReturnType<typeof Promise.withResolvers<Readonly<Record<string, unknown>>>>;
  readonly storage: StorageListener[];
  storageResult: Readonly<Record<string, unknown>>;
  tabs: readonly unknown[];
}
export class BrowserFixture extends Context.Service<BrowserFixture, BrowserState>()(
  "vidbee-extension/test/BrowserFixture.driver/BrowserFixture"
) {}
const fixture = Layer.sync(
  BrowserFixture,
  (): BrowserState => ({
    fail: "",
    tabs: [{ url: "https://fixture.invalid" }],
    storageResult: { videoInfoCacheByUrl: { opaque: null } },
    block: false,
    blockedOperation: "",
    pending: Promise.withResolvers(),
    calls: [],
    messages: [],
    storage: [],
  })
);
export const browserFixture = Layer.effect(
  ExtensionBrowser,
  Effect.gen(function* () {
    const state = yield* BrowserFixture;
    const check = (operation: string) => {
      if (state.fail === operation) throw Error("fixture host failure");
    };
    const promise = <A>(operation: string, value: A): Promise<A> =>
      state.blockedOperation === operation
        ? state.pending.promise.then(() => value)
        : state.fail === operation
          ? Promise.reject(Error("fixture host failure"))
          : Promise.resolve(value);
    const browser: BrowserHost = {
      runtime: {
        getURL: () => {
          check("origin");
          return "chrome-extension://fixture/";
        },
        sendMessage: (command) => {
          state.calls.push(command);
          return promise("sendMessage", undefined);
        },
        onMessage: {
          addListener: (listener) => {
            check("listenMessages");
            state.messages.push(listener);
          },
          removeListener: (listener) => {
            const index = state.messages.indexOf(listener);
            if (index >= 0) state.messages.splice(index, 1);
          },
        },
      },
      tabs: {
        query: (options) => {
          state.calls.push(options);
          return promise("queryActiveTabs", state.tabs);
        },
      },
      action: {
        setIcon: (options) => {
          state.calls.push(options);
          return promise("setIcon", undefined);
        },
      },
      storage: {
        local: {
          get: (key) => {
            state.calls.push(key);
            return state.block ? state.pending.promise : promise("readCacheRoot", state.storageResult);
          },
          set: (value) => {
            state.calls.push(value);
            return promise("writeCacheMap", undefined);
          },
        },
        onChanged: {
          addListener: (listener) => {
            check("listenStorage");
            state.storage.push(listener);
          },
          removeListener: (listener) => {
            const index = state.storage.indexOf(listener);
            if (index >= 0) state.storage.splice(index, 1);
          },
        },
      },
    };
    return makeBrowserDriver(browser);
  })
).pipe(Layer.provideMerge(fixture));
