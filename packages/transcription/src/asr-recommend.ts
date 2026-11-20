import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import * as Str from "effect/String";
import type { AppleSiliconInput, GpuDeviceHint, GpuProfileInput, RecommendAsrInput } from "./Asr.model.js";

export type { GpuDeviceHint, MachineProfile, RecommendAsrInput } from "./Asr.model.js";

import type { GpuKind, OsKind } from "./Literal.model.js";

export type { GpuKind, OsKind } from "./Literal.model.js";

import { asrTierInfo } from "./asr-tiers.js";
import type { AsrLanguageGroup, AsrTierId, MachineClass } from "./asr-tiers.js";

const NVIDIA_VENDOR = 0x10_de;
const AMD_VENDOR = 0x10_02;
const INTEL_VENDOR = 0x80_86;
const APPLE_VENDOR = 0x10_6b;

const GPU_RANK: Record<GpuKind, number> = {
  nvidia: 4,
  apple: 3,
  amd: 2,
  intel: 1,
  unknown: 0,
};

/**
 * Map an app language code to the ASR language group used for ranking.
 */
export const languageGroupFor = (language: string): AsrLanguageGroup => {
  const normalized = Str.toLowerCase(Str.trim(language));
  if (Str.startsWith("zh")(normalized)) {
    return "zh";
  }
  if (Str.startsWith("ja")(normalized) || Str.startsWith("ko")(normalized)) {
    return "cjk";
  }
  if (Str.startsWith("en")(normalized)) {
    return "en";
  }
  return "multi";
};

/**
 * Map a Node platform id to the OS group used for recommendations.
 */
export const osKindFor = (platform: string): OsKind => {
  if (platform === "darwin") {
    return "macos";
  }
  if (platform === "win32") {
    return "windows";
  }
  if (platform === "linux") {
    return "linux";
  }
  return "other";
};

/**
 * Classify this machine from RAM and CPU count.
 */
const classifyMachineDataFirst = (ramBytes: number, cpuCount: number): MachineClass => {
  const ramGB = ramBytes / 1024 ** 3;
  if (ramGB < 8) {
    return "low";
  }
  if (ramGB < 16 || cpuCount <= 4) {
    return "mid";
  }
  return "high";
};
export const classifyMachine: {
  (ramBytes: number, cpuCount: number): MachineClass;
  (cpuCount: number): (ramBytes: number) => MachineClass;
} = dual(2, classifyMachineDataFirst);

/**
 * Guess a GPU vendor from PCI ids and device name strings.
 */
export const gpuKindFromHint = (device: GpuDeviceHint): GpuKind => {
  const vendor = Number(device.vendorId ?? 0);
  if (vendor === NVIDIA_VENDOR) {
    return "nvidia";
  }
  if (vendor === APPLE_VENDOR) {
    return "apple";
  }
  if (vendor === AMD_VENDOR) {
    return "amd";
  }
  if (vendor === INTEL_VENDOR) {
    return "intel";
  }
  const text = Str.toLowerCase(`${device.vendorString ?? ""} ${device.deviceString ?? ""}`);
  if (/\bnvidia\b|\bgeforce\b|\brtx\b|\bquadro\b/.test(text)) {
    return "nvidia";
  }
  if (/\bapple\b|\bmetal renderer\b/.test(text)) {
    return "apple";
  }
  if (/\bamd\b|\bradeon\b/.test(text)) {
    return "amd";
  }
  if (/\bintel\b|\biris\b|\buhd\b/.test(text)) {
    return "intel";
  }
  return "unknown";
};

/**
 * Pull GPU device hints out of Electron/Chromium getGPUInfo payloads.
 */
