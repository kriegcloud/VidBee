import * as S from "effect/Schema";
import { GpuDeviceHint } from "./Asr.model.js";
import { GpuKind } from "./Literal.model.js";
export const Environment = S.Record(S.String, S.UndefinedOr(S.String));
export type Environment = typeof Environment.Type;
export const HostSnapshot = S.Struct({
  platform: S.String,
  arch: S.String,
  pid: S.Finite,
  execPath: S.String,
  cwd: S.String,
  temporaryDirectory: S.String,
  resourceDirectories: S.Array(S.String),
  environment: Environment,
  cpuModel: S.String,
  cpuCount: S.Finite,
  ramBytes: S.Finite,
  locale: S.String,
  timeZone: S.String,
});
export type HostSnapshot = typeof HostSnapshot.Type;
export const MachineOptions = S.Struct({
  platform: S.optional(S.String),
  arch: S.optional(S.String),
  cpuModel: S.optional(S.String),
  devices: GpuDeviceHint.pipe(S.Array, S.optional),
  gpu: S.optional(GpuKind),
  gpuName: S.String.pipe(S.NullOr, S.optional),
});
export type MachineOptions = typeof MachineOptions.Type;
