import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";

export const ErrorCode = LiteralKit([
  "PARSE_ERROR",
  "UNKNOWN_VIDBEE_FLAG",
  "INVALID_TARGET",
  "INVALID_PRIORITY",
  "INVALID_MAX_ATTEMPTS",
  "INVALID_TIMEOUT",
  "MISSING_VALUE",
  "UNEXPECTED_VALUE",
  "STDOUT_OUTPUT_DISALLOWED",
  "PROBE_OUTPUT_TOO_LARGE",
  "DESKTOP_NOT_READY",
  "API_UNREACHABLE",
  "HANDSHAKE_FAILED",
  "TOKEN_EXPIRED",
  "AUTH_FAILED",
  "CONTRACT_VERSION_MISMATCH",
  "CONTRACT_SCHEMA_MISMATCH",
  "NOT_IMPLEMENTED",
  "UNKNOWN_ERROR",
]);
export type ErrorCode = typeof ErrorCode.Type;
export const ErrorEnvelope = S.Struct({
  ok: S.Literal(false).pipe(S.mutableKey),
  code: ErrorCode.pipe(S.mutableKey),
  message: S.String.pipe(S.mutableKey),
  details: S.optional(S.Record(S.String, S.Unknown.pipe(S.mutableKey))).pipe(S.mutableKey),
});
export type ErrorEnvelope = typeof ErrorEnvelope.Type;
export const RenderOptions = S.Struct({ pretty: S.optional(S.Boolean).pipe(S.mutableKey) });
export type RenderOptions = typeof RenderOptions.Type;
const ProbeOutput = S.Struct({
  exitCode: S.Finite.pipe(S.mutableKey),
  stdout: S.String.pipe(S.mutableKey),
  stderr: S.String.pipe(S.mutableKey),
});
const WaitOutput = S.Struct({
  exitCode: S.Finite.pipe(S.mutableKey),
  stdoutTail: S.String.pipe(S.mutableKey),
  stderrTail: S.String.pipe(S.mutableKey),
});
export const ProbeSuccessEnvelope = S.Struct({
  ok: S.Literal(true).pipe(S.mutableKey),
  mode: S.Literal("probe").pipe(S.mutableKey),
  command: S.String.pipe(S.mutableKey),
  ytDlp: ProbeOutput.pipe(S.mutableKey),
});
export type ProbeSuccessEnvelope = typeof ProbeSuccessEnvelope.Type;
export const DownloadDetachedEnvelope = S.Struct({
  ok: S.Literal(true).pipe(S.mutableKey),
  mode: S.Literal("download").pipe(S.mutableKey),
  task: S.Struct({
    id: S.Unknown.pipe(S.mutableKey),
    status: S.Unknown.pipe(S.mutableKey),
    attempt: S.Unknown.pipe(S.mutableKey),
    maxAttempts: S.Unknown.pipe(S.mutableKey),
    command: S.String.pipe(S.mutableKey),
  }).pipe(S.mutableKey),
});
export type DownloadDetachedEnvelope = typeof DownloadDetachedEnvelope.Type;
export const DownloadWaitSuccessEnvelope = S.Struct({
  ok: S.Literal(true).pipe(S.mutableKey),
  mode: S.Literal("download").pipe(S.mutableKey),
  task: S.Unknown.pipe(S.mutableKey),
  ytDlp: WaitOutput.pipe(S.mutableKey),
});
export type DownloadWaitSuccessEnvelope = typeof DownloadWaitSuccessEnvelope.Type;
export const DownloadWaitFailureEnvelope = S.Struct({
  ok: S.Literal(false).pipe(S.mutableKey),
  mode: S.Literal("download").pipe(S.mutableKey),
  task: S.Unknown.pipe(S.mutableKey),
  ytDlp: WaitOutput.pipe(S.mutableKey),
});
export type DownloadWaitFailureEnvelope = typeof DownloadWaitFailureEnvelope.Type;
export const Envelope = S.Union([
  ProbeSuccessEnvelope,
  DownloadDetachedEnvelope,
  DownloadWaitSuccessEnvelope,
  DownloadWaitFailureEnvelope,
  ErrorEnvelope,
  S.Struct({
    ok: S.Literal(true).pipe(S.mutableKey),
    mode: S.Literal("subcommand").pipe(S.mutableKey),
    subcommand: S.String.pipe(S.mutableKey),
    result: S.Unknown.pipe(S.mutableKey),
  }),
]);
export type Envelope = typeof Envelope.Type;
