import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as O from "effect/Option";
import * as R from "effect/Record";
import * as S from "effect/Schema";
import { ExtensionBoundaryFailure } from "./Extension.errors.js";
export const CacheStatus = LiteralKit(["pending", "ready", "error"]);
export type CacheStatus = typeof CacheStatus.Type;
export const VideoFormat = S.Struct({
  format_id: S.optional(S.String),
  ext: S.optional(S.String),
  format_note: S.optional(S.String),
  resolution: S.optional(S.String),
  width: S.optional(S.Finite),
  height: S.optional(S.Finite),
  fps: S.optional(S.Finite),
  vcodec: S.optional(S.String),
  acodec: S.optional(S.String),
  filesize: S.optional(S.Finite),
  filesize_approx: S.optional(S.Finite),
  tbr: S.optional(S.Finite),
});
export type VideoFormat = typeof VideoFormat.Type;
export const VideoInfo = S.Struct({
  title: S.optional(S.String),
  thumbnail: S.optional(S.String),
  duration: S.optional(S.Finite),
  formats: VideoFormat.pipe(S.Array, S.optional),
});
export type VideoInfo = typeof VideoInfo.Type;
export const VideoInfoCacheEntry = S.Struct({
  url: S.String,
  status: CacheStatus,
  fetchedAt: S.Finite,
  info: S.optional(VideoInfo),
  error: S.optional(S.String),
});
export type VideoInfoCacheEntry = typeof VideoInfoCacheEntry.Type;
export const CacheRootObservation = S.Struct({ present: S.Boolean, value: S.Unknown });
export type CacheRootObservation = typeof CacheRootObservation.Type;
export const CacheMap = S.Record(S.String, S.Unknown);
export type CacheMap = typeof CacheMap.Type;
export const PruningTimestamp = S.Struct({ fetchedAt: S.Finite });
export const VideoGroup = S.Struct({ label: S.String, height: S.Finite, formats: S.Array(VideoFormat) });
export type VideoGroup = typeof VideoGroup.Type;
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !A.isArray(value);
const strings = ["format_id", "ext", "format_note", "resolution", "vcodec", "acodec"] as const;
const numbers = ["width", "height", "fps", "filesize", "filesize_approx", "tbr"] as const;
const project = (value: Record<string, unknown>, stringKeys: readonly string[], numberKeys: readonly string[]) => {
  const result: Record<string, unknown> = {};
  for (const key of stringKeys) {
    const field = S.decodeUnknownOption(S.String)(value[key]);
    if (O.isSome(field)) result[key] = field.value;
  }
  for (const key of numberKeys) {
    const field = S.decodeUnknownOption(S.Finite)(value[key]);
    if (O.isSome(field)) result[key] = field.value;
  }
  return result;
};
const decodeProjection = (value: unknown) => S.decodeUnknownEffect(VideoInfo)(value);
export const decodeVideoInfoResponse = Effect.fn("decodeVideoInfoResponse")((value: unknown) => {
  if (!isRecord(value))
    return Effect.fail(ExtensionBoundaryFailure.make({ boundary: "metadata", issue: "Invalid video info." }));
  const result = project(value, ["title", "thumbnail"], ["duration"]);
  if (A.isArray(value.formats))
    result.formats = A.map(A.filter(value.formats, isRecord), (format) => project(format, strings, numbers));
  return decodeProjection(result).pipe(
    Effect.mapError(() => ExtensionBoundaryFailure.make({ boundary: "metadata", issue: "Invalid video info." }))
  );
});
export const pruneCache =
  (now: number) =>
  (map: CacheMap): Record<string, unknown> =>
    R.filter(map, (entry) => {
      const timestamp = S.decodeUnknownOption(PruningTimestamp)(entry);
      return O.isNone(timestamp) || now - timestamp.value.fetchedAt <= 300_000;
    });
