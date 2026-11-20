import * as S from "effect/Schema";
export const ConcurrencySettings = S.Struct({
  maxConcurrentDownloads: S.Unknown,
  maxConcurrentTranscriptions: S.Unknown,
});
export type ConcurrencySettings = typeof ConcurrencySettings.Type;
