import * as S from "effect/Schema";
export const MinimalModelFillOptions = S.Struct({ delaysMs: S.Finite.pipe(S.Array, S.optional) });
export type MinimalModelFillOptions = typeof MinimalModelFillOptions.Type;
