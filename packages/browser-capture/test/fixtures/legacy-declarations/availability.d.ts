// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
/** True when this host can run the virtual-display capture sidecar. */
export declare const isBrowserCaptureAvailable: () => boolean;
/** Locate Xvfb. */
export declare const resolveXvfbPath: () => string | null;
/** Locate pactl for a Pulse/PipeWire null sink (optional). */
export declare const resolvePactlPath: () => string | null;
/**
 * Prefer the cookie-source browser so Widevine and client identity match the
 * session, then fall back to any installed Chromium-family browser.
 */
export declare const resolveBrowserExecutable: (browserForCookies?: string) => string | null;
/** Pick a free X display number. */
export declare const pickDisplayNumber: () => number;
/** Default capture canvas — large enough for 4K in either orientation. */
export declare const DEFAULT_CAPTURE_SIZE: {
    readonly width: 3840;
    readonly height: 3840;
};
/** Home directory used when resolving browser profiles. */
export declare const userHomeDir: () => string;
/** Wait until the virtual screen answers, or the timeout elapses. */
export declare const waitForDisplay: (display: string, timeoutMs?: number) => Promise<void>;
