import * as Core from '../../transcription/src/asr-recommend'
import * as Effect from 'effect/Effect'
import {MachineProfiles} from '../../transcription/src/MachineProfiles.service'
import {runMachineProfile} from './bridge/machine-profile'
import { type AsrLanguageGroup, type AsrTierId, type MachineClass } from './asr-tiers'

export type OsKind = 'linux' | 'macos' | 'other' | 'windows'

export type GpuKind = 'amd' | 'apple' | 'intel' | 'nvidia' | 'unknown'

export interface GpuDeviceHint {
  active?: boolean
  deviceString?: string
  vendorId?: number
  vendorString?: string
}

export interface MachineProfile {
  arch: string
  class: MachineClass
  cpuCount: number
  gpu: GpuKind
  gpuName: string | null
  os: OsKind
  ramBytes: number
}

export interface RecommendAsrInput {
  arch?: string
  cpuCount: number
  gpu?: GpuKind
  language: string
  os?: OsKind
  ramBytes: number
}




/**
 * Map an app language code to the ASR language group used for ranking.
 */
export const languageGroupFor = (language: string): AsrLanguageGroup => { return Core.languageGroupFor(language) }

/**
 * Map a Node platform id to the OS group used for recommendations.
 */
export const osKindFor = (platform: string): OsKind => { return Core.osKindFor(platform) }

/**
 * Classify this machine from RAM and CPU count.
 */
export const classifyMachine = (ramBytes: number, cpuCount: number): MachineClass => { return Core.classifyMachine(ramBytes, cpuCount) }

/**
 * Guess a GPU vendor from PCI ids and device name strings.
 */
export const gpuKindFromHint = (device: GpuDeviceHint): GpuKind => { return Core.gpuKindFromHint(device) }

/**
 * Pull GPU device hints out of Electron/Chromium getGPUInfo payloads.
 */
export const collectGpuDevices = (info: unknown): GpuDeviceHint[] => { return Core.collectGpuDevices(info) }

/**
 * Turn an ANGLE blob into a short chip name such as "Apple M4 Max".
 */
export const prettyGpuName = (raw: string | null | undefined): string | null => { return Core.prettyGpuName(raw) }

/**
 * True when this host is Apple Silicon, including CPU-model fallback.
 */
export const isAppleSilicon = (opts?: {
  arch?: string
  cpuModel?: string
  platform?: string
}): boolean => {
  return runMachineProfile(Effect.flatMap(MachineProfiles,service=>service.appleSilicon(opts)))
}

/**
 * Pick the strongest GPU from a Chromium/Electron gpuDevice list.
 */
export const classifyGpuDevices = (devices: readonly GpuDeviceHint[]): GpuKind => { return Core.classifyGpuDevices(devices) }

/**
 * Human-readable name from the strongest listed GPU.
 */
export const gpuNameFromDevices = (devices: readonly GpuDeviceHint[]): string | null => { return Core.gpuNameFromDevices(devices) }

/**
 * Intel iGPUs are the only GPU class that should prefer smaller/faster models.
 */
export const isWeakGpu = (gpu: GpuKind): boolean => { return Core.isWeakGpu(gpu) }

/**
 * Resolve a GPU vendor and display name, falling back to Apple Silicon.
 */
export const resolveGpuProfile = (opts?: {
  arch?: string
  cpuModel?: string
  devices?: readonly GpuDeviceHint[]
  gpu?: GpuKind
  gpuName?: string | null
  platform?: string
}): { gpu: GpuKind; gpuName: string | null } => {
  return runMachineProfile(Effect.flatMap(MachineProfiles,service=>service.gpu(opts)))
}

/**
 * Read RAM, CPU, OS, and optional GPU from the current process host.
 */
export const readMachineProfile = (opts?: {
  arch?: string
  cpuModel?: string
  devices?: readonly GpuDeviceHint[]
  gpu?: GpuKind
  gpuName?: string | null
  platform?: string
}): MachineProfile => {
  return runMachineProfile(Effect.flatMap(MachineProfiles,service=>service.read(opts)))
}

/**
 * Recommend up to three ASR models for this machine, GPU, OS, and UI language.
 */
export const recommendAsrModels = (input: RecommendAsrInput): AsrTierId[] => { return Core.recommendAsrModels(input) }
