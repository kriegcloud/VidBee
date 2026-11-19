import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as P from "effect/Predicate";
import { TaskExecutor } from "./TaskExecutor.service.js";
import { HostFailure } from "./TaskQueue.errors.js";
import { isDownloadTaskKind } from "./types.js";
import type { TaskKind } from "./Task.model.js";

export interface ExecutorRouterOptions {
  readonly byKind?: Partial<Record<TaskKind, typeof TaskExecutor.Service>>;
  readonly defaultExecutor: typeof TaskExecutor.Service;
}
/** Route registered kinds; subtitle-only and non-download work require an explicit executor. */
export const layer = (options: ExecutorRouterOptions) =>
  Layer.succeed(
    TaskExecutor,
    TaskExecutor.of({
      run: Effect.fn("TaskExecutor.run")((context, sink) => {
        const selected = options.byKind?.[context.input.kind];
        const useDefault = isDownloadTaskKind(context.input.kind) && context.input.kind !== "subtitles";
        if (!P.isTruthy(selected) && !useDefault) {
          const legacyMessage = `This host has no executor for ${context.input.kind} tasks`;
          return HostFailure.make({ original: legacyMessage, legacyMessage });
        }
        const executor = selected ?? options.defaultExecutor;
        return executor.run(context, sink);
      }),
    })
  );
