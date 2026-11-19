import { expect, it, vi } from "@effect/vitest";
import * as A from "effect/Array";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as R from "effect/Record";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import * as Scope from "effect/Scope";
import * as Str from "effect/String";
import * as TestClock from "effect/testing/TestClock";
import { ExtensionHostFailure, ExtensionRequestFailure } from "../src/Extension.errors.js";
import { decodeVideoInfoResponse, pruneCache } from "../src/Extension.model.js";
import { ExtensionBackgroundLive } from "../src/ExtensionBackground.layer.js";
import { ExtensionBackground } from "../src/ExtensionBackground.service.js";
import { ExtensionBrowser } from "../src/ExtensionBrowser.service.js";
import { ExtensionCacheLive } from "../src/ExtensionCache.layer.js";
import { ExtensionCache } from "../src/ExtensionCache.service.js";
import { ExtensionHttp } from "../src/ExtensionHttp.service.js";
import { extensionNavigationLayer } from "../src/ExtensionNavigation.driver.js";
import { currentUrlAtom, errorAtom, infoAtom, loadingAtom, retryAtom } from "../src/Popup.atoms.js";
import { PopupCallback, PopupControllerLive } from "../src/PopupController.layer.js";
import { PopupController } from "../src/PopupController.service.js";
import type { CacheMap } from "../src/Extension.model.js";
import type { StorageChanges } from "../src/ExtensionBrowser.service.js";

const url = "https://fixture.invalid/watch?a=1 2";
const hostFailure = ExtensionHostFailure.make({
  operation: "fixture",
  cause: "fixture failure",
  message: "fixture failure",
});
interface State {
  readonly calls: string[];
  icon: Effect.Effect<void, ExtensionHostFailure>;
  readonly listeners: Array<(changes: StorageChanges, area: string) => void>;
  readonly navigation: string[];
  readonly notifications: Effect.Effect<void>[];
  presentUndefined: boolean;
  query: Effect.Effect<readonly { readonly url: string }[], ExtensionHostFailure>;
  read: Effect.Effect<unknown, ExtensionHostFailure> | undefined;
  request: (method: "GET" | "POST", target: string) => Effect.Effect<unknown, ExtensionRequestFailure>;
  root: unknown;
  send: Effect.Effect<void, ExtensionHostFailure>;
  write: Effect.Effect<void, ExtensionHostFailure> | undefined;
  readonly writes: CacheMap[];
}
class Fixture extends Context.Service<Fixture, State>()("vidbee-extension/test/native.test/Fixture") {}
const fixture = Layer.sync(
  Fixture,
  (): State => ({
    root: undefined,
    presentUndefined: false,
    calls: [],
    writes: [],
    navigation: [],
    notifications: [],
    listeners: [],
    read: undefined,
    write: undefined,
    query: Effect.succeed([{ url }]),
    send: Effect.void,
    icon: Effect.void,
    request: (_method, target) =>
      Effect.succeed(
        Str.endsWith("/token")(target)
          ? { token: "token +/" }
          : Str.endsWith("/status")(target)
            ? false
            : { title: "Fixture", duration: 60, formats: [] }
      ),
  })
);
const host = Layer.effect(
  ExtensionBrowser,
  Effect.gen(function* () {
    const state = yield* Fixture;
    return ExtensionBrowser.of({
      origin: Effect.succeed("chrome-extension://fixture"),
      readCacheRoot: Effect.suspend(() => {
        state.calls.push("read");
        return (state.read ?? Effect.succeed(state.root)).pipe(
          Effect.map((value) => ({ present: state.presentUndefined || value !== undefined, value }))
        );
      }),
      writeCacheMap: Effect.fn("fixture.writeCacheMap")((map) =>
        Effect.suspend(() => {
          state.calls.push("write");
          state.writes.push(map);
          state.root = map;
          return state.write ?? Effect.void;
        })
      ),
      queryActiveTabs: Effect.suspend(() => {
        state.calls.push("query");
        return state.query;
      }),
      sendMessage: Effect.fn("fixture.sendMessage")(() =>
        Effect.suspend(() => {
          state.calls.push("send");
          return state.send;
        })
      ),
      setIcon: Effect.fn("fixture.setIcon")(() =>
        Effect.suspend(() => {
          state.calls.push("icon");
          return state.icon;
        })
      ),
      listenStorage: Effect.fn("fixture.listenStorage")((listener) =>
        Effect.sync(() => {
          state.calls.push("listen");
          state.listeners.push(listener);
          return () => {
            state.calls.push("remove");
            const index = state.listeners.indexOf(listener);
            if (index >= 0) state.listeners.splice(index, 1);
          };
        })
      ),
      listenMessages: Effect.fn("fixture.listenMessages")(() => Effect.succeed(() => {})),
    });
  })
).pipe(Layer.provideMerge(fixture));
const cache = ExtensionCacheLive.pipe(Layer.provideMerge(host));
const http = Layer.effect(
  ExtensionHttp,
  Effect.gen(function* () {
    const state = yield* Fixture;
    return ExtensionHttp.of({
      requestJson: Effect.fn("fixture.requestJson")((method, target) =>
        Effect.suspend(() => {
          state.calls.push(`${method} ${target}`);
          return state.request(method, target);
        })
      ),
    });
  })
).pipe(Layer.provide(fixture));
const background = ExtensionBackgroundLive.pipe(Layer.provideMerge([cache, http]));
const popup = PopupControllerLive.pipe(
  Layer.provideMerge([
    cache,
    AtomRegistry.layer,
    Layer.effect(
      PopupCallback,
      Effect.gen(function* () {
        const state = yield* Fixture;
        return {
          run: (effect: Effect.Effect<void>) => {
            state.notifications.push(effect);
          },
        };
      })
    ).pipe(Layer.provide(fixture)),
    Layer.unwrap(
      Effect.gen(function* () {
        const state = yield* Fixture;
        return extensionNavigationLayer((uri) => {
          state.navigation.push(uri);
        });
      })
    ).pipe(Layer.provide(fixture)),
  ])
);

