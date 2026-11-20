import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { MinimalModelFillOptions } from "./MinimalModelFill.model.js";
import type { HostFailure } from "./Transcription.errors.js";
export interface MinimalFillTimer {
  readonly cancel: Effect.Effect<void>;
  readonly truthy: boolean;
}
export interface MinimalFillHandle {
  readonly stop: Effect.Effect<void>;
}
export class MinimalFillSchedule extends Context.Service<
  MinimalFillSchedule,
  {
    readonly schedule: (
      action: Effect.Effect<void, HostFailure>,
      ms: number
    ) => Effect.Effect<MinimalFillTimer, HostFailure>;
  }
>()("@vidbee/transcription/MinimalModelFill.service/MinimalFillSchedule") {}
export class MinimalFillHooks extends Context.Service<
  MinimalFillHooks,
  {
    readonly ready: Effect.Effect<void, HostFailure>;
    readonly failed: (error: unknown) => Effect.Effect<void, HostFailure>;
  }
>()("@vidbee/transcription/MinimalModelFill.service/MinimalFillHooks") {}
export class MinimalModelFill extends Context.Service<
  MinimalModelFill,
  { readonly start: (options?: MinimalModelFillOptions) => Effect.Effect<MinimalFillHandle, HostFailure> }
>()("@vidbee/transcription/MinimalModelFill.service/MinimalModelFill") {}
