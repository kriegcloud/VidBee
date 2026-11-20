import { expect, it } from "@effect/vitest";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Checkpoint from "../../src/Checkpoint.model.js";
import * as Cloud from "../../src/Cloud.model.js";
import * as Models from "../../src/Model.model.js";
import * as Pipeline from "../../src/Pipeline.model.js";
import * as Transcript from "../../src/Transcript.model.js";
import * as Worker from "../../src/Worker.model.js";

const word = { endMs: 500, startMs: 100, text: "hello" };
const speaker = { id: "speaker", speakerKey: "speaker-1", displayName: "Speaker 1", sortIndex: 0 };
const segment = {
  id: "segment",
  speakerId: "speaker",
  startMs: 100,
  endMs: 500,
  text: "hello",
  words: [word],
  confidence: null,
  sortIndex: 0,
};
const record = {
  id: "transcript",
  downloadTaskId: "download",
  transcriptionTaskId: "task",
  resultKind: "transcript",
  modelVersion: "fixture",
  asrTier: null,
  language: "en",
  sourceFilePath: "/fixture/audio.wav",
  sourceKind: "asr",
  supersededAt: null,
  createdAt: 1000,
  updatedAt: 1000,
  speakers: [speaker],
  segments: [segment],
};
const pipeline = {
  resultKind: "transcript",
  language: "en",
  modelVersion: "fixture",
  asrTier: null,
  speakers: [{ speakerKey: "speaker-1", displayName: "Speaker 1" }],
  segments: [{ speakerKey: "speaker-1", startMs: 100, endMs: 500, text: "hello", words: [word], confidence: null }],
};

it("domain schemas retain mutable nested data and explicitly undefined optional fields", () => {
  const decoded = S.decodeUnknownResult(Transcript.TranscriptRecord)(record);
  expect(Result.isSuccess(decoded)).toBe(true);
  if (Result.isSuccess(decoded)) {
    decoded.success.segments[0]?.words.push({ ...word, text: "second" });
    decoded.success.speakers.push({ ...speaker, id: "second" });
    decoded.success.updatedAt = 1001;
    expect(decoded.success.segments[0]?.words.length).toBe(2);
  }
  const options = {
    downloadTaskId: "download",
    sourceFilePath: "/fixture/media",
    trigger: "manual",
    skipVad: undefined,
    speakerCount: undefined,
    language: undefined,
  };
  const parsed = S.decodeUnknownResult(Transcript.TranscriptionTaskOptions)(options);
  expect(Result.isSuccess(parsed)).toBe(true);
  if (Result.isSuccess(parsed)) expect(parsed.success).toEqual(options);
});

it("stored reads preserve arbitrary result kinds while produced results retain their kit", () => {
  const stored = { ...record, resultKind: "future-kind" };
  const decoded = S.decodeUnknownResult(Transcript.StoredTranscriptRecord)(stored);
  expect(Result.isSuccess(decoded)).toBe(true);
  if (Result.isSuccess(decoded)) expect(decoded.success.resultKind).toBe("future-kind");
  expect(Result.isFailure(S.decodeUnknownResult(Transcript.TranscriptRecord)(stored))).toBe(true);
  const head = { ...stored, speakers: undefined, segments: undefined };
  expect(Result.isSuccess(S.decodeUnknownResult(Transcript.StoredTranscriptHead)(head))).toBe(true);
  expect(
    Result.isFailure(S.decodeUnknownResult(Pipeline.PipelineResult)({ ...pipeline, resultKind: "future-kind" }))
  ).toBe(true);
});

it("numeric schemas reject non-finite boundary values without inventing range refinements", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    expect(Result.isFailure(S.decodeResult(Transcript.TranscriptWord)({ ...word, startMs: value }))).toBe(true);
    expect(
      Result.isFailure(
        S.decodeResult(Worker.WorkerProgressMessage)({ type: "progress", stage: "recognizing", percent: value })
      )
    ).toBe(true);
  }
  expect(Result.isSuccess(S.decodeResult(Transcript.TranscriptWord)({ ...word, startMs: -2.5, endMs: -7 }))).toBe(true);
  expect(
    Result.isSuccess(
      S.decodeResult(Worker.WorkerProgressMessage)({ type: "progress", stage: "recognizing", percent: 150.5 })
    )
  ).toBe(true);
});

it("persisted manifest codecs preserve unknown data at every retained object level", () => {
  const value = {
    extra: { nested: true },
    key: { taskId: "task", fingerprint: "1:2", modelVersion: "fixture", keyExtra: 1 },
    durationMs: 500,
    speakers: [{ ...pipeline.speakers[0], speakerExtra: 2 }],
    turns: [{ startMs: 100, endMs: 500, speakerKey: "speaker-1", turnExtra: 3 }],
    chunks: [{ index: 0, ...pipeline.segments[0], words: [{ ...word, wordExtra: 4 }], chunkExtra: 5 }],
    stages: [{ stage: "future-stage", startedAt: 100, stageExtra: 6 }],
  };
  const decoded = S.decodeUnknownResult(Checkpoint.PersistedChunkManifest)(value);
  expect(Result.isSuccess(decoded)).toBe(true);
  if (Result.isSuccess(decoded)) expect(decoded.success).toEqual(value);
});

it("runtime cache accepts each JSON root and keeps JSON decoding separate from lookup", () => {
  for (const text of ["null", "false", "7", '"abc"', "[]", "{}", '{"key":"truthy"}']) {
    expect(Result.isSuccess(S.decodeResult(Checkpoint.ProbeCacheJson)(text))).toBe(true);
  }
  expect(Result.isFailure(S.decodeResult(Checkpoint.ProbeCacheJson)("{bad"))).toBe(true);
});

it("model and cloud optional fields admit absence and undefined without widening null", () => {
  const model = {
    id: "model",
    role: "vad",
    group: "vad",
    fileName: "vad.onnx",
    url: "https://fixture.invalid/model",
    required: true,
  };
  expect(Result.isSuccess(S.decodeUnknownResult(Models.ModelFileSpec)(model))).toBe(true);
  expect(Result.isSuccess(S.decodeUnknownResult(Models.ModelFileSpec)({ ...model, tier: undefined }))).toBe(true);
  expect(Result.isFailure(S.decodeUnknownResult(Models.ModelFileSpec)({ ...model, tier: null }))).toBe(true);
  const result = { requestId: "request", modelId: "model", text: "hello", language: null, audioSeconds: 1, credits: 2 };
  expect(Result.isSuccess(S.decodeResult(Cloud.CloudTranscriptionResult)(result))).toBe(true);
  expect(
    Result.isFailure(S.decodeResult(Cloud.CloudTranscriptionResult)({ ...result, credits: Number.POSITIVE_INFINITY }))
  ).toBe(true);
});
