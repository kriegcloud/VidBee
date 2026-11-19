import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./TaskQueue.errors.js";
export class ProcessControl extends Context.Service<
  ProcessControl,
  {
    readonly kill: (pid: number, signal: "SIGTERM" | "SIGKILL") => Effect.Effect<void, HostFailure>;
    readonly isAlive: (pid: number) => Effect.Effect<boolean>;
    readonly startTime: (pid: number) => Effect.Effect<number | null>;
  }
>()("@vidbee/task-queue/ProcessControl.service/ProcessControl") {}

/** Non-waiting signal requests; ownership and PID identity remain the caller's responsibility. */
export class ProcessRequests extends Context.Service<
  ProcessRequests,
  {
    readonly pid: (pid: number, signal: "SIGTERM" | "SIGKILL" | "SIGINT") => Effect.Effect<void>;
    readonly group: (pid: number, signal: "SIGTERM" | "SIGKILL" | "SIGINT") => Effect.Effect<void>;
    readonly tree: (pid: number, signal: "SIGTERM" | "SIGKILL" | "SIGINT") => Effect.Effect<void>;
  }
>()("@vidbee/task-queue/ProcessControl.service/ProcessRequests") {}
