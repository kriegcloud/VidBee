import * as S from "effect/Schema";

export { ExtractedAudio, PcmWave } from "./Pipeline.model.js";
export const AudioExtractInput = S.Struct({
  sourceFilePath: S.String,
  ffmpegPath: S.String,
  outputDir: S.String,
  signal: S.optional(S.instanceOf(AbortSignal)),
});
export type AudioExtractInput = typeof AudioExtractInput.Type;
