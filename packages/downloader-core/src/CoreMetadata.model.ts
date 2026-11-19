import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { BoundaryDecodeError, MetadataFailure } from "./Downloader.errors.js";
import { VideoInfo } from "./MediaInfo.model.js";

export const CoreMetadataJson = S.fromJsonString(S.Unknown);
const record = S.Record(S.String, S.Unknown);
const optionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" && !Number.isNaN(value) ? value : undefined;
const optionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = Str.trim(value);
  return text.length > 0 ? text : undefined;
};
const invalid = () => BoundaryDecodeError.make({ operation: "metadata", legacyMessage: "Invalid yt-dlp metadata." });
const oldFailure = (message: string) =>
  MetadataFailure.make({ operation: "metadata", legacyMessage: message, cause: new TypeError(message) });

/** Normalize the old optional fields, then enforce the public model's scalar types. */
export const decodeVideoInfo = Effect.fn("CoreMetadata.decodeVideoInfo")(function* (value: unknown, target: string) {
  if (value === null) return yield* oldFailure("Cannot read properties of null (reading 'formats')");
  const raw = yield* S.decodeUnknownEffect(record)(typeof value === "object" && !A.isArray(value) ? value : {}).pipe(
    Effect.mapError(invalid)
  );
  const formats = raw.formats ?? [];
  if (!A.isArray(formats)) return yield* oldFailure("(raw.formats ?? []).map is not a function");
  const mapped = yield* Effect.forEach(
    formats,
    Effect.fn("CoreMetadata.format")(function* (value: unknown) {
      if (value === null) return yield* oldFailure("Cannot read properties of null (reading 'format_id')");
      const format = yield* S.decodeUnknownEffect(record)(
        typeof value === "object" && !A.isArray(value) ? value : {}
      ).pipe(Effect.mapError(invalid));
      return {
        formatId: format.format_id ?? "unknown",
        ext: format.ext ?? "unknown",
        width: optionalNumber(format.width),
        height: optionalNumber(format.height),
        fps: optionalNumber(format.fps),
        vcodec: optionalString(format.vcodec),
        acodec: optionalString(format.acodec),
        filesize: optionalNumber(format.filesize),
        filesizeApprox: optionalNumber(format.filesize_approx),
        formatNote: optionalString(format.format_note),
        tbr: optionalNumber(format.tbr),
        quality: optionalNumber(format.quality),
        protocol: optionalString(format.protocol),
        language: optionalString(format.language),
        videoExt: optionalString(format.video_ext),
        audioExt: optionalString(format.audio_ext),
      };
    }),
    { concurrency: 1 }
  );
  const tags = A.isArray(raw.tags)
    ? A.flatMap(raw.tags, (value) => {
        const text = optionalString(value);
        return text === undefined ? [] : [text];
      })
    : [];
  return yield* S.decodeUnknownEffect(VideoInfo)({
    id: raw.id ?? target,
    title: raw.title ?? target,
    thumbnail: optionalString(raw.thumbnail),
    duration: optionalNumber(raw.duration),
    extractorKey: optionalString(raw.extractor_key),
    webpageUrl: optionalString(raw.webpage_url),
    description: optionalString(raw.description),
    viewCount: optionalNumber(raw.view_count),
    uploader: optionalString(raw.uploader),
    tags: tags.length > 0 ? tags : undefined,
    formats: mapped,
  }).pipe(Effect.mapError(invalid));
});
