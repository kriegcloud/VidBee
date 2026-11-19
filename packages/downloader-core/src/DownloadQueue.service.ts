import * as Context from "effect/Context";
import type { AddTaskRequest } from "@vidbee/task-queue/TaskQueue.model";
import type { Task } from "@vidbee/task-queue/types";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Downloader.errors.js";
export interface DownloadQueueOperations {
  readonly add: (request: AddTaskRequest) => Effect.Effect<{ readonly id: string }, HostFailure>;
  readonly get: (id: string) => Effect.Effect<Readonly<Task> | undefined>;
  readonly identity: object;
  readonly list: (options: {
    readonly limit: number;
    readonly cursor: string | null;
  }) => Effect.Effect<{ readonly tasks: ReadonlyArray<Readonly<Task>>; readonly nextCursor: string | null }>;
  readonly retryManual: (id: string, options?: Task["input"]["options"]) => Effect.Effect<void, HostFailure>;
  readonly setMaxPerGroup: (group: string, maximum: number | null) => Effect.Effect<void, HostFailure>;
}
/** The adapter borrows the host queue; it never creates a queue or database. */
export class DownloadQueue extends Context.Service<DownloadQueue, DownloadQueueOperations>()(
  "@vidbee/downloader-core/DownloadQueue.service/DownloadQueue"
) {}
