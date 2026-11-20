export declare const TARGET_SAMPLE_RATE = 16000;
export interface ExtractedAudio {
    wavPath: string;
    durationMs: number;
}
/**
 * Return true when a cached 16 kHz wav is long enough to reuse.
 */
export declare const isReusableExtractedWav: (wavMs: number, sourceMs: number) => boolean;
/**
 * Decode the source media to a 16 kHz mono wav, re-extracting a short leftover file.
 */
export declare function extractMonoWav(input: {
    sourceFilePath: string;
    ffmpegPath: string;
    outputDir: string;
    signal?: AbortSignal;
}): Promise<ExtractedAudio>;
export interface PcmWave {
    sampleRate: number;
    samples: Float32Array;
}
/**
 * Read a PCM WAV into a JS-owned Float32Array.
 * sherpa-onnx-node's readWave uses N-API external buffers, which Electron-as-Node rejects.
 */
export declare function readPcmWav(path: string): PcmWave;
