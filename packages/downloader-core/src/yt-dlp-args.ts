import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Str from "effect/String";
import { parseBrowserCookiesSetting } from "./browser-cookies-setting.js";
import { InvalidDownload } from "./Downloader.errors.js";
import { DownloadFiles } from "./DownloadFiles.service.js";
import { DownloadHost } from "./DownloadHost.service.js";
import { DownloadTiming } from "./DownloadTiming.service.js";
import { normalizeDzenProfileUrl } from "./dzen-profile.js";
import { isFanslySite } from "./fansly-profile.js";
import { DEFAULT_FILENAME_TEMPLATE, resolveFilenameTemplate } from "./filename-style.js";
import { isOnlyFansSite } from "./onlyfans-profile.js";
import { expandSubtitleLanguageAliases, resolveSubtitleLanguages } from "./subtitle-languages.js";
import type { DownloadCookieSource } from "@vidbee/task-queue";
import type { SubtitleSkipReason, SubtitleSourceKeys } from "./DownloadLiterals.model.js";
import type { OneClickContainerOption } from "./format-preferences.js";
import type { DownloadRuntimeSettings } from "./types.js";

export type { YtDlpDownloadOptions, YtDlpDownloadSettings } from "./DownloadArguments.model.js";

import type { YtDlpDownloadOptions, YtDlpDownloadSettings } from "./DownloadArguments.model.js";

