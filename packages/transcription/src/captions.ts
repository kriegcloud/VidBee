import * as Arr from "effect/Array";
import * as Fn from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { chineseScriptFromText, chineseScriptOf } from "./chinese-script.js";
import { iso6391FromTag } from "./iso-639.js";
import type { PipelineResult, PipelineSegment, PipelineSpeaker } from "./Pipeline.model.js";

const SIMPLIFIED_CHINESE_TAGS = ["zh", "zh-Hans", "zh-CN", "zh-SG"] as const;
const TRADITIONAL_CHINESE_TAGS = ["zh-TW", "zh-Hant", "zh-HK", "zh-MO"] as const;
/**
 * Normalize a BCP-47 tag for caption matching.
 */
const normalizeCaptionTag = (tag: string): string => Str.replaceAll("_", "-")(Str.toLowerCase(Str.trim(tag)));
export const CAPTIONS_MODEL_VERSION = "embedded-captions";
export const CAPTION_FILE_EXTENSIONS = [".vtt", ".srt", ".ass"] as const;
const AUTO_CAPTION_PREFIX = /^(?:ai|auto|automatic)(?:-|$)/i;
const NON_DIALOGUE_CAPTION_TAG = /^(?:danmaku|live[_-]?chat|rechat|chat)$/i;

export type { CaptionCue, CaptionTrack } from "./Caption.model.js";

import type { CaptionCue, CaptionTrack } from "./Caption.model.js";
/**
 * True when this tag is platform auto-captions such as Bilibili `ai-zh`.
 *
 * @param tag Language, stream title, or sidecar suffix.
 */
export const isPlatformAiCaptionTag = (tag: string | null | undefined): boolean => {
  if (tag == null || Str.trim(tag) === "") {
    return false;
  }
  const compact = normalizeCaptionTag(tag);
  if (AUTO_CAPTION_PREFIX.test(compact)) {
    return true;
  }
  return Arr.some(Str.split("-")(compact), (part) => AUTO_CAPTION_PREFIX.test(part));
};
/**
 * True when this tag is danmaku or a live-chat dump, not dialogue captions.
 *
 * @param tag Language, stream title, or sidecar suffix.
 */
export const isChatCaptionTag = (tag: string | null | undefined): boolean => {
  if (tag == null || Str.trim(tag) === "") {
    return false;
  }
  const compact = normalizeCaptionTag(tag);
  if (NON_DIALOGUE_CAPTION_TAG.test(compact)) {
    return true;
  }
  return Arr.some(Str.split("-")(compact), (part) => NON_DIALOGUE_CAPTION_TAG.test(part));
};
/**
 * True when this tag is platform auto-captions, danmaku, or chat.
 *
 * @param tag Language, stream title, or sidecar suffix.
 */
export const isMachineCaptionTag = (tag: string | null | undefined): boolean =>
  isPlatformAiCaptionTag(tag) || isChatCaptionTag(tag);
/**
 * True when a sidecar name is a danmaku or chat dump.
 *
 * @param path File name after the host has applied its basename rules.
 */
export const isMachineCaptionName = (path: string | null | undefined): boolean => {
  if (path == null || Boolean(path) === false) {
    return false;
  }
  const name = Str.toLowerCase(path);
  return /\.(?:danmaku|live[_-]chat|rechat)\.(?:ass|srt|vtt)$/i.test(name);
};
/**
 * True when this track is dialogue captions, including platform AI subs.
 *
 * Danmaku and chat dumps stay out. Bilibili `ai-zh` / `ai-en` sidecars are
 * valid caption sources and can be switched on the transcript page.
 *
 * @param track Language tag, optional stream title, and optional host-normalized sidecar basename.
 */
export const isImportableCaptionTrack = (track: {
  language?: string | null | undefined;
  path?: string | undefined;
  title?: string | undefined;
}): boolean => !(isChatCaptionTag(track.language) || isChatCaptionTag(track.title) || isMachineCaptionName(track.path));
/**
 * Alias kept for existing call sites: importable dialogue captions.
 *
 * @param track Language tag, optional stream title, and optional host-normalized sidecar basename.
 */
