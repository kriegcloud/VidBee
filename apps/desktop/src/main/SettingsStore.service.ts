import { $DesktopId } from "@vidbee/identity/packages";
import * as Context from "effect/Context";
import type { SystemProfile } from "@vidbee/i18n/system-locale";
import type * as Effect from "effect/Effect";
import type { SettingsDocument } from "../shared/Settings.model.js";
import type { OriginalFailure } from "./lib/OriginalFailure.errors.js";
import type { SynchronousCall } from "./lib/SynchronousHost.service.js";
import type { SettingsEnvironment } from "./SettingsEnvironment.model.js";

const $I = $DesktopId.create("main/SettingsStore.service");
/** Borrowed synchronous native operations. Store construction keeps electron-store/Conf's own defaults, JSON, dotted-key and atomic-write semantics.
 * @category type-level
 * @since 0.0.0
 */
export interface SettingsPrimitives {
  readonly isAbsolute: (value: unknown) => boolean;
  readonly join: (from: unknown, to: unknown) => string;
  readonly locale: () => SystemProfile;
  readonly mkdir: (value: unknown) => void;
  readonly open: () => {
    readonly environment: SettingsEnvironment;
    readonly get: (key: string) => unknown;
    readonly document: () => unknown;
    readonly set: (key: string, value: unknown) => void;
    readonly replace: (value: SettingsDocument) => void;
    readonly clear: () => void;
  };
  readonly relative: (from: unknown, to: unknown) => string;
  readonly rememberPortableRoot: () => void;
  readonly resolve: (value: unknown) => string;
  readonly trim: (value: unknown) => string;
}
/** Qualified persistence and host driver. The only semantic decoder on raw storage is its open document shape; known fields remain permissive for legacy callers.
 * **Example** (Read a raw value)
 * ```ts
 * import { SettingsStore } from './SettingsStore.service.js'
 * import * as Effect from 'effect/Effect'
 * export const driver = Effect.map(SettingsStore, store => store.forCall)
 * // Provide the initialized store and the current synchronous authority.
 * ```
 * @category services
 * @since 0.0.0
 */
export interface SettingsStoreOperations {
  readonly clear: Effect.Effect<void, OriginalFailure>;
  readonly configuration: Effect.Effect<SettingsEnvironment, OriginalFailure>;
  readonly document: Effect.Effect<SettingsDocument, OriginalFailure>;
  readonly get: (key: string) => Effect.Effect<unknown, OriginalFailure>;
  readonly initialize: Effect.Effect<SettingsEnvironment, OriginalFailure>;
  readonly isAbsolute: (value: unknown) => Effect.Effect<boolean, OriginalFailure>;
  readonly join: (from: unknown, to: unknown) => Effect.Effect<string, OriginalFailure>;
  readonly locale: Effect.Effect<SystemProfile, OriginalFailure>;
  readonly marker: Effect.Effect<void, OriginalFailure>;
  readonly mkdir: (value: unknown) => Effect.Effect<void, OriginalFailure>;
  readonly relative: (from: unknown, to: unknown) => Effect.Effect<string, OriginalFailure>;
  readonly replace: (value: SettingsDocument) => Effect.Effect<void, OriginalFailure>;
  readonly resolve: (value: unknown) => Effect.Effect<string, OriginalFailure>;
  readonly set: (key: string, value: unknown) => Effect.Effect<void, OriginalFailure>;
  readonly trim: (value: unknown) => Effect.Effect<string, OriginalFailure>;
}

/** Shares one native store across separately revocable synchronous calls.
 * **Example** (Bind a borrowed call)
 * ```ts
 * import { SettingsStore } from './SettingsStore.service.js'
 * import type { SynchronousCall } from './lib/SynchronousHost.service.js'
 * export const read = (call: SynchronousCall) => SettingsStore.use(store => store.forCall(call).get('theme'))
 * ```
 * @category services
 * @since 0.0.0
 */
export class SettingsStore extends Context.Service<
  SettingsStore,
  {
    readonly forCall: (call: SynchronousCall) => SettingsStoreOperations;
  }
>()($I`SettingsStore`) {}
