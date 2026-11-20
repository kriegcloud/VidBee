import * as Context from "effect/Context";
import type { QueueError } from "@vidbee/task-queue/TaskQueue.service";
import type * as Effect from "effect/Effect";
import type { ConcurrencySettings } from "./Concurrency.model.js";
import type { HostFailure } from "./Transcription.errors.js";
export type ConcurrencyError = HostFailure | QueueError;
export class ConcurrencyQueue extends Context.Service<
  ConcurrencyQueue,
  {
    readonly setMaxConcurrency: (value: number) => Effect.Effect<void, ConcurrencyError>;
    readonly setMaxPerGroup: (group: string, value: number | null) => Effect.Effect<void, ConcurrencyError>;
    readonly setMaxConcurrentDownloads: (value: number) => Effect.Effect<void, ConcurrencyError>;
  }
>()("@vidbee/transcription/Concurrency.service/ConcurrencyQueue") {}
export class TranscriptionConcurrency extends Context.Service<
  TranscriptionConcurrency,
  {
    readonly apply: (settings: ConcurrencySettings) => Effect.Effect<void, ConcurrencyError, ConcurrencyQueue>;
  }
>()("@vidbee/transcription/Concurrency.service/TranscriptionConcurrency") {}
