import * as A from "effect/Array";
import * as R from "effect/Record";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { BoundaryDecodeError, CaptureJobInvalid } from "./Capture.errors.js";
import { CaptureJob } from "./Capture.model.js";
import { ConsumedSidecarEvent, RawSidecarEvent } from "./Protocol.model.js";
import { VIRTUAL_DISPLAY_SIZE } from "./quality.js";
import type { SidecarEvent } from "./Protocol.model.js";

export type { CaptureJob } from "./Capture.model.js";
export type { SidecarEvent } from "./Protocol.model.js";

const EVENT_PREFIX = "__VIDBEE_CAPTURE__";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const Json = S.fromJsonString(S.Unknown);
const invalid = (operation: string, cause: unknown) =>
  BoundaryDecodeError.make({ operation, legacyMessage: "Invalid browser-capture data.", cause });

/** Encoding preserves old key order and JSON's write-only handling of non-finite numbers. */
export const encodeSidecarEvent = (event: SidecarEvent): Result.Result<string, BoundaryDecodeError> =>
  event === undefined
    ? Result.succeed(`${EVENT_PREFIX}undefined`)
    : Result.mapBoth(S.encodeUnknownResult(Json)(event), {
        onSuccess: (text) => `${EVENT_PREFIX}${text}`,
        onFailure: (cause) => invalid("encodeSidecarEvent", cause),
      });

/** Parse syntax and the permissive envelope; consumed known fields are decoded separately. */
export const parseSidecarEvent = (line: string): RawSidecarEvent | null => {
  const trimmed = Str.trim(line);
  if (!Str.startsWith(EVENT_PREFIX)(trimmed)) return null;
  const parsed = S.decodeResult(Json)(Str.slice(EVENT_PREFIX.length)(trimmed));
  if (Result.isFailure(parsed)) return null;
  const envelope = S.decodeUnknownResult(RawSidecarEvent)(parsed.success);
  if (Result.isFailure(envelope) || !("type" in envelope.success)) return null;
  return envelope.success;
};

/** Unknown discriminants are ignored and ignored payload fields are never validated. */
export const decodeConsumedSidecarEvent = (
  event: RawSidecarEvent
): Result.Result<ConsumedSidecarEvent | null, BoundaryDecodeError> => {
  if (!A.contains(["log", "progress", "done", "error"], event.type)) return Result.succeed(null);
  return Result.mapError(S.decodeUnknownResult(ConsumedSidecarEvent)(event), (cause) =>
    invalid("sidecar event", cause)
  );
};

/** Normalize first, then validate only the fields that survive the original projection. */
export const parseCaptureJob = (value: unknown): Result.Result<CaptureJob, CaptureJobInvalid | BoundaryDecodeError> => {
  if (!isRecord(value))
    return Result.fail(
      CaptureJobInvalid.make({ operation: "parseCaptureJob", legacyMessage: "Capture job must be an object" })
    );
  if (typeof value.url !== "string" || Str.trim(value.url).length === 0)
    return Result.fail(
      CaptureJobInvalid.make({ operation: "parseCaptureJob", legacyMessage: "Capture job is missing url" })
    );
  if (typeof value.outputPath !== "string" || Str.trim(value.outputPath).length === 0)
    return Result.fail(
      CaptureJobInvalid.make({ operation: "parseCaptureJob", legacyMessage: "Capture job is missing outputPath" })
    );
  if (typeof value.ffmpegPath !== "string" || Str.trim(value.ffmpegPath).length === 0)
    return Result.fail(
      CaptureJobInvalid.make({ operation: "parseCaptureJob", legacyMessage: "Capture job is missing ffmpegPath" })
    );
  const localStorage = isRecord(value.localStorage)
    ? R.fromEntries(
        A.filter(R.toEntries(value.localStorage), (entry): entry is [string, string] => typeof entry[1] === "string")
      )
    : undefined;
  const normalized = {
    url: Str.trim(value.url),
    outputPath: value.outputPath,
    ffmpegPath: value.ffmpegPath,
    cookiesPath: typeof value.cookiesPath === "string" ? value.cookiesPath : undefined,
    browserExecutable: typeof value.browserExecutable === "string" ? value.browserExecutable : undefined,
    width: typeof value.width === "number" && value.width > 0 ? value.width : VIRTUAL_DISPLAY_SIZE.width,
    height: typeof value.height === "number" && value.height > 0 ? value.height : VIRTUAL_DISPLAY_SIZE.height,
    durationHintSec:
      typeof value.durationHintSec === "number" && value.durationHintSec > 0 ? value.durationHintSec : undefined,
    localStorage,
    userDataDir:
      typeof value.userDataDir === "string" && Str.trim(value.userDataDir).length > 0 ? value.userDataDir : undefined,
    videoOrdinal:
      typeof value.videoOrdinal === "number" && Number.isInteger(value.videoOrdinal) && value.videoOrdinal > 0
        ? value.videoOrdinal
        : undefined,
  };
  return Result.mapError(S.decodeResult(CaptureJob)(normalized), (cause) => invalid("parseCaptureJob", cause));
};
