import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $I = $DesktopId.create("main/logging/Otlp.model");

/** Captured environment; endpoint discovery is deferred until enabled.
 * **Example** (Default-off configuration)
 * ```ts
 * OtlpConfiguration.make({ enabled: false, endpoint: "http://127.0.0.1:4318/v1/traces", version: "2.4.0" })
 * ```
 * @category models
 * @since 0.0.0
 */
export const OtlpConfiguration = S.Struct({ enabled: S.Boolean, endpoint: S.String, version: S.String }).pipe(
  $I.annoteSchema("OtlpConfiguration", {
    description: "Captured explicit tracing switch, collector endpoint and application version.",
  })
);
export type OtlpConfiguration = typeof OtlpConfiguration.Type;

/** Only the exact environment value 1 enables export.
 * **Example** (Remain off for other truthy text)
 * ```ts
 * otlpEnabled("true") // false
 * ```
 * @category configuration
 * @since 0.0.0
 */
export const otlpEnabled = (value: string | undefined): boolean => value === "1";
