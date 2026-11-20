import type { GpuKind } from './asr-recommend';
export declare const SHERPA_EXECUTION_PROVIDERS: readonly ['cpu', 'cuda', 'directml', 'coreml'];
export type SherpaExecutionProvider = (typeof SHERPA_EXECUTION_PROVIDERS)[number];
export interface SherpaProviderProbeResult {
    durationMs: number | null;
    error: string | null;
    ok: boolean;
    provider: SherpaExecutionProvider;
    stderr?: string;
}
export interface SherpaProviderSelection {
    cacheable: boolean;
    candidates: SherpaExecutionProvider[];
    provider: SherpaExecutionProvider;
    reason: string;
}
export interface SelectSherpaProviderInput {
    arch?: string;
    gpuKinds?: readonly GpuKind[];
    platform?: NodeJS.Platform;
    probe: (provider: SherpaExecutionProvider) => Promise<SherpaProviderProbeResult>;
}
/**
 * Detect sherpa-onnx logs that mean a requested provider silently used CPU instead.
 */
export declare const isSherpaProviderFallbackLog: (provider: SherpaExecutionProvider, text: string) => boolean;
/**
 * Build a compatibility-first provider ladder for this OS, architecture, and GPU set.
 */
export declare const sherpaProviderCandidates: (input?: {
    arch?: string;
    gpuKinds?: readonly GpuKind[];
    platform?: NodeJS.Platform;
}) => SherpaExecutionProvider[];
/**
 * Try the preferred accelerator ladder, compare the first working option with CPU, and stop.
 */
export declare const selectSherpaProvider: (input: SelectSherpaProviderInput) => Promise<SherpaProviderSelection>;
