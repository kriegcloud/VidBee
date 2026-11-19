import { classifyWithDateParser } from "@vidbee/task-queue/classifier";
import * as A from "effect/Array";
import * as DateTime from "effect/DateTime";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { VIDBEE_OUTPUT_PATH_PREFIX } from "./yt-dlp-args.js";
import type { ClassifiedError, TaskOutput } from "@vidbee/task-queue/Task.model";
export const STDOUT_TAIL_BYTES = 8 * 1024;
export const STDERR_TAIL_BYTES = 8 * 1024;
export const OUTPUT_PATH_SCAN_BYTES = 4 * 1024;
export const PROCESSING_LINE =
  /^\[(?:Merger|Postprocess|ExtractAudio|VideoConvertor|VideoRemuxer|EmbedThumbnail|EmbedSubtitle|Metadata|Fixup\w*|FFmpeg)\]/i;
export const OUTPUT_LINE_END = /\r\n|\n|\r/;
export const SUBTITLE_DOWNLOAD_ERROR = /Unable to download video subtitles for/i;
const SUBTITLE_DOWNLOAD_INFO = /\[info\][^\r\n]*Downloading subtitles:\s*([^\r\n]+)/i;
export const SUBTITLE_UNAVAILABLE_INFO =
  /There are no subtitles for the requested languages|video doesn't have subtitles/i;
const SUBTITLE_OPTIONS_WITH_VALUE = HashSet.fromIterable(["--sleep-subtitles", "--sub-langs"]);
const SUBTITLE_TOGGLE_OPTIONS = HashSet.fromIterable([
  "--embed-subs",
  "--no-embed-subs",
  "--no-write-auto-subs",
  "--no-write-subs",
  "--write-auto-subs",
  "--write-subs",
]);
export const SUBTITLE_FALLBACK_LOG = "[VidBeep] Subtitle download failed; retrying the video without subtitles.";

export const FFMPEG_NOT_FOUND_ERROR =
  "ffmpeg/ffprobe not found. Use Desktop resources/ffmpeg, install in PATH, or set FFMPEG_PATH.";

interface SubtitleOutcome {
  languages?: string[];
  status: NonNullable<TaskOutput["subtitleStatus"]>;
}

/** Extract the subtitle language tags yt-dlp selected from its info output. */
export const extractDownloadedSubtitleLanguages = (output: string): string[] => {
  const matched = Option.getOrUndefined(Str.match(SUBTITLE_DOWNLOAD_INFO)(output));
  const rawLanguages = matched?.[1];
  if (rawLanguages === undefined || rawLanguages === "") {
    return [];
  }
  return A.filter(A.map(Str.split(",")(rawLanguages), Str.trim), (language) => language !== "");
};

/** Resolve the persisted subtitle outcome from one completed yt-dlp run. */
export const resolveSubtitleOutcome = (input: {
  downloadedLanguages: readonly string[];
  fallbackAttempted: boolean;
  initialStatus?: SubtitleOutcome["status"] | undefined;
  subtitlesRequested: boolean;
  unavailableSeen: boolean;
}): SubtitleOutcome | undefined => {
  const hasInitialStatus = Boolean(input.initialStatus);
  if (hasInitialStatus && input.initialStatus !== undefined) {
    return { status: input.initialStatus };
  }
  if (input.fallbackAttempted) {
    return { status: "failed" };
  }

  if (input.downloadedLanguages.length > 0) {
    return { languages: [...input.downloadedLanguages], status: "downloaded" };
  }
  if (input.subtitlesRequested && input.unavailableSeen) {
    return { status: "unavailable" };
  }
  return undefined;
};

/**
 * Return whether an argv snapshot asks yt-dlp to fetch or embed subtitles.
 *
 * @param args Full yt-dlp argv.
 * @returns True when subtitle download behavior is enabled.
 */
export const hasSubtitleDownloadArgs = (args: readonly string[]): boolean =>
  A.some(args, (arg) => arg === "--embed-subs" || arg === "--write-auto-subs" || arg === "--write-subs");

/**
 * Remove subtitle options and append explicit opt-outs before the source URL.
 *
 * @param args Full yt-dlp argv from the failed process.
 * @returns A retry argv that downloads the media without subtitles.
 */
export const withoutSubtitleDownloadArgs = (args: readonly string[]): string[] => {
  const filtered: string[] = [];
  let skipNextValue = false;

  for (const arg of args) {
    if (skipNextValue) {
      skipNextValue = false;
      continue;
    }
    if (HashSet.has(SUBTITLE_OPTIONS_WITH_VALUE, arg)) {
      skipNextValue = true;
      continue;
    }
    if (HashSet.has(SUBTITLE_TOGGLE_OPTIONS, arg)) {
      continue;
    }
    filtered.push(arg);
  }

  const sourceUrl = filtered.pop();
  filtered.push("--no-write-subs", "--no-write-auto-subs", "--no-embed-subs");
  const hasSourceUrl = Boolean(sourceUrl);
  if (hasSourceUrl && sourceUrl !== undefined) {
    filtered.push(sourceUrl);
  }
  return filtered;
};

