// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import { type AsrLanguageGroup, type AsrTierId, type MachineClass } from './asr-tiers';
export type OsKind = 'linux' | 'macos' | 'other' | 'windows';
export type GpuKind = 'amd' | 'apple' | 'intel' | 'nvidia' | 'unknown';
export interface GpuDeviceHint {
    active?: boolean;
    deviceString?: string;
    vendorId?: number;
    vendorString?: string;
}
export interface MachineProfile {
    arch: string;
    class: MachineClass;
    cpuCount: number;
    gpu: GpuKind;
    gpuName: string | null;
    os: OsKind;
    ramBytes: number;
}
export interface RecommendAsrInput {
    arch?: string;
    cpuCount: number;
    gpu?: GpuKind;
    language: string;
    os?: OsKind;
    ramBytes: number;
}
/**
 * Map an app language code to the ASR language group used for ranking.
 */
export declare const languageGroupFor: (language: string) => AsrLanguageGroup;
/**
 * Map a Node platform id to the OS group used for recommendations.
 */
export declare const osKindFor: (platform: string) => OsKind;
/**
 * Classify this machine from RAM and CPU count.
 */
export declare const classifyMachine: (ramBytes: number, cpuCount: number) => MachineClass;
/**
 * Guess a GPU vendor from PCI ids and device name strings.
 */
export declare const gpuKindFromHint: (device: GpuDeviceHint) => GpuKind;
/**
 * Pull GPU device hints out of Electron/Chromium getGPUInfo payloads.
 */
export declare const collectGpuDevices: (info: unknown) => GpuDeviceHint[];
/**
 * Turn an ANGLE blob into a short chip name such as "Apple M4 Max".
 */
export declare const prettyGpuName: (raw: string | null | undefined) => string | null;
/**
 * True when this host is Apple Silicon, including CPU-model fallback.
 */
export declare const isAppleSilicon: (opts?: {
    arch?: string;
    cpuModel?: string;
    platform?: string;
}) => boolean;
/**
 * Pick the strongest GPU from a Chromium/Electron gpuDevice list.
 */
export declare const classifyGpuDevices: (devices: readonly GpuDeviceHint[]) => GpuKind;
/**
 * Human-readable name from the strongest listed GPU.
 */
export declare const gpuNameFromDevices: (devices: readonly GpuDeviceHint[]) => string | null;
/**
 * Intel iGPUs are the only GPU class that should prefer smaller/faster models.
 */
export declare const isWeakGpu: (gpu: GpuKind) => boolean;
/**
 * Resolve a GPU vendor and display name, falling back to Apple Silicon.
 */
export declare const resolveGpuProfile: (opts?: {
    arch?: string;
    cpuModel?: string;
    devices?: readonly GpuDeviceHint[];
    gpu?: GpuKind;
    gpuName?: string | null;
    platform?: string;
}) => {
    gpu: GpuKind;
    gpuName: string | null;
};
/**
 * Read RAM, CPU, OS, and optional GPU from the current process host.
 */
export declare const readMachineProfile: (opts?: {
    arch?: string;
    cpuModel?: string;
    devices?: readonly GpuDeviceHint[];
    gpu?: GpuKind;
    gpuName?: string | null;
    platform?: string;
}) => MachineProfile;
/**
 * Recommend up to three ASR models for this machine, GPU, OS, and UI language.
 */
export declare const recommendAsrModels: (input: RecommendAsrInput) => AsrTierId[];
