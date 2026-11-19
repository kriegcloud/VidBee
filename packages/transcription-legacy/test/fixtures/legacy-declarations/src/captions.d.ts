// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import type { PipelineResult } from './types';
export declare const CAPTIONS_MODEL_VERSION = "embedded-captions";
export declare const CAPTION_FILE_EXTENSIONS: readonly ['.vtt', '.srt', '.ass'];
export interface CaptionCue {
    endMs: number;
    startMs: number;
    text: string;
    /** Speaker name from a VTT voice tag or ASS Dialogue Name field. */
    speaker?: string | null;
}
export interface CaptionTrack {
    format: 'ass' | 'srt' | 'vtt';
    language: string | null;
    path?: string;
    text: string;
    title?: string;
}
/**
 * True when this tag is platform auto-captions such as Bilibili `ai-zh`.
 *
 * @param tag Language, stream title, or sidecar suffix.
 */
export declare const isPlatformAiCaptionTag: (tag: string | null | undefined) => boolean;
/**
 * True when this tag is danmaku or a live-chat dump, not dialogue captions.
 *
 * @param tag Language, stream title, or sidecar suffix.
 */
export declare const isChatCaptionTag: (tag: string | null | undefined) => boolean;
/**
 * True when this tag is platform auto-captions, danmaku, or chat.
 *
 * @param tag Language, stream title, or sidecar suffix.
 */
export declare const isMachineCaptionTag: (tag: string | null | undefined) => boolean;
/**
 * True when a sidecar name is a danmaku or chat dump.
 *
 * @param path Absolute or file name.
 */
export declare const isMachineCaptionPath: (path: string | null | undefined) => boolean;
/**
 * True when this track is dialogue captions, including platform AI subs.
 *
 * Danmaku and chat dumps stay out. Bilibili `ai-zh` / `ai-en` sidecars are
 * valid caption sources and can be switched on the transcript page.
 *
 * @param track Language tag, optional stream title, and optional sidecar path.
 */
export declare const isImportableCaptionTrack: (track: {
    language?: string | null;
    path?: string;
    title?: string;
}) => boolean;
/**
 * Alias kept for existing call sites: importable dialogue captions.
 *
 * @param track Language tag, optional stream title, and optional sidecar path.
 */
export declare const isHumanCaptionTrack: typeof isImportableCaptionTrack;
/**
 * Drop platform auto-caption prefixes so `ai-zh` matches Chinese, then map ffmpeg 639-2 tags.
 *
 * @param language Track language tag.
 */
export declare const captionLanguageForMatch: (language: string) => string;
/**
 * Stable key used to match caption languages across files and stored rows.
 *
 * Platform AI prefixes stay (`ai-zh` vs `zh`). ffmpeg `zho` / `eng` collapse onto `zh` / `en`.
 *
 * @param language Track language tag.
 */
export declare const captionLanguageKey: (language: string | null | undefined) => string;
/**
 * Canonical language tag for a track: map ffmpeg 639-2 codes and split Chinese scripts.
 *
 * @param language Declared stream or sidecar tag.
 * @param text Caption document or cue text, used to tell Simplified from Traditional.
 */
export declare const refineCaptionLanguage: (language: string | null, text: string) => string | null;
/**
 * Stable task id used when captions are imported without an ASR child task.
 *
 * @param downloadTaskId Parent download id.
 */
export declare const captionsTaskId: (downloadTaskId: string, language?: string | null) => string;
/**
 * True when this subtitle codec can be converted to text (not bitmap).
 *
 * @param codecName ffprobe codec_name, if present.
 */
export declare const isTextSubtitleCodec: (codecName: string | null | undefined) => boolean;
/**
 * Strip WebVTT / SRT / ASS markup and collapse whitespace.
 *
 * @param raw Cue text, possibly with tags.
 */
export declare const cleanCaptionText: (raw: string) => string;
/**
 * Parse WebVTT or SRT cues from a subtitle document.
 *
 * @param text File or extracted track contents.
 */
export declare const parseCaptionCues: (text: string) => CaptionCue[];
/**
 * Parse simple ASS `Dialogue:` rows when a sidecar is not VTT/SRT.
 *
 * @param text Advanced SubStation Alpha document.
 */
export declare const parseAssCues: (text: string) => CaptionCue[];
/**
 * Parse cues using the file format.
 *
 * @param text Subtitle document.
 * @param format Declared format.
 */
export declare const parseCaptionTrack: (text: string, format: CaptionTrack['format']) => CaptionCue[];
/**
 * Read the language tag from a yt-dlp sidecar name such as `Title.en.vtt`.
 *
 * @param fileName File name only.
 * @param mediaStem Video file stem without extension.
 */
export declare const languageFromSidecarName: (fileName: string, mediaStem: string) => string | null;
/**
 * Find yt-dlp sidecar subtitle files next to a downloaded video.
 *
 * @param sourceFilePath Absolute media path.
 */
export declare const findSidecarCaptionTracks: (sourceFilePath: string) => CaptionTrack[];
/**
 * Language tags used to pick a caption track. Simplified and Traditional stay in separate buckets.
 *
 * @param language UI language tag.
 */
export declare const preferredCaptionLanguages: (language: string) => string[];
/**
 * Score a caption track against the user's language preference.
 *
 * @param language Track language tag.
 * @param preferred Preferred tags, highest first.
 */
export declare const captionLanguageScore: (language: string | null, preferred: string[]) => number;
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
export declare const pickCaptionTrack: <T extends {
    language: string | null;
    path?: string;
    text: string;
    title?: string;
}>(tracks: T[], preferred: string[]) => T | null;
/**
 * Turn parsed cues into a captions-sourced pipeline result.
 *
 * @param cues Timed caption lines.
 * @param language Chosen track language.
 */
export declare const pipelineResultFromCues: (cues: CaptionCue[], language: string | null) => PipelineResult | null;
