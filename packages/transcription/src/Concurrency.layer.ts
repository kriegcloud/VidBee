import { TaskQueue } from "@vidbee/task-queue/TaskQueue.service";
import { TRANSCRIPTION_GROUP_KEY } from "@vidbee/task-queue/types";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ConcurrencyQueue, TranscriptionConcurrency } from "./Concurrency.service.js";
import { clampMaxConcurrentDownloads, clampMaxConcurrentTranscriptions } from "./concurrency.js";
/** Native queue effects complete in order; compatibility setter primitives deliberately discard Promise returns. */
export const ConcurrencyQueueLive = Layer.effect(
  ConcurrencyQueue,
  Effect.map(TaskQueue, (queue) => ({
    setMaxConcurrency: queue.setMaxConcurrency,
    setMaxPerGroup: queue.setMaxPerGroup,
    setMaxConcurrentDownloads: queue.setMaxConcurrentDownloads,
  }))
);
export const make = Effect.fnUntraced(function* () {
  const queue = yield* ConcurrencyQueue;
  return TranscriptionConcurrency.of({
    apply: Effect.fn("TranscriptionConcurrency.apply")(function* (settings) {
      const downloads = clampMaxConcurrentDownloads(settings.maxConcurrentDownloads);
      const transcriptions = clampMaxConcurrentTranscriptions(settings.maxConcurrentTranscriptions);
      yield* queue.setMaxConcurrency(Math.max(downloads, transcriptions));
      yield* queue.setMaxPerGroup(TRANSCRIPTION_GROUP_KEY, transcriptions);
      yield* queue.setMaxConcurrentDownloads(downloads);
    }),
  });
});
export const TranscriptionConcurrencyLive = Layer.effect(TranscriptionConcurrency, make());
