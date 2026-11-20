import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
export const ModelHttpMethod = LiteralKit(["GET", "HEAD"]);
export const ModelRequest = S.Struct({
  url: S.String,
  method: ModelHttpMethod,
  signal: S.optional(S.instanceOf(AbortSignal)),
  timeoutMs: S.optional(S.Finite),
});
export type ModelRequest = typeof ModelRequest.Type;
