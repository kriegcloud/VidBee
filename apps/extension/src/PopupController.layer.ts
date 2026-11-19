import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import * as S from "effect/Schema";
import * as Scope from "effect/Scope";
import { logFailure } from "./Extension.diagnostics.js";
import { ExtensionBoundaryFailure } from "./Extension.errors.js";
import { CacheMap, VideoInfoCacheEntry } from "./Extension.model.js";
import { isValidHttpUrl, sanitizeError } from "./Extension.pure.js";
import { ExtensionBrowser } from "./ExtensionBrowser.service.js";
import { ExtensionCache } from "./ExtensionCache.service.js";
import { ExtensionNavigation } from "./ExtensionNavigation.service.js";
import { currentUrlAtom, errorAtom, infoAtom, loadingAtom, retryAtom } from "./Popup.atoms.js";
import { incrementRetry, makePopupCommands } from "./PopupCommands.js";
import { PopupController } from "./PopupController.service.js";
export const PopupControllerLive = Layer.effect(
  PopupController,
  Effect.gen(function* () {
    const browser = yield* ExtensionBrowser;
    const cache = yield* ExtensionCache;
    const navigation = yield* ExtensionNavigation;
    const registry = yield* AtomRegistry.AtomRegistry;
    const scope = yield* Effect.scope;
    const context = yield* Effect.context<never>();
    // The entrypoint supplies the synchronous callback runner, capturing the document context.
    const callback = yield* PopupCallback;
    const publish = (entry: VideoInfoCacheEntry | null) => {
      if (entry?.status === "ready" && P.isTruthy(entry.info)) {
        registry.set(infoAtom, entry.info ?? null);
        registry.set(errorAtom, null);
        registry.set(loadingAtom, false);
      } else if (entry?.status === "error" && P.isTruthy(entry.error)) {
        registry.set(errorAtom, sanitizeError(entry.error ?? ""));
        registry.set(infoAtom, null);
        registry.set(loadingAtom, false);
      } else if (entry?.status === "pending") registry.set(loadingAtom, true);
    };
    const retry = Effect.sync(() => registry.update(retryAtom, incrementRetry));
    return PopupController.of({
      beginSession: Effect.fn("PopupController.beginSession")(function* (retryTrigger) {
        let active = true;
        let targetUrl = "";
        const listener = (changes: import("./ExtensionBrowser.service.js").StorageChanges, area: string) => {
          if (!active || area !== "local") return;
          const value = changes.videoInfoCacheByUrl?.newValue;
          if (!P.isTruthy(value)) return;
          callback.run(
            S.decodeUnknownEffect(CacheMap)(value).pipe(
              Effect.mapError(() =>
                ExtensionBoundaryFailure.make({ boundary: "notification", issue: "Invalid cache root" })
              ),
              Effect.tap((map) =>
                Effect.sync(() => {
                  const entry = S.decodeUnknownOption(VideoInfoCacheEntry)(map[targetUrl]);
                  if (O.isSome(entry)) publish(entry.value);
                })
              ),
              Effect.asVoid,
              Effect.catchCause(logFailure),
              Effect.provideContext(context),
              Effect.forkIn(scope, { startImmediately: true }),
              Effect.asVoid
            )
          );
        };
        const remove = yield* browser.listenStorage(listener);
        const sessionScope = yield* Scope.fork(scope);
        yield* Scope.addFinalizer(
          sessionScope,
          Effect.sync(() => {
            if (active) {
              active = false;
              remove();
            }
          })
        );
        const release = Scope.close(sessionScope, Exit.void);
        yield* Effect.gen(function* () {
          registry.set(loadingAtom, true);
          registry.set(errorAtom, null);
          registry.set(infoAtom, null);
          const [tab] = yield* browser.queryActiveTabs;
          if (!isValidHttpUrl(tab?.url)) {
            registry.set(errorAtom, "Please open a valid video page first.");
            registry.set(loadingAtom, false);
            return;
          }
          const url = tab?.url ?? "";
          targetUrl = url;
          registry.set(currentUrlAtom, url);
          const cached = yield* cache.readSelected(url, 3_600_000);
          if (
            cached !== null &&
            retryTrigger === 0 &&
            ((cached.status === "ready" && P.isTruthy(cached.info)) ||
              (cached.status === "error" && P.isTruthy(cached.error)))
          ) {
            if (cached.status === "ready") registry.set(infoAtom, cached.info ?? null);
            else registry.set(errorAtom, sanitizeError(cached.error ?? ""));
            registry.set(loadingAtom, false);
            return;
          }
          yield* browser.sendMessage({ type: "video-info:fetch", url }).pipe(
            Effect.catch((error) =>
              Effect.sync(() => {
                registry.set(errorAtom, sanitizeError(error.message));
                registry.set(loadingAtom, false);
              })
            )
          );
          const latest = yield* cache.readSelected(url, 3_600_000);
          if (latest?.status !== "pending") publish(latest);
        }).pipe(Effect.catchCause(logFailure), Effect.forkIn(scope, { startImmediately: true }));
        return { release };
      }, Effect.uninterruptible),
      ...makePopupCommands({ navigation, retry, currentUrl: () => registry.get(currentUrlAtom) }),
    });
  })
);

import * as Context from "effect/Context";
export class PopupCallback extends Context.Service<
  PopupCallback,
  {
    readonly run: (effect: Effect.Effect<void>) => void;
  }
>()("vidbee-extension/PopupController.layer/PopupCallback") {}
