import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import { CaptureJobInvalid, CaptureProcessFailure } from "./Capture.errors.js";
import { Capture } from "./Capture.service.js";
import { CaptureFiles } from "./CaptureFiles.service.js";
import { CaptureHost } from "./CaptureHost.service.js";
import { parseCaptureJob } from "./protocol.js";
import { SidecarJson } from "./Sidecar.service.js";
import type { SidecarSink } from "./Sidecar.service.js";
/** Shared sidecar sequence; raw JSON errors and output sinks remain host capabilities. */
export const runSidecar = Effect.fn("runSidecar")(function* (
  argv: readonly string[],
  signal: AbortSignal,
  sink: SidecarSink
) {
  const host = yield* CaptureHost;
  const files = yield* CaptureFiles;
  const capture = yield* Capture;
  const json = yield* SidecarJson;
  const timing = yield* LegacyTiming;
  const snapshot = yield* host.snapshot;
  yield* sink.emit({ pid: snapshot.pid, type: "spawn" });
  const flag = argv.indexOf("--job");
  const jobPath = flag >= 0 ? argv[flag + 1] : argv[2];
  if (!Predicate.isTruthy(jobPath) || jobPath === undefined)
    return yield* CaptureJobInvalid.make({
      operation: "sidecar",
      legacyMessage: "Usage: browser-capture-sidecar --job <job.json>",
    });
  const text = yield* files.readText(jobPath);
  const value = yield* json.parse(text);
  const job = yield* Effect.fromResult(parseCaptureJob(value));
  const result = yield* capture.run(job, signal, {
    log: (message) => sink.emit({ message, type: "log" }),
    progress: (state) =>
      sink.emit({ type: "progress", percent: state.percent, currentTime: state.currentTime, duration: state.duration }),
  });
  yield* timing.turn("sidecar.capture");
  const info = yield* files.stat(result.filePath);
  if (info.size <= 0)
    return yield* CaptureProcessFailure.make({
      operation: "sidecar",
      legacyMessage: "ffmpeg produced an empty capture file",
    });
  yield* sink.emit({ type: "done", filePath: result.filePath, size: info.size, durationMs: result.durationMs });
});
