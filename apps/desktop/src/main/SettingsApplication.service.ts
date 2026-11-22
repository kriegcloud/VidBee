import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import { originalFailure } from "./lib/OriginalFailure.errors.js";
import type { SynchronousCall } from "./lib/SynchronousHost.service.js";
import type { SettingsOperations } from "./Settings.service.js";

/** Native application callbacks installed by the legacy composition shell. Entries and keys are captured at separate historical boundaries, including reentrant changes during persistence.
 * @category type-level
 * @since 0.0.0
 */
export interface SettingsApplicationPrimitives {
  readonly broadcast: () => void;
  readonly dock: (value: unknown) => void;
  readonly entries: () => ReadonlyArray<readonly [string, unknown]>;
  readonly followup: () => void;
  readonly keys: () => ReadonlyArray<string>;
  readonly language: () => void;
  readonly login: (value: unknown) => void;
  readonly needsFollowup: () => boolean;
  readonly queue: () => void;
}

/** Applies persisted values in caller key order, schedules the existing detached transcript followup, then broadcasts. Reset retains its separate dock, login, queue order and emits no broadcast.
 * **Example** (Bind a compatibility update to its live authority)
 * ```ts
 * import { makeSettingsApplication } from './SettingsApplication.service.js'
 * import type { SettingsApplicationPrimitives } from './SettingsApplication.service.js'
 * import type { SettingsOperations } from './Settings.service.js'
 * import type { SynchronousCall } from './lib/SynchronousHost.service.js'
 * export const update = ({settings,call,native}: {settings: SettingsOperations; call: SynchronousCall; native: SettingsApplicationPrimitives}) =>
 *   makeSettingsApplication({ settings, call, native }).update
 * // Persistence and reread complete before native side effects are admitted.
 * ```
 * @category services
 * @since 0.0.0
 */
export const makeSettingsApplication = ({
  settings,
  call,
  native,
}: {
  readonly settings: SettingsOperations;
  readonly call: SynchronousCall;
  readonly native: SettingsApplicationPrimitives;
}) => {
  const attempt = <A>(operation: string, body: () => A) =>
    Effect.try({
      try: () => call.use(body),
      catch: (original) =>
        originalFailure({
          original,
          operation,
          legacyMessage: original instanceof Error ? original.message : String(original),
        }),
    });
  const apply = Effect.fn("SettingsApplication.apply")(function* (key: string, value: unknown) {
    if (key === "language") yield* attempt("Settings.language", native.language);
    else if (key === "hideDockIcon") yield* attempt("Settings.dock", () => native.dock(Boolean(value)));
    else if (key === "launchAtLogin") yield* attempt("Settings.login", () => native.login(Boolean(value)));
    else if (key === "maxConcurrentDownloads" || key === "maxConcurrentTranscriptions") {
      // Preserve coercion before calling the historically argument-free queue callback.
      yield* attempt("Settings.queue", () => {
        Number(value);
        native.queue();
      });
    }
  });
  return {
    update: Effect.gen(function* () {
      const entries = yield* attempt("Settings.entries", native.entries);
      yield* settings.setAll(entries);
      const actual = yield* settings.getAll;
      const keys = yield* attempt("Settings.keys", native.keys);
      const applied = A.map(keys, (key) => [key, actual[key]] satisfies readonly [string, unknown]);
      for (const [key, value] of applied) if (value !== undefined) yield* apply(key, value);
      if (yield* attempt("Settings.needsFollowup", native.needsFollowup))
        yield* attempt("Settings.followup", native.followup);
      yield* attempt("Settings.broadcast", native.broadcast);
    }),
    reset: Effect.gen(function* () {
      yield* settings.reset;
      const dock = yield* settings.get("hideDockIcon");
      yield* attempt("Settings.dock", () => native.dock(dock));
      const login = yield* settings.get("launchAtLogin");
      yield* attempt("Settings.login", () => native.login(login));
      yield* attempt("Settings.queue", native.queue);
    }),
  };
};
