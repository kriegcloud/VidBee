import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Transcription.errors.js";
export type CancelTimer = Effect.Effect<void>;
export interface TimerOptions {
  readonly keepAlive: boolean;
}
export class TranscriptionTime extends Context.Service<
  TranscriptionTime,
  {
    readonly now: Effect.Effect<number>;
    readonly monotonicMillis: Effect.Effect<number>;
    readonly readMonotonicMillis: () => number;
    readonly sleep: (ms: number) => Effect.Effect<void>;
    readonly after: (
      ms: number,
      action: Effect.Effect<void, HostFailure>,
      options: TimerOptions
    ) => Effect.Effect<CancelTimer>;
    readonly every: (
      ms: number,
      action: Effect.Effect<void, HostFailure>,
      options: TimerOptions
    ) => Effect.Effect<CancelTimer>;
    readonly microtask: (action: Effect.Effect<void, HostFailure>) => Effect.Effect<void, HostFailure>;
  }
>()("@vidbee/transcription/TranscriptionTime.service/TranscriptionTime") {}
