import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SubscriptionDispatch } from "./SubscriptionDispatch.service.js";
export const layer = Layer.effect(
  SubscriptionDispatch,
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    return SubscriptionDispatch.of({
      detach: Effect.fn("SubscriptionDispatch.detach")((operation) =>
        operation.pipe(
          Effect.tapCause((cause) => Effect.logError(cause)),
          Effect.forkIn(scope, { startImmediately: true }),
          Effect.asVoid
        )
      ),
    });
  })
);
