import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { HostFailure } from "./Downloader.errors.js";
import { DownloadProcess } from "./DownloadProcess.service.js";
import { DownloadTiming } from "./DownloadTiming.service.js";
import { redGifsWatchUrl } from "./mapped-profile-source.js";
import type { ProcessRun } from "./DownloadProcess.service.js";
import type { GalleryDlProfileMapRuntime } from "./gallery-dl-json-run.js";
import type { SocialMappedItem } from "./ProfilePersistence.model.js";

const json = S.fromJsonString(S.Unknown);
const record = S.Record(S.String, S.Unknown);
/** Streaming decoding and async line delivery preserve readline's stdout-end behavior. */
export const mapRedGifsProfile = Effect.fn("Redgifs.map")(function* (
  url: string,
  resolveYtDlpPath: () => string,
  admission: GalleryDlProfileMapRuntime["admission"],
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => Effect.Effect<void>
) {
  const owner = Str.split(new URL(url).pathname, "/")[2] ?? "redgifs";
  const release = yield* admission?.acquire(url, signal) ?? Effect.undefined;
  return yield* Effect.gen(function* () {
    if (signal.aborted) return { complete: false };
    const process = yield* DownloadProcess;
    const timing = yield* DownloadTiming;
    const lines = yield* Queue.make<string | null>();
    const closed = yield* Deferred.make<number | null, HostFailure>();
    const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
    let pending = "";
    let lastCrAt: number | undefined;
    let stdoutEnded = false;
    let exitCode: number | null = null;
    let run: ProcessRun | undefined;
    const abort = Effect.fn("Redgifs.abort")(() =>
      run === undefined ? Effect.void : run.signalChild("SIGTERM").pipe(Effect.orDie)
    );
    const consume = Effect.fn("Redgifs.consume")(function* (chunk: string) {
      const now = yield* Clock.currentTimeMillis;
      for (const character of chunk) {
        if (character === "\n" && lastCrAt !== undefined && now - lastCrAt <= 100) {
          lastCrAt = undefined;
          continue;
        }
        if (character === "\r" || character === "\n") {
          yield* Queue.offer(lines, pending);
          pending = "";
          lastCrAt = character === "\r" ? now : undefined;
        } else {
          lastCrAt = undefined;
          pending += character;
        }
      }
    });
    const end = Effect.fn("Redgifs.end")(function* () {
      if (stdoutEnded) return;
      stdoutEnded = true;
      yield* consume(decoder.decode());
      if (pending !== "") yield* Queue.offer(lines, pending);
      pending = "";
      yield* Queue.offer(lines, null);
    });
    const acquired = yield* process.start(
      {
        command: resolveYtDlpPath(),
        argv: ["--ignore-config", "--flat-playlist", "--dump-json", "--no-progress", url],
        env: undefined,
        extendEnv: true,
        cwd: undefined,
        detached: false,
        windowsHide: false,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "ignore",
      },
      {
        abort: abort(),
        emit: Effect.fn("Redgifs.event")(function* (event) {
          if (event._tag === "stdout") yield* consume(decoder.decode(event.chunk, { stream: true }));
          else if (event._tag === "stdoutEnd") yield* end();
          else if (event._tag === "rawExit") exitCode = event.code;
          else if (event._tag === "nativeExit" && event.result._tag === "ExitCode") exitCode = event.result.code;
          else if (event._tag === "rawError")
            yield* Deferred.fail(
              closed,
              HostFailure.make({
                operation: "redgifs.spawn",
                legacyMessage: event.error instanceof Error ? event.error.message : String(event.error),
                cause: event.error,
              })
            );
          else if (event._tag === "complete") {
            yield* end();
            if (event.outcome._tag === "Raw") yield* Deferred.succeed(closed, event.outcome.code);
            else if (event.outcome.result._tag === "ExitCode")
              yield* Deferred.succeed(closed, event.outcome.result.code);
            else
              yield* Deferred.fail(
                closed,
                HostFailure.make({
                  operation: "redgifs.process",
                  legacyMessage: event.outcome.result.error.message,
                  cause: event.outcome.result.error,
                })
              );
          }
        }),
      }
    );
    if (acquired._tag === "NativeSpawnFailure")
      return yield* HostFailure.make({
        operation: "redgifs.spawn",
        legacyMessage: acquired.error.message,
        cause: acquired.error,
      });
    run = acquired.run;
    const cancellation = yield* Effect.forkChild(
      Effect.callback<void>((resume) => {
        const listener = () => resume(abort());
        signal.addEventListener("abort", listener, { once: true });
        if (signal.aborted) listener();
        return Effect.sync(() => signal.removeEventListener("abort", listener));
      }),
      { startImmediately: true }
    );
    return yield* Effect.gen(function* () {
      while (true) {
        const line = yield* Queue.take(lines);
        if (line === null) break;
        yield* timing.turn("redgifs.line");
        if (signal.aborted || line.length > 100_000) continue;
        const parsed = S.decodeResult(json)(line);
        if (Result.isFailure(parsed)) continue;
        if (parsed.success === null)
          return yield* HostFailure.make({
            operation: "redgifs.line",
            legacyMessage: "Cannot read properties of null (reading 'id')",
            cause: new TypeError("Cannot read properties of null (reading 'id')"),
          });
        const entry = S.decodeUnknownOption(record)(parsed.success);
        if (Option.isNone(entry)) continue;
        const id = entry.value.id;
        const postUrl = typeof id === "string" ? redGifsWatchUrl(id) : null;
        if (entry.value.extractor_key !== "RedGifs" || postUrl === null || typeof id !== "string") continue;
        yield* onItem({
          id,
          url: postUrl,
          author: owner,
          images: 0,
          videos: 1,
          title: typeof entry.value.title === "string" ? entry.value.title : undefined,
        });
      }
      const code = yield* Deferred.await(closed);
      if (signal.aborted) return { complete: false };
      return code === 0
        ? { complete: true }
        : { complete: false, error: "Redgifs mapping stopped before traversal completed." };
    }).pipe(
      Effect.ensuring(
        Effect.gen(function* () {
          yield* Fiber.interrupt(cancellation);
          if (exitCode === null) yield* abort();
        })
      )
    );
  }).pipe(Effect.ensuring(release ?? Effect.void));
});
