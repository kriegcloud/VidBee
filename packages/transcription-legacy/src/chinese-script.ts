import * as Pure from "@vidbee/transcription/chinese-script";
import type { PipelineResult, PipelineSegment } from './types';
export type ChineseScript = 'hans' | 'hant'

export const chineseScriptOf = (language: string): ChineseScript | null => { return Pure.chineseScriptOf(language); };

export const chineseScriptHint = (language?: string | null): string | undefined => { return Pure.chineseScriptHint(language); };

export const looksLikeChinese = (text: string): boolean => { return Pure.looksLikeChinese(text); };

export const chineseScriptFromText = (text: string): ChineseScript | null => { return Pure.chineseScriptFromText(text); };

export const applyChineseScript = (
  text: string,
  script: ChineseScript | null | undefined
): string => { return Pure.applyChineseScript(text, script); };

export const applyChineseScriptToSegment = (
  segment: PipelineSegment,
  script: ChineseScript | null | undefined
): PipelineSegment => { return Pure.applyChineseScriptToSegment(segment, script); };

export const languageAfterChineseScript = (
  segments: Array<{ text: string }>,
  script: ChineseScript | null | undefined
): string | null => { return Pure.languageAfterChineseScript(segments, script); };

export const applyChineseScriptToResult = (
  result: PipelineResult,
  script: ChineseScript | null | undefined
): PipelineResult => { return Pure.applyChineseScriptToResult(result, script); };