const YOUTUBE_HOST_SUFFIXES = ["youtube.com", "youtu.be", "youtube-nocookie.com"] as const;
const BILIBILI_AUTO_SUBTITLE_PREFIX = "ai-";
// GitHub issue #359: drop only the bare `web` client (which requires a PO
// token and frequently 403s) but keep `web_safari` and the other defaults so
// extraction has more fallbacks before failing.
const YOUTUBE_SAFE_PLAYER_CLIENTS = "default,-web";
export const VIDBEE_OUTPUT_PATH_PREFIX = "__VIDBEE_OUTPUT_PATH__:";
const WINDOWS_FILENAME_TRIM_LENGTH = "120";
const DIRECT_MEDIA_SEGMENT_EXTENSION = /\.(?:cmfa|cmfv|m4s)(?:$|[?#])/i;

// GitHub issues #326, #355, #325: yt-dlp's default of 10 retries and no
// socket timeout left users with `Giving up after N retries` and DNS hangs
// on flaky networks. Push the defaults up and add a short backoff so a
// single transient failure does not abort the whole download.
const DEFAULT_RETRIES = "30";
const DEFAULT_FRAGMENT_RETRIES = "30";
const DEFAULT_EXTRACTOR_RETRIES = "10";
const DEFAULT_RETRY_SLEEP = "2";
const DEFAULT_SOCKET_TIMEOUT = "30";

/**
 * Resolve canonical, regional, and Bilibili AI subtitle language tags.
 *
 * yt-dlp exposes Bilibili AI captions as regular subtitle tracks such as `ai-zh`,
 * so `--write-auto-subs` alone cannot select them. Common extractor aliases are
 * always included; Bilibili AI aliases are added only while automatic captions are on.
 */
export const resolveDownloadSubtitleLanguages: {
  (url: string, writeAutoSubs: boolean): (languages: readonly string[]) => string[];
  (languages: readonly string[], url: string, writeAutoSubs: boolean): string[];
} = dual(3, (languages: readonly string[], url: string, writeAutoSubs: boolean): string[] => {
  let resolved = HashMap.empty<string, string>();
  const order: string[] = [];
  const put = (key: string, value: string): void => {
    if (!HashMap.has(resolved, key)) order.push(key);
    resolved = HashMap.set(resolved, key, value);
  };
  for (const language of expandSubtitleLanguageAliases(languages)) put(Str.toLowerCase(language), language);

  if (isBilibiliUrl(url) && writeAutoSubs) {
    for (const language of languages) {
      if (Str.startsWith(BILIBILI_AUTO_SUBTITLE_PREFIX)(Str.toLowerCase(language))) {
        continue;
      }
      const primaryLanguage = Str.toLowerCase(Str.split(language, "-")[0]);
      if (nonempty(primaryLanguage)) {
        const automaticLanguage = `${BILIBILI_AUTO_SUBTITLE_PREFIX}${primaryLanguage}`;
        put(automaticLanguage, automaticLanguage);
      }
    }
  }

  return A.map(order, (key) => HashMap.getUnsafe(resolved, key));
});

/** Share subtitle language, automatic-caption and sidecar flags between media and caption downloads. */
const appendSubtitleDownloadArgs = (
  args: string[],
  url: string,
  languages: readonly string[],
  writeAutoSubs: boolean,
  embedSubs: boolean
): void => {
  const resolved = resolveDownloadSubtitleLanguages(languages, url, writeAutoSubs);
  args.push("--sub-langs", A.join(resolved, ",") || "all", "--sleep-subtitles", "1");
  args.push(writeAutoSubs ? "--write-auto-subs" : "--no-write-auto-subs");
  args.push("--write-subs", embedSubs ? "--embed-subs" : "--no-embed-subs");
};

const appendNetworkResilienceArgs = (args: string[]): void => {
  args.push("--retries", DEFAULT_RETRIES);
  args.push("--fragment-retries", DEFAULT_FRAGMENT_RETRIES);
  args.push("--extractor-retries", DEFAULT_EXTRACTOR_RETRIES);
  args.push("--retry-sleep", DEFAULT_RETRY_SLEEP);
  args.push("--retry-sleep", `extractor:${DEFAULT_RETRY_SLEEP}`);
  args.push("--socket-timeout", DEFAULT_SOCKET_TIMEOUT);
};

/** Add bounded retries to metadata probes without fragment-only flags. */
const appendMetadataNetworkResilienceArgs = (args: string[]): void => {
  args.push("--retries", DEFAULT_RETRIES);
  args.push("--extractor-retries", DEFAULT_EXTRACTOR_RETRIES);
  args.push("--retry-sleep", DEFAULT_RETRY_SLEEP);
  args.push("--retry-sleep", `extractor:${DEFAULT_RETRY_SLEEP}`);
  args.push("--socket-timeout", DEFAULT_SOCKET_TIMEOUT);
};

export const METADATA_NETWORK_ATTEMPTS = 3;
export const METADATA_NETWORK_RETRY_DELAY_MS = 1000;

/**
 * Return whether a yt-dlp failure is a truncated or timed-out HTTP read.
 *
 * Extractor webpage/JSON reads do not honor `--retries`. IncompleteRead and
 * read timeouts therefore fail a `-j` probe unless the whole process is retried.
 */
export const isTransientYtDlpNetworkError = (error: string): boolean => {
  const normalized = Str.toLowerCase(error);
  return (
    Str.includes("incompleteread")(normalized) ||
    Str.includes("error reading response")(normalized) ||
    Str.includes("read timed out")(normalized) ||
    Str.includes("connection reset")(normalized) ||
    Str.includes("connection aborted")(normalized) ||
    Str.includes("econnreset")(normalized) ||
    Str.includes("econnaborted")(normalized)
  );
};

/**
 * Return a string message from an unknown thrown value.
 */
const networkErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Retry only transient metadata failures, preserving the original failure. */
export const retryTransientYtDlpNetworkError = <A, E, R>(
  run: () => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R | DownloadTiming> => {
  const attempt = (number: number): Effect.Effect<A, E, R | DownloadTiming> =>
    run().pipe(
      Effect.catchIf(
        (error) => number < METADATA_NETWORK_ATTEMPTS && isTransientYtDlpNetworkError(networkErrorMessage(error)),
        () =>
          Effect.flatMap(DownloadTiming, (timing) =>
            timing.sleep(METADATA_NETWORK_RETRY_DELAY_MS).pipe(Effect.andThen(() => attempt(number + 1)))
          )
      )
    );
  return Effect.suspend(() => attempt(1));
};

const hasYouTubeHost = (host: string): boolean =>
  A.some(YOUTUBE_HOST_SUFFIXES, (suffix) => host === suffix || Str.endsWith(`.${suffix}`)(host));

const nonempty = (value: string | null | undefined): value is string =>
  value !== undefined && value !== null && value !== "";

const trim = (value?: string | null): string => Str.trim(value ?? "");

/** Remove trailing Windows-invalid dots and spaces in linear time. */
const trimWindowsFilenameSegmentEnd = (value: string): string => {
  let end = value.length;
  while (end > 0) {
    const characterCode = value[end - 1];
    if (characterCode !== " " && characterCode !== ".") {
      break;
    }
    end -= 1;
  }
  return Str.slice(0, end)(value);
};

/** Convert a seconds, MM:SS, or HH:MM:SS timecode to seconds. */
export const parseDownloadTimecode = (value: string): number | null => {
  const normalized = Str.trim(value);
  if (!nonempty(normalized)) {
    return null;
  }

  const parts = Str.split(normalized, ":");
  if (parts.length > 3) return null;
  const numericParts: number[] = [];
  for (const [index, part] of parts.entries()) {
    if (!/^\d+(?:\.\d+)?$/.test(part)) return null;
    const number = Number(part);
    if (!Number.isFinite(number) || (index > 0 && number >= 60)) return null;
    numericParts.push(number);
  }

  return A.reduce(numericParts, 0, (total, part) => total * 60 + part);
};

/** Validate optional time-range values before passing them to yt-dlp. */
export const validateDownloadTimeRange = (options: {
  readonly startTime?: string | undefined;
  readonly endTime?: string | undefined;
}): Result.Result<void, InvalidDownload> => {
  const { startTime, endTime } = options;
  const start = trim(startTime);
  const end = trim(endTime);
  const startSeconds = nonempty(start) ? parseDownloadTimecode(start) : 0;
  const endSeconds = nonempty(end) ? parseDownloadTimecode(end) : null;

  if (nonempty(start) && startSeconds === null) {
    return Result.fail(
      InvalidDownload.make({
        operation: "validateDownloadTimeRange",
        legacyMessage: "Invalid start time. Use seconds, MM:SS, or HH:MM:SS.",
      })
    );
  }
  if (nonempty(end) && endSeconds === null) {
    return Result.fail(
      InvalidDownload.make({
        operation: "validateDownloadTimeRange",
        legacyMessage: "Invalid end time. Use seconds, MM:SS, or HH:MM:SS.",
      })
    );
  }
  if (endSeconds !== null && startSeconds !== null && endSeconds <= startSeconds) {
    return Result.fail(
      InvalidDownload.make({
        operation: "validateDownloadTimeRange",
        legacyMessage: "End time must be later than start time.",
      })
    );
  }
  return Result.succeed(undefined);
};

/**
 * Return whether a URL points at a single DASH media segment instead of a
 * page or manifest that yt-dlp can resolve into a complete download.
 */
export const isDirectMediaSegmentUrl = (value: string): boolean => DIRECT_MEDIA_SEGMENT_EXTENSION.test(Str.trim(value));

/** Reject bare media-segment URLs with guidance that is useful in every host. */
export const assertDownloadSourceUrl = (value: string): Result.Result<void, InvalidDownload> => {
  if (isDirectMediaSegmentUrl(value)) {
    return Result.fail(
      InvalidDownload.make({
        operation: "assertDownloadSourceUrl",
        legacyMessage: "This URL points to a single media segment. Paste the original video page URL instead.",
      })
    );
  }
  return Result.succeed(undefined);
};

/**
 * Normalize browser cookies settings before passing them to yt-dlp.
 *
 * Issue refs: #331, #337, #341.
 */
export const windowsProfileIsAbsolute = (value: string): boolean =>
  /^[\\/]/.test(value) || /^[a-zA-Z]:[\\/]/.test(value);
export const windowsProfileBasename = (value: string): string => {
  const withoutDrive = Str.replace(/^[a-zA-Z]:/, "")(value);
  return A.filter(Str.split(withoutDrive, /[\\/]/), Boolean).at(-1) ?? "";
};

export const normalizeBrowserCookiesSettingForYtDlp = Effect.fn("DownloadArguments.normalizeBrowserCookies")(function* (
  value?: string | null
) {
  const path = yield* Path.Path;
  const files = yield* DownloadFiles;
  const rawValue = trim(value);
  if (!nonempty(rawValue) || rawValue === "none") {
    return "none";
  }

  const { browser, profile } = parseBrowserCookiesSetting(rawValue);
  if (!nonempty(profile)) {
    return browser;
  }

  if (browser === "safari") {
    return "safari";
  }

  const looksLikePath = Str.includes("/")(profile) || Str.includes("\\")(profile);
  if (!looksLikePath) {
    return `${browser}:${profile}`;
  }

  // GitHub issue #331: yt-dlp accepts either a profile name or an absolute
  // path. Firefox profiles in non-default locations (portable/custom installs)
  // cannot be resolved by name, so when the absolute path holds a
  // cookies.sqlite we pass it verbatim; otherwise fall back to the basename,
  // which keeps resolving for standard installs.
  const isWindowsPath = Str.includes("\\")(profile);
  const isAbsolutePath = isWindowsPath ? windowsProfileIsAbsolute(profile) : Str.startsWith("/")(profile);
  if (browser === "firefox" && isAbsolutePath && (yield* files.exists(path.join(profile, "cookies.sqlite")))) {
    return `${browser}:${profile}`;
  }

  const profileName = isWindowsPath
    ? windowsProfileBasename(profile)
    : A.filter(Str.split(profile, "/"), Boolean).at(-1);
  return nonempty(profileName) ? `${browser}:${profileName}` : browser;
});

/** Return whether a host is the domain itself or one of its subdomains. */
const hostMatchesDomain = (host: string, domain: string): boolean =>
  host === domain || Str.endsWith(`.${domain}`)(host);

/** Return whether a URL uses a Bilibili-owned video domain. */
const isBilibiliUrl = (url: string): boolean => {
  try {
    const host = Str.toLowerCase(new URL(url).hostname);
    return A.some(["bilibili.com", "b23.tv", "bili.tv"], (domain) => hostMatchesDomain(host, domain));
  } catch {
    return false;
  }
};

/** Return whether a URL uses a Twitch domain. */
const isTwitchUrl = (url: string): boolean => {
  try {
    const host = Str.toLowerCase(new URL(url).hostname);
    return hostMatchesDomain(host, "twitch.tv");
  } catch {
    return false;
  }
};

/** Return whether a URL uses a TikTok domain. */
const isTikTokUrl = (url: string): boolean => {
  try {
    const host = Str.toLowerCase(new URL(url).hostname);
    return hostMatchesDomain(host, "tiktok.com");
  } catch {
    return false;
  }
};

export type SubtitleDownloadSkipReason = typeof SubtitleSkipReason.Type;

/**
 * Explain why a requested video subtitle download must be skipped before yt-dlp starts.
 *
 * @param options Download source and media type.
 * @param settings Effective runtime subtitle and authentication settings.
 * @returns A stable skip reason, or null when subtitle arguments should be emitted.
 */
export const resolveSubtitleDownloadSkipReason: {
  (
    settings: YtDlpDownloadSettings,
    browserForCookies: string
  ): (options: Pick<YtDlpDownloadOptions, typeof SubtitleSourceKeys.Type>) => SubtitleDownloadSkipReason | null;
  (
    options: Pick<YtDlpDownloadOptions, typeof SubtitleSourceKeys.Type>,
    settings: YtDlpDownloadSettings,
    browserForCookies: string
  ): SubtitleDownloadSkipReason | null;
} = dual(
  3,
  (
    options: Pick<YtDlpDownloadOptions, typeof SubtitleSourceKeys.Type>,
    settings: YtDlpDownloadSettings,
    browserForCookies: string
  ): SubtitleDownloadSkipReason | null => {
    if (options.type !== "video" || !(settings.downloadSubtitles ?? true)) {
      return null;
    }
    if (isTikTokUrl(options.url) && !(settings.writeAutoSubs ?? true)) {
      return "automatic-captions-disabled";
    }

    const hasSubtitleAuth =
      (nonempty(browserForCookies) && browserForCookies !== "none") || Boolean(trim(settings.cookiesPath));
    if ((isBilibiliUrl(options.url) || isTwitchUrl(options.url)) && !hasSubtitleAuth) {
      return "auth-required";
    }

    return null;
  }
);

export const resolvePathWithHome: {
  (homeDirectory: string, path: Pick<Path.Path, "join">): (rawPath: string | null | undefined) => string | undefined;
  (rawPath: string | null | undefined, homeDirectory: string, path: Pick<Path.Path, "join">): string | undefined;
} = dual(
  3,
  (rawPath: string | null | undefined, homeDirectory: string, path: Pick<Path.Path, "join">): string | undefined => {
    const trimmed = trim(rawPath);
    if (!nonempty(trimmed)) {
      return undefined;
    }

    if (trimmed === "~") {
      return homeDirectory;
    }

    if (Str.startsWith("~/")(trimmed) || Str.startsWith("~\\")(trimmed)) {
      return path.join(homeDirectory, Str.slice(2)(trimmed));
    }

    return trimmed;
  }
);

export const sanitizeFilenameTemplateWithFallback: {
  (fallbackTemplate: string): (template: string) => string;
  (template: string, fallbackTemplate: string): string;
} = dual(2, (template: string, fallbackTemplate: string): string => {
  const trimmed = Str.trim(template);
  if (!nonempty(trimmed)) {
    return fallbackTemplate;
  }
  const normalized = Str.replace(/\\/g, "/")(trimmed);
  const safeParts = A.filter(
    A.map(
      A.filter(
        A.map(Str.split(normalized, "/"), (part) => Str.trim(part)),
        (part) => part !== "" && part !== "." && part !== ".."
      ),
      (part) => trimWindowsFilenameSegmentEnd(Str.replace(/[<>:"|?*]/g, "-")(part))
    ),
    (part) => part !== ""
  );
  return safeParts.length === 0 ? fallbackTemplate : A.join(safeParts, "/");
});

export const sanitizeFilenameTemplate = (template: string): string =>
  sanitizeFilenameTemplateWithFallback(template, DEFAULT_FILENAME_TEMPLATE);

/**
 * Appends platform-specific filename safety flags.
 */
export const appendPlatformFilenameSafetyArgs: {
  (platform: string): (args: string[]) => void;
  (args: string[], platform: string): void;
} = dual(2, (args: string[], platform: string): void => {
  if (platform === "win32") {
    args.push("--windows-filenames");
  }

  if (platform === "win32" || platform === "darwin" || platform === "linux") {
    args.push("--trim-filenames", WINDOWS_FILENAME_TRIM_LENGTH);
    return;
  }
});

export const isYouTubeUrl = (url: string): boolean => {
  try {
    const host = Str.toLowerCase(new URL(url).hostname);
    return hasYouTubeHost(host);
  } catch {
    return false;
  }
};

export const appendYouTubeSafeExtractorArgs: {
  (url: string): (args: string[]) => void;
  (args: string[], url: string): void;
} = dual(2, (args: string[], url: string): void => {
  if (!isYouTubeUrl(url)) {
    return;
  }
  args.push("--extractor-args", `youtube:player_client=${YOUTUBE_SAFE_PLAYER_CLIENTS}`);
});

const isOnlyFansUrl = (value: string): boolean => {
  try {
    const host = Str.toLowerCase(new URL(value).hostname);
    return host === "onlyfans.com" || Str.endsWith(".onlyfans.com")(host);
  } catch {
    return false;
  }
};

const isDirectMediaFileUrl = (value: string): boolean => {
  try {
    return /\.(?:jpe?g|png|gif|webp|avif|mp4|m4v|mov|webm)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
};

/** CDN photos/MP4s 403 unless the request looks like Chrome with an OF referer. */
const appendOnlyFansIdentityArgs = (args: string[], url: string): void => {
  if (!isOnlyFansUrl(url)) {
    return;
  }
  args.push("--impersonate", "chrome");
  args.push("--add-header", "Referer:https://onlyfans.com/");
};

/** Profile/chat inventories page the API; skip the polite delay on metadata probes. */
const appendOnlyFansInventoryArgs = (args: string[], url: string): void => {
  if (!isOnlyFansUrl(url)) {
    return;
  }
  args.push("--extractor-args", "onlyfans:page_sleep=0");
};

export const formatYtDlpCommand = (args: string[]): string => {
  const quoted = A.map(args, (arg) => {
    if (arg === "") {
      return '""';
    }
    if (/[\s"'\\]/.test(arg)) {
      return `"${Str.replace(/(["\\])/g, "\\$1")(arg)}"`;
    }
    return arg;
  });
  return `yt-dlp ${A.join(quoted, " ")}`;
};

export const resolveFfmpegLocationFromPath: {
  (path: Pick<Path.Path, "dirname">): (ffmpegPath: string) => string;
  (ffmpegPath: string, path: Pick<Path.Path, "dirname">): string;
} = dual(2, (ffmpegPath: string, path: Pick<Path.Path, "dirname">): string => path.dirname(ffmpegPath));

const BEST_FORMAT_FALLBACK = "bestvideo+bestaudio/best";

/**
 * Append a best-available fallback so a strict `video+audio` selection
 * degrades instead of hard-failing with "Requested format is not available"
 * (GitHub issue #294). Selectors that already carry a `/` fallback are kept.
 */
const withBestFallback = (selector: string): string =>
  Str.includes("/")(selector) ? selector : `${selector}/${BEST_FORMAT_FALLBACK}`;

export const resolveVideoFormatSelector = (options: YtDlpDownloadOptions): string => {
  const format = options.format;
  const audioFormat = options.audioFormat;
  const hasFormat = Boolean(format);
  const hasAudioFormat = Boolean(audioFormat);
  const audioFormatIds = A.filter(options.audioFormatIds ?? [], (id) => Str.trim(id) !== "");

  if (hasFormat && format !== undefined && audioFormat === "") {
    return format;
  }

  if (
    hasFormat &&
    format !== undefined &&
    (Str.includes("/")(format) || Str.includes("+")(format) || Str.includes("[")(format))
  ) {
    return format;
  }

  if (audioFormatIds.length > 0) {
    const baseVideo = hasFormat && format !== undefined && format !== "best" ? format : "bestvideo*";
    return `${baseVideo}+${A.join(audioFormatIds, "+")}`;
  }

  if (!(hasFormat && format !== undefined) || format === "best") {
    if (audioFormat === "none") {
      return "bestvideo+none";
    }
    if (!hasAudioFormat || audioFormat === "best") {
      return "bestvideo+bestaudio/best";
    }
    return withBestFallback(`bestvideo+${audioFormat}`);
  }

  if (audioFormat === "none") {
    return `${format}+none`;
  }

  if (!hasAudioFormat || audioFormat === "best") {
    return `${format}+bestaudio/best`;
  }

  return withBestFallback(`${format}+${audioFormat}`);
};

const UNSUPPORTED_THUMBNAIL_EMBED_ERROR = /supported filetypes for thumbnail embedding are/i;

export const THUMBNAIL_EMBED_UNSUPPORTED_LOG =
  "[VidBeep] Thumbnail embedding is unsupported for this container. The video was saved. Choose MP4 or MKV to embed cover art.";

/**
 * Thumbnail flags for one download.
 *
 * WebM cannot store cover art. `--embed-thumbnail` makes yt-dlp fail the
 * download after the video is saved (GitHub issue #467). Write a separate
 * thumbnail file instead. MP4, MKV, and Auto still embed the cover.
 */
export const resolveThumbnailDownloadArgs: {
  (
    container: OneClickContainerOption | undefined,
    embedThumbnail: boolean
  ): (type: YtDlpDownloadOptions["type"]) => string[];
  (
    type: YtDlpDownloadOptions["type"],
    container: OneClickContainerOption | undefined,
    embedThumbnail: boolean
  ): string[];
} = dual(
  3,
  (
    type: YtDlpDownloadOptions["type"],
    container: OneClickContainerOption | undefined,
    embedThumbnail: boolean
  ): string[] => {
    if (!embedThumbnail) {
      return ["--no-embed-thumbnail"];
    }
    if (type === "video" && container === "webm") {
      return ["--no-embed-thumbnail", "--write-thumbnail"];
    }
    return ["--embed-thumbnail"];
  }
);

/**
 * Return whether yt-dlp failed only because cover art cannot be embedded.
 *
 * Other ERROR lines still fail the download. Callers must also confirm a
 * non-empty media file exists before treating the run as successful.
 */
export const isUnsupportedThumbnailEmbedOnlyFailure = (output: string): boolean => {
  if (!UNSUPPORTED_THUMBNAIL_EMBED_ERROR.test(output)) {
    return false;
  }
  const errorLines = A.filter(
    A.map(Str.split(output, /\r?\n/), (line) => Str.trim(line)),
    (line) => /^ERROR:/i.test(line)
  );
  return errorLines.length > 0 && A.every(errorLines, (line) => UNSUPPORTED_THUMBNAIL_EMBED_ERROR.test(line));
};

export const resolveAudioFormatSelector = (options: YtDlpDownloadOptions): string => {
  const format = options.format;
  const hasFormat = Boolean(format);

  if (!hasFormat || format === undefined) {
    return "bestaudio";
  }

  if (Str.includes("/")(format) || Str.includes("+")(format) || Str.includes("[")(format)) {
    return format;
  }

  return format;
};

export const buildDownloadArgs = Effect.fn("DownloadArguments.buildDownloadArgs")(function* (
  options: YtDlpDownloadOptions,
  fallbackDownloadPath: string,
  settings: YtDlpDownloadSettings,
  jsRuntimeArgs: string[] = []
) {
  const path = yield* Path.Path;
  const host = yield* DownloadHost;
  yield* Effect.fromResult(assertBrowserProfileSession(options.url));
  yield* Effect.fromResult(assertDownloadSourceUrl(options.url));
  yield* Effect.fromResult(validateDownloadTimeRange({ startTime: options.startTime, endTime: options.endTime }));
  const args: string[] = ["--no-playlist", "--no-mtime", "--encoding", "utf-8"];
  // The vendored kernel enables unplayable formats by default, which disables
  // embedding and media fixups. Downloads need playable formats and postprocessing.
  args.push("--no-allow-unplayable-formats");

  const container: OneClickContainerOption | undefined =
    options.type === "video" ? (options.containerFormat ?? "auto") : undefined;

  const hasContainer = Boolean(container);
  if (options.type === "video" && hasContainer && container !== undefined && !isDirectMediaFileUrl(options.url)) {
    const formatSelector = resolveVideoFormatSelector(options);
    if (nonempty(formatSelector)) {
      args.push("-f", formatSelector);
    }
    if ((options.audioFormatIds?.length ?? 0) > 0 || Str.includes("mergeall")(formatSelector)) {
      args.push("--audio-multistreams");
    }
    // GitHub issues #367 and #351 (2): the user-selected container takes
    // precedence over the default. `original` skips the flag entirely so
    // yt-dlp uses its built-in defaults; explicit mp4/mkv/webm forces the
    // chosen container and remuxes single-source files when possible.
    // GitHub issues #207 and #129: `auto` keeps the mp4/mkv fallback so
    // ffmpeg muxing failures (HEVC + Hi-Res audio on bilibili, webm
    // fragments on YouTube under proxies, etc.) do not abort the download.
    if (container === "auto") {
      args.push("--merge-output-format", "mp4/mkv");
    } else if (container !== "original") {
      args.push("--merge-output-format", container);
      args.push("--remux-video", container);
    }
  } else if (options.type === "audio") {
    args.push("-f", resolveAudioFormatSelector(options));
  }

  const startTime = trim(options.startTime);
  const endTime = trim(options.endTime);
  if (nonempty(startTime) || nonempty(endTime)) {
    const start = startTime || "0";
    const end = endTime || "";
    args.push("--download-sections", `*${start}-${end}`);
  }

  const downloadSubtitles = settings.downloadSubtitles ?? true;
  const selectedSubtitleLanguages = resolveSubtitleLanguages(settings.subtitleLanguages, settings.interfaceLanguage);
  const embedSubs = settings.embedSubs ?? true;
  const writeAutoSubs = settings.writeAutoSubs ?? true;
  const embedThumbnail = settings.embedThumbnail ?? false;
  const embedMetadata = settings.embedMetadata ?? true;
  const embedChapters = settings.embedChapters ?? true;
  const browserForCookies = yield* normalizeBrowserCookiesSettingForYtDlp(settings.browserForCookies);
  const cookiesPath = trim(settings.cookiesPath);
  const isBilibili = isBilibiliUrl(options.url);
  // GitHub issue #370: Twitch `rechat` 404s abort the VOD. GitHub issue #196:
  // Bilibili subtitle fetch without cookies can fail and abort the video. TikTok
  // exposes its generated captions as normal subtitles, so the automatic-captions
  // switch must gate subtitle fetching there instead of relying on yt-dlp's flag.
  const subtitleCookies = yield* normalizeBrowserCookiesSettingForYtDlp(settings.browserForCookies);
  const subtitleSkipReason = resolveSubtitleDownloadSkipReason(options, settings, subtitleCookies);
  const shouldAttemptSubtitles = options.type === "video" && downloadSubtitles && subtitleSkipReason === null;
  // GitHub issues #129, #196, #199, #291, #347: Bilibili lists danmaku as a
  // subtitle track (`danmaku.xml`). ffmpeg cannot mux XML into MP4/MKV and
  // aborts with `Invalid data found when processing input` after the video
  // and audio have already merged. Keep XML/SRT as sidecar files instead.
  const shouldEmbedSubs = embedSubs && shouldAttemptSubtitles && !isBilibili;

  if (shouldAttemptSubtitles) {
    // yt-dlp deletes the subtitle file after `--embed-subs` unless `--write-subs`
    // is also set. Downloading subtitles means keep that sidecar; embedding is
    // additional. GitHub issue #475.
    appendSubtitleDownloadArgs(args, options.url, selectedSubtitleLanguages, writeAutoSubs, shouldEmbedSubs);
  } else {
    args.push("--no-write-subs", "--no-write-auto-subs", "--no-embed-subs");
  }

  args.push(...resolveThumbnailDownloadArgs(options.type, container, embedThumbnail));
  args.push(embedMetadata ? "--embed-metadata" : "--no-embed-metadata");
  args.push(embedChapters ? "--embed-chapters" : "--no-embed-chapters");

  const baseDownloadPath = trim(options.customDownloadPath) || trim(settings.downloadPath) || fallbackDownloadPath;
  const defaultFilenameTemplate = resolveFilenameTemplate(
    settings.filenameStyle,
    options.type,
    settings.shareWatermark,
    settings.filenameViaVidBee
  );
  const filenameTemplate = sanitizeFilenameTemplateWithFallback(
    options.customFilenameTemplate ?? defaultFilenameTemplate,
    defaultFilenameTemplate
  );
  const safeTemplate = Str.replace(/^[\\/]+/, "")(filenameTemplate);
  args.push("-o", path.join(baseDownloadPath, safeTemplate));
  args.push("--continue");
  args.push("--no-playlist-reverse");
  // GitHub issue #447: emit the final post-processed path without suppressing
  // progress output so the executor can stat the exact saved file.
  args.push(
    "--print",
    `after_move:${VIDBEE_OUTPUT_PATH_PREFIX}%(filepath)s`,
    "--print",
    "before_dl:VIDBEE_VISIBILITY:%(availability)s",
    "--print",
    "before_dl:VIDBEE_DURATION:%(duration)s",
    "--no-quiet"
  );

  appendPlatformFilenameSafetyArgs(args, host.platform());
  appendNetworkResilienceArgs(args);
  appendOnlyFansIdentityArgs(args, options.url);

  if (nonempty(browserForCookies) && browserForCookies !== "none") {
    args.push("--cookies-from-browser", browserForCookies);
  }

  if (nonempty(cookiesPath)) {
    args.push("--cookies", cookiesPath);
  }

  const proxy = trim(settings.proxy);
  if (nonempty(proxy)) {
    args.push("--proxy", proxy);
  }

  const configPath = resolvePathWithHome(settings.configPath, host.homeDirectory(), path);
  if (nonempty(configPath)) {
    args.push("--config-location", configPath);
  } else {
    args.push("--ignore-config");
    appendYouTubeSafeExtractorArgs(args, options.url);
  }

  if (jsRuntimeArgs.length > 0) {
    args.push(...jsRuntimeArgs);
  }

  args.push(options.url);
  return args;
});

export const buildVideoInfoArgs = Effect.fn("DownloadArguments.buildVideoInfoArgs")(function* (
  url: string,
  settings: YtDlpDownloadSettings,
  jsRuntimeArgs: string[] = []
) {
  const path = yield* Path.Path;
  const host = yield* DownloadHost;
  yield* Effect.fromResult(assertBrowserProfileSession(url));
  yield* Effect.fromResult(assertDownloadSourceUrl(url));
  const args = ["-j", "--no-playlist", "--no-warnings", "--encoding", "utf-8"];

  const proxy = trim(settings.proxy);
  if (nonempty(proxy)) {
    args.push("--proxy", proxy);
  }

  // GitHub issues #289, #355, and #325: metadata requests need the same
  // bounded retry/backoff policy as downloads, not only a socket timeout.
  appendMetadataNetworkResilienceArgs(args);

  const browserForCookies = yield* normalizeBrowserCookiesSettingForYtDlp(settings.browserForCookies);
  if (nonempty(browserForCookies) && browserForCookies !== "none") {
    args.push("--cookies-from-browser", browserForCookies);
  }

  const cookiesPath = trim(settings.cookiesPath);
  if (nonempty(cookiesPath)) {
    args.push("--cookies", cookiesPath);
  }

  const configPath = resolvePathWithHome(settings.configPath, host.homeDirectory(), path);
  if (nonempty(configPath)) {
    args.push("--config-location", configPath);
  } else {
    // GitHub issue #294: an implicit user yt-dlp config can inject a strict
    // format selector into `-j` and make metadata discovery fail.
    args.push("--ignore-config");
    appendYouTubeSafeExtractorArgs(args, url);
  }

  if (jsRuntimeArgs.length > 0) {
    args.push(...jsRuntimeArgs);
  }

  appendOnlyFansIdentityArgs(args, url);
  appendOnlyFansInventoryArgs(args, url);
  args.push(url);
  return args;
});

/**
 * Build a skip-download yt-dlp argv that writes caption sidecars next to an info JSON.
 *
 * @param url Watch URL.
 * @param outputTemplate yt-dlp `-o` template without an extension.
 * @param settings Host cookies, proxy, and config.
 * @param jsRuntimeArgs Active Desktop JS runtime flags.
 * @param subtitleLanguages Canonical subtitle languages; an empty list requests all tracks.
 */
export const buildCaptionExtractArgs = Effect.fn("DownloadArguments.buildCaptionExtractArgs")(function* (
  url: string,
  outputTemplate: string,
  settings: YtDlpDownloadSettings,
  jsRuntimeArgs: string[] = [],
  subtitleLanguages: readonly string[] = []
) {
  const path = yield* Path.Path;
  const host = yield* DownloadHost;
  yield* Effect.fromResult(assertDownloadSourceUrl(url));
  const args = [
    "--skip-download",
    "--write-info-json",
    "--sub-format",
    "vtt/srt/ttml/best",
    "--no-playlist",
    "--no-warnings",
    "--encoding",
    "utf-8",
    "-o",
    outputTemplate,
  ];
  appendSubtitleDownloadArgs(args, url, subtitleLanguages, settings.writeAutoSubs ?? true, false);

  const proxy = trim(settings.proxy);
  if (nonempty(proxy)) {
    args.push("--proxy", proxy);
  }

  appendMetadataNetworkResilienceArgs(args);

  const browserForCookies = yield* normalizeBrowserCookiesSettingForYtDlp(settings.browserForCookies);
  if (nonempty(browserForCookies) && browserForCookies !== "none") {
    args.push("--cookies-from-browser", browserForCookies);
  }

  const cookiesPath = trim(settings.cookiesPath);
  if (nonempty(cookiesPath)) {
    args.push("--cookies", cookiesPath);
  }

  const configPath = resolvePathWithHome(settings.configPath, host.homeDirectory(), path);
  if (nonempty(configPath)) {
    args.push("--config-location", configPath);
  } else {
    args.push("--ignore-config");
    appendYouTubeSafeExtractorArgs(args, url);
  }

  if (jsRuntimeArgs.length > 0) {
    args.push(...jsRuntimeArgs);
  }

  args.push(url);
  return args;
});

export const buildPlaylistInfoArgs = Effect.fn("DownloadArguments.buildPlaylistInfoArgs")(function* (
  url: string,
  settings: YtDlpDownloadSettings,
  jsRuntimeArgs: string[] = []
) {
  const path = yield* Path.Path;
  const host = yield* DownloadHost;
  yield* Effect.fromResult(assertBrowserProfileSession(url));
  yield* Effect.fromResult(assertDownloadSourceUrl(url));
  // GitHub issue #322: a single unavailable entry (e.g. an age-restricted
  // video in a channel/playlist) must not abort listing the whole playlist.
  const dzenProfile = normalizeDzenProfileUrl(url);
  const args = ["-J", "--flat-playlist", "--ignore-errors", "--no-warnings", "--encoding", "utf-8"];

  const proxy = trim(settings.proxy);
  if (nonempty(proxy)) {
    args.push("--proxy", proxy);
  }

  appendMetadataNetworkResilienceArgs(args);

  const browserForCookies = yield* normalizeBrowserCookiesSettingForYtDlp(settings.browserForCookies);
  if (nonempty(browserForCookies) && browserForCookies !== "none") {
    args.push("--cookies-from-browser", browserForCookies);
  }

  const cookiesPath = trim(settings.cookiesPath);
  if (nonempty(cookiesPath)) {
    args.push("--cookies", cookiesPath);
  }

  const configPath = resolvePathWithHome(settings.configPath, host.homeDirectory(), path);
  if (nonempty(configPath)) {
    args.push("--config-location", configPath);
  } else {
    args.push("--ignore-config");
    appendYouTubeSafeExtractorArgs(args, url);
  }

  if (jsRuntimeArgs.length > 0) {
    args.push(...jsRuntimeArgs);
  }

  appendOnlyFansIdentityArgs(args, url);
  appendOnlyFansInventoryArgs(args, url);
  // A failed Dzen feed page must not turn a partial profile into a successful inventory.
  if (nonempty(dzenProfile)) {
    args.push("--abort-on-error");
  }
  args.push(dzenProfile ?? url);
  return args;
});

function assertBrowserProfileSession(url: string): Result.Result<void, InvalidDownload> {
  if (isOnlyFansSite(url))
    return Result.fail(
      InvalidDownload.make({
        operation: "browserProfileSession",
        legacyMessage:
          "OnlyFans requires the dedicated browser session. Open the OnlyFans profile in VidBeep, choose Open browser, sign in there, and map its photos or videos. Imported Chrome cookies are not used for OnlyFans.",
      })
    );
  if (isFanslySite(url))
    return Result.fail(
      InvalidDownload.make({
        operation: "browserProfileSession",
        legacyMessage: "Open the Fansly profile in VidBeep and map it using the dedicated browser session.",
      })
    );
  return Result.succeed(undefined);
}

/** Capture explicit cookie sources from the executed arguments without retaining credentials. */
export const cookieSourcesFromArgs: {
  (settings: DownloadRuntimeSettings): (args: readonly string[]) => DownloadCookieSource[];
  (args: readonly string[], settings: DownloadRuntimeSettings): DownloadCookieSource[];
} = dual(2, (args: readonly string[], settings: DownloadRuntimeSettings): DownloadCookieSource[] => {
  let browser: string | undefined;
  let cookieFile: string | undefined;
  let hasConfig = false;
  const argumentsIterator = args.values();
  for (const argument of argumentsIterator) {
    const [flag, inlineValue] = Str.split(argument, /[=](.*)/s);
    if (flag === "--cookies-from-browser") {
      browser = inlineValue ?? argumentsIterator.next().value;
    } else if (flag === "--cookies") {
      cookieFile = inlineValue ?? argumentsIterator.next().value;
    } else if (flag === "--no-cookies-from-browser") {
      browser = undefined;
    } else if (flag === "--no-cookies") {
      cookieFile = undefined;
    } else if (flag === "--config-location" || flag === "--config-locations") {
      hasConfig = true;
    }
  }
  const sources: DownloadCookieSource[] = [];
  const hasBrowser = Boolean(browser);
  if (hasBrowser && browser !== undefined) {
    sources.push({ type: "browser", browser: Str.split(browser, /[:+]/)[0] });
  }
  const hasCookieFile = Boolean(cookieFile);
  const hasCookieSource = Boolean(settings.cookieSource);
  if (hasCookieFile && cookieFile !== undefined) {
    sources.push(
      cookieFile === settings.cookiesPath && hasCookieSource && settings.cookieSource !== undefined
        ? { ...settings.cookieSource }
        : { type: "file" }
    );
  }
  if (hasConfig || !args.includes("--ignore-config")) {
    sources.push({ type: "config" });
  }
  return sources;
});
