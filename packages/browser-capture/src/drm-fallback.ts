import { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DRM_FALLBACK_MESSAGE, isDrmProtectedMessage } from "./drm.js";
import type { ExecutorFinishEvent } from "@vidbee/task-queue/Executor.model";
import type { ExecutorHandle } from "@vidbee/task-queue/TaskExecutor.service";

export class DrmFallbackDependencies extends Context.Service<
  DrmFallbackDependencies,
  {
    readonly primary: typeof TaskExecutor.Service;
    readonly capture: typeof TaskExecutor.Service;
    readonly available: Effect.Effect<boolean>;
  }
>()("@vidbee/browser-capture/drm-fallback/DrmFallbackDependencies") {}
const isDrmFinish = (event: ExecutorFinishEvent): boolean =>
  event.result.type === "error" &&
  isDrmProtectedMessage(`${event.result.error.rawMessage}\n${event.stderrTail}\n${event.stdoutTail}`);
export const DrmFallbackExecutorLive = Layer.effect(
  TaskExecutor,
  Effect.gen(function* () {
    const dependencies = yield* DrmFallbackDependencies;
    return TaskExecutor.of({
      run: Effect.fn("DrmFallbackExecutor.run")(function* (ctx, sink) {
        let active: ExecutorHandle | null = null;
        let captureStarted = false;
        active = yield* dependencies.primary.run(ctx, {
          emit: Effect.fn("DrmFallbackExecutor.emit")(function* (event) {
            // The old wrapper does not supply the optional processing callback.
            if (event.type === "processing") return;
            if (event.type !== "finish") {
              yield* sink.emit(event);
              return;
            }
            if (captureStarted || !isDrmFinish(event) || !(yield* dependencies.available)) {
              yield* sink.emit(event);
              return;
            }
            captureStarted = true;
            yield* sink.emit({
              type: "std",
              taskId: ctx.taskId,
              attemptId: ctx.attemptId,
              stream: "stderr",
              line: DRM_FALLBACK_MESSAGE,
            });
            active = yield* dependencies.capture.run(ctx, sink).pipe(Effect.orDie);
          }),
        });
        return {
          cancel: Effect.fn("DrmFallbackExecutor.cancel")((timeout) =>
            active === null ? Effect.void : active.cancel(timeout)
          ),
          pause: Effect.suspend(() => (active === null ? Effect.void : active.pause)),
        };
      }),
    });
  })
);
