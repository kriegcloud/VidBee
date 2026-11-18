import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Cancel } from "../QueueTimers.service.js";
export interface WatchdogEntry {
  lastBumpAt: number;
  status: "running" | "processing";
  taskId: string;
  timer: Cancel | null;
}
export class Watchdog extends Context.Service<
  Watchdog,
  {
    readonly arm: (id: string, status: "running" | "processing") => Effect.Effect<void>;
    readonly promoteToProcessing: (id: string) => Effect.Effect<void>;
    readonly bump: (id: string, expectedSilenceMs?: number) => Effect.Effect<void>;
    readonly disarm: (id: string) => Effect.Effect<void>;
    readonly size: Effect.Effect<number>;
  }
>()("@vidbee/task-queue/process/Watchdog.service/Watchdog") {}
