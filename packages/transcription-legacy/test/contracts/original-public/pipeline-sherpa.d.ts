import type { SherpaExecutionProvider } from './compute-provider';
import type { ModelManager } from './model-manager';
import { type PipelineRunInput, type TranscriptionPipeline } from './pipeline';
import { CLUSTERING_THRESHOLD } from './speaker-cluster';
import type { PipelineResult } from './types';
export { CLUSTERING_THRESHOLD };
/** Official sherpa default (header + Python example). */
export declare const MIN_DURATION_ON_SEC = 0.3;
export declare const MIN_DURATION_OFF_SEC = 0.5;
export declare const DIARIZE_NUM_THREADS = 2;
export interface SherpaPipelineOptions {
    models: ModelManager;
    createAddon?: () => SherpaAddon;
    provider?: SherpaExecutionProvider;
}
export interface SherpaWave {
    sampleRate: number;
    samples: Float32Array;
}
export interface SherpaVad {
    acceptWaveform: (samples: Float32Array) => void;
    isEmpty: () => boolean;
    front: (enableExternalBuffer?: boolean) => {
        samples?: Float32Array;
        start?: number;
    };
    pop: () => void;
    flush: () => void;
    config?: {
        sileroVad?: {
            windowSize?: number;
        };
    };
}
export interface SherpaDiarization {
    sampleRate?: number;
    process: (samples: Float32Array) => Array<{
        start: number;
        end: number;
        speaker: number;
    }> | {
        get?: (i: number) => {
            start: number;
            end: number;
            speaker: number;
        };
        size?: number;
    };
}
export interface SherpaStream {
    acceptWaveform: (input: {
        sampleRate: number;
        samples: Float32Array;
    }) => void;
    inputFinished?: () => void;
    handle?: unknown;
    setOption?: (key: string, value: string) => void;
}
export interface SherpaEmbeddingExtractor {
    compute: (stream: SherpaStream, enableExternalBuffer?: boolean) => Float32Array;
    createStream: () => SherpaStream;
    dim?: number;
    isReady?: (stream: SherpaStream) => boolean;
}
export interface SherpaRecognizer {
    createStream: () => SherpaStream;
    decode: (stream: SherpaStream) => void;
    getResult: (stream: SherpaStream) => {
        durations?: number[];
        text?: string;
        timestamps?: number[];
        tokens?: string[];
    };
}
export interface SherpaPunctuation {
    addPunct: (text: string) => string;
}
export interface SherpaAddon {
    Vad: new (config: Record<string, unknown>, bufferSizeInSeconds?: number) => SherpaVad;
    OfflineSpeakerDiarization: new (config: Record<string, unknown>) => SherpaDiarization;
    OfflineRecognizer: new (config: Record<string, unknown>) => SherpaRecognizer;
    OfflinePunctuation?: new (config: Record<string, unknown>) => SherpaPunctuation;
    SpeakerEmbeddingExtractor?: new (config: Record<string, unknown>) => SherpaEmbeddingExtractor;
    readWave: (path: string) => SherpaWave;
}
/** Qwen3-ASR decode OOMs / SIGTRAPs on multi-minute turns in-process. */
export declare const MAX_ASR_CHUNK_MS = 15000;
export declare const splitTurnForAsr: <T extends {
    startMs: number;
    endMs: number;
}>(turn: T, maxChunkMs?: number) => T[];
export declare class SherpaTranscriptionPipeline implements TranscriptionPipeline {
    private readonly opts;
    constructor(opts: SherpaPipelineOptions);
    run(input: PipelineRunInput): Promise<PipelineResult>;
    /**
     * Overlay new speaker turns onto an existing captions or ASR transcript and finish.
     *
     * @param input Pipeline run input.
     * @param seed Words from the previous ASR result.
     * @param turns Fresh diarization turns.
     * @param asrTier Model already used for the text.
     */
    private commitSeed;
    /**
     * Walk VAD speech (or the whole file) in 15s pieces so ASR can stream before diarization.
     *
     * @param speech Intervals from Silero, or empty when VAD was skipped.
     * @param durationMs Audio length.
     * @param skipVad When true, ignore VAD and recognize the full timeline.
     */
    private asrTurnsFromSpeech;
    /**
     * Reuse saved clustering, or run speaker diarization now.
     *
     * @param addon Native sherpa addon.
     * @param wave Full-file waveform.
     * @param speech VAD intervals used as a fallback mask.
     * @param durationMs Audio length.
     * @param input Pipeline run input.
     * @param manifest Resume manifest, if any.
     */
    private speakerTurns;
    private collectSpeechIntervals;
    /**
     * Run sherpa OfflineSpeakerDiarization (pyannote neural segmentation).
     * VAD is not used as a diarization mask.
     */
    private diarize;
    /**
     * Resolve the CAM++ embedding, falling back to already-downloaded TitaNet or eres2net.
     */
    private embeddingPath;
    /**
     * Extract one speaker-level embedding from the longest clean turns in a chunk.
     */
    private embedSpeakerTurns;
    /**
     * sherpa OfflineSpeakerDiarization: pyannote segmentation per chunk, then a
     * global speaker-embedding recluster (even for a single window).
     */
    private diarizeSherpa;
    private recognize;
    /**
     * Load OfflinePunctuation when the model is on disk or can be fetched.
     * Download/load failures skip restoration; the caller still finishes.
     */
    private tryCreatePunctuator;
    private createRecognizer;
    /**
     * Resolve the verified provider selected by the parent worker host.
     */
    private provider;
}
