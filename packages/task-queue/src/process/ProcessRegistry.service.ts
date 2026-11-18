import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ProcessKind } from "../Task.model.js";
import type { PersistenceError } from "../TaskPersistence.service.js";
export interface ProcessHandle {
  attemptId: string;
  kind: ProcessKind;
  pid: number;
  pidStartedAt: number | null;
  spawnedAt: number;
  taskId: string;
}
export interface ReconciledProcess {
  attemptId: string | null;
  killed: boolean;
  pid: number;
  taskId: string;
}
export class ProcessRegistry extends Context.Service<
  ProcessRegistry,
  {
    readonly recordSpawn: (input: ProcessHandle) => Effect.Effect<void, PersistenceError>;
    readonly recordClose: (
      taskId: string,
      attemptId: string,
      exitCode: number | null,
      signal: string | null
    ) => Effect.Effect<void, PersistenceError>;
    readonly cancel: (taskId: string, attemptId: string) => Effect.Effect<void, PersistenceError>;
    readonly reconcile: Effect.Effect<ReconciledProcess[], PersistenceError>;
    readonly size: Effect.Effect<number>;
  }
>()("@vidbee/task-queue/process/ProcessRegistry.service/ProcessRegistry") {}
