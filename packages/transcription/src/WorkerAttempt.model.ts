import * as S from "effect/Schema";
import { PipelineResult } from "./Pipeline.model.js";
import { Environment } from "./TranscriptionHost.model.js";
import { WorkerStartMessage } from "./Worker.model.js";
export const WorkerAttemptInput = S.Struct({
  execPath: S.String,
  workerScript: S.String,
  execArgv: S.String.pipe(S.Array, S.optional),
  env: S.optional(Environment),
  start: WorkerStartMessage,
  signal: S.instanceOf(AbortSignal),
});
export type WorkerAttemptInput = typeof WorkerAttemptInput.Type;
export const WorkerAttemptResult = S.Struct({ result: PipelineResult, durationMs: S.Finite });
export type WorkerAttemptResult = typeof WorkerAttemptResult.Type;
export class WorkerExitFailure extends S.TaggedError<WorkerExitFailure, { readonly brand: unique symbol }>()(
  "WorkerExitFailure",
  { code: S.NullOr(S.Finite), signal: S.NullOr(S.String), legacyMessage: S.String }
) {}
