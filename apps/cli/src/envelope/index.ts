import { dual } from "effect/Function";
import * as P from "effect/Predicate";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import type { Envelope, ErrorCode, ErrorEnvelope, RenderOptions } from "../Envelope.model.js";

export * from "../Envelope.model.js";

export const ExitCode = {
  /** probe success | detached download enqueue success | wait-mode success */
  OK: 0,
  /** wait-mode terminated non-success (failed | retry-scheduled) */
  WAIT_NON_SUCCESS: 1,
  /** argv parse error (incl. unknown --vidbee-*) */
  ARG_ERROR: 2,
  /** desktop / api unreachable: descriptor missing, conn refused, handshake failed */
  HOST_UNREACHABLE: 3,
  /** auth failure */
  AUTH_FAILED: 4,
  /** internal contract error (schema mismatch, version mismatch) */
  CONTRACT_ERROR: 5,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

const compact = S.encodeResult(S.fromJsonString(S.Unknown));
const pretty = S.encodeResult(S.fromJsonString(S.Unknown, { space: 2 }));
export const renderEnvelope: {
  (env: Envelope, opts?: RenderOptions): string;
  (opts?: RenderOptions): (env: Envelope) => string;
} = dual(
  (args) =>
    args.length >= 2 ||
    (args.length === 1 &&
      (args[0] === null ||
        (args[0] !== undefined && typeof args[0] !== "object") ||
        (typeof args[0] === "object" && args[0] !== null && "ok" in args[0]))),
  (env: Envelope, opts: RenderOptions = {}): string =>
    P.isTruthy(opts.pretty) ? Result.getOrThrow(pretty(env)) : Result.getOrThrow(compact(env))
);

/**
 * Map an ErrorCode to its corresponding exit code per §4.4. Anything not
 * in the explicit map falls through to `ARG_ERROR` (2) so a bug here can
 * never silently produce exit 0.
 */
export function exitCodeForError(code: ErrorCode): ExitCode {
  switch (code) {
    case "DESKTOP_NOT_READY":
    case "API_UNREACHABLE":
    case "HANDSHAKE_FAILED":
      return ExitCode.HOST_UNREACHABLE;
    case "AUTH_FAILED":
    case "TOKEN_EXPIRED":
      return ExitCode.AUTH_FAILED;
    case "CONTRACT_VERSION_MISMATCH":
    case "CONTRACT_SCHEMA_MISMATCH":
      return ExitCode.CONTRACT_ERROR;
    case "PROBE_OUTPUT_TOO_LARGE":
      return ExitCode.WAIT_NON_SUCCESS;
    case "NOT_IMPLEMENTED":
      return ExitCode.CONTRACT_ERROR;
    default:
      return ExitCode.ARG_ERROR;
  }
}

export const errorEnvelope: {
  (code: ErrorCode, message: string, details?: Record<string, unknown>): ErrorEnvelope;
  (message: string, details?: Record<string, unknown>): (code: ErrorCode) => ErrorEnvelope;
} = dual(
  (args) => args.length >= 3 || (args.length === 2 && typeof args[1] === "string"),
  (code: ErrorCode, message: string, details?: Record<string, unknown>): ErrorEnvelope =>
    details === undefined ? { ok: false, code, message } : { ok: false, code, message, details }
);
