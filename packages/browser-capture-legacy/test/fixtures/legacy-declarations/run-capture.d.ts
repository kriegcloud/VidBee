// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
import type { CaptureJob } from './protocol';
/**
 * Play the page on a virtual display and record it with ffmpeg.
 */
export declare const runCapture: (job: CaptureJob, input: {
    signal: AbortSignal;
    onLog: (message: string) => void;
    onProgress: (state: {
        currentTime: number;
        duration: number;
        percent: number;
    }) => void;
}) => Promise<{
    filePath: string;
    durationMs: number | null;
}>;
