import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CaptionExtractionInput, CaptionProbeStream, ExtractedCaptionTrack } from "./CaptionExtraction.model.js";
import type { HostFailure, TranscriptionError } from "./Transcription.errors.js";
/** Parsing and later property traversal have distinct historical catch boundaries. */
export interface CaptionProbeDocument {
  readonly filter: (
    predicate: (stream: CaptionProbeStream) => boolean
  ) => Effect.Effect<readonly CaptionProbeStream[], TranscriptionError>;
}
export class CaptionProbeReader extends Context.Service<
  CaptionProbeReader,
  {
    readonly isHuman: (stream: CaptionProbeStream) => boolean;
    readonly parse: (text: string) => Effect.Effect<CaptionProbeDocument, HostFailure>;
  }
>()("@vidbee/transcription/CaptionExtraction.service/CaptionProbeReader") {}
export class CaptionExtraction extends Context.Service<
  CaptionExtraction,
  {
    readonly probePath: (ffmpegPath: string) => string;
    readonly extract: (input: CaptionExtractionInput) => Effect.Effect<ExtractedCaptionTrack[], TranscriptionError>;
  }
>()("@vidbee/transcription/CaptionExtraction.service/CaptionExtraction") {}
