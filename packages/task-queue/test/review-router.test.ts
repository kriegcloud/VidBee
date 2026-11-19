import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { layer as routerLayer } from "../src/TaskExecutor.layer.js";
import { TaskExecutor } from "../src/TaskExecutor.service.js";

const handle = { cancel: () => Effect.void, pause: Effect.void };
const fallback = { run: Effect.fn("fallback")(() => Effect.succeed(handle)) };
for (const value of [null, undefined, 0, "", false, Number.NaN]) {
  const kind: string = "transcription";
  layer(routerLayer({ defaultExecutor: fallback, byKind: { [kind]: value } }))((it) => {
    it.effect(`sweep: falsy dedicated executor ${String(value)} is unsupported`, () =>
      Effect.gen(function* () {
        const executor = yield* TaskExecutor;
        const result = yield* executor
          .run(
            { taskId: "a", attemptId: "b", attemptNumber: 1, input: { kind: "transcription", url: "fixture" } },
            { emit: () => Effect.void }
          )
          .pipe(Effect.result);
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result))
          expect(result.failure.legacyMessage).toBe("This host has no executor for transcription tasks");
      })
    );
  });
}
layer(routerLayer({ defaultExecutor: fallback, byKind: {} }))((it) => {
  it.effect("sweep: absent download executor uses the default", () =>
    Effect.gen(function* () {
      const executor = yield* TaskExecutor;
      const run = yield* executor.run(
        { taskId: "a", attemptId: "b", attemptNumber: 1, input: { kind: "video", url: "fixture" } },
        { emit: () => Effect.void }
      );
      expect(run).toBe(handle);
    })
  );
});
