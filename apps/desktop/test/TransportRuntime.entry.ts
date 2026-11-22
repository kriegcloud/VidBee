import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

/** Real runtime fixture for assertions about the entrypoint's execution/teardown semantics. */
export const runtime = Effect.acquireRelease(
  Effect.sync(() => ManagedRuntime.make(Layer.empty)),
  (owned) => owned.disposeEffect
);
