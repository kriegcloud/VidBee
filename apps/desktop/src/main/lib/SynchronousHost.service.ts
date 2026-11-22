import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { DeliveryError } from "../../renderer/src/transport/DocumentDelivery.errors.js";

/** Qualified ordinary authority is revoked before interruption; cleanup is captured release only. */
export interface SynchronousCall {
  readonly cleanup: (release: () => void) => void;
  readonly use: <A>(body: () => A) => A;
}
export class SynchronousHost extends Context.Service<
  SynchronousHost,
  {
    readonly run: <A, E>(make: (call: SynchronousCall) => Effect.Effect<A, E>) => A;
    readonly drain: Effect.Effect<void, DeliveryError>;
  }
>()("vidbee/main/lib/SynchronousHost.service/SynchronousHost") {}
