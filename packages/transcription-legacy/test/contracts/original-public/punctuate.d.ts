import type { TranscriptWord } from './types';
/** CT-Transformer window size: one addPunct call per batch, not per cue. */
export declare const PUNCT_WINDOW_CHARS = 600;
/** Trigger restoration when sentence-end marks are rarer than this. */
export declare const PUNCT_SENTENCE_DENSITY_CHARS = 200;
export interface Punctuator {
    addPunct: (text: string) => string;
}
/**
 * True when the text looks like speech and is missing usable sentence punctuation.
 *
 * SenseVoice and human captions already carry marks, so they skip restoration.
 */
export declare const needsPunctuation: (text: string) => boolean;
/**
 * Treat `original` as a strict character subsequence of `punctuated`.
 *
 * Returns insertions of length `original.length + 1` (prefix, then after each
 * original character). Null when a character was rewritten or dropped.
 */
export declare const alignInsertions: (original: string, punctuated: string) => string[] | null;
/**
 * Run addPunct and keep the original text when alignment fails.
 */
export declare const punctuateText: (punct: Punctuator, text: string) => string;
/**
 * Attach inserted punctuation to the previous word. Timestamps stay as-is so
 * `words.map((word) => word.text).join('') === text` still holds.
 */
export declare const punctuateWords: (punct: Punctuator, text: string, words: TranscriptWord[] | undefined) => {
    text: string;
    words: TranscriptWord[] | undefined;
};
/**
 * Punctuate caption cues in windows so half-sentence rows are not each closed
 * with a period. Insertions at a cue boundary land on the previous cue's tail.
 */
export declare const punctuateCues: <T extends {
    text: string;
}>(punct: Punctuator, cues: T[]) => T[];
