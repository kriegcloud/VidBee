import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
import { ClassifiedError, StdStream, TaskProgressReadonly, TaskReadonly, TaskStatus } from "./Task.model.js";

export const TransitionEvent = S.Struct({
  type: S.mutableKey(S.Literal("transition")),
  taskId: S.mutableKey(S.String),
  from: S.mutableKey(S.Union([TaskStatus, S.Null])),
  to: S.mutableKey(TaskStatus),
  reason: S.mutableKey(S.Union([S.String, S.Null])),
  attempt: S.mutableKey(S.Finite),
  at: S.mutableKey(S.Finite),
});
export type TransitionEvent = typeof TransitionEvent.Type;

export const ProgressEvent = S.Struct({
  type: S.mutableKey(S.Literal("progress")),
  taskId: S.mutableKey(S.String),
  progress: S.mutableKey(TaskProgressReadonly),
  at: S.mutableKey(S.Finite),
});
export type ProgressEvent = typeof ProgressEvent.Type;

export const SnapshotChangedEvent = S.Struct({
  type: S.mutableKey(S.Literal("snapshot-changed")),
  taskId: S.mutableKey(S.String),
  task: S.mutableKey(TaskReadonly),
  at: S.mutableKey(S.Finite),
});
export type SnapshotChangedEvent = typeof SnapshotChangedEvent.Type;

export const TaskRemovedEvent = S.Struct({
  type: S.mutableKey(S.Literal("task-removed")),
  taskId: S.mutableKey(S.String),
  at: S.mutableKey(S.Finite),
});
export type TaskRemovedEvent = typeof TaskRemovedEvent.Type;

export const OrphanKilledEvent = S.Struct({
  type: S.mutableKey(S.Literal("orphan-killed")),
  taskId: S.mutableKey(S.String),
  pid: S.mutableKey(S.Finite),
  pidStartedAt: S.mutableKey(S.Union([S.Finite, S.Null])),
  signal: S.mutableKey(LiteralKit(["SIGTERM", "SIGKILL"])),
  at: S.mutableKey(S.Finite),
});
export type OrphanKilledEvent = typeof OrphanKilledEvent.Type;

export const ErrorClassifiedEvent = S.Struct({
  type: S.mutableKey(S.Literal("error-classified")),
  taskId: S.mutableKey(S.String),
  attempt: S.mutableKey(S.Finite),
  error: S.mutableKey(ClassifiedError),
  at: S.mutableKey(S.Finite),
});
export type ErrorClassifiedEvent = typeof ErrorClassifiedEvent.Type;

export const LogEvent = S.Struct({
  type: S.mutableKey(S.Literal("log")),
  taskId: S.mutableKey(S.String),
  attemptId: S.mutableKey(S.String),
  stream: S.mutableKey(StdStream),
  line: S.mutableKey(S.String),
  at: S.mutableKey(S.Finite),
});
export type LogEvent = typeof LogEvent.Type;

export const TaskQueueEvent = S.Union([
  TransitionEvent,
  ProgressEvent,
  SnapshotChangedEvent,
  TaskRemovedEvent,
  OrphanKilledEvent,
  ErrorClassifiedEvent,
  LogEvent,
]);
export type TaskQueueEvent = typeof TaskQueueEvent.Type;
