import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
export const ChineseScript = LiteralKit(["hans", "hant"]);
export type ChineseScript = typeof ChineseScript.Type;
export const CaptionFormat = LiteralKit(["ass", "srt", "vtt"]);
export const CaptionCue = S.Struct({
  endMs: S.mutableKey(S.Finite),
  startMs: S.mutableKey(S.Finite),
  text: S.mutableKey(S.String),
  speaker: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
});
export type CaptionCue = typeof CaptionCue.Type;
export const CaptionTrack = S.Struct({
  format: S.mutableKey(CaptionFormat),
  language: S.mutableKey(S.Union([S.String, S.Null])),
  path: S.String.pipe(S.optional, S.mutableKey),
  text: S.mutableKey(S.String),
  title: S.String.pipe(S.optional, S.mutableKey),
});
export type CaptionTrack = typeof CaptionTrack.Type;
