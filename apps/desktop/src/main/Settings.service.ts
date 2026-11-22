import { $DesktopId } from "@vidbee/identity/packages";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { SettingsDecodeError } from "../shared/Settings.errors.js";
import type {
  SettingKey,
  SettingsDocument,
  SettingsPatch,
  SettingsView,
  SettingValue,
} from "../shared/Settings.model.js";
import type { OriginalFailure } from "./lib/OriginalFailure.errors.js";
import type { SynchronousCall } from "./lib/SynchronousHost.service.js";

const $I = $DesktopId.create("main/Settings.service");
/** Application settings operations. Raw methods preserve permissive compatibility; typed reads project without repairing storage, and typed batches retain caller order.
 * **Example** (Read typed preferences after initialization)
 * ```ts
 * import { DesktopSettings } from './Settings.service.js'
 * import * as Effect from 'effect/Effect'
 * export const operations = Effect.map(DesktopSettings, settings => settings.forCall)
 * // Supply the initialized layer and current call authority; invalid known fields use host defaults.
 * ```
 * @category services
 * @since 0.0.0
 */
export interface SettingsOperations {
  readonly freshLocale: Effect.Effect<void, OriginalFailure>;
  readonly get: (key: string) => Effect.Effect<unknown, OriginalFailure>;
  readonly getAll: Effect.Effect<SettingsDocument, OriginalFailure>;
  readonly getTyped: (key: SettingKey) => Effect.Effect<SettingValue, OriginalFailure | SettingsDecodeError>;
  readonly initialize: Effect.Effect<void, OriginalFailure>;
  readonly markWhatsNewSeen: Effect.Effect<void, OriginalFailure>;
  readonly reset: Effect.Effect<void, OriginalFailure>;
  readonly set: (key: string, value: unknown) => Effect.Effect<void, OriginalFailure>;
  readonly setAll: (entries: ReadonlyArray<readonly [string, unknown]>) => Effect.Effect<void, OriginalFailure>;
  readonly setTyped: (updates: SettingsPatch) => Effect.Effect<void, OriginalFailure>;
  readonly shouldPromptWhatsNew: Effect.Effect<boolean, OriginalFailure>;
  readonly view: Effect.Effect<SettingsView, OriginalFailure | SettingsDecodeError>;
}

/** Shares settings logic while binding each native operation to its caller's revocable authority.
 * **Example** (Read with the borrowed authority)
 * ```ts
 * import { DesktopSettings } from './Settings.service.js'
 * import type { SynchronousCall } from './lib/SynchronousHost.service.js'
 * export const theme = (call: SynchronousCall) => DesktopSettings.use(settings => settings.forCall(call).get('theme'))
 * ```
 * @category services
 * @since 0.0.0
 */
export class DesktopSettings extends Context.Service<
  DesktopSettings,
  {
    readonly forCall: (call: SynchronousCall) => SettingsOperations;
  }
>()($I`DesktopSettings`) {}
