// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
import type { PlaywrightCookie } from './cookies';
import { type DecodedQuality } from './quality';
export interface PlaybackSession {
    mediaId: string | null;
    waitUntilPlaying: () => Promise<DecodedQuality & {
        duration: number;
        originX: number;
        originY: number;
    }>;
    waitUntilEnded: (onProgress: (state: {
        currentTime: number;
        duration: number;
    }) => void) => Promise<void>;
    close: () => Promise<void>;
}
export interface MediaClock {
    currentTime: number;
    duration: number;
    paused: boolean;
    ended: boolean;
}
/** Playback has started only after the media clock moves while the element is playing. */
export declare const playbackHasAdvanced: (state: MediaClock | null) => boolean;
/**
 * Resolves with the first clock sample that has advanced.
 * Staying at 0 until the deadline rejects.
 */
export declare const waitUntilPlaybackAdvances: (read: () => Promise<MediaClock | null>, input: {
    timeoutMs: number;
    signal: AbortSignal;
    sleep: (ms: number) => Promise<void>;
}) => Promise<MediaClock>;
/**
 * Launch headed Chromium on the virtual display, inject cookies, and play the
 * first media element so ffmpeg can record the composited (decrypted) frames.
 * A chat `videoOrdinal` plays that video from the opened message list instead.
 */
export declare const startPlayback: (input: {
    url: string;
    cookies: PlaywrightCookie[];
    localStorage?: Record<string, string>;
    executablePath: string;
    display: string;
    pulseSink?: string;
    width: number;
    height: number;
    signal: AbortSignal;
    userDataDir?: string;
    videoOrdinal?: number;
    ffmpegPath: string;
    onLog?: (message: string) => void;
}) => Promise<PlaybackSession>;
