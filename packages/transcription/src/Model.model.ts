import * as S from "effect/Schema";
import {
  AsrFamily,
  AsrLanguageGroup,
  AsrTierId,
  GpuKind,
  MachineClass,
  ModelGroup,
  ModelRole,
  OsKind,
} from "./Literal.model.js";
export const DirectoryMemberRequirement = S.Struct({
  name: S.mutableKey(S.String),
  minBytes: S.mutableKey(S.Finite),
  sha256: S.mutableKey(S.String),
  json: S.Boolean.pipe(S.optional, S.mutableKey),
});
export type DirectoryMemberRequirement = typeof DirectoryMemberRequirement.Type;
export const ModelFileSpec = S.Struct({
  id: S.mutableKey(S.String),
  role: S.mutableKey(ModelRole),
  group: S.mutableKey(ModelGroup),
  tier: AsrTierId.pipe(S.optional, S.mutableKey),
  fileName: S.mutableKey(S.String),
  url: S.mutableKey(S.String),
  sha256: S.String.pipe(S.optional, S.mutableKey),
  checksumManifest: S.String.pipe(S.optional, S.mutableKey),
  directoryMembers: DirectoryMemberRequirement.pipe(S.Array, S.optional, S.mutableKey),
  required: S.mutableKey(S.Boolean),
});
export type ModelFileSpec = typeof ModelFileSpec.Type;
export const AsrTierStatus = S.Struct({
  id: S.mutableKey(AsrTierId),
  family: S.mutableKey(AsrFamily),
  ready: S.mutableKey(S.Boolean),
  bytes: S.mutableKey(S.Finite),
  qualityRank: S.mutableKey(S.Finite),
});
export type AsrTierStatus = typeof AsrTierStatus.Type;
export const MachineProfileStatus = S.Struct({
  arch: S.mutableKey(S.String),
  class: S.mutableKey(MachineClass),
  cpuCount: S.mutableKey(S.Finite),
  gpu: S.mutableKey(GpuKind),
  gpuName: S.mutableKey(S.Union([S.String, S.Null])),
  os: S.mutableKey(OsKind),
  ramBytes: S.mutableKey(S.Finite),
});
export type MachineProfileStatus = typeof MachineProfileStatus.Type;
export const ModelDownloadProgress = S.Struct({
  url: S.mutableKey(S.String),
  received: S.mutableKey(S.Finite),
  total: S.mutableKey(S.Union([S.Finite, S.Null])),
  tier: AsrTierId.pipe(S.optional, S.mutableKey),
});
export type ModelDownloadProgress = typeof ModelDownloadProgress.Type;
export const ModelStatus = S.Struct({
  pendingTiers: AsrTierId.pipe(S.Array, S.mutable, S.optional, S.mutableKey),
  ready: S.mutableKey(S.Boolean),
  version: S.mutableKey(S.String),
  bytes: S.mutableKey(S.Finite),
  files: S.Struct({
    id: S.mutableKey(S.String),
    present: S.mutableKey(S.Boolean),
    path: S.mutableKey(S.String),
    bytes: S.mutableKey(S.Finite),
  }).pipe(S.Array, S.mutable, S.mutableKey),
  tiers: AsrTierStatus.pipe(S.Array, S.mutable, S.mutableKey),
  downloading: S.mutableKey(S.Union([ModelDownloadProgress, S.Null])),
  downloads: ModelDownloadProgress.pipe(S.Array, S.mutable, S.mutableKey),
  machine: MachineProfileStatus.pipe(S.optional, S.mutableKey),
  recommended: AsrTierId.pipe(S.Array, S.mutable, S.optional, S.mutableKey),
  language: S.String.pipe(S.optional, S.mutableKey),
});
export type ModelStatus = typeof ModelStatus.Type;
export const AsrTierInfo = S.Struct({
  id: S.mutableKey(AsrTierId),
  family: S.mutableKey(AsrFamily),
  modelId: S.mutableKey(S.String),
  archiveName: S.mutableKey(S.String),
  bytesHint: S.mutableKey(S.Finite),
  minRamGB: S.mutableKey(S.Finite),
  qualityRank: S.mutableKey(S.Finite),
  languages: AsrLanguageGroup.pipe(S.Array, S.mutableKey),
  performance: S.mutableKey(
    S.Struct({
      machine: S.mutableKey(S.String),
      speed: S.mutableKey(S.String),
      quality: S.mutableKey(S.String),
    })
  ),
});
export type AsrTierInfo = typeof AsrTierInfo.Type;
export const ModelPrepStatus = S.Struct({
  downloading: S.mutableKey(S.Boolean),
  percent: S.mutableKey(S.Finite),
  ready: S.mutableKey(S.Boolean),
});
export type ModelPrepStatus = typeof ModelPrepStatus.Type;
export const DirectoryAssessment = S.Struct({
  present: S.mutableKey(S.Boolean),
  bytes: S.mutableKey(S.Finite),
  issue: S.mutableKey(S.Union([S.String, S.Null])),
});
export type DirectoryAssessment = typeof DirectoryAssessment.Type;
