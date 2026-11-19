import * as S from "effect/Schema";

/** Download-file inspection retains a shallow readonly result. */
export const FileStat = S.Struct({ size: S.Finite, isFile: S.Boolean });
export type FileStat = typeof FileStat.Type;
