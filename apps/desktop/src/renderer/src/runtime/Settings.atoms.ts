import { normalizeLanguageCode } from "@vidbee/i18n/languages";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import type { AppSettings } from "../../../shared/types/Desktop.model.js";
import type { makeFoundationCalls } from "./FoundationCalls.service.js";
import type { FoundationClient } from "./FoundationClient.service.js";
import type { makePreferenceHost } from "./Preferences.driver.js";

/** Drives the shared preference atoms through injected registry projections. Single saves expose their optimistic snapshot synchronously, retain whole-snapshot rollback on failure, and swallow failures after the historical log. Batches merge the current state only after success.
 * **Example** (Create a preference action owner)
 * ```ts
 * import { makeSettingsActions } from './Settings.atoms.js'
 * export const create=(options:Parameters<typeof makeSettingsActions>[0])=>makeSettingsActions(options)
 * // State callbacks project one document registry; they never maintain another preference value.
 * ```
 * @category atoms
 * @since 0.0.0
 */
export const makeSettingsActions = ({
  state,
  calls,
  host,
}: {
  readonly state: {
    readonly read: () => AppSettings;
    readonly write: (settings: AppSettings) => void;
    readonly loaded: () => void;
    readonly capture: (settings: AppSettings) => { readonly release: () => void; readonly restore: () => void };
  };
  readonly calls: ReturnType<typeof makeFoundationCalls>["settings"];
  readonly host: ReturnType<typeof makePreferenceHost>;
}) => {
  const load: Effect.Effect<void, never, FoundationClient> = Effect.gen(function* () {
    const settings = yield* calls.getAll;
    const savedLanguage = normalizeLanguageCode(settings.language);
    const current = yield* host.language;
    const currentLanguage = normalizeLanguageCode(current);
    if (currentLanguage !== savedLanguage)
      yield* host
        .changeLanguage(savedLanguage)
        .pipe(Effect.catch((error) => host.report("Failed to apply saved language:", error.original)));
    yield* Effect.sync(() => {
      state.write({ ...settings, language: savedLanguage });
      state.loaded();
    });
  }).pipe(Effect.catch((error) => host.report("Failed to load settings:", error)));
  const prepareSave = (update: { readonly key: keyof AppSettings; readonly value: AppSettings[keyof AppSettings] }) => {
    const before = Result.try({
      try: () => {
        const previous = state.read();
        const rollback = state.capture(previous);
        const written = Result.try({
          try: () => state.write({ ...previous, [update.key]: update.value }),
          catch: (error) => error,
        });
        if (Result.isFailure(written)) {
          rollback.release();
          return Result.fail(written.failure);
        }
        return Result.succeed(rollback);
      },
      catch: (error) => error,
    }).pipe(Result.getOrElse((error) => Result.fail(error)));
    if (Result.isFailure(before))
      return { effect: host.report("Failed to save setting:", before.failure), refuse: (_restore: boolean) => {} };
    let pending = true;
    const release = () => {
      if (pending) {
        pending = false;
        before.success.release();
      }
    };
    return {
      effect: calls.set(update.key, update.value).pipe(
        Effect.catchCause((cause) =>
          !pending
            ? Effect.void
            : Effect.andThen(
                Effect.sync(() => {
                  if (pending) before.success.restore();
                }),
                host.report("Failed to save setting:", Cause.squash(cause))
              )
        ),
        Effect.ensuring(Effect.sync(release))
      ),
      refuse: (restore: boolean) => {
        if (!pending) return;
        try {
          if (restore) before.success.restore();
        } finally {
          release();
        }
      },
    };
  };
  const beginSave = (update: Parameters<typeof prepareSave>[0]) => prepareSave(update).effect;

  const saveAll = Effect.fn("SettingsActions.saveAll")(
    function* (input: {
      readonly entries: ReadonlyArray<readonly [string, unknown]>;
      readonly settings: Partial<AppSettings>;
    }) {
      yield* calls.setAll(input.entries);
      yield* Effect.sync(() => state.write({ ...state.read(), ...input.settings }));
    },
    Effect.catch((error) => host.report("Failed to save settings:", error))
  );
  return { load, beginSave, prepareSave, saveAll };
};
