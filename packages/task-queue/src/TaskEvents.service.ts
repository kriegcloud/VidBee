import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import type { TaskQueueEvent } from "./Events.model.js";
export type TaskQueueListener<E extends TaskQueueEvent = TaskQueueEvent> = (event: E) => void;
export type Unsubscribe = () => void;
export class TaskEvents extends Context.Service<
  TaskEvents,
  {
    readonly emit: (event: TaskQueueEvent) => Effect.Effect<void>;
    readonly subscribe: (listener: TaskQueueListener) => Effect.Effect<Unsubscribe>;
    readonly on: <T extends TaskQueueEvent["type"]>(
      type: T,
      listener: TaskQueueListener<Extract<TaskQueueEvent, { type: T }>>
    ) => Effect.Effect<Unsubscribe>;
    readonly stream: Stream.Stream<TaskQueueEvent>;
  }
>()("@vidbee/task-queue/TaskEvents.service/TaskEvents") {}
