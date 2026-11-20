import * as S from "effect/Schema";
import { WorkerRuntimeLayer } from "./Literal.model.js";
export const WorkerRuntime = S.Struct({
  execPath: S.mutableKey(S.String),
  layer: S.mutableKey(WorkerRuntimeLayer),
  version: S.mutableKey(S.String),
  guarded: S.mutableKey(S.Boolean),
});
export type WorkerRuntime = typeof WorkerRuntime.Type;
