import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DesktopSettings } from "./Settings.service.js";
import { SettingsStore } from "./SettingsStore.service.js";
import { makeSettings } from "./settings.js";
/** Builds settings logic over one borrowed driver. Initialization stays explicit so static boot order and its synchronous failure boundary remain unchanged.
 * **Example** (Acquire the settings contract)
 * ```ts
 * import { SettingsLive } from './Settings.layer.js'
 * import * as Layer from 'effect/Layer'
 * export const acquire = Layer.build(SettingsLive)
 * // Supply SettingsStore and build within the application scope, then initialize once.
 * ```
 * @category layers
 * @since 0.0.0
 */
export const SettingsLive = Layer.effect(DesktopSettings)(
  Effect.map(SettingsStore, (store) => ({ forCall: (call) => makeSettings(store.forCall(call)) }))
);
