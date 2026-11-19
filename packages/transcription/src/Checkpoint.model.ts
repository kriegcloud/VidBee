import * as S from "effect/Schema";
import { PipelineSpeaker } from "./Pipeline.model.js";
import { TranscriptStageTiming, TranscriptWord } from "./Transcript.model.js";
export const ManifestTurn = S.Struct({
  startMs: S.mutableKey(S.Finite),
  endMs: S.mutableKey(S.Finite),
  speakerKey: S.mutableKey(S.String),
});
export type ManifestTurn = typeof ManifestTurn.Type;
export const ManifestChunk = S.Struct({
  index: S.mutableKey(S.Finite),
  startMs: S.mutableKey(S.Finite),
  endMs: S.mutableKey(S.Finite),
  speakerKey: S.mutableKey(S.Union([S.String, S.Null])),
  text: S.mutableKey(S.String),
  words: TranscriptWord.pipe(S.Array, S.mutable, S.optional, S.mutableKey),
  confidence: S.mutableKey(S.Union([S.Finite, S.Null])),
});
export type ManifestChunk = typeof ManifestChunk.Type;
export const ChunkManifest = S.Struct({
  key: S.mutableKey(
    S.Struct({
      taskId: S.mutableKey(S.String),
      fingerprint: S.mutableKey(S.String),
      modelVersion: S.mutableKey(S.String),
    })
  ),
  durationMs: S.mutableKey(S.Union([S.Finite, S.Null])),
  speakers: PipelineSpeaker.pipe(S.Array, S.mutable, S.mutableKey),
  turns: ManifestTurn.pipe(S.Array, S.mutable, S.mutableKey),
  chunks: ManifestChunk.pipe(S.Array, S.mutable, S.mutableKey),
  stages: TranscriptStageTiming.pipe(S.Array, S.mutable, S.mutableKey),
});
export type ChunkManifest = typeof ChunkManifest.Type;

// Retained persistence objects are deliberately open at every rewritten level.
export const PersistedWord = S.StructWithRest(TranscriptWord, [S.Record(S.String, S.Unknown)]);
export const PersistedSpeaker = S.StructWithRest(PipelineSpeaker, [S.Record(S.String, S.Unknown)]);
export const PersistedTurn = S.StructWithRest(ManifestTurn, [S.Record(S.String, S.Unknown)]);
export const PersistedStage = S.StructWithRest(TranscriptStageTiming, [S.Record(S.String, S.Unknown)]);
export const PersistedChunk = S.StructWithRest(
  S.Struct({
    ...ManifestChunk.fields,
    words: PersistedWord.pipe(S.Array, S.mutable, S.optional, S.mutableKey),
  }),
  [S.Record(S.String, S.Unknown)]
);
export const PersistedManifestKey = S.StructWithRest(
  S.Struct({ taskId: S.String, fingerprint: S.String, modelVersion: S.String }),
  [S.Record(S.String, S.Unknown)]
);
export const PersistedChunkManifest = S.StructWithRest(
  S.Struct({
    ...ChunkManifest.fields,
    key: S.mutableKey(PersistedManifestKey),
    speakers: PersistedSpeaker.pipe(S.Array, S.mutable, S.mutableKey),
    turns: PersistedTurn.pipe(S.Array, S.mutable, S.mutableKey),
    chunks: PersistedChunk.pipe(S.Array, S.mutable, S.mutableKey),
    stages: PersistedStage.pipe(S.Array, S.mutable, S.mutableKey),
  }),
  [S.Record(S.String, S.Unknown)]
);
export type PersistedChunkManifest = typeof PersistedChunkManifest.Type;
export const ProbeCacheRoot = S.Unknown;
export const ProbeCacheJson = S.fromJsonString(ProbeCacheRoot);

const OpenFields = S.Record(S.String, S.mutableKey(S.Unknown));
export const ManifestEnvelopeKey = S.StructWithRest(
  S.Struct({
    taskId: S.Unknown.pipe(S.optional, S.mutableKey),
    fingerprint: S.Unknown.pipe(S.optional, S.mutableKey),
    modelVersion: S.Unknown.pipe(S.optional, S.mutableKey),
  }),
  [OpenFields]
);
export const ManifestEnvelope = S.StructWithRest(
  S.Struct({
    key: S.mutableKey(ManifestEnvelopeKey),
    durationMs: S.Unknown.pipe(S.optional, S.mutableKey),
    speakers: S.Unknown.pipe(S.optional, S.mutableKey),
    turns: S.Unknown.pipe(S.optional, S.mutableKey),
    chunks: S.Unknown.pipe(S.optional, S.mutableKey),
    stages: S.Unknown.pipe(S.optional, S.mutableKey),
  }),
  [OpenFields]
);
export type ManifestEnvelope = typeof ManifestEnvelope.Type;
export const ManifestPatch = S.Struct({
  speakers: PipelineSpeaker.pipe(S.Array, S.mutable, S.optional, S.mutableKey),
  turns: ManifestTurn.pipe(S.Array, S.mutable, S.optional, S.mutableKey),
  durationMs: S.Finite.pipe(S.NullOr, S.optional, S.mutableKey),
});
export type ManifestPatch = typeof ManifestPatch.Type;
export const EnsureManifestInput = S.Struct({
  workDir: S.String,
  taskId: S.String,
  fingerprint: S.String,
  modelVersion: S.String,
});
export type EnsureManifestInput = typeof EnsureManifestInput.Type;
