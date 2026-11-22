import { $StandardsId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";
/** ProbeReport validates compiler probe output.
 * @category schemas
 * @since 0.0.0
 */
export const ProbeReport = S.Struct({
  files: S.Boolean,
  shadow: S.Boolean,
  exportsResolved: S.Boolean,
  wrapped: S.Boolean,
  intersection: S.Boolean,
  union: S.Boolean,
  diagnosticCount: S.Int,
  closed: S.Boolean,
  failed: S.Boolean,
  reacquired: S.Boolean,
  interrupted: S.Boolean,
}).pipe(
  $StandardsId
    .create("test/Probe.model")
    .annoteSchema("ProbeReport", { description: "Validated ProbeReport fixture data." })
);
/** Decoded ProbeReport output.
 * @category type-level
 * @since 0.0.0
 */
export type ProbeReport = typeof ProbeReport.Type;
/** CoverageProbeReport validates compiler probe output.
 * @category schemas
 * @since 0.0.0
 */
export const CoverageProbeReport = S.Struct({
  complete: S.Boolean,
  javascript: S.Boolean,
  declaration: S.Boolean,
  passed: S.Boolean,
  supplemental: S.Boolean,
  cleaned: S.Boolean,
  unchanged: S.Boolean,
}).pipe(
  $StandardsId
    .create("test/Probe.model")
    .annoteSchema("CoverageProbeReport", { description: "Validated CoverageProbeReport fixture data." })
);
/** Decoded CoverageProbeReport output.
 * @category type-level
 * @since 0.0.0
 */
export type CoverageProbeReport = typeof CoverageProbeReport.Type;
