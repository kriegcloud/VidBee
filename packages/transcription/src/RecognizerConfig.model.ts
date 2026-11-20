import * as S from "effect/Schema";
import { AsrTierId, SherpaExecutionProvider } from "./Literal.model.js";
export const RecognizerConfigInput = S.Struct({
  tier: AsrTierId,
  numThreads: S.optional(S.Finite),
  provider: S.optional(SherpaExecutionProvider),
  debug: S.optional(S.Finite),
});
export type RecognizerConfigInput = typeof RecognizerConfigInput.Type;
