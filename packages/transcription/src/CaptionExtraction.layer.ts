import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Num from "effect/Number";
import * as Order from "effect/Order";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { CaptionProbeEnvelope } from "./CaptionExtraction.model.js";
import { CaptionExtraction, CaptionProbeReader } from "./CaptionExtraction.service.js";
import { CaptionProcessOwner } from "./CaptionProcessOwner.service.js";
import { captionLanguageScore, isHumanCaptionTrack, isTextSubtitleCodec } from "./captions.js";
import { BoundaryDecodeError, HostFailure } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import type { CaptionProbeStream, ExtractedCaptionTrack } from "./CaptionExtraction.model.js";

export const probeReaderLayer = Layer.succeed(CaptionProbeReader, {
  isHuman: (stream) =>
    isHumanCaptionTrack({
      ...(stream.tags?.language === undefined ? {} : { language: stream.tags.language }),
      ...(stream.tags?.title === undefined ? {} : { title: stream.tags.title }),
    }),
  parse: Effect.fn("CaptionProbeReader.parse")(function* (text) {
    const value = yield* S.decodeUnknownEffect(S.fromJsonString(S.Unknown))(text).pipe(
      Effect.mapError((cause) =>
        HostFailure.make({ operation: "caption-probe-json", legacyMessage: "Invalid caption probe JSON", cause })
      )
    );
    return {
      filter: (predicate: (stream: CaptionProbeStream) => boolean) =>
        S.decodeUnknownEffect(CaptionProbeEnvelope)(value).pipe(
          Effect.mapBoth({
            onSuccess: (doc) => Arr.filter(doc.streams ?? [], predicate),
            onFailure: (cause) =>
              BoundaryDecodeError.make({
                operation: "caption-probe-streams",
                legacyMessage: "Invalid transcription data at caption-probe-streams.",
                cause,
              }),
          })
        ),
    };
  }),
});
export const layer = Layer.effect(
  CaptionExtraction,
  Effect.gen(function* () {
    const files = yield* TranscriptionFiles;
    const path = yield* Path.Path;
    const owner = yield* CaptionProcessOwner;
    const reader = yield* CaptionProbeReader;
    const probePath = (ffmpegPath: string) =>
      Str.endsWith("ffmpeg.exe")(ffmpegPath)
        ? Str.replace(/ffmpeg\.exe$/i, "ffprobe.exe")(ffmpegPath)
        : path.join(path.dirname(ffmpegPath), "ffprobe");
    const capture = (command: string, argv: readonly string[], timeout: number) =>
      owner.capture(
        {
          command,
          argv,
          env: undefined,
          extendEnv: true,
          cwd: undefined,
          detached: false,
          windowsHide: true,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          stdoutConsumption: "deliver",
          stderrConsumption: "deliver",
        },
        timeout
      );
    return CaptionExtraction.of({
      probePath,
      extract: Effect.fn("CaptionExtraction.extract")(function* (input) {
        if (!(yield* files.exists(input.ffmpegPath)) || !(yield* files.exists(input.filePath))) return [];
        const probe = probePath(input.ffmpegPath);
        if (!(yield* files.exists(probe))) return [];
        const document = yield* capture(
          probe,
          [
            "-v",
            "error",
            "-select_streams",
            "s",
            "-show_entries",
            "stream=index,codec_name,codec_type:stream_tags=language,title",
            "-of",
            "json",
            input.filePath,
          ],
          8000
        ).pipe(
          Effect.flatMap(reader.parse),
          Effect.orElseSucceed(() => null)
        );
        if (document === null) return [];
        const streams = yield* document.filter(
          (stream) =>
            stream.codec_type === "subtitle" && isTextSubtitleCodec(stream.codec_name) && reader.isHuman(stream)
        );
        const selected = yield* Effect.try({
          try: () =>
            Arr.take(
              Arr.sort(
                Arr.map(streams, (stream, index) => ({
                  stream,
                  index,
                  score: captionLanguageScore(stream.tags?.language ?? null, input.preferredLanguages ?? []),
                })),
                Order.make<{ stream: CaptionProbeStream; index: number; score: number }>(
                  (left, right) => Num.Order(right.score, left.score) || Num.Order(left.index, right.index)
                )
              ),
              24
            ),
          catch: (cause) =>
            HostFailure.make({
              operation: "caption-probe-traversal",
              legacyMessage: "Invalid caption probe streams",
              cause,
            }),
        });
        const tracks: ExtractedCaptionTrack[] = [];
        for (const { stream } of selected) {
          if (typeof stream.index !== "number") continue;
          const track = yield* capture(
            input.ffmpegPath,
            ["-v", "error", "-i", input.filePath, "-map", `0:${stream.index}`, "-f", "webvtt", "pipe:1"],
            20_000
          ).pipe(
            Effect.flatMap((text) =>
              Effect.try({
                try: () =>
                  Str.trim(text) === ""
                    ? null
                    : {
                        language:
                          (stream.tags?.language === undefined ? undefined : Str.trim(stream.tags.language)) || null,
                        text,
                        title:
                          (stream.tags?.title === undefined ? undefined : Str.trim(stream.tags.title)) || undefined,
                      },
                catch: (cause) =>
                  HostFailure.make({ operation: "caption-track", legacyMessage: "Invalid caption track", cause }),
              })
            ),
            Effect.orElseSucceed(() => null)
          );
          if (track !== null) tracks.push(track);
        }
        return tracks;
      }),
    });
  })
);
