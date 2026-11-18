import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { SqlError } from "effect/sql/SqlError";
import type {
  JournalAppendInput,
  PersistTransitionInput,
  RecordCloseInput,
  RecordSpawnInput,
} from "./Persist.model.js";
import type { AttemptRow, ProcessJournalRow, Task, TaskProgress } from "./Task.model.js";
import type { HostFailure, TaskRowDecodeError } from "./TaskQueue.errors.js";
export type PersistenceError = SqlError | HostFailure | TaskRowDecodeError;
export class TaskPersistence extends Context.Service<
  TaskPersistence,
  {
    readonly hasTask: (taskId: string) => Effect.Effect<boolean, PersistenceError>;
    readonly insertTask: (task: Task) => Effect.Effect<void, PersistenceError>;
    readonly upsertTask: (input: PersistTransitionInput) => Effect.Effect<void, PersistenceError>;
    readonly upsertTasks: (inputs: PersistTransitionInput[]) => Effect.Effect<void, PersistenceError>;
    readonly upsertProgress: (taskId: string, progress: TaskProgress) => Effect.Effect<void, PersistenceError>;
    readonly deleteTask: (taskId: string) => Effect.Effect<void, PersistenceError>;
    readonly insertAttempt: (input: RecordSpawnInput) => Effect.Effect<void, PersistenceError>;
    readonly closeAttempt: (input: RecordCloseInput) => Effect.Effect<void, PersistenceError>;
    readonly appendJournal: (input: JournalAppendInput) => Effect.Effect<void, PersistenceError>;
    readonly findOpenSpawns: Effect.Effect<ProcessJournalRow[], PersistenceError>;
    readonly loadAllTasks: Effect.Effect<Task[], PersistenceError>;
    readonly loadLatestAttempt: (taskId: string) => Effect.Effect<AttemptRow | null, PersistenceError>;
    readonly maintenance: Effect.Effect<void, PersistenceError>;
    readonly close: Effect.Effect<void, PersistenceError>;
  }
>()("@vidbee/task-queue/TaskPersistence.service/TaskPersistence") {}
