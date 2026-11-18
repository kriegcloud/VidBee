import { dual } from "effect/Function";
import { EMPTY_PROGRESS } from "../src/types.js";
import type { Task } from "../src/types.js";

export const task: {
  (id: string, overrides?: Partial<Task>): Task;
  (overrides?: Partial<Task>): (id: string) => Task;
} = dual(
  (args) => typeof args[0] === "string",
  (id: string, overrides: Partial<Task> = {}): Task => ({
    id,
    kind: "video",
    parentId: null,
    input: { kind: "video", url: "https://example.com/video" },
    priority: 0,
    groupKey: "example.com",
    status: "completed",
    prevStatus: "running",
    statusReason: null,
    enteredStatusAt: 1,
    attempt: 1,
    maxAttempts: 5,
    nextRetryAt: null,
    progress: { ...EMPTY_PROGRESS },
    output: null,
    lastError: null,
    pid: null,
    pidStartedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  })
);
