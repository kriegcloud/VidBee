import * as S from "effect/Schema";
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
});
export type ProbeReport = typeof ProbeReport.Type;
export const CoverageProbeReport = S.Struct({
  complete: S.Boolean,
  javascript: S.Boolean,
  declaration: S.Boolean,
  passed: S.Boolean,
  supplemental: S.Boolean,
  cleaned: S.Boolean,
  unchanged: S.Boolean,
});
export type CoverageProbeReport = typeof CoverageProbeReport.Type;
