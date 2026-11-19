// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
export interface AsrWord {
    endMs: number;
    startMs: number;
    text: string;
}
export interface AsrRecognizerResult {
    durations?: number[];
    text?: string;
    timestamps?: number[];
    tokens?: string[];
}
/**
 * Build word timings from sherpa-onnx tokens and timestamps.
 *
 * Timestamps are seconds relative to the recognized chunk.
 */
export declare const wordsFromAsrResult: (result: AsrRecognizerResult, chunkStartMs: number, chunkEndMs: number) => AsrWord[];
/**
 * Pick the most recently started word at the playhead.
 *
 * Rounding avoids `ms / 1000 * 1000` landing just before a token start, which
 * would highlight the previous word after a click. Later overlapping starts win.
 */
export declare const activeWordIndex: (words: AsrWord[], currentMs: number) => number | null;
