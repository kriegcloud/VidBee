import * as Arr from "effect/Array";
import { dual } from "effect/Function";
import * as HashSet from "effect/HashSet";
import type { ChunkManifest } from "./Checkpoint.model.js";

export type { ChunkManifest, ManifestChunk, ManifestTurn } from "./Checkpoint.model.js";

import { sha256 } from "@vidbee/task-queue/util/sha256";
import * as Str from "effect/String";
import type { PipelineSegment, PipelineSpeaker } from "./Pipeline.model.js";

const manifestWorkKeyDataFirst = (taskId: string, fingerprint: string, modelVersion: string): string =>
  Str.slice(0, 24)(sha256(`${taskId}\0${fingerprint}\0${modelVersion}`));
export const manifestWorkKey: {
  (taskId: string, fingerprint: string, modelVersion: string): string;
  (fingerprint: string, modelVersion: string): (taskId: string) => string;
} = dual(3, manifestWorkKeyDataFirst);
const chunkKeyDataFirst = (startMs: number, endMs: number): string => `${startMs}:${endMs}`;
export const chunkKey: {
  (startMs: number, endMs: number): string;
  (endMs: number): (startMs: number) => string;
} = dual(2, chunkKeyDataFirst);
export const completedChunkKeys = (manifest: ChunkManifest): HashSet.HashSet<string> =>
  HashSet.fromIterable(Arr.map(manifest.chunks, (chunk) => chunkKey(chunk.startMs, chunk.endMs)));
export const resultFromManifest = (
  manifest: ChunkManifest
): {
  speakers: PipelineSpeaker[];
  segments: PipelineSegment[];
} => ({
  speakers: manifest.speakers,
  segments: Arr.map(
    [...manifest.chunks].sort((a, b) => a.startMs - b.startMs),
    (chunk) => ({
      speakerKey: chunk.speakerKey,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      text: chunk.text,
      words: chunk.words,
      confidence: chunk.confidence,
    })
  ),
});
