import * as Context from "effect/Context";
import type { TaskQueueEvent } from "@vidbee/task-queue/Events.model";
import type { Task } from "@vidbee/task-queue/Task.model";
import type { AddTaskRequest, ListOptions } from "@vidbee/task-queue/TaskQueue.model";
import type { QueueError } from "@vidbee/task-queue/TaskQueue.service";
import type { TaskPage } from "@vidbee/task-queue/TaskStore.service";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Transcription.errors.js";
export type TranscriptionQueueError = QueueError | HostFailure;
export interface TranscriptionQueueSubscription {
  readonly unsubscribe: Effect.Effect<void>;
}
export interface TranscriptionQueueSink {
  readonly emit: (event: TaskQueueEvent) => Effect.Effect<void, HostFailure>;
}
/** A borrowed queue capability; this service never creates another work queue. */
export class TranscriptionQueue extends Context.Service<
  TranscriptionQueue,
  {
    readonly get: (id: string) => Effect.Effect<Readonly<Task> | undefined, TranscriptionQueueError>;
    readonly list: (options?: ListOptions) => Effect.Effect<TaskPage, TranscriptionQueueError>;
    readonly add: (request: AddTaskRequest) => Effect.Effect<{ id: string }, TranscriptionQueueError>;
    readonly cancel: (id: string, reason?: string) => Effect.Effect<void, TranscriptionQueueError>;
    readonly retryManual: (id: string) => Effect.Effect<void, TranscriptionQueueError>;
    readonly subscribe: (
      sink: TranscriptionQueueSink
    ) => Effect.Effect<TranscriptionQueueSubscription, TranscriptionQueueError>;
  }
>()("@vidbee/transcription/TranscriptionQueue.service/TranscriptionQueue") {}
