import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as T from "./Task.model.js";
import type * as Errors from "./TaskQueue.errors.js";
import type { ListOptions } from "./TaskQueue.model.js";

export interface TaskPage {
  nextCursor: string | null;
  tasks: T.Task[];
}
export interface TaskStoreShape {
  get(id: string): Effect.Effect<Readonly<T.Task> | undefined>;
  has(id: string): Effect.Effect<boolean>;
  insert(task: T.Task): Effect.Effect<void, Errors.DuplicateTaskId>;
  list(options?: ListOptions): Effect.Effect<TaskPage>;
  remove(id: string): Effect.Effect<boolean>;
  size: Effect.Effect<number>;
  snapshot(id: string): Effect.Effect<T.TaskSnapshot | undefined>;
  stats(capacity: number): Effect.Effect<T.TaskQueueStats>;
  update(task: T.Task): Effect.Effect<void, Errors.StoreMissingTask>;
}
export class TaskStore extends Context.Service<TaskStore, TaskStoreShape>()(
  "@vidbee/task-queue/TaskStore.service/TaskStore"
) {}
