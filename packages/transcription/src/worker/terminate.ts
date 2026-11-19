import * as Effect from "effect/Effect";
import type { WorkerProcessRun } from "../TranscriptionProcess.service.js";
/** Reap an owned worker before releasing its task slot. */
export const terminateWorker = Effect.fn("terminateWorker")(
  (run: Pick<WorkerProcessRun, "terminate">, graceMs = 1000) => run.terminate(graceMs)
);