it.effect("metadata projects fields independently and rejects every non-object root", () =>
  Effect.gen(function* () {
    for (const value of [null, false, true, 0, "x", [], undefined]) {
      const result = yield* Effect.exit(decodeVideoInfoResponse(value));
      expect(Exit.isFailure(result)).toBe(true);
    }
    const info = yield* decodeVideoInfoResponse({
      title: "neighbor",
      duration: true,
      extra: 1,
      formats: [null, 7, [], { format_id: "id", height: "720", filesize: -1, extra: 2 }, {}],
    });
    expect(info).toEqual({ title: "neighbor", formats: [{ format_id: "id", filesize: -1 }, {}] });
  })
);
it.effect("pruning retains opaque entries and only deletes finite expired timestamps", () =>
  Effect.sync(() => {
    const input = {
      null: null,
      string: { fetchedAt: "0" },
      bool: { fetchedAt: false },
      nonfinite: { fetchedAt: Number.NaN },
      edge: { fetchedAt: 1 },
      old: { fetchedAt: 0 },
    };
    expect(pruneCache(300001)(input)).toEqual({
      null: null,
      string: { fetchedAt: "0" },
      bool: { fetchedAt: false },
      nonfinite: { fetchedAt: Number.NaN },
      edge: { fetchedAt: 1 },
    });
    expect(input.old).toEqual({ fetchedAt: 0 });
  })
);

