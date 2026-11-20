import * as Arr from "effect/Array";
import * as Fn from "effect/Function";
import * as HashSet from "effect/HashSet";
import { SherpaExecutionProvider as ExecutionProvider } from "./Literal.model.js";
import type { GpuKind, SherpaExecutionProvider } from "./Literal.model.js";

export type { SherpaProviderProbeResult, SherpaProviderSelection } from "./Host.model.js";
export type { SherpaExecutionProvider } from "./Literal.model.js";
export const SHERPA_EXECUTION_PROVIDERS = ExecutionProvider.literals;
const CUDA_ARCHES = HashSet.fromIterable(["arm64", "x64"]);
const PROVIDER_FALLBACK_PATTERN =
  /fall(?:ing)? back to (?:the )?cpu|failed to .*?(?:coreml|cuda|directml|\bdml\b)|(?:coreml|cuda|directml|\bdml\b).*?(?:failed|not available|not compiled|not enabled|not supported|only available)/i;
/**
 * Detect sherpa-onnx logs that mean a requested provider silently used CPU instead.
 */
export const isSherpaProviderFallbackLog: {
  (provider: SherpaExecutionProvider, text: string): boolean;
  (text: string): (provider: SherpaExecutionProvider) => boolean;
} = Fn.dual(
  2,
  (provider: SherpaExecutionProvider, text: string): boolean =>
    provider !== "cpu" && PROVIDER_FALLBACK_PATTERN.test(text)
);
/**
 * Build a compatibility-first provider ladder for this OS, architecture, and GPU set.
 */
export const sherpaProviderCandidates = (input: {
  arch: string;
  gpuKinds?: readonly GpuKind[];
  platform: string;
}): SherpaExecutionProvider[] => {
  const platform = input.platform;
  const arch = input.arch;
  const knownGpuKinds = HashSet.fromIterable(Arr.filter(input.gpuKinds ?? [], (kind) => kind !== "unknown"));
  const gpuInventoryKnown = HashSet.size(knownGpuKinds) > 0;
  const canTryCuda = HashSet.has(CUDA_ARCHES, arch) && (!gpuInventoryKnown || HashSet.has(knownGpuKinds, "nvidia"));
  if (platform === "darwin") {
    return ["coreml", "cpu"];
  }
  if (platform === "win32") {
    return canTryCuda ? ["cuda", "directml", "cpu"] : ["directml", "cpu"];
  }
  if (platform === "linux" && canTryCuda) {
    return ["cuda", "cpu"];
  }
  return ["cpu"];
};
