import * as S from "effect/Schema";
export const CountRow = S.Struct({ n: S.Finite });
export const ExistsRow = S.Struct({ present: S.Finite });
export const IdRow = S.Struct({ id: S.String });
