import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as PlatformError from "effect/PlatformError";
import * as S from "effect/Schema";

export const ProcessBackend = LiteralKit(["Raw", "Native"]);
export type ProcessBackend = typeof ProcessBackend.Type;
export const ProcessSignal = LiteralKit(["SIGTERM", "SIGKILL", "SIGINT"]);
export type ProcessSignal = typeof ProcessSignal.Type;
export const ProcessDisposition = LiteralKit(["ignore", "pipe", "inherit"]);
export type ProcessDisposition = typeof ProcessDisposition.Type;
export const ProcessOutputConsumption = LiteralKit(["deliver", "unread"]);
export type ProcessOutputConsumption = typeof ProcessOutputConsumption.Type;
export const RawErrorObservation = LiteralKit(["observe", "once", "omit"]);
export type RawErrorObservation = typeof RawErrorObservation.Type;
export const RawSpawnObservationPolicy = LiteralKit(["once", "omit"]);
export type RawSpawnObservationPolicy = typeof RawSpawnObservationPolicy.Type;
export const RawExitObservation = LiteralKit(["observe", "omit"]);
export type RawExitObservation = typeof RawExitObservation.Type;
export const RawObservationStart = LiteralKit(["immediate", "on-demand"]);
export type RawObservationStart = typeof RawObservationStart.Type;
export const RawCloseObservation = LiteralKit(["observe", "once", "on-demand", "omit"]);
export type RawCloseObservation = typeof RawCloseObservation.Type;
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
  stdoutConsumption: S.optional(ProcessOutputConsumption),
  stderrConsumption: S.optional(ProcessOutputConsumption),
  rawObservationStart: S.optional(RawObservationStart),
  rawErrorObservation: S.optional(RawErrorObservation),
  rawSpawnObservation: S.optional(RawSpawnObservationPolicy),
  rawExitObservation: S.optional(RawExitObservation),
  rawCloseObservation: S.optional(RawCloseObservation),
  extendedLifecycle: S.optional(S.Boolean),
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
export const RawSpawnObservation = S.TaggedStruct("rawSpawn", {});
export type RawSpawnObservation = typeof RawSpawnObservation.Type;
export const ProcessEvent = S.Union([
  RawSpawnObservation,
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

/** Live host signalling observation, independent of exit and signal acknowledgement. */
export const LiveSignallingState = S.Union([
  S.TaggedStruct("Raw", { killed: S.Boolean }),
  S.TaggedStruct("Native", {}),
]);
export type LiveSignallingState = typeof LiveSignallingState.Type;
