import { AppRpcs } from "./App.rpc.js";
import { SettingsRpcs } from "./Settings.rpc.js";
import { WindowRpcs } from "./Window.rpc.js";

/** The single mounted foundation group contains all application, settings and window procedures.
 * **Example** (Inspect complete foundation membership)
 * ```ts
 * import { DesktopRpcs } from './Desktop.rpc.js'
 * DesktopRpcs.requests.has('Settings.GetAll') // => true
 * DesktopRpcs.requests.has('Window.Close') // => true
 * ```
 * @category rpc
 * @since 0.0.0
 */
export const DesktopRpcs = SettingsRpcs.merge(AppRpcs, WindowRpcs);
