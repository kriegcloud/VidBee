import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { makeModelsLayer } from "./Models.layer.js";
import { Models } from "./Models.service.js";
import { Pipeline } from "./Pipeline.service.js";
import { makeLayer as fakeLayer } from "./pipeline-fake.js";
import { recognizerConfig } from "./RecognizerConfig.js";
import { Sherpa } from "./Sherpa.service.js";
import { makeLayer as sherpaLayer } from "./SherpaPipeline.layer.js";
import { TranscriptionHost } from "./TranscriptionHost.service.js";
import { WorkerSessionFactory } from "./WorkerHandler.service.js";
import type { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import type * as Path from "effect/Path";
import type { Audio } from "./Audio.service.js";
import type { Checkpoints } from "./Checkpoints.service.js";
import type { ModelFileIO, ModelFiles } from "./ModelFiles.service.js";
import type { ModelHttp } from "./ModelHttp.service.js";
import type { ModelsHooks } from "./Models.service.js";
import type { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import type { TranscriptionTime } from "./TranscriptionTime.service.js";
export const WorkerSessionFactoryLive = Layer.effect(
  WorkerSessionFactory,
  Effect.gen(function* () {
    const dependencies = yield* Effect.context<
      | ModelFiles
      | ModelFileIO
      | ModelHttp
      | TranscriptionFiles
      | TranscriptionTime
      | ModelsHooks
      | LegacyTiming
      | Path.Path
      | Audio
      | Checkpoints
      | Sherpa
    >();
    const scope = yield* Effect.scope;
    const sherpa = yield* Sherpa;
    const host = yield* TranscriptionHost;
    return WorkerSessionFactory.of({
      probeAddon: sherpa.session,
      fakeProbe: Effect.map(host.snapshot, (value) => value.environment.VIDBEE_TRANSCRIPTION_BACKEND === "fake"),
      create: Effect.fn("WorkerSessionFactory.create")(function* (modelsDir) {
        const context = yield* Layer.buildWithScope(makeModelsLayer({ modelsDir }), scope).pipe(
          Effect.provide(dependencies)
        );
        const models = Context.get(context, Models);
        return {
          beginPrepare: Effect.fn("WorkerSessionFactory.beginPrepare")(function* (tier, skip) {
            if (skip) return { wait: Effect.void };
            const fiber = yield* models
              .ensureReady({ groups: ["asr"], tiers: [tier] })
              .pipe(Effect.asVoid, Effect.forkIn(scope));
            return { wait: Fiber.join(fiber) };
          }),
          config: Effect.fn("WorkerSessionFactory.config")((tier, provider) =>
            recognizerConfig(tier, provider).pipe(
              Effect.provide(context),
              Effect.orElseSucceed(() => null)
            )
          ),
          run: Effect.fn("WorkerSessionFactory.run")(function* (message, input, sink) {
            const selected: Layer.Layer<
              Pipeline,
              never,
              TranscriptionTime | Audio | Checkpoints | LegacyTiming | Models | Sherpa
            > = message.backend === "fake" ? fakeLayer() : sherpaLayer({ provider: message.provider });
            const services = yield* Layer.buildWithScope(selected, scope).pipe(
              Effect.provide(Context.merge(dependencies, context))
            );
            return yield* Context.get(services, Pipeline).run(input, sink);
          }),
        };
      }),
    });
  })
);