it.layer(cache)("cache", (it) => {
  it.effect("absent storage is a miss; selected entries decode without rewriting unrelated values", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const service = yield* ExtensionCache;
      const observed0 = yield* service.readSelected(url, 300000);
      expect(observed0).toBeNull();
      state.root = {
        [url]: { url, status: "ready", fetchedAt: 0, info: { title: "Stored" }, extra: true },
        opaque: null,
      };
      const observed1 = yield* service.readSelected(url, 300000);
      expect(observed1).toEqual({ url, status: "ready", fetchedAt: 0, info: { title: "Stored" } });
      expect(state.writes).toEqual([]);
    })
  );
  it.effect("present malformed roots fail; selected malformed entries are misses", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const service = yield* ExtensionCache;
      for (const root of [null, false, 0, "", true, 1, "x", []]) {
        state.root = root;
        const observed2 = yield* Effect.exit(service.readSelected(url, 300000));
        expect(Exit.isFailure(observed2)).toBe(true);
      }
      state.root = { [url]: { url, status: "ready", fetchedAt: "0" }, opaque: null };
      const observed3 = yield* service.readSelected(url, 300000);
      expect(observed3).toBeNull();
    })
  );
  it.effect("TTL equality, backward time, and popup one-hour policy", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const service = yield* ExtensionCache;
      state.root = { [url]: { url, status: "ready", fetchedAt: 0 } };
      yield* TestClock.adjust(300000);
      const observed4 = yield* service.readSelected(url, 300000);
      expect(observed4).not.toBeNull();
      yield* TestClock.adjust(1);
      const observed5 = yield* service.readSelected(url, 300000);
      expect(observed5).toBeNull();
      const observed6 = yield* service.readSelected(url, 3600000);
      expect(observed6).not.toBeNull();
      const now = yield* Clock.currentTimeMillis;
      state.root = { [url]: { url, status: "ready", fetchedAt: now + 1 } };
      const observed7 = yield* service.readSelected(url, 300000);
      expect(observed7).not.toBeNull();
    })
  );
  it.effect("read/write failures stay typed and interruption cancels suspended reads and writes", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const service = yield* ExtensionCache;
      state.read = Effect.fail(hostFailure);
      const observed8 = yield* Effect.exit(service.save({ url, status: "pending", fetchedAt: 0 }));
      expect(Exit.isFailure(observed8)).toBe(true);
      state.read = undefined;
      state.root = undefined;
      state.write = Effect.fail(hostFailure);
      const observed9 = yield* Effect.exit(service.save({ url, status: "pending", fetchedAt: 0 }));
      expect(Exit.isFailure(observed9)).toBe(true);
      let releases = 0;
      state.read = Effect.never.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            releases += 1;
          })
        )
      );
      const readFiber = yield* Effect.forkChild(service.readSelected(url, 300000), { startImmediately: true });
      yield* Fiber.interrupt(readFiber);
      state.read = undefined;
      state.write = Effect.never.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            releases += 1;
          })
        )
      );
      const writeFiber = yield* Effect.forkChild(service.save({ url, status: "pending", fetchedAt: 0 }), {
        startImmediately: true,
      });
      yield* Fiber.interrupt(writeFiber);
      expect(releases).toBe(2);
      state.write = undefined;
    })
  );
});

