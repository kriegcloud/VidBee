import * as S from "effect/Schema";
import { ClassifiedError, ProcessKind, StdStream, TaskInput, TaskOutput, TaskProgress } from "./Task.model.js";

export const ExecutorSpawnEvent = S.Struct({
  taskId: S.mutableKey(S.String),
  attemptId: S.mutableKey(S.String),
  pid: S.mutableKey(S.Finite),
  pidStartedAt: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  kind: S.mutableKey(ProcessKind),
  spawnedAt: S.mutableKey(S.Finite),
});
export type ExecutorSpawnEvent = typeof ExecutorSpawnEvent.Type;

export const ExecutorProgressEvent = S.Struct({
  taskId: S.mutableKey(S.String),
  attemptId: S.mutableKey(S.String),
  progress: S.mutableKey(TaskProgress),
  enteredProcessing: S.mutableKey(S.Boolean),
});
export type ExecutorProgressEvent = typeof ExecutorProgressEvent.Type;

export const ExecutorStdEvent = S.Struct({
  taskId: S.mutableKey(S.String),
  attemptId: S.mutableKey(S.String),
  stream: StdStream.pipe(S.mutableKey),
  line: S.mutableKey(S.String),
  expectedSilenceMs: S.optional(S.Finite).pipe(S.mutableKey),
});
export type ExecutorStdEvent = typeof ExecutorStdEvent.Type;

export const ExecutorFinishEvent = S.Struct({
  taskId: S.mutableKey(S.String),
  attemptId: S.mutableKey(S.String),
  result: S.Union([
    S.Struct({
      type: S.mutableKey(S.Literal("success")),
      output: S.mutableKey(TaskOutput),
    }),
    S.Struct({
      type: S.mutableKey(S.Literal("error")),
      error: S.mutableKey(ClassifiedError),
      exitCode: S.mutableKey(S.Union([S.Finite, S.Null])),
    }),
    S.Struct({
      type: S.mutableKey(S.Literal("cancelled")),
    }),
  ]).pipe(S.mutableKey),
  closedAt: S.mutableKey(S.Finite),
  stdoutTail: S.mutableKey(S.String),
  stderrTail: S.mutableKey(S.String),
});
export type ExecutorFinishEvent = typeof ExecutorFinishEvent.Type;

export const ExecutorContext = S.Struct({
  taskId: S.mutableKey(S.String),
  attemptId: S.mutableKey(S.String),
  attemptNumber: S.mutableKey(S.Finite),
  input: S.mutableKey(TaskInput),
});
export type ExecutorContext = typeof ExecutorContext.Type;
