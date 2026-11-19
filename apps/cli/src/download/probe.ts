import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Str from "effect/String";
import { CliHost } from "../CliHost.service.js";
import { CliProbe } from "../CliProbe.service.js";
import { CliProbeProcess } from "../CliProbeProcess.service.js";
import { errorEnvelope } from "../envelope/index.js";
import { originalMessage } from "../transport/descriptor.js";
import type { ProcessRun } from "@vidbee/downloader-core/DownloadProcess.service";
import type { ProbeOptions, ProbeResult } from "../Probe.model.js";

export type { ProbeOptions, ProbeResult } from "../Probe.model.js";

function concat(chunks: ReadonlyArray<Uint8Array>): Uint8Array {
  let length = 0;
  for (const chunk of chunks) length += chunk.byteLength;
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
export const runProbeNative = Effect.fn("runProbeNative")(function* (options: ProbeOptions) {
  const process = yield* CliProbeProcess;
  const host = yield* CliHost;
  const env = Str.trim((yield* host.environment("YTDLP_PATH")) ?? "");
  const binary = options.ytDlpPath ?? (env.length > 0 ? env : "yt-dlp");
  const maximum = options.stdoutMaxBytes ?? 32 * 1024 * 1024;
  const tailLimit = options.stderrTailBytes ?? 64 * 1024;
  const done = yield* Deferred.make<ProbeResult>();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let overflow = false;
  let tail: Uint8Array = new Uint8Array(0);
  let run: ProcessRun | undefined;
  const error = (message: string): ProbeResult => ({
    kind: "error",
    envelope: errorEnvelope("NOT_IMPLEMENTED", message),
  });
  const start = yield* process
    .start(
      {
        command: binary,
        argv: options.argv,
        env: undefined,
        extendEnv: true,
        cwd: undefined,
        detached: false,
        windowsHide: false,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        rawSpawnObservation: "omit",
        rawExitObservation: "omit",
      },
      {
        abort: Effect.void,
        emit: Effect.fn("CliProbe.emit")(function* (event) {
          switch (event._tag) {
            case "stdout":
              if (overflow) return;
              if (bytes + event.chunk.byteLength > maximum) {
                overflow = true;
                if (run !== undefined) yield* run.signalChild("SIGTERM").pipe(Effect.ignore);
                return;
              }
              bytes += event.chunk.byteLength;
              chunks.push(event.chunk);
              return;
            case "stderr": {
              const merged = concat([tail, event.chunk]);
              tail = merged.byteLength > tailLimit ? merged.subarray(merged.byteLength - tailLimit) : merged;
              return;
            }
            case "rawError":
              yield* Deferred.succeed(done, error(`yt-dlp spawn error: ${originalMessage(event.error)}`));
              return;
            case "complete": {
              if (overflow) {
                yield* Deferred.succeed(done, {
                  kind: "error",
                  envelope: errorEnvelope("PROBE_OUTPUT_TOO_LARGE", `probe stdout exceeded ${maximum} bytes`),
                });
                return;
              }
              const outcome = event.outcome;
              if (outcome._tag === "Native" && outcome.result._tag === "Failure") {
                yield* Deferred.succeed(done, error(`yt-dlp spawn error: ${originalMessage(outcome.result.error)}`));
                return;
              }
              const code =
                outcome._tag === "Raw"
                  ? (outcome.code ?? -1)
                  : outcome.result._tag === "ExitCode"
                    ? outcome.result.code
                    : -1;
              const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
              yield* Deferred.succeed(done, {
                kind: "success",
                stdout: decoder.decode(concat(chunks)),
                stderr: decoder.decode(tail),
                exitCode: code,
                binary,
              });
              return;
            }
          }
        }),
      }
    )
    .pipe(Effect.result);
  if (start._tag === "Failure")
    return error(`failed to spawn yt-dlp at ${binary}: ${originalMessage(start.failure.cause ?? start.failure)}`);
  if (start.success._tag === "NativeSpawnFailure")
    return error(`failed to spawn yt-dlp at ${binary}: ${originalMessage(start.success.error)}`);
  run = start.success.run;
  if (overflow) yield* run.signalChild("SIGTERM").pipe(Effect.ignore);
  return yield* Deferred.await(done);
});
export const runProbe = Effect.fn("runProbe")(function* (options: ProbeOptions) {
  return yield* (yield* CliProbe).run(options);
});
