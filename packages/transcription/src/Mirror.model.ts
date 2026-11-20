import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
export const DownloadMirror = LiteralKit(["auto", "cn", "global"]);
export type DownloadMirror = typeof DownloadMirror.Type;
export const MirrorDecisionInput = S.Struct({
  countryCode: S.String.pipe(S.optional, S.mutableKey),
  env: S.Record(S.String, S.String.pipe(S.UndefinedOr, S.mutableKey)).pipe(S.optional, S.mutableKey),
  language: S.String.pipe(S.optional, S.mutableKey),
  locales: S.Array(S.String).pipe(S.optional, S.mutableKey),
  mirror: S.String.pipe(S.optional, S.mutableKey),
  timeZone: S.String.pipe(S.optional, S.mutableKey),
});
export type MirrorDecisionInput = typeof MirrorDecisionInput.Type;
export const ModelDownloadSpec = S.Struct({ fileName: S.mutableKey(S.String), url: S.mutableKey(S.String) });
export type ModelDownloadSpec = typeof ModelDownloadSpec.Type;
