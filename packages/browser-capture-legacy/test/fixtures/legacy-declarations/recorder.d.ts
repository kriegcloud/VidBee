// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
export interface RecorderHandle {
    stop: () => Promise<void>;
}
/** Build ffmpeg argv that grabs an X11 screen and optional Pulse monitor. */
export declare const buildRecorderArgs: (input: {
    display: string;
    width: number;
    height: number;
    outputPath: string;
    pulseSink?: string;
    includeAudio: boolean;
    fps?: number;
    originX?: number;
    originY?: number;
}) => string[];
/** Find the magenta corner painted on the video, in X screen pixels. */
export declare const measureGrabOrigin: (input: {
    ffmpegPath: string;
    display: string;
    scanWidth: number;
    scanHeight: number;
}) => Promise<{
    x: number;
    y: number;
}>;
/**
 * Start an ffmpeg x11grab recorder pointed at the virtual display.
 */
export declare const startRecorder: (input: {
    ffmpegPath: string;
    display: string;
    width: number;
    height: number;
    outputPath: string;
    pulseSink?: string;
    includeAudio: boolean;
    fps?: number;
    originX?: number;
    originY?: number;
    env?: NodeJS.ProcessEnv;
}) => RecorderHandle;
