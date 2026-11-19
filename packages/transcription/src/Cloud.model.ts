import * as S from "effect/Schema";

export const CloudTranscriptionModel = S.Struct({
  id: S.mutableKey(S.String),
  name: S.mutableKey(S.String),
  creditsPerSecond: S.mutableKey(S.Finite),
});
export type CloudTranscriptionModel = typeof CloudTranscriptionModel.Type;
export const CloudTranscriptionCatalog = S.Struct({
  defaultModelId: S.mutableKey(S.String),
  models: CloudTranscriptionModel.pipe(S.Array, S.mutable, S.mutableKey),
  maxAudioBytes: S.mutableKey(S.Finite),
  maxAudioSeconds: S.mutableKey(S.Finite),
});
export type CloudTranscriptionCatalog = typeof CloudTranscriptionCatalog.Type;
export const CloudTranscriptionResult = S.Struct({
  requestId: S.mutableKey(S.String),
  modelId: S.mutableKey(S.String),
  text: S.mutableKey(S.String),
  language: S.mutableKey(S.Union([S.String, S.Null])),
  audioSeconds: S.mutableKey(S.Finite),
  credits: S.mutableKey(S.Finite),
});
export type CloudTranscriptionResult = typeof CloudTranscriptionResult.Type;
