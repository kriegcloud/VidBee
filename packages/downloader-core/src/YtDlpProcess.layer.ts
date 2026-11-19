import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DownloadProcess } from "./DownloadProcess.service.js";
import { YtDlpProcess } from "./YtDlpProcess.service.js";
import { advanceWrapper, initialWrapperState } from "./YtDlpWrapper.js";

export const layer = Layer.effect(
  YtDlpProcess,
  Effect.gen(function* () {
    const process = yield* DownloadProcess;
    return YtDlpProcess.of({
      start: Effect.fn("YtDlpProcess.start")(function* (spec, sink) {
        let state = initialWrapperState();
        return yield* process.start(spec, {
          abort: sink.abort,
          emit: Effect.fn("YtDlpProcess.emit")(function* (event) {
            const advanced = advanceWrapper({ state, event });
            state = advanced.state;
            yield* Effect.forEach(advanced.observations, sink.emit, { concurrency: 1, discard: true });
          }),
        });
      }),
    });
  })
);
