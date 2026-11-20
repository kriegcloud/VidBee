import * as Arr from "effect/Array";
import * as Fn from "effect/Function";
import * as Str from "effect/String";
import { chineseConversion } from "./OpenCC.driver.js";
import type { PipelineResult, PipelineSegment } from "./Pipeline.model.js";

export type { ChineseScript } from "./Caption.model.js";

import type { ChineseScript } from "./Caption.model.js";

const CJK = /[\u4e00-\u9fff]/;
const JAPANESE_KANA = /[\u3040-\u309f\u30a0-\u30ff]/;
const HANGUL = /[\uac00-\ud7af]/;
/**
 * Return Simplified vs Traditional for a Chinese tag, or null when it is not Chinese.
 */
export const chineseScriptOf = (language: string): ChineseScript | null => {
  const normalized = Str.replaceAll("_", "-")(Str.toLowerCase(Str.trim(language)));
  const base = Str.split("-")(normalized)[0] ?? "";
  if (base !== "zh" && base !== "cmn" && base !== "zho" && base !== "chi") {
    return null;
  }
  if (
    Str.includes("hant")(normalized) ||
    Str.endsWith("-tw")(normalized) ||
    Str.includes("-tw-")(normalized) ||
    Str.endsWith("-hk")(normalized) ||
    Str.includes("-hk-")(normalized) ||
    Str.endsWith("-mo")(normalized) ||
    Str.includes("-mo-")(normalized)
  ) {
    return "hant";
  }
  return "hans";
};
/**
 * Keep Simplified vs Traditional Chinese as a post-ASR script preference.
 */
export const chineseScriptHint = (language?: string | null): string | undefined => {
  if (language == null || Str.trim(language) === "") {
    return undefined;
  }
  const script = chineseScriptOf(language);
  if (script === "hant") {
    return "zh-TW";
  }
  if (script === "hans") {
    return "zh";
  }
  return undefined;
};
/**
 * True when this text looks like Chinese, not Japanese or Korean.
 */
export const looksLikeChinese = (text: string): boolean => {
  if (!CJK.test(text)) {
    return false;
  }
  return !(JAPANESE_KANA.test(text) || HANGUL.test(text));
};
/**
 * Count how many characters differ between two equal-length strings, extra tail included.
 *
 * @param from Original sample.
 * @param to Converted sample.
 */
const changedChars = (from: string, to: string): number => {
  const limit = Math.max(from.length, to.length);
  let count = 0;
  for (let index = 0; index < limit; index += 1) {
    if (from[index] !== to[index]) {
      count += 1;
    }
  }
  return count;
};
/**
 * Infer Simplified vs Traditional from caption text. Null when the text is not Chinese.
 *
 * @param text Caption document or joined cue text.
 */
export const chineseScriptFromText = (text: string): ChineseScript | null => {
  if (!looksLikeChinese(text)) {
    return null;
  }
  const sample = Str.slice(0, 500)(Str.trim(Str.replace(/\s+/g, " ")(text)));
  const asHans = applyChineseScript(sample, "hans");
  const asHant = applyChineseScript(sample, "hant");
  const hansChanged = changedChars(sample, asHans);
  const hantChanged = changedChars(sample, asHant);
  if (hansChanged > hantChanged) {
    return "hant";
  }
  if (hantChanged > hansChanged) {
    return "hans";
  }
  return "hans";
};
/**
 * Convert Chinese text to Simplified or Traditional. Other languages are left unchanged.
 */
export const applyChineseScript: {
  (text: string, script: ChineseScript | null | undefined): string;
  (script: ChineseScript | null | undefined): (text: string) => string;
} = Fn.dual(2, (text: string, script: ChineseScript | null | undefined): string => {
  if (Boolean(text) === false || script == null || Boolean(script) === false || !looksLikeChinese(text)) {
    return text;
  }
  return chineseConversion.convert(text, script);
});
/**
 * Convert one transcript segment, including word timings, to the UI Chinese script.
 */
export const applyChineseScriptToSegment: {
  (segment: PipelineSegment, script: ChineseScript | null | undefined): PipelineSegment;
  (script: ChineseScript | null | undefined): (segment: PipelineSegment) => PipelineSegment;
} = Fn.dual(2, (segment: PipelineSegment, script: ChineseScript | null | undefined): PipelineSegment => {
  if (script == null || Boolean(script) === false) {
    return segment;
  }
  return {
    ...segment,
    text: applyChineseScript(segment.text, script),
    words:
      segment.words == null
        ? undefined
        : Arr.map(segment.words, (word) => ({
            ...word,
            text: applyChineseScript(word.text, script),
          })),
  };
});
/**
 * Language tag to store after Chinese script conversion.
 */
export const languageAfterChineseScript: {
  (
    segments: Array<{
      text: string;
    }>,
    script: ChineseScript | null | undefined
  ): string | null;
  (
    script: ChineseScript | null | undefined
  ): (
    segments: Array<{
      text: string;
    }>
  ) => string | null;
} = Fn.dual(
  2,
  (
    segments: Array<{
      text: string;
    }>,
    script: ChineseScript | null | undefined
  ): string | null => {
    if (!Arr.some(segments, (segment) => looksLikeChinese(segment.text))) {
      return null;
    }
    return script === "hant" ? "zh-TW" : "zh";
  }
);
/**
 * Convert Chinese segments in a pipeline result to the UI script preference.
 */
export const applyChineseScriptToResult: {
  (result: PipelineResult, script: ChineseScript | null | undefined): PipelineResult;
  (script: ChineseScript | null | undefined): (result: PipelineResult) => PipelineResult;
} = Fn.dual(2, (result: PipelineResult, script: ChineseScript | null | undefined): PipelineResult => {
  if (script == null || Boolean(script) === false) {
    const language = languageAfterChineseScript(result.segments, null);
    return language !== null && language !== "" && language !== result.language ? { ...result, language } : result;
  }
  const segments = Arr.map(result.segments, (segment) => applyChineseScriptToSegment(segment, script));
  return {
    ...result,
    language: languageAfterChineseScript(segments, script) ?? result.language,
    segments,
  };
});
