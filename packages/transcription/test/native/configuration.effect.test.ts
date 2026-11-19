import { expect, layer } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import { TranscriptionConcurrencyLive } from "../../src/Concurrency.layer.js";
import { ConcurrencyQueue, TranscriptionConcurrency } from "../../src/Concurrency.service.js";
import { MachineProfilesLive } from "../../src/MachineProfiles.layer.js";
import { MachinePrimitives, MachineProfiles } from "../../src/MachineProfiles.service.js";
import { RecognizerConfigLive } from "../../src/RecognizerConfig.layer.js";
import { RecognizerConfig, RecognizerModels } from "../../src/RecognizerConfig.service.js";
import { HostFailure } from "../../src/Transcription.errors.js";

class Fixture extends Context.Service<
  Fixture,
  { readonly calls: string[]; ram: number; issue: string | null; failRole: boolean }
>()("@vidbee/transcription/test/native/configuration.effect.test/Fixture") {}
const state = Layer.sync(Fixture, () => ({ calls: [], ram: 8 * 1024 ** 3, issue: null, failRole: false }));
const machine = Layer.effect(
  MachinePrimitives,
  Effect.gen(function* () {
    const state = yield* Fixture;
    return MachinePrimitives.of({
      platform: Effect.sync(() => {
        state.calls.push("platform");
        return "darwin";
      }),
      arch: Effect.sync(() => {
        state.calls.push("arch");
        return "arm64";
      }),
      ramBytes: Effect.sync(() => {
        state.calls.push("ram");
        return state.ram;
      }),
      cpuCount: Effect.sync(() => {
        state.calls.push("count");
        return 3;
      }),
      cpuModel: Effect.sync(() => {
        state.calls.push("model");
        return "Apple M4 fixture";
      }),
    });
  })
);
const concurrency = Layer.effect(
  ConcurrencyQueue,
  Effect.gen(function* () {
    const state = yield* Fixture;
    return ConcurrencyQueue.of({
      setMaxConcurrency: Effect.fn("fixture.global")((n) =>
        Effect.sync(() => {
          state.calls.push(`global:${n}`);
        })
      ),
      setMaxPerGroup: Effect.fn("fixture.group")((group, n) =>
        Effect.sync(() => {
          state.calls.push(`group-start:${group}:${n}`);
        }).pipe(
          Effect.andThen(Effect.yieldNow),
          Effect.andThen(
            Effect.sync(() => {
              state.calls.push("group-end");
            })
          )
        )
      ),
      setMaxConcurrentDownloads: Effect.fn("fixture.downloads")((n) =>
        Effect.sync(() => {
          state.calls.push(`downloads:${n}`);
        })
      ),
    });
  })
);
const recognizer = Layer.effect(
  RecognizerModels,
  Effect.gen(function* () {
    const state = yield* Fixture;
    return RecognizerModels.of({
      incompleteModelIssue: Effect.fn("fixture.issue")((tier) =>
        Effect.sync(() => {
          state.calls.push(`issue:${tier}`);
          return state.issue;
        })
      ),
      pathByRole: Effect.fn("fixture.role")((role) =>
        Effect.suspend(() => {
          state.calls.push(role);
          return state.failRole
            ? HostFailure.make({ operation: "role", legacyMessage: "role fixture", cause: new Error("role fixture") })
            : Effect.succeed(`/model/${role}`);
        })
      ),
    });
  })
);
const capabilities = Layer.mergeAll(machine, concurrency, recognizer).pipe(Layer.provideMerge(state));
const services = Layer.mergeAll(MachineProfilesLive, TranscriptionConcurrencyLive, RecognizerConfigLive).pipe(
  Layer.provideMerge(capabilities)
);
layer(services)("native configuration capabilities", (it) => {
  it.effect("reads host primitives in old order and refreshes RAM on later calls", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const profiles = yield* MachineProfiles;
      state.calls.length = 0;
      const first = yield* profiles.read();
      expect(state.calls).toEqual(["platform", "arch", "ram", "count", "model"]);
      expect(first.gpu).toBe("apple");
      expect(first.ramBytes).toBe(8 * 1024 ** 3);
      state.ram = 1024 ** 3;
      state.calls.length = 0;
      const second = yield* profiles.read({ platform: "linux", arch: "x64", cpuModel: "explicit", gpu: "intel" });
      expect(second.ramBytes).toBe(1024 ** 3);
      expect(state.calls).toEqual(["ram", "count"]);
    })
  );
  it.effect("applies native setters sequentially across a suspending group setter", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const service = yield* TranscriptionConcurrency;
      state.calls.length = 0;
      yield* service.apply({ maxConcurrentDownloads: "3", maxConcurrentTranscriptions: 4 });
      expect(state.calls).toEqual(["global:4", "group-start:transcription:4", "group-end", "downloads:3"]);
    })
  );
  it.effect("resolves all role paths in order and preserves configurable values", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const service = yield* RecognizerConfig;
      state.calls.length = 0;
      state.issue = null;
      state.failRole = false;
      const paths = yield* service.paths("minimal");
      expect(paths.encoder).toBe("/model/asr-encoder");
      expect(state.calls).toEqual([
        "issue:minimal",
        "asr-decoder",
        "asr-encoder",
        "asr-frontend",
        "asr-joiner",
        "asr-model",
        "asr-tokenizer",
        "asr-tokens",
      ]);
      const config = yield* service.tryConfig({ tier: "minimal", numThreads: 0, provider: "cuda", debug: -1 });
      expect(config).toMatchObject({ modelConfig: { numThreads: 0, provider: "cuda", debug: -1 } });
    })
  );
  it.effect("short circuits incomplete and throwing models while keeping strict error data", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const service = yield* RecognizerConfig;
      state.calls.length = 0;
      state.issue = "incomplete fixture";
      const incomplete = yield* service.tryConfig({ tier: "minimal" });
      expect(incomplete).toBeNull();
      expect(state.calls).toEqual(["issue:minimal"]);
      const failed = yield* service.paths("minimal").pipe(Effect.result);
      expect(Result.isFailure(failed)).toBe(true);
      if (Result.isFailure(failed)) expect(failed.failure.legacyMessage).toBe("incomplete fixture");
      state.issue = null;
      state.failRole = true;
      const roleFailure = yield* service.tryConfig({ tier: "minimal" });
      expect(roleFailure).toBeNull();
      state.failRole = false;
    })
  );
});
