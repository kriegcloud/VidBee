// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
export interface VirtualDisplay {
    display: string;
    pulseSink?: string;
    stop: () => Promise<void>;
}
/**
 * Start Xvfb (and an optional Pulse null sink) for headed Chromium capture.
 */
export declare const startVirtualDisplay: (input: {
    width: number;
    height: number;
}) => Promise<VirtualDisplay>;
