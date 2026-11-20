import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { CaptionFiles } from "./CaptionFiles.service.js";
import { CaptionImport } from "./CaptionImport.service.js";
import {
  captionLanguageKey,
  captionsTaskId,
  isPlatformAiCaptionTag,
  parseCaptionTrack,
  pipelineResultFromCues,
  refineCaptionLanguage,
} from "./captions.js";
import { applyChineseScriptToResult, chineseScriptOf } from "./chinese-script.js";
import { TranscriptionRecords } from "./TranscriptionRecords.service.js";
import type { CaptionTrack } from "./Caption.model.js";
import type { CaptionCommitInput, CaptionImportInput } from "./CaptionImport.model.js";
export const layer = Layer.effect(
  CaptionImport,
  Effect.gen(function* () {
    const files = yield* CaptionFiles;
    const records = yield* TranscriptionRecords;
    const commit = Effect.fn("CaptionImport.commit")(function* (input: CaptionCommitInput) {
      const current = yield* records.latest(input.downloadTaskId);
      if (Boolean(input.replace) === false && current !== null)
        return current.sourceKind === "captions" ? current : null;
      if (!(yield* files.importable(input.track))) return null;
      const cues = parseCaptionTrack(input.track.text, input.track.format);
      const language = refineCaptionLanguage(
        input.track.language,
        Arr.join(
          Arr.map(cues, (cue) => cue.text),
          "\n"
        )
      );
      const parsed = pipelineResultFromCues(cues, language);
      if (parsed === null) return null;
      const converted =
        input.convertScript === false
          ? parsed
          : applyChineseScriptToResult(parsed, chineseScriptOf(input.preferredLanguages?.[0] ?? ""));
      const result = isPlatformAiCaptionTag(input.track.language)
        ? { ...converted, language: input.track.language }
        : converted;
      return yield* records.commit({
        downloadTaskId: input.downloadTaskId,
        result,
        sourceFilePath: input.sourceFilePath,
        transcriptionTaskId: captionsTaskId(input.downloadTaskId, result.language),
      });
    });
    const sidecar = Effect.fn("CaptionImport.sidecar")(function* (input: CaptionImportInput) {
      const current = yield* records.latest(input.downloadTaskId);
      if (current !== null) return current.sourceKind === "captions" ? current : null;
      const tracks = yield* files.findSidecar(input.sourceFilePath);
      const track = yield* files.pick(tracks, [...(input.preferredLanguages ?? [])]);
      return track === null ? null : yield* commit({ ...input, track });
    });
    const commitTracks = Effect.fn("CaptionImport.commitTracks")(function* (
      input: CaptionImportInput,
      tracks: readonly CaptionTrack[]
    ) {
      const current = yield* records.latest(input.downloadTaskId);
      if (current !== null) return current.sourceKind === "captions" ? current : null;
      const refined: CaptionTrack[] = [];
      let seen = HashSet.empty<string>();
      for (const track of tracks) {
        if (Str.trim(track.text) === "" || !(yield* files.importable(track))) continue;
        const language = refineCaptionLanguage(track.language, track.text);
        const key = captionLanguageKey(language);
        if (HashSet.has(seen, key)) continue;
        seen = HashSet.add(seen, key);
        refined.push({ ...track, language });
      }
      const picked = yield* files.pick(refined, [...(input.preferredLanguages ?? [])]);
      if (picked === null) return null;
      const pickedKey = captionLanguageKey(picked.language);
      for (const track of refined) {
        if (captionLanguageKey(track.language) === pickedKey) continue;
        yield* commit({ ...input, convertScript: false, replace: true, track });
      }
      return yield* commit({ ...input, convertScript: true, replace: true, track: picked });
    });
    return CaptionImport.of({
      commit,
      sidecar,
      switchLanguage: Effect.fn("CaptionImport.switchLanguage")(function* (input) {
        const want = captionLanguageKey(input.language);
        const history = yield* records.list(input.downloadTaskId);
        const stored = Arr.findFirst(
          history,
          (row) =>
            row.sourceKind === "captions" &&
            row.resultKind === "transcript" &&
            captionLanguageKey(row.language) === want
        ).pipe(Option.getOrUndefined);
        if (stored !== undefined) return yield* records.activate(input.downloadTaskId, stored.id);
        const tracks = yield* files.findSidecar(input.sourceFilePath);
        const track = Arr.findFirst(tracks, (item) => captionLanguageKey(item.language) === want).pipe(
          Option.getOrUndefined
        );
        return track === undefined ? null : yield* commit({ ...input, replace: true, track });
      }),
      download: Effect.fn("CaptionImport.download")(function* (input, embedded) {
        const found = yield* sidecar(input);
        if (found !== null) return found;
        if ((yield* records.latest(input.downloadTaskId)) !== null) return null;
        const extraction = embedded?.();
        if (extraction === undefined) return null;
        const extracted = yield* extraction.pipe(Effect.orElseSucceed(() => null));
        if (extracted === null) return null;
        return yield* commitTracks(
          input,
          Arr.map(extracted, (item) => ({
            format: "vtt",
            language: item.language,
            text: item.text,
            ...(item.title === undefined ? {} : { title: item.title }),
          }))
        );
      }),
    });
  })
);
