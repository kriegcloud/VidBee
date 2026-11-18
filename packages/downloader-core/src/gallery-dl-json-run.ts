import * as A from "effect/Array";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { HostFailure } from "./Downloader.errors.js";
import { DownloadHost } from "./DownloadHost.service.js";
import { DownloadProcess } from "./DownloadProcess.service.js";
import type { ProcessRun } from "./DownloadProcess.service.js";
import type { DownloadRuntimeSettings } from "./types.js";

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAX_ERROR_BYTES = 4096;
const MAP_TIMEOUT_MS = 10 * 60 * 1000;
export interface GalleryDlProfileMapRuntime {
  readonly admission?:
    | {
        readonly acquire: (
          url: string,
          signal?: AbortSignal
        ) => Effect.Effect<Effect.Effect<void> | undefined, HostFailure>;
      }
    | undefined;
  readonly resolveGalleryDlArgs?: ((settings?: DownloadRuntimeSettings, url?: string) => readonly string[]) | undefined;
  readonly resolveGalleryDlPath: () => string;
  readonly resolveYtDlpPath: () => string;
}
export interface GalleryDlJsonRun {
  complete: boolean;
  error?: string | undefined;
  stderr: string;
  stdout: string;
}

/** Bounded chunk-local mapping, with synchronous line callbacks on the compatibility host. */
export const runGalleryDlJson = Effect.fn("GalleryDlJson.run")(function* (
  binary: string,
  args: string[],
  signal: AbortSignal,
  label: string,
  onLine?: (line: string) => Effect.Effect<void>
) {
  const process = yield* DownloadProcess;
  const host = yield* DownloadHost;
  const done = yield* Deferred.make<GalleryDlJsonRun, HostFailure>();
  let stdout = "";
  let stderr = "";
  let pending = "";
  let exceeded = false;
  let timedOut = false;
  let run: ProcessRun | undefined;
  const stop = Effect.fn("GalleryDlJson.stop")(function* () {
    if (run === undefined) return;
    if (host.platform() === "win32") yield* run.signalPid("SIGKILL");
    else yield* run.signalGroup("SIGKILL").pipe(Effect.ignore);
  });
  const timer = yield* Effect.forkChild(
    Effect.sleep(MAP_TIMEOUT_MS).pipe(
      Effect.andThen(
        Effect.fn("GalleryDlJson.timeout")(function* () {
          timedOut = true;
          yield* stop();
        })
      )
    )
  );
  const finish = Effect.fn("GalleryDlJson.finish")(function* (code: number | null) {
    yield* Fiber.interrupt(timer);
    if (pending !== "" && onLine !== undefined) yield* onLine(pending);
    const error = timedOut
      ? `${label} mapping timed out.`
      : exceeded
        ? `${label} mapping exceeded its output limit.`
        : code !== 0 && !signal.aborted
          ? Str.trim(stderr) !== ""
            ? Str.trim(stderr)
            : `${label} mapper exited with code ${code}.`
          : undefined;
    yield* Deferred.succeed(done, { stdout, stderr, error, complete: code === 0 && !signal.aborted && !exceeded });
  });
  const acquired = yield* process.start(
    {
      command: binary,
      argv: args,
      env: undefined,
      extendEnv: true,
      cwd: undefined,
      detached: host.platform() !== "win32",
      windowsHide: true,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      abort: stop(),
      emit: Effect.fn("GalleryDlJson.event")(function* (event) {
        if (event._tag === "stdout") {
          const chunk = new TextDecoder("utf-8", { ignoreBOM: true }).decode(event.chunk);
          if (stdout.length + chunk.length > MAX_OUTPUT_BYTES) {
            exceeded = true;
            yield* stop();
            return;
          }
          if (onLine !== undefined) {
            pending += chunk;
            let lineEnd = Option.getOrElse(Str.indexOf("\n")(pending), () => -1);
            while (lineEnd !== -1) {
              yield* onLine(Str.slice(0, lineEnd)(pending));
              pending = Str.slice(lineEnd + 1)(pending);
              lineEnd = Option.getOrElse(Str.indexOf("\n")(pending), () => -1);
            }
          }
          stdout += chunk;
        } else if (event._tag === "stderr") {
          stderr = Str.slice(-MAX_ERROR_BYTES)(
            `${stderr}${new TextDecoder("utf-8", { ignoreBOM: true }).decode(event.chunk)}`
          );
        } else if (event._tag === "rawError") {
          yield* Fiber.interrupt(timer);
          yield* Deferred.fail(
            done,
            HostFailure.make({
              operation: "gallery.map",
              legacyMessage: event.error instanceof Error ? event.error.message : String(event.error),
              cause: event.error,
            })
          );
        } else if (event._tag === "complete") {
          if (event.outcome._tag === "Raw") yield* finish(event.outcome.code);
          else if (event.outcome.result._tag === "ExitCode") yield* finish(event.outcome.result.code);
          else
            yield* Deferred.fail(
              done,
              HostFailure.make({
                operation: "gallery.map",
                legacyMessage: event.outcome.result.error.message,
                cause: event.outcome.result.error,
              })
            );
        }
      }),
    }
  );
  if (acquired._tag === "NativeSpawnFailure") {
    yield* Fiber.interrupt(timer);
    return yield* HostFailure.make({
      operation: "gallery.spawn",
      legacyMessage: acquired.error.message,
      cause: acquired.error,
    });
  }
  run = acquired.run;
  const cancellation = yield* Effect.forkChild(
    Effect.callback<void>((resume) => {
      const abort = () => resume(stop());
      signal.addEventListener("abort", abort, { once: true });
      return Effect.sync(() => signal.removeEventListener("abort", abort));
    }),
    { startImmediately: true }
  );
  return yield* Deferred.await(done).pipe(Effect.ensuring(Fiber.interrupt(cancellation)));
});

export const GALLERY_DL_MAP_ARGS = [
  "--config-ignore",
  "--no-input",
  "--no-colors",
  "-j",
  "-o",
  "output.jsonl=true",
  "--sleep-request",
  "1",
  "--sleep-429",
  "60",
  "--retries",
  "1",
] as const;
const json = S.fromJsonString(S.Unknown);
/** Irrelevant message envelopes are ignored; metadata remains open until field use. */
export const galleryDlUrlMetadata = (line: string): Record<string, unknown> | null => {
  const message = S.decodeResult(json)(line);
  if (Result.isFailure(message) || !A.isArray(message.success) || message.success[0] !== 3) return null;
  const metadata: unknown = message.success[2];
  return Option.getOrNull(S.decodeUnknownOption(S.Record(S.String, S.Unknown))(metadata));
};
