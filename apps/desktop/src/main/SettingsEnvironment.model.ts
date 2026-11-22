import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";
import { AppSettings } from "../shared/types/Desktop.model.js";

const $I = $DesktopId.create("main/SettingsEnvironment.model");
/** Captures effective host defaults and the pre-construction existence decision; no ambient host access occurs in settings logic.
 * **Example** (Inspect the host-default contract)
 * ```ts
 * import { SettingsEnvironment } from './SettingsEnvironment.model.js'
 * import * as S from 'effect/Schema'
 * S.is(SettingsEnvironment)({}) // => false
 * ```
 * @category schemas
 * @since 0.0.0
 */
export const SettingsEnvironment = S.Struct({
  effectiveDefaults: AppSettings,
  defaultDownloadPath: S.String,
  oldDefaultDownloadPath: S.String,
  portable: S.Boolean,
  portableRoot: S.String,
  previousPortableRoot: S.String,
  hadExistingStore: S.Boolean,
}).pipe(
  $I.annoteSchema("SettingsEnvironment", { description: "Captured settings persistence and migration configuration." })
);
/** Host configuration supplied once before settings initialization.
 * @category type-level
 * @since 0.0.0
 */
export type SettingsEnvironment = typeof SettingsEnvironment.Type;
