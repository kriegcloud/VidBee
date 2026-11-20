import * as S from "effect/Schema";
import { GpuKind, MachineClass, OsKind } from "./Literal.model.js";
export const GpuDeviceHint = S.Struct({
  active: S.Boolean.pipe(S.optional, S.mutableKey),
  deviceString: S.String.pipe(S.optional, S.mutableKey),
  vendorId: S.Finite.pipe(S.optional, S.mutableKey),
  vendorString: S.String.pipe(S.optional, S.mutableKey),
});
export type GpuDeviceHint = typeof GpuDeviceHint.Type;
export const MachineProfile = S.Struct({
  arch: S.mutableKey(S.String),
  class: S.mutableKey(MachineClass),
  cpuCount: S.mutableKey(S.Finite),
  gpu: S.mutableKey(GpuKind),
  gpuName: S.mutableKey(S.Union([S.String, S.Null])),
  os: S.mutableKey(OsKind),
  ramBytes: S.mutableKey(S.Finite),
});
export type MachineProfile = typeof MachineProfile.Type;
export const RecommendAsrInput = S.Struct({
  arch: S.String.pipe(S.optional, S.mutableKey),
  cpuCount: S.mutableKey(S.Finite),
  gpu: GpuKind.pipe(S.optional, S.mutableKey),
  language: S.mutableKey(S.String),
  os: OsKind.pipe(S.optional, S.mutableKey),
  ramBytes: S.mutableKey(S.Finite),
});
export type RecommendAsrInput = typeof RecommendAsrInput.Type;
export const AppleSiliconInput = S.Struct({ arch: S.String, platform: S.String, cpuModel: S.optional(S.String) });
export type AppleSiliconInput = typeof AppleSiliconInput.Type;
export const GpuProfileInput = S.Struct({
  ...AppleSiliconInput.fields,
  devices: GpuDeviceHint.pipe(S.Array, S.optional),
  gpu: S.optional(GpuKind),
  gpuName: S.optional(S.Union([S.String, S.Null])),
});
export type GpuProfileInput = typeof GpuProfileInput.Type;
export const AsrModelPaths = S.Struct({
  decoder: S.mutableKey(S.Union([S.String, S.Null])),
  encoder: S.mutableKey(S.Union([S.String, S.Null])),
  frontend: S.mutableKey(S.Union([S.String, S.Null])),
  joiner: S.mutableKey(S.Union([S.String, S.Null])),
  model: S.mutableKey(S.Union([S.String, S.Null])),
  tokenizer: S.mutableKey(S.Union([S.String, S.Null])),
  tokens: S.mutableKey(S.Union([S.String, S.Null])),
});
export type AsrModelPaths = typeof AsrModelPaths.Type;
