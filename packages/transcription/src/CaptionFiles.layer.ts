import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as P from "effect/Predicate";
import * as Str from "effect/String";
import { CaptionFiles } from "./CaptionFiles.service.js";
import { isChatCaptionTag, isMachineCaptionName, pickCaptionTrack } from "./captions.js";
import { HostFailure } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import type { CaptionTrack } from "./Caption.model.js";
import type { CaptionCandidate } from "./CaptionFiles.service.js";

const attempt = <A>(body: () => A) =>
  Effect.try({
    try: body,
    catch: (cause) =>
      HostFailure.make({
        operation: "captions",
        cause,
        legacyMessage: cause instanceof Error ? cause.message : String(cause),
      }),
  });
export const CaptionFilesLive = Layer.effect(
  CaptionFiles,
  Effect.gen(function* () {
    const files = yield* TranscriptionFiles;
    const path = yield* Path.Path;
    const isMachinePath = Effect.fn("CaptionFiles.isMachinePath")((value: string | null | undefined) =>
      attempt(() =>
        isMachineCaptionName(P.isTruthy(value) && value !== null && value !== undefined ? path.basename(value) : value)
      )
    );
    const importable = Effect.fn("CaptionFiles.importable")(function* (track: {
      language?: string | null | undefined;
      path?: string | undefined;
      title?: string | undefined;
    }) {
      return !(isChatCaptionTag(track.language) || isChatCaptionTag(track.title) || (yield* isMachinePath(track.path)));
    });
    const languageFromName = Effect.fn("CaptionFiles.languageFromName")((fileName: string, mediaStem: string) =>
      attempt(() => {
        const ext = Str.toLowerCase(path.extname(fileName));
        if (ext !== ".ass" && ext !== ".srt" && ext !== ".vtt") return null;
        const without = Str.slice(0, -ext.length)(fileName);
        if (without === mediaStem || !Str.startsWith(`${mediaStem}.`)(without)) return null;
        const tag = Str.trim(Str.slice(mediaStem.length + 1)(without));
        return P.isTruthy(tag) ? tag : null;
      })
    );
    return CaptionFiles.of({
      isMachinePath,
      importable,
      languageFromName,
      pick: Effect.fn("CaptionFiles.pick")(<T extends CaptionCandidate>(tracks: T[], preferred: string[]) =>
        attempt(() => {
          if (tracks.length === 0) return null;
          const normalized = Arr.map(tracks, (track) => ({
            ...track,
            path:
              P.isTruthy(Str.trim(track.text)) &&
              !isChatCaptionTag(track.language) &&
              !isChatCaptionTag(track.title) &&
              P.isTruthy(track.path) &&
              track.path !== undefined
                ? path.basename(track.path)
                : undefined,
          }));
          const selected = pickCaptionTrack(normalized, preferred);
          if (selected === null) return null;
          const index = Arr.findFirstIndex(normalized, (track) => track === selected);
          return Option.isSome(index) ? (tracks[index.value] ?? null) : null;
        })
      ),
      findSidecar: Effect.fn("CaptionFiles.findSidecar")(function* (source) {
        if (!(yield* files.exists(source))) return [];
        const location = yield* attempt(() => ({
          directory: path.dirname(source),
          stem: path.basename(source, path.extname(source)),
        }));
        const names = yield* files.readDirectory(location.directory).pipe(Effect.orElseSucceed(() => []));
        const tracks: CaptionTrack[] = [];
        for (const name of names) {
          const ext = Str.toLowerCase(path.extname(name));
          if (ext !== ".ass" && ext !== ".srt" && ext !== ".vtt") continue;
          const language = yield* languageFromName(name, location.stem);
          if (language === null && path.basename(name, ext) !== location.stem) continue;
          const target = path.join(location.directory, name);
          if (!(yield* importable({ language, path: target }))) continue;
          const track = yield* Effect.gen(function* () {
            if (!(yield* files.stat(target)).isFile) return null;
            const text = yield* files.readText(target);
            if (Str.trim(text).length === 0) return null;
            return {
              format: ext === ".ass" ? ("ass" as const) : ext === ".srt" ? ("srt" as const) : ("vtt" as const),
              language,
              path: target,
              text,
            };
          }).pipe(Effect.orElseSucceed(() => null));
          if (track !== null) tracks.push(track);
        }
        return tracks;
      }),
    });
  })
);
