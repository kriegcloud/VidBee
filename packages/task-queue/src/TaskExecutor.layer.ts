import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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
        if (selected !== undefined) return selected.run(context, sink);
        if (isDownloadTaskKind(context.input.kind) && context.input.kind !== "subtitles")
          return options.defaultExecutor.run(context, sink);
        const legacyMessage = `This host has no executor for ${context.input.kind} tasks`;
        return HostFailure.make({ original: legacyMessage, legacyMessage });
      }),
    })
  );
