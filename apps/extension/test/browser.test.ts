import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import { ExtensionBrowser } from "../src/ExtensionBrowser.service.js";
import { BrowserFixture, browserFixture } from "./BrowserFixture.driver.js";

it.layer(browserFixture)("browser driver", (it) => {
  it.effect("host projections and exact listener removal preserve synchronous message returns", () =>
    Effect.gen(function* () {
      const state = yield* BrowserFixture;
      const browser = yield* ExtensionBrowser;
      const origin = yield* browser.origin;
      expect(origin).toBe("chrome-extension://fixture");
      const tabs = yield* browser.queryActiveTabs;
      expect(tabs).toEqual([{ url: "https://fixture.invalid" }]);
      const root = yield* browser.readCacheRoot;
      expect(root).toEqual({ present: true, value: { opaque: null } });
      yield* browser.sendMessage({ type: "video-info:fetch", url: "https://fixture.invalid" });
      yield* browser.writeCacheMap({ opaque: null });
      yield* browser.setIcon({ path: { 16: "icon/16.png" }, tabId: 0 });
      const received: unknown[] = [];
      const removeMessage = yield* browser.listenMessages((message, sender) => {
        received.push([message, sender]);
        return undefined;
      });
      const callback = state.messages[0];
      expect(callback?.({ type: "fixture" }, { tab: { id: 7 } })).toBeUndefined();
      expect(received).toEqual([[{ type: "fixture" }, { tabId: 7 }]]);
      const removeStorage = yield* browser.listenStorage((changes, area) => {
        received.push([changes, area]);
      });
      state.storage[0]?.({ videoInfoCacheByUrl: { newValue: {} } }, "local");
      removeMessage();
      removeStorage();
      expect(state.messages).toEqual([]);
      expect(state.storage).toEqual([]);
    })
  );
  it.effect("storage projection distinguishes a missing key from a present undefined value", () =>
    Effect.gen(function* () {
      const state = yield* BrowserFixture;
      const browser = yield* ExtensionBrowser;
      state.storageResult = {};
      const absent = yield* browser.readCacheRoot;
      expect(absent).toEqual({ present: false, value: undefined });
      state.storageResult = { videoInfoCacheByUrl: undefined };
      const present = yield* browser.readCacheRoot;
      expect(present).toEqual({ present: true, value: undefined });
    })
  );
  it.effect.each([7, {}, true, null, undefined, "", "https://fixture.invalid"])(
    "tab and message URL decoding admits strings and treats %j as absent otherwise",
    (value) =>
      Effect.gen(function* () {
        const state = yield* BrowserFixture;
        const browser = yield* ExtensionBrowser;
        state.tabs = [{ url: value }];
        const expected = typeof value === "string" ? value : undefined;
        const tabs = yield* browser.queryActiveTabs;
        expect(tabs).toEqual([{ url: expected }]);
        const received: unknown[] = [];
        const remove = yield* browser.listenMessages((message) => {
          received.push(message);
          return undefined;
        });
        state.messages[0]?.({ type: "video-info:fetch", url: value }, {});
        expect(received).toEqual([{ type: "video-info:fetch", url: expected }]);
        remove();
      })
  );
  it.effect.each([
    "origin",
    "queryActiveTabs",
    "sendMessage",
    "readCacheRoot",
    "writeCacheMap",
    "setIcon",
    "listenStorage",
    "listenMessages",
  ])("%s failures are tagged and retain their operation", (operation) =>
    Effect.gen(function* () {
      const state = yield* BrowserFixture;
      const browser = yield* ExtensionBrowser;
      state.fail = operation;
      const methods: Record<
        string,
        Effect.Effect<unknown, import("../src/Extension.errors.js").ExtensionHostFailure>
      > = {
        origin: browser.origin,
        queryActiveTabs: browser.queryActiveTabs,
        sendMessage: browser.sendMessage({ type: "video-info:fetch", url: "https://fixture.invalid" }),
        readCacheRoot: browser.readCacheRoot,
        writeCacheMap: browser.writeCacheMap({}),
        setIcon: browser.setIcon({ path: {} }),
        listenStorage: browser.listenStorage(() => {}),
        listenMessages: browser.listenMessages(() => undefined),
      };
      const method = methods[operation];
      if (method === undefined) return yield* Effect.die("Missing fixture operation");
      const result = yield* Effect.exit(method);
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result))
        expect(result.cause).toMatchObject({
          reasons: [{ error: { _tag: "ExtensionHostFailure", operation, cause: "Browser API failure" } }],
        });
      state.fail = "";
    })
  );
  it.effect.each(["queryActiveTabs", "sendMessage", "readCacheRoot", "writeCacheMap", "setIcon"])(
    "interrupting %s releases Effect finalizers and suppresses its continuation",
    (operation) =>
      Effect.gen(function* () {
        const state = yield* BrowserFixture;
        const browser = yield* ExtensionBrowser;
        state.blockedOperation = operation;
        state.pending = Promise.withResolvers();
        const methods: Record<
          string,
          Effect.Effect<unknown, import("../src/Extension.errors.js").ExtensionHostFailure>
        > = {
          queryActiveTabs: browser.queryActiveTabs,
          sendMessage: browser.sendMessage({ type: "video-info:fetch", url: "https://fixture.invalid" }),
          readCacheRoot: browser.readCacheRoot,
          writeCacheMap: browser.writeCacheMap({}),
          setIcon: browser.setIcon({ path: {} }),
        };
        const method = methods[operation];
        if (method === undefined) return yield* Effect.die("Missing fixture operation");
        let released = 0;
        let continued = false;
        const work = yield* Effect.forkChild(
          method.pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                continued = true;
              })
            ),
            Effect.ensuring(
              Effect.sync(() => {
                released += 1;
              })
            )
          ),
          { startImmediately: true }
        );
        yield* Fiber.interrupt(work);
        state.pending.resolve({});
        yield* Effect.yieldNow;
        expect(released).toBe(1);
        expect(continued).toBe(false);
        state.blockedOperation = "";
      })
  );
});
