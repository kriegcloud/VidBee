import * as S from "effect/Schema";

/** The wrapper's progress observation, including its historical totalSize key. */
export const YtDlpProgressPayload = S.Struct({
  percent: S.Finite.pipe(S.optional, S.mutableKey),
  currentSpeed: S.String.pipe(S.optional, S.mutableKey),
  eta: S.String.pipe(S.optional, S.mutableKey),
  downloaded: S.String.pipe(S.optional, S.mutableKey),
  total: S.String.pipe(S.optional, S.mutableKey),
  totalSize: S.String.pipe(S.optional, S.mutableKey),
});
export type YtDlpProgressPayload = typeof YtDlpProgressPayload.Type;
