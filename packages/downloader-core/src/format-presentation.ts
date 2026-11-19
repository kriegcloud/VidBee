import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as MutableHashMap from "effect/MutableHashMap";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import type { DownloadMediaType } from "./DownloadLiterals.model.js";
import type { VideoFormat } from "./types.js";

type FormatType = typeof DownloadMediaType.Type;

const isVideoFormat = (format: VideoFormat): boolean =>
  format.videoExt !== "none" && Boolean(format.vcodec) && format.vcodec !== "none";
const isAudioFormat = (format: VideoFormat): boolean => {
  const hasAudio = Boolean(format.acodec);
  const hasVideoExt = Boolean(format.videoExt);
  const hasVideoCodec = Boolean(format.vcodec);
  return (
    hasAudio &&
    format.acodec !== "none" &&
    (format.videoExt === "none" || !hasVideoExt || !hasVideoCodec || format.vcodec === "none")
  );
};

const filterFormatsByTypeDataFirst = <T extends VideoFormat>(formats: readonly T[], type: FormatType): T[] =>
  A.filter(formats, type === "video" ? isVideoFormat : isAudioFormat);

export const filterFormatsByType: {
  (type: FormatType): <T extends VideoFormat>(formats: readonly T[]) => T[];
  <T extends VideoFormat>(formats: readonly T[], type: FormatType): T[];
} = dual(2, filterFormatsByTypeDataFirst);

const getFileSize = (format: VideoFormat): number => format.filesize ?? format.filesizeApprox ?? 0;

const compareVideoQuality = (a: VideoFormat, b: VideoFormat): number =>
  (b.height ?? 0) - (a.height ?? 0) ||
  (b.fps ?? 0) - (a.fps ?? 0) ||
  getFileSize(b) - getFileSize(a) ||
  Str.localeCompare(b.formatId)(a.formatId);

const compareAudioQuality = (a: VideoFormat, b: VideoFormat): number =>
  (b.tbr ?? b.quality ?? 0) - (a.tbr ?? a.quality ?? 0) ||
  getFileSize(b) - getFileSize(a) ||
  Str.localeCompare(b.formatId)(a.formatId);

const encodeGroup = S.encodeResult(S.fromJsonString(S.Unknown));
const groupKey = (values: readonly unknown[]): string => Result.getOrElse(encodeGroup(values), () => "");

const videoGroupKey = (format: VideoFormat): string =>
  groupKey([
    format.height ?? format.formatId,
    format.width,
    format.fps,
    format.tbr,
    format.ext,
    format.vcodec,
    format.acodec,
    format.language,
    format.formatNote,
    format.quality,
  ]);

const audioGroupKey = (format: VideoFormat): string =>
  groupKey([
    format.tbr ?? format.quality ?? format.formatId,
    format.ext,
    format.acodec,
    format.language,
    format.formatNote,
  ]);

const isHttp = (format: VideoFormat): boolean => format.protocol === "http" || format.protocol === "https";

const isHls = (format: VideoFormat): boolean => format.protocol === "m3u8" || format.protocol === "m3u8_native";

/** Prefer a direct transfer only after matching the rendition's media properties. */
const compareTransport = (a: VideoFormat, b: VideoFormat): number => {
  if (isHttp(a) && isHls(b)) {
    return -1;
  }
  if (isHls(a) && isHttp(b)) {
    return 1;
  }
  return 0;
};

const pickGroups = <T extends VideoFormat>(
  formats: readonly T[],
  key: (format: T) => string,
  compare: (a: T, b: T) => number
): T[] => {
  const indexes = MutableHashMap.empty<string, number>();
  const groups: T[] = [];
  for (const format of formats) {
    const groupKey = key(format);
    const index = MutableHashMap.get(indexes, groupKey);
    const previous = Option.isSome(index) ? groups[index.value] : undefined;
    if (previous === undefined) {
      MutableHashMap.set(indexes, groupKey, groups.length);
      groups.push(format);
    } else if (Option.isSome(index) && (compareTransport(format, previous) || compare(format, previous)) < 0) {
      groups[index.value] = format;
    }
  }
  return groups;
};

/** Keep the desktop and web format pickers consistent. */
export const getDisplayFormats = <T extends VideoFormat>({
  formats,
  type,
  codec,
}: {
  formats: readonly T[];
  type: FormatType;
  codec?: string;
}): { videoFormats: T[]; audioFormats: T[] } => {
  const videos = A.filter(formats, isVideoFormat);
  const audios = A.filter(formats, isAudioFormat);
  const videoFormats = pickGroups(videos, videoGroupKey, compareVideoQuality).sort(compareVideoQuality);
  const audioFormats =
    type === "audio" && codec === "auto" ? pickGroups(audios, audioGroupKey, compareAudioQuality) : audios;
  return { videoFormats, audioFormats: audioFormats.sort(compareAudioQuality) };
};

/** Plain implementations for internal data-first calls. */
export const DataFirst = {
  filterFormatsByType: filterFormatsByTypeDataFirst,
};
