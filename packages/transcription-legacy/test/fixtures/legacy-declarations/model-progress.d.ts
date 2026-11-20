// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import type { ModelStatus } from './types';
export interface ModelPrepStatus {
    downloading: boolean;
    percent: number;
    ready: boolean;
}
/**
 * Map on-disk files plus the active download into a 0-100 prep percentage.
 *
 * @param status Model manager status for the boot (minimal) catalog slice.
 */
export declare const modelFillPercent: (status: Pick<ModelStatus, 'downloads' | 'files' | 'ready'>) => number;
/**
 * Compact prep snapshot used by the desktop banner and IPC.
 *
 * @param status Model manager status for the boot (minimal) catalog slice.
 */
export declare const toModelPrepStatus: (status: Pick<ModelStatus, 'downloads' | 'files' | 'ready'>) => ModelPrepStatus;
