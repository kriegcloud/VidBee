import * as S from "effect/Schema";
export const DisplaySize = S.Struct({ width: S.Finite, height: S.Finite });
export type DisplaySize = typeof DisplaySize.Type;
