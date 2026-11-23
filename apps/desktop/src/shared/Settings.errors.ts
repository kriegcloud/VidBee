import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $I = $DesktopId.create("shared/Settings.errors");

/** Storage read failure without private document values.
 *
 * **Example** (Describe a read failure)
 * ```ts
 * import { SettingsReadError } from './Settings.errors.js'
 * SettingsReadError.make({ operation: 'getAll', message: 'unavailable' }).message // => 'unavailable'
 * ```
 * @category errors
 * @since 0.0.0
 */
export class SettingsReadError extends S.TaggedError<SettingsReadError, { readonly brand: unique symbol }>()(
  "SettingsReadError",
  { operation: S.String, message: S.String },
  $I.annoteError("SettingsReadError", { description: "A settings read could not complete." })
) {}

/** Storage write failure; original failure remains main-only.
 *
 * **Example** (Describe a write failure)
 * ```ts
 * import { SettingsWriteError } from './Settings.errors.js'
 * SettingsWriteError.make({ operation: 'set', key: 'theme', message: 'read only' }).key // => 'theme'
 * ```
 * @category errors
 * @since 0.0.0
 */
export class SettingsWriteError extends S.TaggedError<SettingsWriteError, { readonly brand: unique symbol }>()(
  "SettingsWriteError",
  {
    operation: S.String,
    key: S.String.pipe(S.UndefinedOr, S.optionalKey),
    message: S.String,
  },
  $I.annoteError("SettingsWriteError", { description: "A settings mutation could not complete." })
) {}

/** Invalid typed settings input or projection infrastructure failure.
 *
 * **Example** (Describe invalid typed input)
 * ```ts
 * import { SettingsDecodeError } from './Settings.errors.js'
 * SettingsDecodeError.make({ operation: 'setAll', issue: 'Duplicate setting key' }).operation // => 'setAll'
 * ```
 * @category errors
 * @since 0.0.0
 */
export class SettingsDecodeError extends S.TaggedError<SettingsDecodeError, { readonly brand: unique symbol }>()(
  "SettingsDecodeError",
  { operation: S.String, issue: S.String },
  $I.annoteError("SettingsDecodeError", { description: "Typed settings validation failed." })
) {}

/** Declared settings application failures.
 *
 * **Example** (Validate a declared application failure)
 * ```ts
 * import * as S from 'effect/Schema'
 * import { SettingsError, SettingsReadError } from './Settings.errors.js'
 * S.is(SettingsError)(SettingsReadError.make({ operation: 'get', message: 'unavailable' })) // => true
 * ```
 * @category schemas
 * @since 0.0.0
 */
export const SettingsError = S.Union([SettingsReadError, SettingsWriteError, SettingsDecodeError]).pipe(
  $I.annoteSchema("SettingsError", { description: "Public settings application failure." })
);

/** Schema-derived application failure.
 *
 * **Example** (Read the failure operation)
 * ```ts
 * import type { SettingsError } from './Settings.errors.js'
 * const operation = (error: SettingsError) => error.operation
 * operation
 * ```
 * @category type-level
 * @since 0.0.0
 */
export type SettingsError = typeof SettingsError.Type;
