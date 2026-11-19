import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { MinimalFillHooks, MinimalFillSchedule, MinimalModelFill } from "./MinimalModelFill.service.js";
import { Models } from "./Models.service.js";
import { MINIMAL_MODEL_GROUPS, MINIMAL_MODEL_TIERS } from "./model-catalog.js";
import { HostFailure } from "./Transcription.errors.js";
import { TranscriptionTime } from "./TranscriptionTime.service.js";
import type { MinimalFillTimer } from "./MinimalModelFill.service.js";

const DEFAULT_DELAYS = [0, 5000, 15000, 45000, 120000, 600000];
export const scheduleLayer = Layer.effect(
  MinimalFillSchedule,
  Effect.map(TranscriptionTime, (time) => ({
    schedule: Effect.fn("MinimalFillSchedule.schedule")((action, ms) =>
      time.after(ms, action, { keepAlive: true }).pipe(Effect.map((cancel) => ({ cancel, truthy: true })))
    ),
  }))
);
/** Stopping removes future timers; an already running ensure retains its success continuation. */
export const layer = Layer.effect(
  MinimalModelFill,
  Effect.gen(function* () {
    const models = yield* Models;
    const schedule = yield* MinimalFillSchedule;
    const hooks = yield* MinimalFillHooks;
    const timing = yield* LegacyTiming;
    const owner = yield* Effect.scope;
    return MinimalModelFill.of({
      start: Effect.fn("MinimalModelFill.start")(function* (options) {
        const delays = options?.delaysMs ?? DEFAULT_DELAYS;
        let stopped = false;
        let attempt = 0;
        let timer: MinimalFillTimer | null = null;
        const run: Effect.Effect<void, HostFailure> = Effect.suspend(() =>
          stopped ? Effect.void : body.pipe(Effect.forkIn(owner, { startImmediately: true }), Effect.asVoid)
        );
        const body: Effect.Effect<void, HostFailure> = models
          .ensureReady({ groups: MINIMAL_MODEL_GROUPS, tiers: MINIMAL_MODEL_TIERS })
          .pipe(
            Effect.andThen(timing.turn("minimal-fill.ready")),
            Effect.andThen(hooks.ready),
            Effect.catch(
              Effect.fn("MinimalModelFill.failed")(function* (error) {
                if (stopped) return;
                yield* hooks.failed(S.is(HostFailure)(error) ? error.cause : error);
                attempt = Math.min(attempt + 1, delays.length - 1);
                timer = yield* schedule.schedule(run, delays[attempt] ?? 600000);
              })
            )
          );
        timer = yield* schedule.schedule(run, delays[0] ?? 0);
        return {
          stop: Effect.suspend(() => {
            stopped = true;
            return timer?.truthy === true ? timer.cancel : Effect.void;
          }),
        };
      }),
    });
  })
);
