import { makeSettingsApplication } from "../../SettingsApplication.service.js";

/** Settings mutations share the same application coordinator for typed RPCs and raw compatibility callers. The native shell supplies transcript scheduling and live-window broadcast callbacks.
 * **Example** (Inspect the shared update factory)
 * ```ts
 * import { settingsApplication } from './settings-service.js'
 * import type { SettingsApplicationPrimitives } from '../../SettingsApplication.service.js'
 * import type { SettingsOperations } from '../../Settings.service.js'
 * import type { SynchronousCall } from '../../lib/SynchronousHost.service.js'
 * export const update = ({settings,call,native}: {settings:SettingsOperations;call:SynchronousCall;native:SettingsApplicationPrimitives}) =>
 *   settingsApplication({settings,call,native}).update
 * // Updates persist before side effects; reset has its own application sequence.
 * ```
 * @category services
 * @since 0.0.0
 */
export const settingsApplication = makeSettingsApplication;