it.layer(background)("background", (it) => {
  it.effect("pending precedes network; any 2xx status selects token then encoded metadata", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const service = yield* ExtensionBackground;
      state.root = undefined;
      state.calls.length = 0;
      state.writes.length = 0;
      yield* service.fetchAndCache(url);
      expect(A.filter(state.calls, (call) => call !== "icon" && call !== "read")).toEqual([
        "write",
        "GET http://127.0.0.1:27100/status",
        "POST http://127.0.0.1:27100/token",
        `GET http://127.0.0.1:27100/video-info?url=${encodeURIComponent(url)}&token=token%20%2B%2F`,
        "write",
      ]);
      expect(state.writes).toHaveLength(2);
    })
  );
  it.effect("initial read and pending write failures bypass the request catch", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const service = yield* ExtensionBackground;
      state.root = undefined;
      state.calls.length = 0;
      state.read = Effect.fail(hostFailure);
      const observed10 = yield* Effect.exit(service.fetchAndCache(url));
      expect(Exit.isFailure(observed10)).toBe(true);
      expect(state.calls).toEqual(["read"]);
      state.read = undefined;
      state.write = Effect.fail(hostFailure);
      state.calls.length = 0;
      const observed11 = yield* Effect.exit(service.fetchAndCache(url));
      expect(Exit.isFailure(observed11)).toBe(true);
      expect(A.filter(state.calls, (value) => Str.startsWith("GET")(value))).toEqual([]);
      state.write = undefined;
    })
  );
  it.effect("interruption releases admission and joins duplicates without a second request", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const service = yield* ExtensionBackground;
      state.root = undefined;
      state.calls.length = 0;
      const reached = yield* Deferred.make<void>();
      let releases = 0;
      state.read = Deferred.succeed(reached, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(
          Effect.sync(() => {
            releases += 1;
          })
        )
      );
      const first = yield* Effect.forkChild(service.fetchAndCache(url), { startImmediately: true });
      yield* Deferred.await(reached);
      const second = yield* Effect.forkChild(service.fetchAndCache(url), { startImmediately: true });
      expect(state.calls).toEqual(["read"]);
      yield* Fiber.interrupt(first);
      yield* Fiber.interrupt(second);
      expect(releases).toBe(1);
      state.read = undefined;
      yield* service.fetchAndCache(url);
      expect(state.writes.length).toBeGreaterThan(0);
    })
  );
});

it.layer(popup)("popup", (it) => {
  it.effect(
    "listener installs before query; release removes exact listener but permits initialization continuation",
    () =>
      Effect.gen(function* () {
        const state = yield* Fixture;
        const controller = yield* PopupController;
        const registry = yield* AtomRegistry.AtomRegistry;
        state.calls.length = 0;
        state.root = undefined;
        const query = yield* Deferred.make<readonly { readonly url: string }[]>();
        state.query = Deferred.await(query);
        const session = yield* controller.beginSession(0);
        expect(state.calls).toEqual(["listen", "query"]);
        yield* session.release;
        yield* session.release;
        expect(state.listeners).toEqual([]);
        expect(A.filter(state.calls, (call) => call === "remove")).toHaveLength(1);
        yield* Deferred.succeed(query, [{ url }]);
        yield* Effect.yieldNow;
        expect(registry.get(currentUrlAtom)).toBe(url);
        state.query = Effect.succeed([{ url }]);
      })
  );
  it.effect("pending only changes loading; invalid notification has no transition", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const controller = yield* PopupController;
      const registry = yield* AtomRegistry.AtomRegistry;
      state.root = { [url]: { url, status: "ready", fetchedAt: 0, info: { title: "old" } } };
      const session = yield* controller.beginSession(0);
      yield* Effect.yieldNow;
      const listener = state.listeners[0];
      expect(listener).toBeDefined();
      registry.set(errorAtom, "retained");
      listener?.({ videoInfoCacheByUrl: { newValue: { [url]: { url, status: "pending", fetchedAt: 0 } } } }, "local");
      for (const notification of state.notifications) yield* notification;
      state.notifications.length = 0;
      expect(registry.get(loadingAtom)).toBe(true);
      expect(registry.get(infoAtom)?.title).toBe("old");
      expect(registry.get(errorAtom)).toBe("retained");
      yield* session.release;
    })
  );
  it.effect("handoff URIs and two-second launch delay survive session release", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const controller = yield* PopupController;
      const registry = yield* AtomRegistry.AtomRegistry;
      registry.set(currentUrlAtom, "");
      state.navigation.length = 0;
      yield* controller.download;
      expect(state.navigation).toEqual([]);
      registry.set(currentUrlAtom, url);
      yield* controller.download;
      const retry = registry.get(retryAtom);
      const launch = yield* Effect.forkChild(controller.openClientAndRetry, { startImmediately: true });
      expect(state.navigation).toEqual([`vidbee://download?url=${encodeURIComponent(url)}`, "vidbee://"]);
      yield* TestClock.adjust(1999);
      expect(registry.get(retryAtom)).toBe(retry);
      yield* TestClock.adjust(1);
      yield* Fiber.join(launch);
      expect(registry.get(retryAtom)).toBe(retry + 1);
    })
  );
});

