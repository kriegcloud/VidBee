import { resolveWorkerExecPath } from './runtime';
export { resolveWorkerExecPath };
/**
 * sherpa-onnx-node publishes `sherpa-onnx-win-*` instead of `win32`.
 */
export declare const sherpaNativePackageName: (platform?: NodeJS.Platform, arch?: NodeJS.Architecture) => string;
/**
 * Directory of the platform-specific sherpa-onnx shared libraries.
 * On macOS the worker must set DYLD_LIBRARY_PATH to this folder.
 * Only the matching platform/arch package is accepted so a cross-built
 * x64 app cannot pick up an arm64 leftover.
 */
export declare function resolveSherpaLibraryDir(): string | null;
export declare function sherpaWorkerEnv(extra?: NodeJS.ProcessEnv, opts?: {
    electronAsNode?: boolean;
}): NodeJS.ProcessEnv;
