// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import type { PipelineSegment, PipelineSpeaker, TranscriptStageTiming, TranscriptWord } from './types';
export interface ManifestTurn {
    startMs: number;
    endMs: number;
    speakerKey: string;
}
export interface ManifestChunk {
    index: number;
    startMs: number;
    endMs: number;
    speakerKey: string | null;
    text: string;
    words?: TranscriptWord[];
    confidence: number | null;
}
export interface ChunkManifest {
    key: {
        taskId: string;
        fingerprint: string;
        modelVersion: string;
    };
    durationMs: number | null;
    speakers: PipelineSpeaker[];
    turns: ManifestTurn[];
    chunks: ManifestChunk[];
    stages: TranscriptStageTiming[];
}
export declare const sourceFingerprint: (filePath: string) => string;
export declare const manifestWorkKey: (taskId: string, fingerprint: string, modelVersion: string) => string;
export declare const manifestPathFor: (workDir: string) => string;
/**
 * Host-only stage clock, kept off `chunks.json` so the worker can append ASR
 * chunks without sharing a `.tmp` rename.
 *
 * @param workDir Pipeline work directory.
 */
export declare const stagesPathFor: (workDir: string) => string;
export declare const loadChunkManifest: (filePath: string) => ChunkManifest | null;
/**
 * Atomically persist the ASR chunk manifest.
 *
 * @param filePath Destination `chunks.json` path.
 * @param manifest Manifest to write.
 */
export declare const saveChunkManifest: (filePath: string, manifest: ChunkManifest) => void;
/**
 * Merge fields into the on-disk manifest. In-memory snapshots must not rewrite
 * `chunks` — that used to wipe ASR after diarization saved turns.
 *
 * @param filePath Destination `chunks.json` path.
 * @param patch Speakers, turns, or duration to publish.
 */
export declare const patchChunkManifest: (filePath: string, patch: Partial<Pick<ChunkManifest, 'speakers' | 'turns' | 'durationMs'>>) => ChunkManifest;
export declare const ensureChunkManifest: (input: {
    workDir: string;
    taskId: string;
    fingerprint: string;
    modelVersion: string;
}) => {
    path: string;
    manifest: ChunkManifest;
};
/**
 * Load thinking-step timings written by the host process.
 *
 * @param workDir Pipeline work directory.
 */
export declare const loadManifestStages: (workDir: string) => TranscriptStageTiming[] | null;
/**
 * Persist thinking-step timings next to ASR chunks so a restart can resume the clock.
 * Written to `stages.json` so the host never races the worker's `chunks.json`.
 *
 * @param workDir Pipeline work directory.
 * @param stages Stage history with start timestamps.
 */
export declare const saveManifestStages: (workDir: string, stages: TranscriptStageTiming[]) => void;
export declare const chunkKey: (startMs: number, endMs: number) => string;
export declare const completedChunkKeys: (manifest: ChunkManifest) => Set<string>;
export declare const appendManifestChunk: (filePath: string, chunk: ManifestChunk, extras?: Partial<Pick<ChunkManifest, 'speakers' | 'turns' | 'durationMs'>>) => ChunkManifest;
export declare const resultFromManifest: (manifest: ChunkManifest) => {
    speakers: PipelineSpeaker[];
    segments: PipelineSegment[];
};