export const isHumanCaptionTrack = isImportableCaptionTrack;
/**
 * Drop platform auto-caption prefixes so `ai-zh` matches Chinese, then map ffmpeg 639-2 tags.
 *
 * @param language Track language tag.
 */
export const captionLanguageForMatch = (language: string): string => {
  const compact = normalizeCaptionTag(language);
  let stripped = compact;
  for (const prefix of ["ai-", "auto-", "automatic-"]) {
    if (Str.startsWith(prefix)(stripped)) {
      stripped = Str.slice(prefix.length)(stripped);
      break;
    }
  }
  if (Str.endsWith("-auto")(stripped)) {
    stripped = Str.slice(0, -5)(stripped);
  }
  return iso6391FromTag(stripped);
};
/**
 * Stable key used to match caption languages across files and stored rows.
 *
 * Platform AI prefixes stay (`ai-zh` vs `zh`). ffmpeg `zho` / `eng` collapse onto `zh` / `en`.
 *
 * @param language Track language tag.
 */
export const captionLanguageKey = (language: string | null | undefined): string => {
  if (language == null || Str.trim(language) === "") {
    return "und";
  }
  const compact = normalizeCaptionTag(language);
  if (isPlatformAiCaptionTag(compact)) {
    return compact;
  }
  return captionLanguageForMatch(compact);
};
/**
 * Canonical language tag for a track: map ffmpeg 639-2 codes and split Chinese scripts.
 *
 * @param language Declared stream or sidecar tag.
 * @param text Caption document or cue text, used to tell Simplified from Traditional.
 */
export const refineCaptionLanguage: {
  (language: string | null, text: string): string | null;
  (text: string): (language: string | null) => string | null;
} = Fn.dual(2, (language: string | null, text: string): string | null => {
  const script = chineseScriptFromText(text);
  if (script === "hant") {
    return "zh-Hant";
  }
  if (script === "hans") {
    return "zh";
  }
  if (language == null || Str.trim(language) === "") {
    return language;
  }
  return captionLanguageForMatch(language);
});
const TIMESTAMP = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/g;
const VTT_ARROW = /-->/;
const CUE_SETTINGS = /\s+(?:align|line|position|size|vertical):[^\s]+/gi;
const MARKUP = /<[^>]+>|\{[^}]+\}/g;
const VTT_VOICE_TAG = /<v(?:\.[^\s>]*)?\s+([^>]+)>/i;
/**
 * Stable task id used when captions are imported without an ASR child task.
 *
 * @param downloadTaskId Parent download id.
 */
export const captionsTaskId: {
  (downloadTaskId: string, language: string | null | undefined): string;
  (language: string | null | undefined): (downloadTaskId: string) => string;
} = Fn.dual(2, (downloadTaskId: string, language: string | null | undefined): string => {
  const tag = language == null ? undefined : Str.trim(language);
  return tag !== undefined && tag !== ""
    ? `captions:${downloadTaskId}:${captionLanguageKey(tag)}`
    : `captions:${downloadTaskId}`;
});
/**
 * True when this subtitle codec can be converted to text (not bitmap).
 *
 * @param codecName ffprobe codec_name, if present.
 */
export const isTextSubtitleCodec = (codecName: string | null | undefined): boolean => {
  if (codecName == null || Boolean(codecName) === false) {
    return true;
  }
  const codec = Str.toLowerCase(codecName);
  return !Str.includes("pgs")(codec) && !Str.includes("dvd_subtitle")(codec) && !Str.includes("dvb_subtitle")(codec);
};
/**
 * Convert a clock timestamp to milliseconds.
 *
 * @param hours Optional hour field.
 * @param minutes Minute field.
 * @param seconds Second field.
 * @param fraction Fractional seconds (1-3 digits).
 */
