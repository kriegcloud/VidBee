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