it.layer(background)("background suspension finalizers", (it) => {
  it.effect.each(["pending", "status", "token", "metadata", "ready", "error"] as const)(
    "interruption at %s releases admission",
    (phase) =>
      Effect.gen(function* () {
        const state = yield* Fixture;
        const service = yield* ExtensionBackground;
        state.root = undefined;
        state.writes.length = 0;
        const reached = yield* Deferred.make<void>();
        let releases = 0;
        const blocked = Deferred.succeed(reached, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(
            Effect.sync(() => {
              releases += 1;
            })
          )
        );
        const initialRequest = state.request;
        state.write = Effect.suspend(() =>
          (phase === "pending" && state.writes.length === 1) ||
          ((phase === "ready" || phase === "error") && state.writes.length === 2)
            ? blocked
            : Effect.void
        );
        state.request = (method, target) =>
          (phase === "status" && Str.endsWith("/status")(target)) ||
          (phase === "token" && Str.endsWith("/token")(target)) ||
          (phase === "metadata" && Str.includes("/video-info?")(target))
            ? blocked
            : phase === "error"
              ? Effect.fail(ExtensionRequestFailure.make({ message: "fixture" }))
              : initialRequest(method, target);
        const work = yield* Effect.forkChild(service.fetchAndCache(url), { startImmediately: true });
        yield* Deferred.await(reached);
        yield* Fiber.interrupt(work);
        expect(releases).toBe(1);
        state.write = undefined;
        state.request = initialRequest;
        state.root = undefined;
        yield* service.fetchAndCache(url);
      })
  );
});

it.effect("document layer scope removes listeners and cancels suspended initialization", () =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const context = yield* Layer.buildWithScope(popup, scope);
    const state = Context.get(context, Fixture);
    const controller = Context.get(context, PopupController);
    let finalized = 0;
    state.query = Effect.never.pipe(
      Effect.ensuring(
        Effect.sync(() => {
          finalized += 1;
        })
      )
    );
    yield* controller.beginSession(0);
    expect(state.listeners).toHaveLength(1);
    yield* Scope.close(scope, Exit.void);
    expect(state.listeners).toHaveLength(0);
    expect(finalized).toBe(1);
  })
);
it.effect("worker layer scope cancels detached icon without blocking ready storage", () =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const context = yield* Layer.buildWithScope(background, scope);
    const state = Context.get(context, Fixture);
    const service = Context.get(context, ExtensionBackground);
    let finalized = 0;
    state.icon = Effect.never.pipe(
      Effect.ensuring(
        Effect.sync(() => {
          finalized += 1;
        })
      )
    );
    yield* service.fetchAndCache(url);
    expect(state.writes).toHaveLength(2);
    yield* Scope.close(scope, Exit.void);
    expect(finalized).toBe(2);
  })
);

it.layer(background)("background recovery boundaries", (it) => {
  it.effect("ready-write failure becomes an error entry; failed error-write prevents the default icon", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const service = yield* ExtensionBackground;
      state.root = undefined;
      state.calls.length = 0;
      state.writes.length = 0;
      state.write = Effect.suspend(() => (state.writes.length === 2 ? Effect.fail(hostFailure) : Effect.void));
      yield* service.fetchAndCache(url);
      expect(state.writes).toHaveLength(3);
      expect(state.writes[2]?.[url]).toMatchObject({ status: "error", error: "fixture failure" });
      state.root = undefined;
      state.calls.length = 0;
      state.writes.length = 0;
      state.request = () => Effect.fail(ExtensionRequestFailure.make({ message: "fixture request failure" }));
      const result = yield* Effect.exit(service.fetchAndCache(url));
      expect(Exit.isFailure(result)).toBe(true);
      expect(A.filter(state.calls, (call) => call === "icon")).toHaveLength(1);
      state.write = undefined;
    })
  );
});

