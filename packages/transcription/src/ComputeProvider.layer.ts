import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { sherpaProviderCandidates } from "./compute-provider.js";
import { HostFailure } from "./Transcription.errors.js";
import { TranscriptionHost } from "./TranscriptionHost.service.js";
import { ComputeProvider } from "./WorkerRuntime.service.js";
import type { SherpaProviderProbeResult, SherpaProviderSelection } from "./Host.model.js";
import type { SherpaExecutionProvider } from "./Literal.model.js";
import type { SelectProviderOptions } from "./WorkerRuntime.service.js";

const MODEL_UNAVAILABLE_PATTERN = /probe model unavailable/i;
export const make = Effect.fnUntraced(function* () {
  const host = yield* TranscriptionHost;
  const timing = yield* LegacyTiming;
  const safeProbe = (provider: SherpaExecutionProvider, input: SelectProviderOptions) =>
    Effect.suspend(() => input.probe(provider)).pipe(
      Effect.catchCause((cause) => {
        const raw = Cause.squash(cause);
        const error = S.is(HostFailure)(raw) ? raw.cause : raw;
        return Effect.succeed({
          durationMs: null,
          error: error instanceof Error ? error.message : String(error),
          ok: false,
          provider,
        });
      })
    );
  return ComputeProvider.of({
    select: Effect.fn("ComputeProvider.select")(function* (input) {
      const snapshot = yield* host.snapshot;
      const candidates = sherpaProviderCandidates({
        arch: input.arch ?? snapshot.arch,
        platform: input.platform ?? snapshot.platform,
        gpuKinds: input.gpuKinds ?? [],
      });
      if (candidates.length === 1 && candidates[0] === "cpu")
        return { cacheable: true, candidates, provider: "cpu", reason: "no-compatible-accelerator" };
      const probes: SherpaProviderProbeResult[] = [];
      let accelerator: SherpaProviderProbeResult | null = null;
      for (const provider of candidates) {
        if (provider === "cpu") continue;
        const result = yield* safeProbe(provider, input).pipe(
          Effect.onExit(() => timing.turn("provider.select.accelerator"))
        );
        probes.push(result);
        if (result.ok) {
          accelerator = result;
          break;
        }
      }
      const cpu = yield* safeProbe("cpu", input).pipe(Effect.onExit(() => timing.turn("provider.select.cpu")));
      probes.push(cpu);
      const cacheable = !A.some(probes, (p) => MODEL_UNAVAILABLE_PATTERN.test(p.error ?? ""));
      if (accelerator === null) return { cacheable, candidates, provider: "cpu", reason: "accelerator-probes-failed" };
      const acceleratorDuration = accelerator.durationMs;
      const hasCpuTime = Boolean(cpu.durationMs);
      const hasAcceleratorTime = Boolean(acceleratorDuration);
      if (!(cpu.ok && hasCpuTime && hasAcceleratorTime) || cpu.durationMs === null || acceleratorDuration === null)
        return { cacheable, candidates, provider: accelerator.provider, reason: "accelerator-verified-without-timing" };
      const result: SherpaProviderSelection = {
        cacheable,
        candidates,
        provider: acceleratorDuration >= cpu.durationMs * 0.95 ? "cpu" : accelerator.provider,
        reason: acceleratorDuration >= cpu.durationMs * 0.95 ? "cpu-faster-or-within-margin" : "accelerator-faster",
      };
      return result;
    }),
  });
});
export const layer = Layer.effect(ComputeProvider, make());
