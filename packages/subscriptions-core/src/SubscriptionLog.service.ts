import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as Context from "effect/Context";
import type * as Cause from "effect/Cause";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Subscriptions.errors.js";
export const SubscriptionLogLevel = LiteralKit(["info", "warn", "error"]);
export type SubscriptionLogLevel = typeof SubscriptionLogLevel.Type;
export class SubscriptionLog extends Context.Service<
  SubscriptionLog,
  {
    readonly write: (
      level: SubscriptionLogLevel,
      message: string,
      metadata?: unknown,
      cause?: Cause.Cause<unknown>
    ) => Effect.Effect<void, HostFailure>;
  }
>()("@vidbee/subscriptions-core/SubscriptionLog.service/SubscriptionLog") {}
