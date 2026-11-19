import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { InvalidConcurrency } from "../TaskQueue.errors.js";
export interface SchedulerStats {
  readonly capacity: number;
  readonly perGroup: Record<string, number>;
  readonly queued: number;
  readonly running: number;
}
export interface SchedulerShape {
  readonly dequeue: (id: string) => Effect.Effect<boolean>;
  readonly enqueue: (id: string, priority: number) => Effect.Effect<void>;
  readonly ensureEnqueued: (id: string, priority: number) => Effect.Effect<void>;
  readonly kick: Effect.Effect<void>;
  readonly releaseSlot: (id: string) => Effect.Effect<void>;
  readonly setMaxConcurrency: (n: number) => Effect.Effect<void, InvalidConcurrency>;
  readonly setMaxConcurrentDownloads: (n: number) => Effect.Effect<void, InvalidConcurrency>;
  readonly setMaxPerGroup: (key: string, n: number | null) => Effect.Effect<void, InvalidConcurrency>;
  readonly stats: Effect.Effect<SchedulerStats>;
  readonly sweepDeadSlots: (isLive: (id: string) => boolean | Effect.Effect<boolean>) => Effect.Effect<void>;
}
export class Scheduler extends Context.Service<Scheduler, SchedulerShape>()(
  "@vidbee/task-queue/scheduler/Scheduler.service/Scheduler"
) {}
