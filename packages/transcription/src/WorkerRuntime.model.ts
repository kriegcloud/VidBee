import * as S from "effect/Schema";
import { AsrTierId, GpuKind, SherpaExecutionProvider, WorkerRuntimeLayer } from "./Literal.model.js";
import { Environment } from "./TranscriptionHost.model.js";
export const ResolveWorkerRuntimeInput = S.Struct({
  envPath: S.String.pipe(S.NullOr, S.optional),
  bundledPath: S.String.pipe(S.NullOr, S.optional),
  systemPaths: S.String.pipe(S.Array, S.mutable, S.optional),
  electronPath: S.optional(S.String),
  forceLayer: WorkerRuntimeLayer.pipe(S.NullOr, S.optional),
  minNodeMajor: S.optional(S.Finite),
  lookUpSystem: S.optional(S.Boolean),
});
export type ResolveWorkerRuntimeInput = typeof ResolveWorkerRuntimeInput.Type;
export const RuntimeCommand = S.Struct({
  command: S.String,
  argv: S.Array(S.String),
  timeoutMs: S.Finite,
  env: S.optional(Environment),
});
export type RuntimeCommand = typeof RuntimeCommand.Type;
export const ProbeWorkerProviderInput = S.Struct({
  execPath: S.String,
  execArgv: S.String.pipe(S.Array, S.mutable, S.optional),
  workerScript: S.String,
  modelsDir: S.String,
  provider: SherpaExecutionProvider,
  asrTier: S.optional(AsrTierId),
  benchmark: S.optional(S.Boolean),
  env: S.optional(Environment),
  timeoutMs: S.optional(S.Finite),
});
export type ProbeWorkerProviderInput = typeof ProbeWorkerProviderInput.Type;
export const ProviderSelectionInput = S.Struct({
  arch: S.optional(S.String),
  platform: S.optional(S.String),
  gpuKinds: S.Array(GpuKind).pipe(S.optional),
});
export type ProviderSelectionInput = typeof ProviderSelectionInput.Type;
