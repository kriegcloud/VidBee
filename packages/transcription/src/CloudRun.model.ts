import * as S from "effect/Schema";
export const CloudRunInput = S.Struct({
  accountId: S.String,
  taskId: S.String,
  sourceFilePath: S.String,
  modelId: S.String,
  ffmpegPath: S.String,
  workRoot: S.String,
  signal: S.instanceOf(AbortSignal),
});
export type CloudRunInput = typeof CloudRunInput.Type;
export const CloudClipBounds = S.Struct({ start: S.Unknown, end: S.Unknown });
export const CloudSavedClip = S.StructWithRest(
  S.Struct({
    start: S.Finite,
    end: S.Finite,
    requestId: S.mutableKey(S.String),
    result: S.Unknown.pipe(S.optional, S.mutableKey),
  }),
  [S.Record(S.String, S.Unknown)]
);
export type CloudSavedClip = typeof CloudSavedClip.Type;
export const CloudSavedResult = S.StructWithRest(
  S.Struct({ text: S.String, language: S.String.pipe(S.NullOr, S.optional) }),
  [S.Record(S.String, S.Unknown)]
);
export const CloudProgressEnvelope = S.StructWithRest(S.Struct({ accountId: S.Unknown, clips: S.Unknown }), [
  S.Record(S.String, S.Unknown),
]);
