import * as S from "effect/Schema";
import { GpuKind, MachineClass, OsKind, SherpaExecutionProvider } from "./Literal.model.js";
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
export const SherpaProviderProbeResult = S.Struct({
  durationMs: S.mutableKey(S.Union([S.Finite, S.Null])),
  error: S.mutableKey(S.Union([S.String, S.Null])),
  ok: S.mutableKey(S.Boolean),
  provider: S.mutableKey(SherpaExecutionProvider),
  stderr: S.String.pipe(S.optional, S.mutableKey),
});
export type SherpaProviderProbeResult = typeof SherpaProviderProbeResult.Type;
export const SherpaProviderSelection = S.Struct({
  cacheable: S.mutableKey(S.Boolean),
  candidates: SherpaExecutionProvider.pipe(S.Array, S.mutable, S.mutableKey),
  provider: S.mutableKey(SherpaExecutionProvider),
  reason: S.mutableKey(S.String),
});
export type SherpaProviderSelection = typeof SherpaProviderSelection.Type;
