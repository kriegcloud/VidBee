import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $I = $DesktopId.create("main/logging/Otlp.model");

/** Captured environment; endpoint discovery is deferred until enabled.
 * **Example** (Default-off configuration)
 * ```ts
 * import { OtlpConfiguration } from "./Otlp.model.js"
 * console.assert(OtlpConfiguration.make({ enabled: false, endpoint: "", version: "2.4.0" }).enabled === false)
 * ```
 * @category models
 * @since 0.0.0
 */
export class OtlpConfiguration extends S.Opaque<OtlpConfiguration, { readonly brand: unique symbol }>()(
  S.Struct({ enabled: S.Boolean, endpoint: S.String, version: S.String }).pipe(
    $I.annoteSchema("OtlpConfiguration", {
      description: "Captured explicit tracing switch, collector endpoint and application version.",
    })
  )
) {}

/** Only the exact environment value 1 enables export.
 * **Example** (Remain off for other truthy text)
 * ```ts
 * import { otlpEnabled } from "./Otlp.model.js"
 * console.assert(otlpEnabled("true") === false)
 * ```
 * @category configuration
 * @since 0.0.0
 */
export const otlpEnabled = (value: string | undefined): boolean => value === "1";