export const collectGpuDevices = (info: unknown): GpuDeviceHint[] => {
  if (!P.isTruthy(info) || typeof info !== "object") {
    return [];
  }
  const record = info as Record<string, unknown>;
  const raw = record.gpuDevice ?? record.gpuDevices;
  const devices: GpuDeviceHint[] = [];
  if (A.isArray(raw)) {
    for (const item of raw) {
      if (P.isTruthy(item) && typeof item === "object") {
        devices.push(item as GpuDeviceHint);
      }
    }
  }
  const aux = record.auxAttributes;
  if (P.isTruthy(aux) && typeof aux === "object") {
    const fields = aux as Record<string, unknown>;
    devices.push({
      deviceString: String(fields.glRenderer ?? fields.displayName ?? ""),
      vendorString: String(fields.glVendor ?? fields.vendorString ?? ""),
    });
  }
  return devices;
};

/**
 * Turn an ANGLE blob into a short chip name such as "Apple M4 Max".
 */
export const prettyGpuName = (raw: string | null | undefined): string | null => {
  const text = raw == null ? "" : Str.trim(raw);
  if (!P.isTruthy(text)) {
    return null;
  }
  const appleChip = O.getOrNull(Str.match(/Apple\s+M\d+(?:\s+(?:Pro|Max|Ultra|Plus))?/i)(text));
  if (appleChip !== null && appleChip[0] !== undefined && P.isTruthy(appleChip[0])) {
    return Str.trim(Str.replace(/\s+/g, " ")(appleChip[0]));
  }
  const metal = O.getOrNull(Str.match(/Metal Renderer:\s*([^,)]+)/i)(text));
  if (metal !== null && metal[1] !== undefined && P.isTruthy(metal[1])) {
    return Str.trim(metal[1]);
  }
  if (/angle/i.test(text)) {
    return null;
  }
  return text;
};

/**
 * True when this host is Apple Silicon, including CPU-model fallback.
 */
export const isAppleSilicon = (opts: AppleSiliconInput): boolean => {
  const platform = opts.platform;
  const arch = opts.arch;
  if (platform === "darwin" && arch === "arm64") {
    return true;
  }
  return platform === "darwin" && /^Apple\s+M\d+/i.test(opts?.cpuModel ?? "");
};

/**
 * Pick the strongest GPU from a Chromium/Electron gpuDevice list.
 */
export const classifyGpuDevices = (devices: readonly GpuDeviceHint[]): GpuKind => {
  const ranked = A.filter(
    A.map(devices, (device) => ({ device, kind: gpuKindFromHint(device) })),
    (item) => item.kind !== "unknown" || P.isTruthy(item.device.active)
  );
  if (ranked.length === 0) {
    return "unknown";
  }
  const active = A.filter(ranked, (item) => item.device.active !== false);
  const pool = active.length > 0 ? active : ranked;
  return pool.sort((left, right) => GPU_RANK[right.kind] - GPU_RANK[left.kind])[0]?.kind ?? "unknown";
};

/**
 * Human-readable name from the strongest listed GPU.
 */
export const gpuNameFromDevices = (devices: readonly GpuDeviceHint[]): string | null => {
  const kind = classifyGpuDevices(devices);
  if (kind === "unknown") {
    return null;
  }
  const match = O.getOrUndefined(
    A.findFirst(
      A.reverse(devices),
      (device) =>
        gpuKindFromHint(device) === kind &&
        P.isTruthy(device.deviceString == null ? undefined : Str.trim(device.deviceString))
    )
  );
  return prettyGpuName(match?.deviceString);
};

/**
 * Intel iGPUs are the only GPU class that should prefer smaller/faster models.
 */
export const isWeakGpu = (gpu: GpuKind): boolean => gpu === "intel";

/**
 * Resolve a GPU vendor and display name, falling back to Apple Silicon.
 */
