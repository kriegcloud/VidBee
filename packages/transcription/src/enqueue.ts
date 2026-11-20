import { TERMINAL_STATUSES } from "@vidbee/task-queue/types";
import * as HashSet from "effect/HashSet";
import type { Task } from "@vidbee/task-queue/Task.model";

export { layer } from "./Enqueue.layer.js";
export { Enqueue } from "./Enqueue.service.js";
export type { EnqueueTranscriptionInput, EnqueueTranscriptionResult } from "./Enqueue.model.js";
export const isTerminalTranscription = (task: Readonly<Task>): boolean => HashSet.has(TERMINAL_STATUSES, task.status);
