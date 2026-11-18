import * as S from "effect/Schema";
import { TaskStatus } from "./Task.model.js";

export class IllegalTransition extends S.TaggedError<IllegalTransition, { readonly brand: unique symbol }>(
  "@vidbee/task-queue/IllegalTransition"
)("IllegalTransition", {
  from: TaskStatus,
  to: TaskStatus,
  reason: S.UndefinedOr(S.String),
  legacyMessage: S.String,
}) {}
export class HostFailure extends S.TaggedError<HostFailure, { readonly brand: unique symbol }>(
  "@vidbee/task-queue/HostFailure"
)("HostFailure", {
  original: S.Unknown,
  legacyMessage: S.String,
}) {}
export class TaskRowDecodeError extends S.TaggedError<TaskRowDecodeError, { readonly brand: unique symbol }>(
  "@vidbee/task-queue/TaskRowDecodeError"
)("TaskRowDecodeError", {
  taskId: S.String,
  column: S.String,
  issue: S.String,
  legacyMessage: S.String,
}) {}
export class TaskNotFound extends S.TaggedError<TaskNotFound, { readonly brand: unique symbol }>(
  "@vidbee/task-queue/TaskNotFound"
)("TaskNotFound", { legacyMessage: S.String }) {}
export class ParentTaskUnavailable extends S.TaggedError<ParentTaskUnavailable, { readonly brand: unique symbol }>(
  "@vidbee/task-queue/ParentTaskUnavailable"
)("ParentTaskUnavailable", { legacyMessage: S.String }) {}
export class InvalidTitle extends S.TaggedError<InvalidTitle, { readonly brand: unique symbol }>(
  "@vidbee/task-queue/InvalidTitle"
)("InvalidTitle", { legacyMessage: S.String }) {}
export class InvalidPathPair extends S.TaggedError<InvalidPathPair, { readonly brand: unique symbol }>(
  "@vidbee/task-queue/InvalidPathPair"
)("InvalidPathPair", { legacyMessage: S.String }) {}
export class FileInUse extends S.TaggedError<FileInUse, { readonly brand: unique symbol }>(
  "@vidbee/task-queue/FileInUse"
)("FileInUse", { legacyMessage: S.String }) {}
export class DependentTasksActive extends S.TaggedError<DependentTasksActive, { readonly brand: unique symbol }>(
  "@vidbee/task-queue/DependentTasksActive"
)("DependentTasksActive", { legacyMessage: S.String }) {}
export class TaskNotTerminal extends S.TaggedError<TaskNotTerminal, { readonly brand: unique symbol }>(
  "@vidbee/task-queue/TaskNotTerminal"
)("TaskNotTerminal", { legacyMessage: S.String }) {}
export class InvalidConcurrency extends S.TaggedError<InvalidConcurrency, { readonly brand: unique symbol }>(
  "@vidbee/task-queue/InvalidConcurrency"
)("InvalidConcurrency", { legacyMessage: S.String }) {}
export class ExecutorUnavailable extends S.TaggedError<ExecutorUnavailable, { readonly brand: unique symbol }>(
  "@vidbee/task-queue/ExecutorUnavailable"
)("ExecutorUnavailable", { legacyMessage: S.String }) {}
export class DuplicateTaskId extends S.TaggedError<DuplicateTaskId, { readonly brand: unique symbol }>(
  "@vidbee/task-queue/DuplicateTaskId"
)("DuplicateTaskId", { legacyMessage: S.String }) {}
export class StoreMissingTask extends S.TaggedError<StoreMissingTask, { readonly brand: unique symbol }>(
  "@vidbee/task-queue/StoreMissingTask"
)("StoreMissingTask", { legacyMessage: S.String }) {}
