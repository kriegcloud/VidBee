import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as PlatformError from "effect/PlatformError";
import * as S from "effect/Schema";

export const ProcessSignal = LiteralKit(["SIGTERM", "SIGKILL"]);
export type ProcessSignal = typeof ProcessSignal.Type;
export const ProcessDisposition = LiteralKit(["ignore", "pipe", "inherit"]);
export type ProcessDisposition = typeof ProcessDisposition.Type;
export const ProcessSpec = S.Struct({
  command: S.String,
  argv: S.Array(S.String),
  env: S.UndefinedOr(S.Record(S.String, S.UndefinedOr(S.String))),
  extendEnv: S.Boolean,
  cwd: S.UndefinedOr(S.String),
  detached: S.Boolean,
  windowsHide: S.Boolean,
  stdin: ProcessDisposition,
  stdout: ProcessDisposition,
  stderr: ProcessDisposition,
  abortSignal: S.optional(S.instanceOf(AbortSignal)),
});
export type ProcessSpec = typeof ProcessSpec.Type;
const NativeFailure = S.TaggedStruct("Failure", { error: S.instanceOf(PlatformError.PlatformError) });
export const NativeOutcome = S.Union([S.TaggedStruct("ExitCode", { code: S.Finite }), NativeFailure]);
export type NativeOutcome = typeof NativeOutcome.Type;
export const ProcessOutcome = S.Union([
  S.TaggedStruct("Raw", { code: S.NullOr(S.Finite), signal: S.NullOr(S.String), killed: S.Boolean }),
  S.TaggedStruct("Native", { result: NativeOutcome }),
]);
export type ProcessOutcome = typeof ProcessOutcome.Type;
export const ProcessEvent = S.Union([
  S.TaggedStruct("stdout", { chunk: S.Uint8Array }),
  S.TaggedStruct("stderr", { chunk: S.Uint8Array }),
  S.TaggedStruct("stdoutEnd", {}),
  S.TaggedStruct("stderrEnd", {}),
  S.TaggedStruct("rawError", { error: S.Unknown }),
  S.TaggedStruct("rawExit", { code: S.NullOr(S.Finite), signal: S.NullOr(S.String) }),
  S.TaggedStruct("nativeExit", { result: NativeOutcome }),
  S.TaggedStruct("complete", { outcome: ProcessOutcome }),
]);
export type ProcessEvent = typeof ProcessEvent.Type;
