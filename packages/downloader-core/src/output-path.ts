import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as Option from "effect/Option";
import * as Str from "effect/String";

const INVALID_VARIATION_SELECTOR_REGEX = /[\ufe00-\ufe0f]/gu;
const INVALID_PATH_SEGMENT_PUNCTUATION_REGEX = /[\\/:*?"<>|]+/g;

export interface VideoDownloadPathInfo {
  title?: string;
  uploader?: string;
}

const isInvalidPathCodePoint = (codePoint: number): boolean => {
  if (codePoint <= 0x1f) {
    return true;
  }
  if (codePoint >= 0x7f && codePoint <= 0x9f) {
    return true;
  }
  return codePoint >= 0xff_f0 && codePoint <= 0xff_ff;
};

/**
 * Normalize user-derived path segments so they remain valid on filesystems.
 *
 * @param value Raw folder or file fragment.
 * @returns A trimmed, punctuation-safe segment.
 */
export const sanitizePathSegment = (value: string): string => {
  const filtered = A.join(
    A.filter(Array.from(value), (character) => {
      const codePoint = Option.getOrUndefined(Str.codePointAt(character, 0));
      return codePoint !== undefined && !isInvalidPathCodePoint(codePoint);
    }),
    ""
  );

  return Str.replace(
    /[. ]+$/g,
    ""
  )(
    Str.trim(
      Str.replace(
        /\s+/g,
        " "
      )(
        Str.replace(
          INVALID_PATH_SEGMENT_PUNCTUATION_REGEX,
          " "
        )(Str.replace(INVALID_VARIATION_SELECTOR_REGEX, "")(filtered))
      )
    )
  );
};

/**
 * Sanitize a folder name generated from remote metadata.
 *
 * @param value Uploader or title.
 * @param fallback Used when the value is empty after sanitizing.
 * @returns A usable folder name.
 */
export const sanitizeFolderName: {
  (fallback: string): (value: string) => string;
  (value: string, fallback: string): string;
} = dual(2, (value: string, fallback: string): string => {
  const trimmed = Str.trim(value);
  if (!(trimmed !== undefined && trimmed !== null && trimmed !== "")) {
    return fallback;
  }
  const sanitized = sanitizePathSegment(trimmed);
  return sanitized || fallback;
});

/**
 * Resolve the on-disk folder for a single-video download.
 *
 * Files land in `{downloadPath}/{channel}` by default, or `{downloadPath}`
 * when channel subfolders are disabled.
 *
 * @param basePath Configured download directory.
 * @param info Optional title/uploader from the video.
 * @param skipChannelSubfolders When true, skip the channel folder.
 * @returns Destination directory.
 */
export const resolveAutoVideoDownloadPath: {
  (info?: VideoDownloadPathInfo | null, skipChannelSubfolders?: boolean): (basePath: string) => string;
  (basePath: string, info?: VideoDownloadPathInfo | null, skipChannelSubfolders?: boolean): string;
} = dual(
  (args) => typeof args[0] === "string",
  (basePath: string, info?: VideoDownloadPathInfo | null, skipChannelSubfolders: boolean = Boolean()): string => {
    if (info === undefined || info === null || skipChannelSubfolders) {
      return basePath;
    }
    const label =
      (info.uploader === undefined || info.uploader === null ? undefined : Str.trim(info.uploader)) ||
      (info.title === undefined || info.title === null ? undefined : Str.trim(info.title));
    if (!(label !== undefined && label !== null && label !== "")) {
      return basePath;
    }
    const separator = Str.includes("\\")(basePath) && !Str.includes("/")(basePath) ? "\\" : "/";
    const trimmedBase = Str.replace(/[\\/]+$/, "")(basePath);
    return `${trimmedBase}${separator}${sanitizeFolderName(label, "Video")}`;
  }
);
