import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { CliFailure } from "../Cli.errors.js";
import { wireProperty } from "../transport/automation-client.js";
import { originalMessage } from "../transport/descriptor.js";
import type { AddTaskRequest } from "@vidbee/task-queue/TaskQueue.model";
import type { EffectContractClient } from "../Cli.model.js";
export interface EnqueueOptions {
  readonly client: EffectContractClient;
  readonly pollFastMs?: number | undefined;
  readonly pollSlowMs?: number | undefined;
  readonly request: AddTaskRequest;
  readonly wait: boolean;
  readonly waitTimeoutMs?: number | null | undefined;
}
export type EnqueueResult =
  | { readonly kind: "detached" | "wait-success"; readonly task: unknown }
  | { readonly kind: "wait-non-success"; readonly task: unknown; readonly reason: string };
export const enqueueDownload = Effect.fn("enqueueDownload")(function* (options: EnqueueOptions) {
  if (options.client.add === undefined) return yield* CliFailure.make({ message: "transport does not support add()" });
  let task = (yield* options.client.add(options.request)).task;
  if (!options.wait) return { kind: "detached", task } satisfies EnqueueResult;
  const start = yield* Clock.currentTimeMillis;
  const budget = options.waitTimeoutMs ?? null;
  while (true) {
    const status = yield* Effect.try({
      try: () => wireProperty(task, "status"),
      catch: (cause) => CliFailure.make({ message: originalMessage(cause), cause }),
    });
    if (status === "completed") return { kind: "wait-success", task } satisfies EnqueueResult;
    if (status === "failed" || status === "cancelled" || status === "retry-scheduled" || status === "paused")
      return { kind: "wait-non-success", task, reason: status } satisfies EnqueueResult;
    if (budget !== null && (yield* Clock.currentTimeMillis) - start >= budget)
      return { kind: "wait-non-success", task, reason: "timeout" } satisfies EnqueueResult;
    yield* Effect.sleep(status === "queued" ? (options.pollSlowMs ?? 1000) : (options.pollFastMs ?? 200));
    const id = yield* Effect.try({
      try: () => wireProperty(task, "id"),
      catch: (cause) => CliFailure.make({ message: originalMessage(cause), cause }),
    });
    task = yield* options.client.get(id);
  }
});
