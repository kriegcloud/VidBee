import * as Arr from "effect/Array";
import * as Fn from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";
import { captionLanguageForMatch, captionLanguageKey, isPlatformAiCaptionTag } from "./captions.js";
import type { TranscriptHead, TranscriptSourceMeta, TranscriptSourceOption } from "./Transcript.model.js";

export type { TranscriptHead, TranscriptSourceMeta } from "./Transcript.model.js";
/**
 * Build the captions-language and ASR choices for one download.
 *
 * @param input Current row, stored history, sidecar languages, and optional viewing key.
 */
export const buildTranscriptSources = (input: {
  asrActive?: boolean | undefined;
  current: TranscriptSourceMeta | null;
  preferredKey?: string | null | undefined;
  stored: readonly TranscriptSourceMeta[];
  tracks: ReadonlyArray<{
    language: string | null;
  }>;
}): TranscriptSourceOption[] => {
  let seen = HashSet.empty<string>();
  const captionLangs: Array<{
    auto: boolean;
    language: string | null;
  }> = [];
  const pushCaption = (language: string | null): void => {
    const key = captionLanguageKey(language);
    if (HashSet.has(seen, key)) {
      return;
    }
    seen = HashSet.add(seen, key);
    captionLangs.push({ auto: isPlatformAiCaptionTag(language), language });
  };
  for (const track of input.tracks) {
    pushCaption(track.language);
  }
  for (const row of input.stored) {
    if (row.sourceKind === "captions") {
      pushCaption(row.language);
    }
  }
  const asrActive = Boolean(input.asrActive);
  const asrRecord = Option.getOrUndefined(
    Arr.findFirst(input.stored, (row) => row.sourceKind === "asr" && row.resultKind === "transcript")
  );
  const includeAsr =
    captionLangs.length > 0 || asrRecord !== undefined || input.current?.sourceKind === "asr" || asrActive;
  const preferred =
    input.preferredKey != null &&
    input.preferredKey !== "" &&
    (input.preferredKey === "asr"
      ? includeAsr
      : Arr.some(captionLangs, (item) => `captions:${captionLanguageKey(item.language)}` === input.preferredKey))
      ? input.preferredKey
      : null;
  const currentCaptionKey =
    !(preferred !== null || asrActive) && input.current?.sourceKind === "captions"
      ? captionLanguageKey(input.current.language)
      : null;
  const sources: TranscriptSourceOption[] = Arr.map(captionLangs, (item) => {
    const key = `captions:${captionLanguageKey(item.language)}`;
    const code =
      Boolean(item.language) === true && item.language !== null ? captionLanguageForMatch(item.language) : null;
    return {
      auto: item.auto,
      key,
      kind: "captions",
      language: item.language,
      languageCode: code !== null && code !== "" ? code : item.language,
      selected: preferred !== null ? preferred === key : currentCaptionKey === captionLanguageKey(item.language),
    };
  });
  if (includeAsr) {
    sources.push({
      auto: false,
      key: "asr",
      kind: "asr",
      language: asrRecord?.language ?? null,
      languageCode: asrRecord?.language ?? null,
      selected: preferred !== null ? preferred === "asr" : asrActive || input.current?.sourceKind === "asr",
    });
  }
  return sources;
};
/**
 * Pick the stored row that matches the source the user is viewing.
 *
 * ASR without a finished transcript returns null so the idle empty state can
 * show. Captions still fall back to the latest row when a language is missing.
 * History may be superseded; callers must pass every row, newest first.
 *
 * @param selected Option marked selected in `buildTranscriptSources`.
 * @param stored History for this download, newest first.
 * @param fallback Latest row when a captions source has no finished record.
 */
export const recordForTranscriptSource: {
  <T extends TranscriptSourceMeta>(
    selected: TranscriptSourceOption | undefined,
    stored: readonly T[],
    fallback: T | null
  ): T | null;
  <T extends TranscriptSourceMeta>(
    stored: readonly T[],
    fallback: T | null
  ): (selected: TranscriptSourceOption | undefined) => T | null;
} = Fn.dual(
  3,
  <T extends TranscriptSourceMeta>(
    selected: TranscriptSourceOption | undefined,
    stored: readonly T[],
    fallback: T | null
  ): T | null => {
    if (selected === undefined || Boolean(selected) === false) {
      return fallback;
    }
    if (selected.kind === "captions") {
      const want = captionLanguageKey(selected.language);
      return (
        Option.getOrUndefined(
          Arr.findFirst(
            stored,
            (row) =>
              row.sourceKind === "captions" &&
              row.resultKind === "transcript" &&
              captionLanguageKey(row.language) === want
          )
        ) ?? fallback
      );
    }
    return (
      Option.getOrUndefined(
        Arr.findFirst(stored, (row) => row.sourceKind === "asr" && row.resultKind === "transcript")
      ) ?? null
    );
  }
);
/**
 * Latest current row, or the newest row for the latest task when nothing is current.
 *
 * @param heads Rows for one download, newest first.
 * @param latestTaskId Newest transcription child, if any.
 */
export const latestTranscriptHead: {
  <T extends TranscriptHead>(heads: readonly T[], latestTaskId: string | null): T | null;
  <T extends TranscriptHead>(latestTaskId: string | null): (heads: readonly T[]) => T | null;
} = Fn.dual(2, <T extends TranscriptHead>(heads: readonly T[], latestTaskId: string | null): T | null => {
  const current = Option.getOrUndefined(Arr.findFirst(heads, (head) => head.supersededAt == null));
  if (current !== undefined && Boolean(current) === true) {
    return current;
  }
  if (latestTaskId === null || Boolean(latestTaskId) === false) {
    return null;
  }
  return Option.getOrUndefined(Arr.findFirst(heads, (head) => head.transcriptionTaskId === latestTaskId)) ?? null;
});
/**
 * Resolve the transcript row `getTranscriptSnapshot` would select, using heads only.
 *
 * @param input Newest-first heads, sidecar languages, and the viewing key.
 */
export const resolveTranscriptHeads = <T extends TranscriptHead>(input: {
  asrActive: boolean;
  heads: readonly T[];
  latestTaskId: string | null;
  preferredKey?: string | null | undefined;
  tracks: ReadonlyArray<{
    language: string | null;
  }>;
}): {
  latest: T | null;
  selected: T | null;
  sources: TranscriptSourceOption[];
} => {
  const latest = latestTranscriptHead(input.heads, input.latestTaskId);
  const sources = buildTranscriptSources({
    asrActive: input.asrActive,
    current: latest,
    preferredKey: input.preferredKey,
    stored: input.heads,
    tracks: input.tracks,
  });
  const selected = recordForTranscriptSource(
    Option.getOrUndefined(Arr.findFirst(sources, (item) => item.selected)),
    input.heads,
    latest
  );
  return { latest, selected, sources };
};
/**
 * Group newest-first heads by download without copying row objects.
 *
 * @param heads Library heads, newest first.
 */
export const groupTranscriptHeads = (heads: readonly TranscriptHead[]): HashMap.HashMap<string, TranscriptHead[]> => {
  let grouped = HashMap.empty<string, TranscriptHead[]>();
  for (const head of heads) {
    const rows = HashMap.get(grouped, head.downloadTaskId).pipe(Option.getOrUndefined);
    if (rows !== undefined) {
      rows.push(head);
    } else {
      grouped = HashMap.set(grouped, head.downloadTaskId, [head]);
    }
  }
  return grouped;
};
