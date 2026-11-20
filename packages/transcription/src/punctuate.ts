import * as Arr from "effect/Array";
import * as Fn from "effect/Function";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import type { TranscriptWord } from "./Transcript.model.js";
/** CT-Transformer window size: one addPunct call per batch, not per cue. */
export const PUNCT_WINDOW_CHARS = 600;
/** Trigger restoration when sentence-end marks are rarer than this. */
export const PUNCT_SENTENCE_DENSITY_CHARS = 200;
const CJK_OR_LATIN = /[\u4e00-\u9fffA-Za-z]/u;
const SENTENCE_END = /[。！？!?…]/gu;
export interface Punctuator {
  addPunct: (text: string) => string;
}
/**
 * True when the text looks like speech and is missing usable sentence punctuation.
 *
 * SenseVoice and human captions already carry marks, so they skip restoration.
 */
export const needsPunctuation = (text: string): boolean => {
  if (!CJK_OR_LATIN.test(text)) {
    return false;
  }
  const chars = [...text].length;
  if (chars === 0) {
    return false;
  }
  const ends = Option.getOrNull(Str.match(SENTENCE_END)(text))?.length ?? 0;
  if (ends === 0) {
    return true;
  }
  return chars / ends > PUNCT_SENTENCE_DENSITY_CHARS;
};
/**
 * Treat `original` as a strict character subsequence of `punctuated`.
 *
 * Returns insertions of length `original.length + 1` (prefix, then after each
 * original character). Null when a character was rewritten or dropped.
 */
export const alignInsertions: {
  (original: string, punctuated: string): string[] | null;
  (punctuated: string): (original: string) => string[] | null;
} = Fn.dual(2, (original: string, punctuated: string): string[] | null => {
  const source = [...original];
  const target = [...punctuated];
  const insertions = Array.from({ length: source.length + 1 }, () => "");
  let cursor = 0;
  for (const [index, char] of source.entries()) {
    const start = cursor;
    while (cursor < target.length && target[cursor] !== char) {
      cursor += 1;
    }
    if (cursor >= target.length) {
      return null;
    }
    insertions[index] = Arr.join(target.slice(start, cursor), "");
    cursor += 1;
  }
  insertions[source.length] = Arr.join(target.slice(cursor), "");
  return insertions;
});
/**
 * Run addPunct and keep the original text when alignment fails.
 */
export const punctuateText: {
  (punct: Punctuator, text: string): string;
  (text: string): (punct: Punctuator) => string;
} = Fn.dual(2, (punct: Punctuator, text: string): string => {
  if (!needsPunctuation(text)) {
    return text;
  }
  try {
    const punctuated = punct.addPunct(text);
    if (typeof punctuated !== "string" || punctuated.length === 0) {
      return text;
    }
    if (alignInsertions(text, punctuated) === null) {
      return text;
    }
    return punctuated;
  } catch {
    return text;
  }
});
/**
 * Attach inserted punctuation to the previous word. Timestamps stay as-is so
 * `words.map((word) => word.text).join('') === text` still holds.
 */
export const punctuateWords: {
  (
    punct: Punctuator,
    text: string,
    words: TranscriptWord[] | undefined
  ): {
    text: string;
    words: TranscriptWord[] | undefined;
  };
  (
    text: string,
    words: TranscriptWord[] | undefined
  ): (punct: Punctuator) => {
    text: string;
    words: TranscriptWord[] | undefined;
  };
} = Fn.dual(
  3,
  (
    punct: Punctuator,
    text: string,
    words: TranscriptWord[] | undefined
  ): {
    text: string;
    words: TranscriptWord[] | undefined;
  } => {
    if (!needsPunctuation(text)) {
      return { text, words };
    }
    if (words === undefined || Boolean(words) === false || words.length === 0) {
      return { text: punctuateText(punct, text), words };
    }
    const joined = Arr.join(
      Arr.map(words, (word) => word.text),
      ""
    );
    if (joined !== text) {
      return { text, words };
    }
    const punctuated = punctuateText(punct, text);
    if (punctuated === text) {
      return { text, words };
    }
    const insertions = alignInsertions(text, punctuated);
    if (insertions === null) {
      return { text, words };
    }
    const nextWords = Arr.map(
      applyInsertions(
        Arr.map(words, (word) => word.text),
        insertions
      ),
      (next, index) => {
        const word = words[index];
        return word !== undefined ? { ...word, text: next } : { startMs: 0, endMs: 0, text: next };
      }
    );
    return {
      text: Arr.join(
        Arr.map(nextWords, (word) => word.text),
        ""
      ),
      words: nextWords,
    };
  }
);
/**
 * Punctuate caption cues in windows so half-sentence rows are not each closed
 * with a period. Insertions at a cue boundary land on the previous cue's tail.
 */
export const punctuateCues: {
  <
    T extends {
      text: string;
    },
  >(
    punct: Punctuator,
    cues: T[]
  ): T[];
  <
    T extends {
      text: string;
    },
  >(
    cues: T[]
  ): (punct: Punctuator) => T[];
} = Fn.dual(
  2,
  <
    T extends {
      text: string;
    },
  >(
    punct: Punctuator,
    cues: T[]
  ): T[] => {
    if (cues.length === 0) {
      return cues;
    }
    const joined = Arr.join(
      Arr.map(cues, (cue) => cue.text),
      ""
    );
    if (!needsPunctuation(joined)) {
      return cues;
    }
    const next = Arr.map(cues, (cue) => ({ ...cue }));
    let index = 0;
    while (index < next.length) {
      let size = [...(next[index]?.text ?? "")].length;
      let end = index + 1;
      while (end < next.length) {
        const extra = [...(next[end]?.text ?? "")].length;
        if (size + extra > PUNCT_WINDOW_CHARS) {
          break;
        }
        size += extra;
        end += 1;
      }
      punctuateCueWindow(punct, next.slice(index, end));
      index = end;
    }
    return next;
  }
);
/**
 * Rewrite one window of cue texts in place from a single addPunct call.
 */
const punctuateCueWindow = <
  T extends {
    text: string;
  },
>(
  punct: Punctuator,
  window: T[]
): void => {
  if (window.length === 0) {
    return;
  }
  const original = Arr.join(
    Arr.map(window, (cue) => cue.text),
    ""
  );
  const punctuated = punctuateText(punct, original);
  if (punctuated === original) {
    return;
  }
  const insertions = alignInsertions(original, punctuated);
  if (insertions === null) {
    return;
  }
  const texts = applyInsertions(
    Arr.map(window, (cue) => cue.text),
    insertions
  );
  for (const [offset, cue] of window.entries()) {
    const text = texts[offset];
    if (text !== undefined) {
      cue.text = text;
    }
  }
};
/**
 * Splice insertion strings into consecutive text parts (words or cues).
 */
const applyInsertions = (parts: string[], insertions: string[]): string[] => {
  let charIndex = 0;
  let prefix = insertions[0] ?? "";
  return Arr.map(parts, (part) => {
    const chars = [...part];
    let built = prefix;
    prefix = "";
    for (const char of chars) {
      built += char + (insertions[charIndex + 1] ?? "");
      charIndex += 1;
    }
    return built;
  });
};