const toMs = (hours: string | undefined, minutes: string, seconds: string, fraction: string): number => {
  const millis = Str.slice(0, 3)(`${fraction}000`);
  return Number(hours ?? "0") * 3600000 + Number(minutes) * 60000 + Number(seconds) * 1000 + Number(millis);
};
/**
 * Parse one `HH:MM:SS.mmm --> HH:MM:SS.mmm` (or SRT comma) line.
 *
 * @param line Timestamp line, optionally with VTT cue settings.
 */
const parseTimestampLine = (
  line: string
): {
  endMs: number;
  startMs: number;
} | null => {
  const cleaned = Str.trim(Str.replace(CUE_SETTINGS, "")(line));
  if (!VTT_ARROW.test(cleaned)) {
    return null;
  }
  TIMESTAMP.lastIndex = 0;
  const start = TIMESTAMP.exec(cleaned);
  const end = TIMESTAMP.exec(cleaned);
  if (start === null || end === null) {
    return null;
  }
  return {
    endMs: toMs(end[1], end[2] ?? "0", end[3] ?? "0", end[4] ?? "0"),
    startMs: toMs(start[1], start[2] ?? "0", start[3] ?? "0", start[4] ?? "0"),
  };
};
/**
 * Strip WebVTT / SRT / ASS markup and collapse whitespace.
 *
 * @param raw Cue text, possibly with tags.
 */
export const cleanCaptionText = (raw: string): string =>
  Str.trim(Str.replace(/\s+/g, " ")(Str.replace(/\\[nNh]/g, " ")(Str.replace(MARKUP, " ")(raw))));
/**
 * Read a WebVTT voice annotation as a speaker name, if present.
 *
 * @param raw Cue body before markup is stripped.
 */
const speakerFromCaptionMarkup = (raw: string): string | null => {
  const name = Str.trim(Str.replace(/\s+/g, " ")(VTT_VOICE_TAG.exec(raw)?.[1] ?? ""));
  return name === "" || name === undefined ? null : name;
};
/**
 * Number speakers in first-appearance order using names from the caption file.
 *
 * @param cues Timed caption lines, some of which may name a speaker.
 */
const speakersFromCaptionCues = (
  cues: CaptionCue[]
): {
  speakers: PipelineSpeaker[];
  keyByName: HashMap.HashMap<string, string>;
} => {
  const speakers: PipelineSpeaker[] = [];
  let keyByName = HashMap.empty<string, string>();
  for (const cue of cues) {
    const name = Str.trim(cue.speaker ?? "");
    if (name == null || name === "" || HashMap.has(keyByName, name)) {
      continue;
    }
    const speakerKey = `speaker-${speakers.length + 1}`;
    keyByName = HashMap.set(keyByName, name, speakerKey);
    speakers.push({ speakerKey, displayName: name });
  }
  return { speakers, keyByName };
};
/**
 * Parse WebVTT or SRT cues from a subtitle document.
 *
 * @param text File or extracted track contents.
 */
export const parseCaptionCues = (text: string): CaptionCue[] => {
  const cues: CaptionCue[] = [];
  const blocks = Str.split(/\r?\n\r?\n/)(Str.replace(/^\uFEFF/, "")(text));
  for (const block of blocks) {
    const lines = Arr.filter(
      Arr.map(Str.split(/\r?\n/)(block), (line) => Str.trim(line)),
      (line) => line.length > 0 && !/^WEBVTT\b/i.test(line) && !/^NOTE\b/i.test(line)
    );
    if (lines.length === 0) {
      continue;
    }
    const stampIndex = Option.getOrElse(
      Arr.findFirstIndex(lines, (line) => VTT_ARROW.test(line)),
      () => -1
    );
    if (stampIndex < 0) {
      continue;
    }
    const times = parseTimestampLine(lines[stampIndex] ?? "");
    if (times === null || times.endMs <= times.startMs) {
      continue;
    }
    const rawBody = Arr.join(lines.slice(stampIndex + 1), " ");
    const body = cleanCaptionText(rawBody);
    if (body === "") {
      continue;
    }
    const speaker = speakerFromCaptionMarkup(rawBody);
    cues.push(
      speaker !== null && speaker !== ""
        ? { endMs: times.endMs, speaker, startMs: times.startMs, text: body }
        : { endMs: times.endMs, startMs: times.startMs, text: body }
    );
  }
  return cues;
};
/**
 * Parse simple ASS `Dialogue:` rows when a sidecar is not VTT/SRT.
 *
 * @param text Advanced SubStation Alpha document.
 */
