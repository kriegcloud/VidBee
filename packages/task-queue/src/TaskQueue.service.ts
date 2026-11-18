import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { TaskQueueEvent } from "./Events.model.js";
import type * as T from "./Task.model.js";
import type { TaskQueueListener, Unsubscribe } from "./TaskEvents.service.js";
import type { PersistenceError } from "./TaskPersistence.service.js";
import type * as E from "./TaskQueue.errors.js";
import type * as M from "./TaskQueue.model.js";
import type { TaskPage } from "./TaskStore.service.js";
export type QueueError =
  | PersistenceError
  | E.IllegalTransition
  | E.TaskNotFound
  | E.ParentTaskUnavailable
  | E.InvalidTitle
  | E.InvalidPathPair
  | E.FileInUse
  | E.DependentTasksActive
  | E.TaskNotTerminal
  | E.InvalidConcurrency
  | E.ExecutorUnavailable
  | E.DuplicateTaskId
  | E.StoreMissingTask;
export interface TaskQueueShape {
  readonly add: (request: M.AddTaskRequest) => Effect.Effect<{ id: string }, QueueError>;
  readonly cancel: (id: string, reason?: string) => Effect.Effect<void, QueueError>;
  readonly findDuplicateDownload: (
    input: T.TaskInput,
    parentId?: string | null
  ) => Effect.Effect<Readonly<T.Task> | undefined>;
  readonly get: (id: string) => Effect.Effect<Readonly<T.Task> | undefined>;
  readonly getTaskLog: (id: string) => Effect.Effect<string | null, QueueError>;
  readonly hasTask: (id: string) => Effect.Effect<boolean, QueueError>;
  readonly importCompleted: (
    request: M.ImportCompletedRequest
  ) => Effect.Effect<{ id: string; created: boolean }, QueueError>;
  readonly list: (options?: M.ListOptions) => Effect.Effect<TaskPage>;
  readonly on: <K extends TaskQueueEvent["type"]>(
    type: K,
    listener: TaskQueueListener<Extract<TaskQueueEvent, { type: K }>>
  ) => Effect.Effect<Unsubscribe>;
  readonly pause: (id: string, reason?: string) => Effect.Effect<void, QueueError>;
  readonly reconcileQueue: Effect.Effect<void, QueueError>;
  readonly relocateFileReferences: (from: string, to: string) => Effect.Effect<void, QueueError>;
  readonly removeFromHistory: (id: string) => Effect.Effect<void, QueueError>;
  readonly rename: (id: string, title: string) => Effect.Effect<void, QueueError>;
  readonly resume: (id: string) => Effect.Effect<void, QueueError>;
  readonly retryManual: (id: string, options?: T.TaskInput["options"]) => Effect.Effect<void, QueueError>;
  readonly setMaxConcurrency: (n: number) => Effect.Effect<void, QueueError>;
  readonly setMaxConcurrentDownloads: (n: number) => Effect.Effect<void, QueueError>;
  readonly setMaxPerGroup: (group: string, n: number | null) => Effect.Effect<void, QueueError>;
  readonly start: Effect.Effect<void, QueueError>;
  readonly stats: Effect.Effect<T.TaskQueueStats>;
  readonly stop: Effect.Effect<void, QueueError>;
  readonly subscribe: (listener: TaskQueueListener) => Effect.Effect<Unsubscribe>;
}
export class TaskQueue extends Context.Service<TaskQueue, TaskQueueShape>()(
  "@vidbee/task-queue/TaskQueue.service/TaskQueue"
) {}

export interface TaskQueueHandlers {
  readonly demote: (id: string) => Effect.Effect<void>;
  readonly dispatch: (id: string) => Effect.Effect<boolean, QueueError>;
  readonly retryDue: (id: string, at: number) => Effect.Effect<void, QueueError>;
  readonly stalled: (
    id: string,
    entry: Readonly<import("./process/Watchdog.service.js").WatchdogEntry>
  ) => Effect.Effect<void>;
}
export class TaskQueueHooks extends Context.Service<
  TaskQueueHooks,
  TaskQueueHandlers & {
    readonly bind: (handlers: TaskQueueHandlers) => Effect.Effect<void>;
  }
>()("@vidbee/task-queue/TaskQueue.service/TaskQueueHooks") {
  static readonly layer = Layer.sync(TaskQueueHooks, () => {
    let handlers: TaskQueueHandlers | undefined;
    const unbound = Effect.die("Task queue callback service used before binding the queue");
    return TaskQueueHooks.of({
      bind: Effect.fn("TaskQueueHooks.bind")((next) =>
        Effect.sync(() => {
          handlers = next;
        })
      ),
      dispatch: Effect.fn("TaskQueueHooks.dispatch")((id) =>
        Effect.suspend(() => (handlers === undefined ? unbound : handlers.dispatch(id)))
      ),
      demote: Effect.fn("TaskQueueHooks.demote")((id) =>
        Effect.suspend(() => (handlers === undefined ? unbound : handlers.demote(id)))
      ),
      retryDue: Effect.fn("TaskQueueHooks.retryDue")((id, at) =>
        Effect.suspend(() => (handlers === undefined ? unbound : handlers.retryDue(id, at)))
      ),
      stalled: Effect.fn("TaskQueueHooks.stalled")((id, entry) =>
        Effect.suspend(() => (handlers === undefined ? unbound : handlers.stalled(id, entry)))
      ),
    });
  });
}
