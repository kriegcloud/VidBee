import * as S from "effect/Schema";
import { AsrTierId, ModelGroup } from "./Literal.model.js";
import { ModelFileSpec } from "./Model.model.js";

export { DirectoryAssessment as InstalledFileState } from "./Model.model.js";
export const ModelsOptions = S.Struct({
  modelsDir: S.String,
  catalog: ModelFileSpec.pipe(S.Array, S.optional),
  attemptTimeoutMs: S.optional(S.Finite),
});
export type ModelsOptions = typeof ModelsOptions.Type;
export const EnsureReadyOptions = S.Struct({
  groups: ModelGroup.pipe(S.Array, S.optional),
  tiers: AsrTierId.pipe(S.Array, S.optional),
});
export type EnsureReadyOptions = typeof EnsureReadyOptions.Type;