export const parseAssCues = (text: string): CaptionCue[] => {
  const cues: CaptionCue[] = [];
  for (const rawLine of Str.split(/\r?\n/)(Str.replace(/^\uFEFF/, "")(text))) {
    if (!Str.startsWith("Dialogue:")(rawLine)) {
      continue;
    }
    const payload = Str.trim(Str.slice("Dialogue:".length)(rawLine));
    const parts = Str.split(",")(payload);
    if (parts.length < 10) {
      continue;
    }
    const start = parseAssTime(parts[1] ?? "");
    const end = parseAssTime(parts[2] ?? "");
    if (start == null || end == null || end <= start) {
      continue;
    }
    const body = cleanCaptionText(Arr.join(parts.slice(9), ","));
    if (body === "") {
      continue;
    }
    const speaker = Str.trim(parts[4] ?? "");
    cues.push(
      speaker !== null && speaker !== ""
        ? { endMs: end, speaker, startMs: start, text: body }
        : { endMs: end, startMs: start, text: body }
    );
  }
  return cues;
};
/**
 * Parse an ASS clock like `0:00:01.00`.
 *
 * @param value ASS time field.
 */
const parseAssTime = (value: string): number | null => {
  const match = Option.getOrNull(Str.match(/^(\d+):(\d{2}):(\d{2})\.(\d{1,2})$/)(Str.trim(value)));
  if (match === null) {
    return null;
  }
  const centis = Str.slice(0, 2)(`${match[4]}0`);
  return Number(match[1]) * 3600000 + Number(match[2]) * 60000 + Number(match[3]) * 1000 + Number(centis) * 10;
};
/**
 * Parse cues using the file format.
 *
 * @param text Subtitle document.
 * @param format Declared format.
 */
export const parseCaptionTrack: {
  (text: string, format: CaptionTrack["format"]): CaptionCue[];
  (format: CaptionTrack["format"]): (text: string) => CaptionCue[];
} = Fn.dual(2, (text: string, format: CaptionTrack["format"]): CaptionCue[] =>
  format === "ass" ? parseAssCues(text) : parseCaptionCues(text)
);
/**
 * Language tags used to pick a caption track. Simplified and Traditional stay in separate buckets.
 *
 * @param language UI language tag.
 */
export const preferredCaptionLanguages = (language: string): string[] => {
  const tags: string[] = [];
  const push = (tag: string): void => {
    const trimmed = Str.trim(tag);
    if (trimmed === "") {
      return;
    }
    if (Arr.some(tags, (item) => normalizeCaptionTag(item) === normalizeCaptionTag(trimmed))) {
      return;
    }
    tags.push(trimmed);
  };
  push(language);
  const script = chineseScriptOf(language);
  if (script === "hant") {
    for (const tag of TRADITIONAL_CHINESE_TAGS) {
      push(tag);
    }
  } else if (script === "hans") {
    for (const tag of SIMPLIFIED_CHINESE_TAGS) {
      push(tag);
    }
  }
  const lower = normalizeCaptionTag(language);
  if (lower !== "en" && !Str.startsWith("en-")(lower)) {
    push("en");
  }
  return tags;
};
/**
 * Score a caption track against the user's language preference.
 *
 * @param language Track language tag.
 * @param preferred Preferred tags, highest first.
 */
