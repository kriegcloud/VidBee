import * as S from "effect/Schema";
import { TaskInput, TaskKind, TaskOutput, TaskPriority, TaskStatus } from "./Task.model.js";

export const ImportCompletedRequest = S.Struct({
  input: S.mutableKey(TaskInput),
  output: S.mutableKey(TaskOutput),
  id: S.optional(S.String).pipe(S.mutableKey),
  groupKey: S.optional(S.String).pipe(S.mutableKey),
});
export type ImportCompletedRequest = typeof ImportCompletedRequest.Type;

export const AddTaskRequest = S.Struct({
  input: S.mutableKey(TaskInput),
  priority: S.optional(TaskPriority).pipe(S.mutableKey),
  groupKey: S.optional(S.String).pipe(S.mutableKey),
  parentId: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  maxAttempts: S.optional(S.Finite).pipe(S.mutableKey),
  id: S.optional(S.String).pipe(S.mutableKey),
});
export type AddTaskRequest = typeof AddTaskRequest.Type;

export const ListOptions = S.Struct({
  query: S.optional(S.String).pipe(S.mutableKey),
  kind: S.optional(TaskKind).pipe(S.mutableKey),
  status: S.optional(TaskStatus).pipe(S.mutableKey),
  groupKey: S.optional(S.String).pipe(S.mutableKey),
  parentId: S.optional(S.String).pipe(S.mutableKey),
  limit: S.optional(S.Finite).pipe(S.mutableKey),
  cursor: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
});
export type ListOptions = typeof ListOptions.Type;
