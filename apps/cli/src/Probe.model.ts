import * as S from "effect/Schema";
import { ErrorEnvelope } from "./Envelope.model.js";
export const ProbeOptions = S.Struct({
  argv: S.Array(S.String).pipe(S.mutableKey),
  ytDlpPath: S.optional(S.String).pipe(S.mutableKey),
  stdoutMaxBytes: S.optional(S.Finite).pipe(S.mutableKey),
  stderrTailBytes: S.optional(S.Finite).pipe(S.mutableKey),
});
export type ProbeOptions = typeof ProbeOptions.Type;
export const ProbeResult = S.Union([
  S.Struct({
    kind: S.Literal("success").pipe(S.mutableKey),
    stdout: S.String.pipe(S.mutableKey),
    stderr: S.String.pipe(S.mutableKey),
    exitCode: S.Finite.pipe(S.mutableKey),
    binary: S.String.pipe(S.mutableKey),
  }),
  S.Struct({ kind: S.Literal("error").pipe(S.mutableKey), envelope: ErrorEnvelope.pipe(S.mutableKey) }),
]);
export type ProbeResult = typeof ProbeResult.Type;
