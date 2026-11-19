import * as A from "effect/Array";
import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import { dual } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { HostFailure } from "./Downloader.errors.js";
import { DownloadHost } from "./DownloadHost.service.js";
import { DownloadProcess } from "./DownloadProcess.service.js";
import type { BoundaryDecodeError } from "./Downloader.errors.js";
import type { ProcessRun } from "./DownloadProcess.service.js";
import type { GalleryJsonResult } from "./InstagramScan.model.js";
import type {
  InstagramCategorySummary,
  InstagramInspectionErrorCode,
  InstagramProfileCategory,
  InstagramProfileItem,
} from "./Profile.model.js";

export type { GalleryJsonResult } from "./InstagramScan.model.js";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  Option.getOrNull(S.decodeUnknownOption(S.Record(S.String, S.Unknown))(value));
export const INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS = [
  "-o",
  "extractor.instagram.api=rest",
  "-o",
  "extractor.instagram.videos=true",
  "-o",
  "extractor.instagram.static-videos=true",
  "-o",
  "extractor.instagram.previews=false",
  "-o",
  "extractor.instagram.audio=false",
] as const;
export const readString = (record: Record<string, unknown> | null, ...keys: readonly string[]): string | undefined => {
  if (!(record !== null)) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (
      typeof value === "string" &&
      Str.trim(value) !== undefined &&
      Str.trim(value) !== null &&
      Str.trim(value) !== ""
    ) {
      return Str.trim(value);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
};
export const resolveUserRecord = (metadata: Record<string, unknown> | undefined): Record<string, unknown> | null => {
  const hasMetadata = Boolean(metadata);
  if (metadata === undefined || metadata === null || !hasMetadata) {
    return null;
  }
  return asRecord(metadata.user) ?? asRecord(metadata.owner) ?? metadata;
};
export const resolveSourceId = (metadata: Record<string, unknown>): string | undefined =>
  readString(metadata, "post_id", "post_shortcode", "media_id", "id", "pk");
const parseGalleryJsonMessageDataFirst = (message: unknown, result: GalleryJsonResult): void => {
  if (!A.isArray(message) || message.length < 2) {
    result.parseError = true;
    return;
  }

  const messageType = message[0];
  if (messageType === -1) {
    const error = asRecord(message[1]);
    result.stderr += `\n${readString(error, "error") ?? ""}: ${readString(error, "message") ?? ""}`;
    result.parseError = true;
    return;
  }

  if (messageType === 2) {
    const metadata = asRecord(message[1]);
    if (!(metadata !== null)) {
      return;
    }
    const cursor = readString(metadata, "vidbee_cursor");
    if (cursor !== undefined && cursor !== null && cursor !== "") {
      result.cursor = cursor;
    }
    if (result.directoryMetadata.length === 0) {
      result.directoryMetadata.push(metadata);
    }
    const sourceId = resolveSourceId(metadata);
    if (sourceId !== undefined && sourceId !== null && sourceId !== "") {
      result.sourceIds = HashSet.add(result.sourceIds, sourceId);
    }
    return;
  }

  if (messageType === 3) {
    const metadata = asRecord(message[2]);
    if (!(metadata !== null)) {
      return;
    }
    result.assetCount += 1;
    const sourceUrl = readString(metadata, "post_url");
    if (sourceUrl !== undefined && sourceUrl !== null && sourceUrl !== "") {
      try {
        const parsed = new URL(sourceUrl);
        if (
          (parsed.hostname === "www.instagram.com" || parsed.hostname === "instagram.com") &&
          !(parsed.username !== undefined && parsed.username !== null && parsed.username !== "") &&
          !(parsed.password !== undefined && parsed.password !== null && parsed.password !== "") &&
          !(parsed.port !== undefined && parsed.port !== null && parsed.port !== "") &&
          /^\/(?:p\/|reel\/|tv\/|stories\/)/.test(parsed.pathname)
        ) {
          parsed.search = "";
          parsed.hash = "";
          parsed.protocol = "https:";
          const mediaId = readString(metadata, "media_id");
          if (
            metadata.type === "story" &&
            mediaId !== undefined &&
            mediaId !== null &&
            mediaId !== "" &&
            /^\d+$/.test(mediaId)
          ) {
            parsed.pathname = `${Str.replace(/\/$/, "")(parsed.pathname)}/${mediaId}/`;
          }
          const itemUrl = parsed.toString();
          const title = readString(metadata, "highlight_title", "description");
          const existing = Option.getOrUndefined(HashMap.get(result.items, itemUrl));
          if (existing === undefined) result.itemOrder.push(itemUrl);
          result.items = HashMap.set(result.items, itemUrl, {
            id: itemUrl,
            url: itemUrl,
            assetCount: (existing?.assetCount ?? 0) + 1,
            assetIds: [
              ...(existing?.assetIds ?? []),
              ...(mediaId !== undefined && mediaId !== null && mediaId !== "" ? [mediaId] : []),
            ],
            sourceVersion: readString(metadata, "vidbee_source_version"),
            title: title === undefined ? undefined : Str.slice(0, 160)(title),
          });
        }
      } catch {
        /* Invalid source references are not persisted. */
      }
    }
    const sourceId = resolveSourceId(metadata);
    if (sourceId !== undefined && sourceId !== null && sourceId !== "") {
      result.sourceIds = HashSet.add(result.sourceIds, sourceId);
    }
  }
};

export const parseGalleryJsonMessage: {
  (result: GalleryJsonResult): (message: unknown) => void;
  (message: unknown, result: GalleryJsonResult): void;
} = dual(2, parseGalleryJsonMessageDataFirst);
const inspectionFailureCodeDataFirst = (
  stderr: string,
  binaryMissing: boolean = Boolean()
): InstagramInspectionErrorCode => {
  if (binaryMissing) {
    return "binary-missing";
  }
  // Instagram throttles with 429s, "please wait" 401s, and soft redirects to
  // the home page; none of these are cookie problems.
  if (
    /429|too many requests|rate.?limit|please wait a few minutes|redirect to home page|temporarily blocked/i.test(
      stderr
    )
  ) {
    return "rate-limited";
  }
  if (/login required|private profile|cookies|redirect to (?:login|challenge)|authentication/i.test(stderr)) {
    return "auth-required";
  }
  if (/404|notfound|not found|does not exist/i.test(stderr)) {
    return "not-found";
  }
  if (/timeout|connection|econn|network|dns/i.test(stderr)) {
    return "network";
  }
  return "unavailable";
};

export const inspectionFailureCode: {
  (binaryMissing?: boolean): (stderr: string) => InstagramInspectionErrorCode;
  (stderr: string, binaryMissing?: boolean): InstagramInspectionErrorCode;
} = dual((args) => typeof args[0] === "string", inspectionFailureCodeDataFirst);
const toCategorySummaryDataFirst = (
  category: InstagramProfileCategory,
  result: GalleryJsonResult
): InstagramCategorySummary => {
  if (result.exitCode !== 0 || result.parseError) {
    const errorCode = inspectionFailureCodeDataFirst(result.stderr);
    return {
      category,
      state: errorCode === "auth-required" ? "auth-required" : "unavailable",
      sourceCount: HashSet.size(result.sourceIds),
      assetCount: result.assetCount,
      errorCode,
    };
  }
  if (result.assetCount === 0) {
    return {
      category,
      state: "empty",
      sourceCount: 0,
      assetCount: 0,
    };
  }
  return {
    category,
    state: "ready",
    sourceCount: HashSet.size(result.sourceIds) || result.assetCount,
    assetCount: result.assetCount,
  };
};

export const toCategorySummary: {
  (result: GalleryJsonResult): (category: InstagramProfileCategory) => InstagramCategorySummary;
  (category: InstagramProfileCategory, result: GalleryJsonResult): InstagramCategorySummary;
} = dual(2, toCategorySummaryDataFirst);
const buildInstagramCategoryUrlDataFirst = (username: string, category: InstagramProfileCategory): string => {
  if (category === "stories") {
    return `https://www.instagram.com/stories/${username}/`;
  }
  const extractorPath = category;
  return `https://www.instagram.com/${username}/${extractorPath}/`;
};

export const buildInstagramCategoryUrl: {
  (category: InstagramProfileCategory): (username: string) => string;
  (username: string, category: InstagramProfileCategory): string;
} = dual(2, buildInstagramCategoryUrlDataFirst);

export const galleryItems = (result: GalleryJsonResult): InstagramProfileItem[] => {
  const items: InstagramProfileItem[] = [];
  for (const id of result.itemOrder) {
    const item = HashMap.get(result.items, id);
    if (Option.isSome(item)) items.push(item.value);
  }
  return items;
};
const json = S.fromJsonString(S.Unknown);

/** Collect the full document while delivering checkpoint updates synchronously through the process sink. */
export const runGalleryJson = Effect.fn("InstagramScan.run")(function* (
  binaryPath: string,
  url: string,
  extraArgs: readonly string[],
  sleepBeforeExtraction: boolean,
  signal?: AbortSignal,
  onCheckpoint?: (result: GalleryJsonResult) => Effect.Effect<void, HostFailure | BoundaryDecodeError>
) {
  const process = yield* DownloadProcess;
  const host = yield* DownloadHost;
  const done = yield* Deferred.make<GalleryJsonResult, HostFailure>();
  const result: GalleryJsonResult = {
    exitCode: null,
    stderr: "",
    directoryMetadata: [],
    sourceIds: HashSet.empty(),
    assetCount: 0,
    parseError: false,
    items: HashMap.empty(),
    itemOrder: [],
  };
  const args = [
    "-J",
    "-o",
    "output.jsonl=false",
    "-o",
    "extractor.instagram.vidbee-inspection=true",
    "--no-input",
    "--no-colors",
    "--retries",
    "1",
    ...INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS,
    ...(sleepBeforeExtraction ? ["--sleep-extractor", "6.0-12.0"] : []),
    ...extraArgs,
    url,
  ];
  const chunks: Uint8Array[] = [];
  let stdoutBytes = 0;
  let stderrBuffer = "";
  let checkpointAt = 0;
  let run: ProcessRun | undefined;
  let timer: Fiber.Fiber<void> | undefined;
  let cancellation: Fiber.Fiber<void> | undefined;
  const stopInspection = Effect.fn("InstagramScan.stop")(function* () {
    if (run === undefined || run.pid === undefined || run.pid === 0) return;
    const request = host.platform() === "win32" ? run.signalTree("SIGKILL") : run.signalGroup("SIGKILL");
    yield* request.pipe(Effect.ignore);
  });
  const abort = Effect.fn("InstagramScan.abort")(function* () {
    result.cancelled = true;
    yield* stopInspection();
  });
  const cleanup = Effect.fn("InstagramScan.cleanup")(function* () {
    if (timer !== undefined) yield* Fiber.interrupt(timer);
    if (cancellation !== undefined) yield* Fiber.interrupt(cancellation);
  });
  const finish = Effect.fn("InstagramScan.finish")(function* (exitCode: number | null) {
    yield* cleanup();
    result.stderr = Str.slice(-16_384)(`${result.stderr}\n${stderrBuffer}`);
    if (result.cancelled !== true) {
      let length = 0;
      for (const chunk of chunks) length += chunk.length;
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const parsed = S.decodeResult(json)(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes));
      if (Result.isSuccess(parsed) && A.isArray(parsed.success)) {
        result.assetCount = 0;
        result.sourceIds = HashSet.empty();
        result.items = HashMap.empty();
        result.itemOrder = [];
        result.directoryMetadata = [];
        for (const message of parsed.success) parseGalleryJsonMessageDataFirst(message, result);
      } else result.parseError = true;
    }
    result.exitCode = exitCode;
    yield* Deferred.succeed(done, result);
  });
  const acquired = yield* process.start(
    {
      command: binaryPath,
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
      abort: abort(),
      emit: Effect.fn("InstagramScan.event")(function* (event) {
        if (event._tag === "stdout") {
          stdoutBytes += event.chunk.length;
          if (stdoutBytes > 64 * 1024 * 1024) {
            result.parseError = true;
            result.stderr += "\nInstagram inspection exceeded the response size limit.";
            yield* stopInspection();
            return;
          }
          chunks.push(event.chunk);
        } else if (event._tag === "stderr") {
          stderrBuffer += new TextDecoder("utf-8", { ignoreBOM: true }).decode(event.chunk);
          let newline = Option.getOrElse(Str.indexOf("\n")(stderrBuffer), () => -1);
          while (newline >= 0) {
            const line = Str.slice(0, newline)(stderrBuffer);
            stderrBuffer = Str.slice(newline + 1)(stderrBuffer);
            if (Str.startsWith("VIDBEE_MAP:")(line)) {
              const parsed = S.decodeResult(json)(Str.slice("VIDBEE_MAP:".length)(line));
              if (Result.isFailure(parsed)) result.parseError = true;
              else {
                parseGalleryJsonMessageDataFirst(parsed.success, result);
                const now = yield* Clock.currentTimeMillis;
                if (now - checkpointAt >= 1000 || Str.includes("vidbee_cursor")(line)) {
                  checkpointAt = yield* Clock.currentTimeMillis;
                  if (onCheckpoint !== undefined) {
                    const checkpoint = yield* Effect.exit(onCheckpoint(result));
                    if (Exit.isFailure(checkpoint)) result.parseError = true;
                  }
                }
              }
            } else {
              if (Str.includes("Unable to load modules")(line)) result.parseError = true;
              result.stderr = Str.slice(-16_384)(`${result.stderr}\n${line}`);
            }
            newline = Option.getOrElse(Str.indexOf("\n")(stderrBuffer), () => -1);
          }
          if (stderrBuffer.length > 1024 * 1024) {
            result.parseError = true;
            yield* stopInspection();
          }
        } else if (event._tag === "rawError") {
          yield* cleanup();
          yield* Deferred.fail(
            done,
            HostFailure.make({
              operation: "instagram.scan",
              legacyMessage: event.error instanceof Error ? event.error.message : String(event.error),
              cause: event.error,
            })
          );
        } else if (event._tag === "complete") {
          if (event.outcome._tag === "Raw") yield* finish(event.outcome.code);
          else if (event.outcome.result._tag === "ExitCode") yield* finish(event.outcome.result.code);
          else {
            yield* cleanup();
            yield* Deferred.fail(
              done,
              HostFailure.make({
                operation: "instagram.scan",
                legacyMessage: event.outcome.result.error.message,
                cause: event.outcome.result.error,
              })
            );
          }
        }
      }),
    }
  );
  if (acquired._tag === "NativeSpawnFailure")
    return yield* HostFailure.make({
      operation: "instagram.spawn",
      legacyMessage: acquired.error.message,
      cause: acquired.error,
    });
  run = acquired.run;
  timer = yield* Effect.forkChild(
    Effect.sleep(10 * 60 * 1000).pipe(
      Effect.andThen(
        Effect.fn("InstagramScan.timeout")(function* () {
          result.parseError = true;
          result.stderr += "\nInstagram inspection timed out.";
          yield* stopInspection();
        })
      )
    )
  );
  if (signal !== undefined) {
    cancellation = yield* Effect.forkChild(
      Effect.callback<void>((resume) => {
        const onAbort = () => resume(abort());
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
        return Effect.sync(() => signal.removeEventListener("abort", onAbort));
      }),
      { startImmediately: true }
    );
  }
  return yield* Deferred.await(done).pipe(Effect.ensuring(cleanup()));
});

/** Plain implementations for internal data-first calls. */
export const DataFirst = {
  parseGalleryJsonMessage: parseGalleryJsonMessageDataFirst,
  inspectionFailureCode: inspectionFailureCodeDataFirst,
  toCategorySummary: toCategorySummaryDataFirst,
  buildInstagramCategoryUrl: buildInstagramCategoryUrlDataFirst,
};