export const resolveGpuProfile = (opts: GpuProfileInput): { gpu: GpuKind; gpuName: string | null } => {
  const cpuModel = opts.cpuModel;
  const apple = isAppleSilicon({
    arch: opts?.arch,
    cpuModel,
    platform: opts?.platform,
  });
  const detected =
    opts?.gpu !== undefined && P.isTruthy(opts.gpu) && opts.gpu !== "unknown"
      ? opts.gpu
      : classifyGpuDevices(opts?.devices ?? []);
  const gpu = detected === "unknown" ? (apple ? "apple" : "unknown") : detected;
  const fromHint = prettyGpuName(opts?.gpuName);
  if (fromHint !== null && P.isTruthy(fromHint)) {
    return { gpu, gpuName: fromHint };
  }
  const fromDevices = prettyGpuName(gpuNameFromDevices(opts?.devices ?? []));
  if (fromDevices !== null && P.isTruthy(fromDevices)) {
    return { gpu, gpuName: fromDevices };
  }
  if (gpu !== "apple") {
    return { gpu, gpuName: null };
  }
  const appleChip = /^Apple\s+M\d+/i.test(cpuModel ?? "")
    ? cpuModel == null
      ? undefined
      : Str.trim(cpuModel)
    : undefined;
  return { gpu, gpuName: appleChip || "Apple Silicon" };
};

/**
 * Drop models that need more RAM than this machine can spare.
 */
const fitsRam = (id: AsrTierId, ramBytes: number): boolean => {
  const ramGB = ramBytes / 1024 ** 3;
  return ramGB + 0.5 >= asrTierInfo(id).minRamGB;
};

/**
 * Keep the first unique ids that still fit in RAM.
 */
const pickFits = (ids: readonly AsrTierId[], ramBytes: number): AsrTierId[] => {
  const picked: AsrTierId[] = [];
  for (const id of ids) {
    if (picked.includes(id) || !fitsRam(id, ramBytes)) {
      continue;
    }
    picked.push(id);
    if (picked.length >= 3) {
      break;
    }
  }
  if (picked.length === 0 && fitsRam("minimal", ramBytes)) {
    return ["minimal"];
  }
  return picked.length > 0 ? picked : ["minimal"];
};

/**
 * Recommend up to three ASR models for this machine, GPU, OS, and UI language.
 */
export const recommendAsrModels = (input: RecommendAsrInput): AsrTierId[] => {
  const machine = classifyMachine(input.ramBytes, input.cpuCount);
  const group = languageGroupFor(input.language);
  const gpu = input.gpu ?? "unknown";
  const weak = isWeakGpu(gpu);
  const appleSilicon = input.os === "macos" && (input.arch === "arm64" || gpu === "apple");
  const strong = !weak && (gpu === "apple" || gpu === "nvidia" || gpu === "amd" || appleSilicon);
  if (machine === "low") {
    const lowZh: AsrTierId[] = ["minimal", "whisper-base", "sense-voice"];
    return pickFits(group === "zh" ? lowZh : ["minimal", "whisper-base", "balanced"], input.ramBytes);
  }
  if (group === "zh") {
    if (machine === "high" && (strong || gpu === "unknown")) {
      return pickFits(["quality", "sense-voice-2025", "whisper-turbo"], input.ramBytes);
    }
    if (machine === "high") {
      return pickFits(["sense-voice-2025", "quality", "whisper-turbo"], input.ramBytes);
    }
    return pickFits(["sense-voice-2025", "sense-voice", "whisper-base"], input.ramBytes);
  }
  if (group === "cjk") {
    return pickFits(["sense-voice-2025", "sense-voice", "whisper-turbo"], input.ramBytes);
  }
  if (group === "en") {
    if (machine === "high" && (strong || gpu === "unknown")) {
      return pickFits(["parakeet-v3", "whisper-turbo", "balanced"], input.ramBytes);
    }
    return pickFits(["parakeet-v2", "balanced", "whisper-base"], input.ramBytes);
  }
  if (machine === "high" && (strong || gpu === "unknown")) {
    return pickFits(["whisper-turbo", "sense-voice-2025", "parakeet-v3"], input.ramBytes);
  }
  return pickFits(["sense-voice-2025", "balanced", "whisper-base"], input.ramBytes);
};