export const captionLanguageScore: {
  (language: string | null, preferred: string[]): number;
  (preferred: string[]): (language: string | null) => number;
} = Fn.dual(2, (language: string | null, preferred: string[]): number => {
  const withAiPenalty = (score: number): number => (isPlatformAiCaptionTag(language) ? score - 40 : score);
  if (language == null || Boolean(language) === false) {
    return 1;
  }
  const compact = captionLanguageForMatch(language);
  for (const [index, item] of preferred.entries()) {
    const want = normalizeCaptionTag(item);
    if (want === "") {
      continue;
    }
    const rank = 1000 - index * 10;
    if (compact === want) {
      return withAiPenalty(rank);
    }
    const wantScript = chineseScriptOf(want);
    const haveScript = chineseScriptOf(compact);
    if (wantScript !== null && haveScript !== null) {
      if (wantScript === haveScript) {
        return withAiPenalty(rank - 2);
      }
      continue;
    }
    if (Str.startsWith(`${want}-`)(compact) || Str.startsWith(`${compact}-`)(want)) {
      return withAiPenalty(rank);
    }
    const wantBase = Str.split("-")(want)[0];
    const haveBase = Str.split("-")(compact)[0];
    if (wantBase !== undefined && wantBase !== "" && haveBase === wantBase) {
      return withAiPenalty(rank - 5);
    }
  }
  if (compact === "en" || Str.startsWith("en-")(compact)) {
    return withAiPenalty(20);
  }
  return withAiPenalty(2);
});
/**
 * Pick the caption track that best matches the UI language.
 *
 * Platform auto captions score below official tracks. A negative score still
 * wins when it is the only usable file, so Bilibili `ai-zh` is imported
 * instead of starting a local transcription.
 *
 * @param tracks Candidate tracks.
 * @param preferred Preferred language tags.
 */
export const pickCaptionTrack: {
  <
    T extends {
      language: string | null;
      path?: string | undefined;
      text: string;
      title?: string | undefined;
    },
  >(
    tracks: T[],
    preferred: string[]
  ): T | null;
  <
    T extends {
      language: string | null;
      path?: string | undefined;
      text: string;
      title?: string | undefined;
    },
  >(
    preferred: string[]
  ): (tracks: T[]) => T | null;
} = Fn.dual(
  2,
  <
    T extends {
      language: string | null;
      path?: string | undefined;
      text: string;
      title?: string | undefined;
    },
  >(
    tracks: T[],
    preferred: string[]
  ): T | null => {
    let best: T | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const track of tracks) {
      if (!(Str.trim(track.text) !== "" && isImportableCaptionTrack(track))) {
        continue;
      }
      const score = captionLanguageScore(track.language, preferred);
      if (score > bestScore) {
        best = track;
        bestScore = score;
      }
    }
    return best;
  }
);
/**
 * Turn parsed cues into a captions-sourced pipeline result.
 *
 * @param cues Timed caption lines.
 * @param language Chosen track language.
 */
export const pipelineResultFromCues: {
  (cues: CaptionCue[], language: string | null): PipelineResult | null;
  (language: string | null): (cues: CaptionCue[]) => PipelineResult | null;
} = Fn.dual(2, (cues: CaptionCue[], language: string | null): PipelineResult | null => {
  const usable = Arr.filter(cues, (cue) => Boolean(cue.text) === true && cue.endMs > cue.startMs);
  if (usable.length === 0) {
    return null;
  }
  const { speakers, keyByName } = speakersFromCaptionCues(usable);
  const segments: PipelineSegment[] = Arr.map(usable, (cue) => ({
    confidence: null,
    endMs: cue.endMs,
    speakerKey:
      cue.speaker != null && cue.speaker !== ""
        ? (HashMap.get(keyByName, Str.trim(cue.speaker ?? "")).pipe(Option.getOrUndefined) ?? null)
        : null,
    startMs: cue.startMs,
    text: cue.text,
    words: [],
  }));
  return {
    asrTier: null,
    language,
    modelVersion: CAPTIONS_MODEL_VERSION,
    resultKind: "transcript",
    segments,
    sourceKind: "captions",
    speakers,
  };
});
