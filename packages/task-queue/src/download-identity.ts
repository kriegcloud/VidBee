import * as HashSet from "effect/HashSet";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Str from "effect/String";

const encodeIdentity = S.encodeResult(S.fromJsonString(S.Unknown));
function identityJson(value: unknown): string | null {
  const result = encodeIdentity(value);
  return Result.isSuccess(result) ? result.success : null;
}

import type { TaskInput } from "./types.js";

const BILIBILI_HOSTS = HashSet.make("bilibili.com", "www.bilibili.com", "m.bilibili.com");
const YOUTUBE_HOSTS = HashSet.make("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com");
const BILIBILI_VIDEO_PATH = /^\/video\/((?:BV|av)[^/]+)\/?$/i;
const YOUTUBE_VIDEO_PATH = /^\/(?:shorts|embed|live)\/([^/]+)\/?$/;
const TRACKING_PARAMETERS = HashSet.make("spm_id_from", "vd_source", "fbclid", "gclid", "msclkid");

/** Identify known videos across share URLs while preserving generic content query parameters. */
function mediaUrlIdentity(value: string): string {
  const url = new URL(Str.trim(value));
  if (url.username === "" && url.password === "") {
    const bilibiliId = HashSet.has(BILIBILI_HOSTS, url.hostname)
      ? BILIBILI_VIDEO_PATH.exec(url.pathname)?.[1]
      : undefined;
    if (bilibiliId !== undefined && bilibiliId !== "") {
      return `bilibili:${bilibiliId}:${url.searchParams.get("p") || "1"}`;
    }
    let youtubeId: string | null | undefined;
    if (url.hostname === "youtu.be") {
      youtubeId = Str.split(url.pathname, "/")[1];
    } else if (HashSet.has(YOUTUBE_HOSTS, url.hostname)) {
      youtubeId = url.pathname === "/watch" ? url.searchParams.get("v") : YOUTUBE_VIDEO_PATH.exec(url.pathname)?.[1];
    }
    if (youtubeId != null && youtubeId !== "") {
      return `youtube:${youtubeId}`;
    }
  }
  for (const key of [...url.searchParams.keys()]) {
    if (Str.startsWith("utm_")(key) || HashSet.has(TRACKING_PARAMETERS, key)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.href;
}

/** Match media requests independently of their client id, playlist, destination and display metadata. */
export function downloadIdentity(input: TaskInput): string | null {
  if (!["video", "audio", "subtitles", "subscription-item"].includes(input.kind)) {
    return null;
  }
  try {
    const url = new URL(Str.trim(input.url));
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    const options = input.options ?? {};
    if (input.kind === "subtitles") {
      return identityJson([
        mediaUrlIdentity(input.url),
        input.kind,
        options.format ?? "srt",
        options.language ?? "",
        options.languages ?? [],
      ]);
    }
    const type = input.kind === "subscription-item" ? (options.type === "audio" ? "audio" : "video") : input.kind;
    return identityJson([
      mediaUrlIdentity(input.url),
      type,
      options.format ?? "",
      options.audioFormat ?? null,
      options.audioFormatIds ?? [],
      options.containerFormat ?? "auto",
      options.startTime ?? "",
      options.endTime ?? "",
      input.rawArgs ?? [],
    ]);
  } catch {
    return null;
  }
}
