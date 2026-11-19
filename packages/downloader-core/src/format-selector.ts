import { dual } from "effect/Function";
import * as Str from "effect/String";
/**
 * Shared yt-dlp format-id selector used by Desktop and Web download dialogs.
 *
 * A single-format pick must degrade to best-available instead of hard-failing
 * with "Requested format is not available". Some sites list premium tiers
 * when cookies are present even for accounts that cannot fetch them.
 */

export interface FormatSelectorInput {
  acodec?: string;
  ext?: string;
  vcodec?: string;
}

export const SINGLE_FORMAT_FALLBACK = "bestvideo+bestaudio/best";

export const isMuxedVideoFormat = (format: FormatSelectorInput | undefined): boolean =>
  Boolean(format?.vcodec && format.vcodec !== "none" && format.acodec && format.acodec !== "none");

export const resolvePreferredAudioExt = (videoExt: string | undefined): string | undefined => {
  const hasExt = Boolean(videoExt);
  if (videoExt === undefined || !hasExt) {
    return undefined;
  }

  const normalizedExt = Str.toLowerCase(videoExt);
  if (normalizedExt === "mp4") {
    return "m4a";
  }
  if (normalizedExt === "webm") {
    return "webm";
  }
  return undefined;
};

export const buildSingleVideoFormatSelector: {
  (format: FormatSelectorInput | undefined): (formatId: string) => string;
  (formatId: string, format: FormatSelectorInput | undefined): string;
} = dual(2, (formatId: string, format: FormatSelectorInput | undefined): string => {
  const hasFormat = Boolean(format);
  if (format === undefined || format === null || !hasFormat || isMuxedVideoFormat(format)) {
    return `${formatId}/${SINGLE_FORMAT_FALLBACK}`;
  }

  const preferredAudioExt = resolvePreferredAudioExt(format.ext);
  if (!(preferredAudioExt !== undefined && preferredAudioExt !== null && preferredAudioExt !== "")) {
    return `${formatId}+bestaudio/${SINGLE_FORMAT_FALLBACK}`;
  }

  return `${formatId}+bestaudio[ext=${preferredAudioExt}]/${formatId}+bestaudio/${SINGLE_FORMAT_FALLBACK}`;
});