it.layer(cache)("cache record-key preservation", (it) => {
  it.effect("unrelated own prototype-named fields survive, while special URL assignment retains the old behavior", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const service = yield* ExtensionCache;
      state.root = { ["__proto__"]: { opaque: true }, other: 17 };
      yield* service.save({ url, status: "pending", fetchedAt: 0 });
      const first = state.writes[state.writes.length - 1] ?? {};
      expect(R.has(first, "__proto__")).toBe(true);
      expect(R.get(first, "__proto__")).toEqual(O.some({ opaque: true }));
      state.root = undefined;
      yield* service.save({ url: "__proto__", status: "pending", fetchedAt: 0 });
      const second = state.writes[state.writes.length - 1] ?? {};
      expect(R.has(second, "__proto__")).toBe(false);
    })
  );
});

it.layer(background)("native encoding failures", (it) => {
  it.effect(
    "a valid string containing a lone surrogate stores the original encoding failure and releases admission",
    () =>
      Effect.gen(function* () {
        const state = yield* Fixture;
        const service = yield* ExtensionBackground;
        const malformed = "\ud800";
        yield* service.fetchAndCache(malformed);
        expect(state.writes).toHaveLength(2);
        expect(state.writes[1]?.[malformed]).toMatchObject({ status: "error" });
        expect(A.filter(state.calls, (call) => call === "icon")).toHaveLength(2);
        yield* service.fetchAndCache(malformed);
        expect(state.writes).toHaveLength(4);
      })
  );
});

it.effect("a notification admitted before document closure cannot publish after its owner closes", () =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const context = yield* Layer.buildWithScope(popup, scope);
    const state = Context.get(context, Fixture);
    const controller = Context.get(context, PopupController);
    const registry = Context.get(context, AtomRegistry.AtomRegistry);
    const writes = yield* Effect.acquireRelease(
      Effect.sync(() => vi.spyOn(registry, "set")),
      (spy) => Effect.sync(() => spy.mockRestore())
    );
    state.root = { [url]: { url, status: "ready", fetchedAt: 0, info: { title: "Before" } } };
    yield* controller.beginSession(0);
    const listener = state.listeners[0];
    listener?.(
      {
        videoInfoCacheByUrl: {
          newValue: { [url]: { url, status: "ready", fetchedAt: 0, info: { title: "Too late" } } },
        },
      },
      "local"
    );
    expect(state.notifications).toHaveLength(1);
    yield* Scope.close(scope, Exit.void);
    const before = writes.mock.calls.length;
    for (const notification of state.notifications) yield* notification;
    expect(writes.mock.calls).toHaveLength(before);
  })
);

it.effect.each(["first-read", "send", "final-read"] as const)(
  "document closure interrupts initialization at %s",
  (phase) =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const context = yield* Layer.buildWithScope(popup, scope);
      const state = Context.get(context, Fixture);
      const controller = Context.get(context, PopupController);
      const reached = yield* Deferred.make<void>();
      let releases = 0;
      let reads = 0;
      const blocked = Deferred.succeed(reached, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(
          Effect.sync(() => {
            releases += 1;
          })
        )
      );
      state.read = Effect.suspend(() => {
        reads += 1;
        return (phase === "first-read" && reads === 1) || (phase === "final-read" && reads === 2)
          ? blocked
          : Effect.undefined;
      });
      if (phase === "send") state.send = blocked;
      yield* controller.beginSession(0);
      yield* Deferred.await(reached);
      yield* Scope.close(scope, Exit.void);
      expect(releases).toBe(1);
      expect(state.listeners).toEqual([]);
      expect(state.writes).toEqual([]);
    })
);

it.layer(cache)("cache key presence", (it) => {
  it.effect("a present undefined root fails decoding without a write", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const service = yield* ExtensionCache;
      state.presentUndefined = true;
      const result = yield* Effect.result(service.readSelected(url, 300000));
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "ExtensionBoundaryFailure", boundary: "storage" },
      });
      expect(state.writes).toEqual([]);
    })
  );
});
