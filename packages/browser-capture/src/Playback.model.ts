import * as S from "effect/Schema";

export const MediaClock = S.Struct({
  currentTime: S.Finite.pipe(S.mutableKey),
  duration: S.Finite.pipe(S.mutableKey),
  paused: S.Boolean.pipe(S.mutableKey),
  ended: S.Boolean.pipe(S.mutableKey),
});
export type MediaClock = typeof MediaClock.Type;
export const DecodedQuality = S.Struct({
  fps: S.Finite.pipe(S.mutableKey),
  height: S.Finite.pipe(S.mutableKey),
  width: S.Finite.pipe(S.mutableKey),
  method: S.String.pipe(S.mutableKey),
});
export type DecodedQuality = typeof DecodedQuality.Type;
export const Playing = S.Struct({
  ...DecodedQuality.fields,
  duration: S.Finite.pipe(S.mutableKey),
  originX: S.Finite.pipe(S.mutableKey),
  originY: S.Finite.pipe(S.mutableKey),
});
export type Playing = typeof Playing.Type;
export const PlaybackProgress = S.Struct({
  currentTime: S.Finite.pipe(S.mutableKey),
  duration: S.Finite.pipe(S.mutableKey),
  percent: S.Finite.pipe(S.mutableKey),
});
export type PlaybackProgress = typeof PlaybackProgress.Type;
export const Position = S.Struct({ x: S.Finite.pipe(S.mutableKey), y: S.Finite.pipe(S.mutableKey) });
export type Position = typeof Position.Type;
export const Rectangle = S.Struct({
  ...Position.fields,
  width: S.Finite.pipe(S.mutableKey),
  height: S.Finite.pipe(S.mutableKey),
});
export type Rectangle = typeof Rectangle.Type;
