import {CaptionFiles} from '../../transcription/src/CaptionFiles.service'
import {runStateless} from './bridge/stateless'
import * as Pure from "@vidbee/transcription/captions";
import type { PipelineResult } from './types';
export const CAPTIONS_MODEL_VERSION = Pure.CAPTIONS_MODEL_VERSION;

export const CAPTION_FILE_EXTENSIONS = Pure.CAPTION_FILE_EXTENSIONS;

export interface CaptionCue {
  endMs: number
  startMs: number
  text: string
  /** Speaker name from a VTT voice tag or ASS Dialogue Name field. */
  speaker?: string | null
}

export interface CaptionTrack {
  format: 'ass' | 'srt' | 'vtt'
  language: string | null
  path?: string
  text: string
  title?: string
}

export const isPlatformAiCaptionTag = (tag: string | null | undefined): boolean => { return Pure.isPlatformAiCaptionTag(tag); };

export const isChatCaptionTag = (tag: string | null | undefined): boolean => { return Pure.isChatCaptionTag(tag); };

export const isMachineCaptionTag = (tag: string | null | undefined): boolean =>
  { return Pure.isMachineCaptionTag(tag); };

export const isMachineCaptionPath = (path: string | null | undefined): boolean => { return runStateless(CaptionFiles.use(service=>service.isMachinePath(path))); };

export const isImportableCaptionTrack = (track: {
  language?: string | null
  path?: string
  title?: string
}): boolean =>
  { return !(Pure.isChatCaptionTag(track.language) || Pure.isChatCaptionTag(track.title) || isMachineCaptionPath(track.path)); };

export const isHumanCaptionTrack = isImportableCaptionTrack;

export const captionLanguageForMatch = (language: string): string => { return Pure.captionLanguageForMatch(language); };

export const captionLanguageKey = (language: string | null | undefined): string => { return Pure.captionLanguageKey(language); };

export const refineCaptionLanguage = (language: string | null, text: string): string | null => { return Pure.refineCaptionLanguage(language, text); };

export const captionsTaskId = (downloadTaskId: string, language?: string | null): string => { return Pure.captionsTaskId(downloadTaskId, language); };

export const isTextSubtitleCodec = (codecName: string | null | undefined): boolean => { return Pure.isTextSubtitleCodec(codecName); };

export const cleanCaptionText = (raw: string): string =>
  { return Pure.cleanCaptionText(raw); };

export const parseCaptionCues = (text: string): CaptionCue[] => { return Pure.parseCaptionCues(text); };

export const parseAssCues = (text: string): CaptionCue[] => { return Pure.parseAssCues(text); };

export const parseCaptionTrack = (text: string, format: CaptionTrack['format']): CaptionCue[] =>
  { return Pure.parseCaptionTrack(text, format); };

export const languageFromSidecarName = (fileName: string, mediaStem: string): string | null => {
  return runStateless(CaptionFiles.use(service=>service.languageFromName(fileName,mediaStem)))
}

export const findSidecarCaptionTracks = (sourceFilePath: string): CaptionTrack[] => {
  return runStateless(CaptionFiles.use(service=>service.findSidecar(sourceFilePath)))
}

export const preferredCaptionLanguages = (language: string): string[] => { return Pure.preferredCaptionLanguages(language); };

export const captionLanguageScore = (
  language: string | null,
  preferred: string[]
): number => { return Pure.captionLanguageScore(language, preferred); };

export const pickCaptionTrack = <
  T extends { language: string | null; path?: string; text: string; title?: string }
>(
  tracks: T[],
  preferred: string[]
 ): T | null => runStateless(CaptionFiles.use(service=>service.pick(tracks,preferred)));

export const pipelineResultFromCues = (
  cues: CaptionCue[],
  language: string | null
): PipelineResult | null => { return Pure.pipelineResultFromCues(cues, language); };

