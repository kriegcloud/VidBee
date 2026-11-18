import * as S from "effect/Schema";
import { AttemptRow, ProcessJournalOp, Task, TaskProgress } from "./Task.model.js";

export const PersistTransitionInput = S.Struct({
  task: S.mutableKey(Task),
  progress: S.mutableKey(TaskProgress),
});
export type PersistTransitionInput = typeof PersistTransitionInput.Type;

export const RecordSpawnInput = S.Struct({
  taskId: S.mutableKey(S.String),
  attemptId: S.mutableKey(S.String),
  pid: S.mutableKey(S.Finite),
  pidStartedAt: S.mutableKey(S.Union([S.Finite, S.Null])),
  startedAt: S.mutableKey(S.Finite),
  rawArgsHash: S.mutableKey(S.String),
});
export type RecordSpawnInput = typeof RecordSpawnInput.Type;

export const RecordCloseInput = S.Struct({
  taskId: S.mutableKey(S.String),
  attemptId: S.mutableKey(S.String),
  endedAt: S.mutableKey(S.Finite),
  exitCode: S.mutableKey(S.Union([S.Finite, S.Null])),
  errorCategory: S.mutableKey(AttemptRow.fields.errorCategory),
  stdoutTail: S.mutableKey(S.Union([S.String, S.Null])),
  stderrTail: S.mutableKey(S.Union([S.String, S.Null])),
});
export type RecordCloseInput = typeof RecordCloseInput.Type;

export const JournalAppendInput = S.Struct({
  ts: S.mutableKey(S.Finite),
  op: S.mutableKey(ProcessJournalOp),
  taskId: S.mutableKey(S.String),
  attemptId: S.mutableKey(S.Union([S.String, S.Null])),
  pid: S.mutableKey(S.Finite),
  pidStartedAt: S.mutableKey(S.Union([S.Finite, S.Null])),
  exitCode: S.mutableKey(S.Union([S.Finite, S.Null])),
  signal: S.mutableKey(S.Union([S.String, S.Null])),
});
export type JournalAppendInput = typeof JournalAppendInput.Type;
