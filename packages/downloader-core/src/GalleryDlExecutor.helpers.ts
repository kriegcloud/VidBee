import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as Str from "effect/String";
import { normalizeFacebookGalleryUrl } from "./facebook-gallery.js";
import { normalizePinterestUrl } from "./pinterest.js";
import { normalizeSnapchatUrl } from "./snapchat.js";
import { resolveSocialSource } from "./social-media.js";
import { normalizeThreadsUrl } from "./threads.js";
import { normalizeTikTokPhotoUrl } from "./tiktok-photo.js";
import { normalizeVscoUrl } from "./vsco.js";
import type { TaskKind } from "@vidbee/task-queue/types";
import type { GalleryDlTaskOptions } from "./ExecutorOptions.model.js";
export interface NormalizedVscoGalleryUrl {
  profileUrl: string;
  username: string;
}
const SEQUENTIAL_TEMPLATE_REGEX = /^(\d+)\.%\(ext\)s$/;
export const VSCO_GALLERY_DL_EXTRACTOR_ARGS = [
  "-o",
  "extractor.vsco.tls12=true",
  "-o",
  "extractor.vsco.videos=true",
  "--sleep-request",
  "1",
  "--sleep-429",
  "60",
  "--retries",
  "8",
] as const;
export const FACEBOOK_GALLERY_DL_EXTRACTOR_ARGS = [
  "--sleep-request",
  "1",
  "--sleep-429",
  "60",
  "--retries",
  "8",
] as const;
export const TIKTOK_PHOTO_GALLERY_DL_EXTRACTOR_ARGS = [
  "-o",
  "extractor.tiktok.photos=true",
  "-o",
  "extractor.tiktok.audio=true",
  "-o",
  "extractor.tiktok.videos=false",
  "--sleep-429",
  "60",
  "--retries",
  "5",
] as const;
export const normalizeVscoGalleryUrl = (value: string): NormalizedVscoGalleryUrl | null => {
  const vsco = normalizeVscoUrl(value);
  return vsco?.kind === "gallery" ? { username: vsco.username, profileUrl: vsco.url } : null;
};
export const resolveDownloadTaskKind: {
  (requestedType: "audio" | "video"): (url: string) => TaskKind;
  (url: string, requestedType: "audio" | "video"): TaskKind;
} = dual(2, (url: string, requestedType: "audio" | "video"): TaskKind => {
  if (normalizePinterestUrl(url) !== null) {
    return "pinterest-gallery";
  }
  if (resolveSocialSource(url) !== null) {
    return "social-media";
  }
  const threads = normalizeThreadsUrl(url);
  if (threads !== null) {
    return threads.kind === "post" ? "threads-post" : "threads-profile";
  }
  if (normalizeSnapchatUrl(url) !== null) {
    return "snapchat-media";
  }
  if (normalizeFacebookGalleryUrl(url) !== null) {
    return "facebook-gallery";
  }
  if (normalizeTikTokPhotoUrl(url) !== null) {
    return "tiktok-photo";
  }
  return normalizeVscoUrl(url) !== null ? "vsco-gallery" : requestedType;
});
export const resolveDefaultGalleryDlFilenameTemplate = (url: string): string => {
  if (normalizeSnapchatUrl(url) !== null) {
    // Snap file ids are unique per asset; the date keeps folders chronological.
    return "{date:%Y-%m-%d}_{file_id}.{extension}";
  }
  if (normalizeThreadsUrl(url) !== null || normalizePinterestUrl(url) !== null) {
    return "{id}_{num:>02}.{extension}";
  }
  if (normalizeTikTokPhotoUrl(url) !== null) {
    // Images enumerate from 1; the slideshow sound is num 0.
    return "{id}_{num:>02}.{extension}";
  }
  return normalizeVscoUrl(url) !== null || normalizeFacebookGalleryUrl(url) !== null
    ? "{id}.{extension}"
    : "{sidecar_media_id:?/_/}{media_id}.{extension}";
};
export const resolveGalleryDlFilenameTemplate: {
  (options: GalleryDlTaskOptions): (url: string) => string;
  (url: string, options: GalleryDlTaskOptions): string;
} = dual(2, (url: string, options: GalleryDlTaskOptions): string => {
  if (
    normalizePinterestUrl(url) !== null ||
    normalizeVscoUrl(url) !== null ||
    normalizeFacebookGalleryUrl(url) !== null ||
    normalizeTikTokPhotoUrl(url) !== null ||
    normalizeThreadsUrl(url) !== null ||
    normalizeSnapchatUrl(url) !== null
  ) {
    return resolveDefaultGalleryDlFilenameTemplate(url);
  }
  const galleryTemplate =
    options.galleryDlFilenameTemplate === undefined || options.galleryDlFilenameTemplate === null
      ? undefined
      : Str.trim(options.galleryDlFilenameTemplate);
  if (galleryTemplate !== undefined && galleryTemplate !== null && galleryTemplate !== "") {
    return galleryTemplate;
  }
  const trimmed =
    (options.customFilenameTemplate === undefined || options.customFilenameTemplate === null
      ? undefined
      : Str.trim(options.customFilenameTemplate)) ?? "";
  if (!(trimmed !== undefined && trimmed !== null && trimmed !== "")) {
    return resolveDefaultGalleryDlFilenameTemplate(url);
  }
  const sequential = SEQUENTIAL_TEMPLATE_REGEX.exec(trimmed);
  if (sequential !== null) {
    return `${sequential[1]}.{num}.{extension}`;
  }
  return "{sidecar_media_id:?/_/}{media_id}.{extension}";
});
export const galleryWaitDurationMs = (line: string): number | undefined => {
  const match = /\[(?:info|warning)\] Waiting for (\d+(?:\.\d+)?) (seconds?|minutes?) (?:until|\()/i.exec(line);
  if (!(match !== null)) {
    return undefined;
  }
  const duration = Number(match[1]) * (Str.startsWith("minute")(Str.toLowerCase(match[2] ?? "")) ? 60_000 : 1000);
  return Number.isFinite(duration) ? Math.min(duration, 10 * 60_000) : undefined;
};
const GALLERY_DL_HOSTS = ["instagram.com", "instagr.am", "cdninstagram.com"] as const;
export const shouldUseGalleryDl = (url: string): boolean => {
  if (resolveSocialSource(url) !== null) {
    return true;
  }
  if (
    normalizePinterestUrl(url) !== null ||
    normalizeVscoUrl(url) !== null ||
    normalizeFacebookGalleryUrl(url) !== null ||
    normalizeTikTokPhotoUrl(url) !== null ||
    normalizeThreadsUrl(url) !== null ||
    normalizeSnapchatUrl(url) !== null
  ) {
    return true;
  }
  try {
    const host = Str.toLowerCase(new URL(url).hostname);
    return A.some(GALLERY_DL_HOSTS, (candidate) => host === candidate || Str.endsWith(`.${candidate}`)(host));
  } catch {
    return false;
  }
};
