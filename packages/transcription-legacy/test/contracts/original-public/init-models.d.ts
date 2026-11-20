import type { ModelManager } from './model-manager';
export interface MinimalModelFillOptions {
    models: ModelManager;
    now?: () => number;
    schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
    delaysMs?: readonly number[];
    logger?: {
        info?: (message: string) => void;
        warn?: (message: string, err?: unknown) => void;
    };
    /** Called once the boot model set is on disk. */
    onReady?: () => void;
}
/**
 * Silently ensure VAD + speaker + Whisper tiny are on disk. Failures retry
 * with backoff and never surface a dialog.
 */
export declare const startMinimalModelFill: (opts: MinimalModelFillOptions) => {
    stop: () => void;
};
