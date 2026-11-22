import * as Effect from "effect/Effect";
import { PreferenceHostError } from "./PreferenceHost.errors.js";

/** Adapts document language access and its existing renderer logger. Only this driver converts the i18n Promise; application sequencing remains in Settings.atoms.
 * **Example** (Inject a document language implementation)
 * ```ts
 * import { makePreferenceHost } from './Preferences.driver.js'
 * const host=makePreferenceHost({language:()=> 'en',changeLanguage:()=>Promise.resolve(),report:()=>{}})
 * export const language=host.language
 * // Execute with the document owner; construction performs no language access.
 * ```
 * @category drivers
 * @since 0.0.0
 */
export const makePreferenceHost = (native: {
  readonly language: () => string;
  readonly changeLanguage: (language: string) => PromiseLike<unknown>;
  readonly report: (message: string, error: unknown) => void;
}) => ({
  language: Effect.try({ try: native.language, catch: (original) => PreferenceHostError.make({ original }) }),
  changeLanguage: Effect.fn("PreferenceHost.changeLanguage")((language: string) =>
    Effect.tryPromise({
      try: () => native.changeLanguage(language),
      catch: (original) => PreferenceHostError.make({ original }),
    }).pipe(Effect.asVoid)
  ),
  report: Effect.fn("PreferenceHost.report")((message: string, error: unknown) =>
    Effect.sync(() => native.report(message, error))
  ),
});
