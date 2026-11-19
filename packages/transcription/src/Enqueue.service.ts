import * as Context from "effect/Context";
import type { Task } from "@vidbee/task-queue/Task.model";
import type * as Effect from "effect/Effect";
import type { EnqueueTranscriptionInput, EnqueueTranscriptionResult } from "./Enqueue.model.js";
import type { TranscriptionError } from "./Transcription.errors.js";
import type { TranscriptionQueueError } from "./TranscriptionQueue.service.js";
import type { TranscriptionRecordError } from "./TranscriptionRecords.service.js";
export type EnqueueError = TranscriptionQueueError | TranscriptionRecordError | TranscriptionError;
export class Enqueue extends Context.Service<
  Enqueue,
  {
    readonly children: (downloadId: string) => Effect.Effect<Readonly<Task>[], TranscriptionQueueError>;
    readonly active: (downloadId: string) => Effect.Effect<Readonly<Task> | undefined, TranscriptionQueueError>;
    readonly enqueue: (input: EnqueueTranscriptionInput) => Effect.Effect<EnqueueTranscriptionResult, EnqueueError>;
  }
>()("@vidbee/transcription/Enqueue.service/Enqueue") {}
