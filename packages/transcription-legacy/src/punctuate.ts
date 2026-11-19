import * as Pure from "@vidbee/transcription/punctuate";
import type { TranscriptWord } from './types';
export const PUNCT_WINDOW_CHARS = Pure.PUNCT_WINDOW_CHARS;

export const PUNCT_SENTENCE_DENSITY_CHARS = Pure.PUNCT_SENTENCE_DENSITY_CHARS;

export interface Punctuator {
  addPunct: (text: string) => string
}

export const needsPunctuation = (text: string): boolean => { return Pure.needsPunctuation(text); };

export const alignInsertions = (original: string, punctuated: string): string[] | null => { return Pure.alignInsertions(original, punctuated); };

export const punctuateText = (punct: Punctuator, text: string): string => { return Pure.punctuateText(punct, text); };

export const punctuateWords = (
  punct: Punctuator,
  text: string,
  words: TranscriptWord[] | undefined
): { text: string; words: TranscriptWord[] | undefined } => { return Pure.punctuateWords(punct, text, words); };

export const punctuateCues = <T extends { text: string }>(punct: Punctuator, cues: T[]): T[] => { return Pure.punctuateCues(punct, cues); };

