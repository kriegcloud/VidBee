import type { PipelineResult, PipelineSegment } from './types';
export type ChineseScript = 'hans' | 'hant';
/**
 * Return Simplified vs Traditional for a Chinese tag, or null when it is not Chinese.
 */
export declare const chineseScriptOf: (language: string) => ChineseScript | null;
/**
 * Keep Simplified vs Traditional Chinese as a post-ASR script preference.
 */
export declare const chineseScriptHint: (language?: string | null) => string | undefined;
/**
 * True when this text looks like Chinese, not Japanese or Korean.
 */
export declare const looksLikeChinese: (text: string) => boolean;
/**
 * Infer Simplified vs Traditional from caption text. Null when the text is not Chinese.
 *
 * @param text Caption document or joined cue text.
 */
export declare const chineseScriptFromText: (text: string) => ChineseScript | null;
/**
 * Convert Chinese text to Simplified or Traditional. Other languages are left unchanged.
 */
export declare const applyChineseScript: (text: string, script: ChineseScript | null | undefined) => string;
/**
 * Convert one transcript segment, including word timings, to the UI Chinese script.
 */
export declare const applyChineseScriptToSegment: (segment: PipelineSegment, script: ChineseScript | null | undefined) => PipelineSegment;
/**
 * Language tag to store after Chinese script conversion.
 */
export declare const languageAfterChineseScript: (segments: Array<{
    text: string;
}>, script: ChineseScript | null | undefined) => string | null;
/**
 * Convert Chinese segments in a pipeline result to the UI script preference.
 */
export declare const applyChineseScriptToResult: (result: PipelineResult, script: ChineseScript | null | undefined) => PipelineResult;