export function insertFfmpegLocation({
  args,
  ffmpegLocation,
}: {
  readonly args: string[];
  readonly ffmpegLocation: string;
}): void {
  const urlArg = args.pop();
  args.push("--ffmpeg-location", ffmpegLocation);
  if (urlArg !== undefined) {
    args.push(urlArg);
  }
}

/**
 * Tail stdout for yt-dlp's "Downloading 1 format(s): X" info line. The
 * value `X` (e.g. `30080+30280`) is the resolved format id picked by the
 * chain — hosts compare it to the user's single-format pick to detect
 * that the fallback (`/best`) kicked in.
 */
export function extractFormatId(rawLog: string): string | undefined {
  const log = Str.trim(rawLog);
  if (log === "") {
    return undefined;
  }
  // [info] BV...: Downloading 1 format(s): 30080+30280
  const re = /Downloading\s+\d+\s+format\(s\):\s+([^\r\n]+)/gi;
  const matches = A.fromIterable(Str.matchAll(re)(log));
  const last = A.get(matches, matches.length - 1).pipe(Option.getOrUndefined);
  const value = last?.[1] === undefined ? undefined : Str.trim(last[1]);
  if (value === undefined || value === "") {
    return undefined;
  }
  return value;
}

export function extractSavedFilePath(rawLog: string): string | undefined {
  const log = Str.trim(rawLog);
  if (log === "") {
    return undefined;
  }
  const patterns: RegExp[] = [
    new RegExp(`^${VIDBEE_OUTPUT_PATH_PREFIX}(.+)$`, "gm"),
    /Merging formats into "([^"]+)"/g,
    /Destination:\s+"([^"]+)"/g,
    /Destination:\s+'([^']+)'/g,
    /\[download\]\s+([^\r\n]+?)\s+has already been downloaded/g,
    /\[MoveFiles\]\s+Moving file "[^"]+" to "([^"]+)"/g,
    /\[(?:EmbedSubtitle|EmbedThumbnail|FixupM3u8|Metadata)\].*?"([^"]+)"/g,
    /\[(?:ExtractAudio|VideoConvertor|VideoRemuxer)\].*?\bto "([^"]+)"/g,
  ];
  let latestMatchIndex = -1;
  let latestCandidate: string | undefined;
  for (const re of patterns) {
    for (const match of Str.matchAll(re)(log)) {
      const candidate = match[1] === undefined ? undefined : Str.trim(match[1]);
      const matchIndex = match.index ?? -1;
      if (candidate !== undefined && candidate !== "" && matchIndex >= latestMatchIndex) {
        latestMatchIndex = matchIndex;
        latestCandidate = candidate;
      }
    }
  }
  if (latestCandidate !== undefined && latestCandidate !== "") {
    return latestCandidate;
  }
  const lines = A.reverse(Str.split(/\r?\n/)(log));
  for (const line of lines) {
    const idx = Option.getOrElse(Str.indexOf("Destination:")(line), () => -1);
    if (idx >= 0) {
      const candidate = Str.trim(Str.slice(idx + "Destination:".length)(line));
      if (candidate !== "") {
        return candidate;
      }
    }
  }
  return undefined;
}

/** Use the queue's canonical classifier for both process errors and non-zero exits. */
export function classifyYtDlpExit({
  exitCode,
  stderr,
  now,
  parseDate = (value) =>
    Option.match(DateTime.make(value), { onNone: () => Number.NaN, onSome: DateTime.toEpochMillis }),
}: {
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly now: number;
  readonly parseDate?: (value: string) => number;
}): ClassifiedError {
  return classifyWithDateParser(
    { exitCode, stderr: stderr || `yt-dlp exited with code ${exitCode ?? -1}` },
    now,
    parseDate
  );
}

interface TailBuffer {
  append: (text: string) => void;
  read: () => string;
}

export function createTailBuffer(maxBytes: number): TailBuffer {
  let buf = "";
  return {
    append(text) {
      buf += text;
      if (buf.length > maxBytes * 4) {
        // Avoid pathological growth before truncate.
        buf = Str.slice(buf.length - maxBytes)(buf);
      }
    },
    read() {
      return buf.length > maxBytes ? Str.slice(buf.length - maxBytes)(buf) : buf;
    },
  };
}
