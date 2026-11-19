// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
export type SidecarEvent = {
    type: 'spawn';
    pid: number;
} | {
    type: 'log';
    message: string;
} | {
    type: 'progress';
    percent: number;
    currentTime: number;
    duration: number;
} | {
    type: 'done';
    filePath: string;
    size: number;
    durationMs: number | null;
} | {
    type: 'error';
    message: string;
};
/** Encode one sidecar event as a stdout line the executor can parse. */
export declare const encodeSidecarEvent: (event: SidecarEvent) => string;
/** Parse a sidecar stdout line into an event, or null when it is plain log text. */
export declare const parseSidecarEvent: (line: string) => SidecarEvent | null;
export interface CaptureJob {
    url: string;
    outputPath: string;
    ffmpegPath: string;
    cookiesPath?: string;
    browserExecutable?: string;
    width: number;
    height: number;
    durationHintSec?: number;
    localStorage?: Record<string, string>;
    userDataDir?: string;
    videoOrdinal?: number;
}
/** Parse a capture job JSON object. */
export declare const parseCaptureJob: (value: unknown) => CaptureJob;
