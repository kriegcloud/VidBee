import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { SettingsDocument } from "../shared/Settings.model.js";
import { OriginalFailure, originalFailure } from "./lib/OriginalFailure.errors.js";
import { SettingsStore } from "./SettingsStore.service.js";
import type { SynchronousCall } from "./lib/SynchronousHost.service.js";
import type { SettingsPrimitives, SettingsStoreOperations } from "./SettingsStore.service.js";

/** Adapts the installed synchronous store and native path primitives without replacing their persistence policy. Authority is checked before each operation, including construction.
 * **Example** (Construct an injected persistence layer)
 * ```ts
 * import { settingsStoreLayer } from './SettingsStore.driver.js'
 * import type { SettingsPrimitives } from './SettingsStore.service.js'
 * export const provideStore = (native: SettingsPrimitives) => settingsStoreLayer(native)
 * // The returned layer opens nothing until initialize runs under a live call authority.
 * ```
 * @category layers
 * @since 0.0.0
 */
export const settingsStoreLayer = (native: SettingsPrimitives) => {
  let opened: ReturnType<SettingsPrimitives["open"]> | undefined;
  const forCall = (call: SynchronousCall): SettingsStoreOperations => {
    const attempt = <A>(operation: string, body: () => A) =>
      Effect.try({
        try: () => call.use(body),
        catch: (original) =>
          S.is(OriginalFailure)(original)
            ? original
            : originalFailure({
                original,
                operation,
                legacyMessage: original instanceof Error ? original.message : String(original),
              }),
      });
    // These operations capture an initialized record before invoking a reentrant primitive.
    const withStore = <A>(operation: string, body: (store: ReturnType<SettingsPrimitives["open"]>) => A) =>
      Effect.suspend(() => {
        const current = opened;
        return current === undefined
          ? Effect.fail(
              originalFailure({
                original: "Settings not initialized",
                operation,
                legacyMessage: "Settings not initialized",
              })
            )
          : attempt(operation, () => body(current));
      });
    return {
      configuration: withStore("SettingsStore.configuration", (store) => store.environment),
      initialize: attempt("SettingsStore.initialize", () => {
        const current = native.open();
        opened = current;
        return current.environment;
      }),
      get: Effect.fn("SettingsStore.get")((key: string) => withStore("SettingsStore.get", (store) => store.get(key))),
      document: withStore("SettingsStore.document", (store) => store.document()).pipe(
        Effect.flatMap(S.decodeUnknownEffect(SettingsDocument)),
        Effect.mapError((error) =>
          S.is(OriginalFailure)(error)
            ? error
            : originalFailure({
                original: error,
                operation: "SettingsStore.document",
                legacyMessage: "Invalid settings document",
              })
        )
      ),
      set: Effect.fn("SettingsStore.set")((key: string, value: unknown) =>
        withStore("SettingsStore.set", (store) => store.set(key, value))
      ),
      replace: Effect.fn("SettingsStore.replace")((value: SettingsDocument) =>
        withStore("SettingsStore.replace", (store) => store.replace(value))
      ),
      clear: withStore("SettingsStore.clear", (store) => store.clear()),
      mkdir: Effect.fn("SettingsStore.mkdir")((value: unknown) =>
        attempt("SettingsStore.mkdir", () => native.mkdir(value))
      ),
      marker: attempt("SettingsStore.marker", native.rememberPortableRoot),
      locale: attempt("SettingsStore.locale", native.locale),
      resolve: Effect.fn("SettingsStore.resolve")((value: unknown) =>
        attempt("SettingsStore.resolve", () => native.resolve(value))
      ),
      relative: Effect.fn("SettingsStore.relative")((from: unknown, to: unknown) =>
        attempt("SettingsStore.relative", () => native.relative(from, to))
      ),
      join: Effect.fn("SettingsStore.join")((from: unknown, to: unknown) =>
        attempt("SettingsStore.join", () => native.join(from, to))
      ),
      isAbsolute: Effect.fn("SettingsStore.isAbsolute")((value: unknown) =>
        attempt("SettingsStore.isAbsolute", () => native.isAbsolute(value))
      ),
      trim: Effect.fn("SettingsStore.trim")((value: unknown) =>
        attempt("SettingsStore.trim", () => native.trim(value))
      ),
    };
  };
  return Layer.succeed(SettingsStore, { forCall });
};
