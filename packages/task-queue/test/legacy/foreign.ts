import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Scheduler from "effect/Scheduler";

const foreign = ManagedRuntime.make(Layer.empty);
export const releaseFromForeignOwner = (effect: Effect.Effect<void>): void => {
  foreign.runSync(effect.pipe(Effect.provideService(Scheduler.PreventSchedulerYield, false)));
};
