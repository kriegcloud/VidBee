import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Model from "./Executor.model.js";
import type { HostFailure } from "./TaskQueue.errors.js";
export type ExecutorEvent =
  | ({ readonly type: "spawn" } & Model.ExecutorSpawnEvent)
  | ({ readonly type: "progress" } & Model.ExecutorProgressEvent)
  | { readonly type: "processing"; readonly taskId: string; readonly attemptId: string }
  | ({ readonly type: "std" } & Model.ExecutorStdEvent)
  | ({ readonly type: "finish" } & Model.ExecutorFinishEvent);
export interface ExecutorSink {
  readonly emit: (event: ExecutorEvent) => Effect.Effect<void>;
}
export interface ExecutorHandle {
  readonly cancel: (timeoutMs?: number) => Effect.Effect<void, HostFailure>;
  readonly pause: Effect.Effect<void, HostFailure>;
}
export class TaskExecutor extends Context.Service<
  TaskExecutor,
  {
    readonly run: (context: Model.ExecutorContext, sink: ExecutorSink) => Effect.Effect<ExecutorHandle, HostFailure>;
  }
>()("@vidbee/task-queue/TaskExecutor.service/TaskExecutor") {}
