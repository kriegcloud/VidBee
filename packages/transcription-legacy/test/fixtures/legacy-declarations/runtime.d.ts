// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import type { AsrTierId } from './asr-tiers';
import { type SherpaExecutionProvider, type SherpaProviderProbeResult } from './compute-provider';
export type WorkerRuntimeLayer = 'env' | 'bundled' | 'system' | 'electron';
export declare const MIN_NODE_MAJOR = 18;
export declare const DEFAULT_MAX_WORKER_RESTARTS = 2;
export interface WorkerRuntime {
    execPath: string;
    layer: WorkerRuntimeLayer;
    version: string;
    guarded: boolean;
}
export interface ProbeCache {
    get: (key: string) => boolean | undefined;
    set: (key: string, ok: boolean) => void;
}
export interface ResolveWorkerRuntimeInput {
    envPath?: string | null;
    bundledPath?: string | null;
    systemPaths?: string[];
    electronPath?: string;
    forceLayer?: WorkerRuntimeLayer | null;
    minNodeMajor?: number;
    probe?: (runtime: WorkerRuntime) => Promise<boolean>;
    cache?: ProbeCache;
    lookUpSystem?: boolean;
}
export declare const isElectronBinary: (bin: string) => boolean;
export declare const nodeBinaryName: (platform?: NodeJS.Platform) => string;
export declare const readNodeVersion: (bin: string) => string;
export declare const nodeVersionMeetsBaseline: (version: string, minMajor?: number) => boolean;
export declare const probeCacheKey: (execPath: string) => string;
export declare const createFileProbeCache: (filePath?: string) => ProbeCache;
export declare const resolveBundledNodePath: (resourceDirs?: string[]) => string | null;
export declare const resolveSystemNodePaths: () => string[];
export declare function resolveWorkerRuntime(input?: ResolveWorkerRuntimeInput): Promise<WorkerRuntime>;
/** Sync ladder without probe — used by hosts that only need a path. */
export declare function resolveWorkerExecPath(preferred?: string): string;
export interface ProbeWorkerProviderInput {
    execPath: string;
    execArgv?: string[];
    workerScript: string;
    modelsDir: string;
    provider: SherpaExecutionProvider;
    asrTier?: AsrTierId;
    benchmark?: boolean;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
}
/**
 * Probe one provider in an isolated process and reject sherpa's silent CPU fallback.
 */
export declare const probeWorkerProvider: (input: ProbeWorkerProviderInput) => Promise<SherpaProviderProbeResult>;
/**
 * Validate that a worker runtime can load sherpa and decode with its CPU provider.
 */
export declare const probeWorker: (input: Omit<ProbeWorkerProviderInput, 'provider' | 'asrTier' | 'benchmark'>) => Promise<boolean>;
export declare const formatRuntimeLog: (runtime: WorkerRuntime, restarts?: number) => string[];
