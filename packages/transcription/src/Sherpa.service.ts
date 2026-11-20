/// <reference path="./sherpa-onnx-node.d.ts" />
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Addon, OfflineStream, Recognizer } from "sherpa-onnx-node";
import type { AsrRecognizerResult, PcmWave, TimeInterval } from "./Pipeline.model.js";
import type { Punctuator } from "./punctuate.js";
import type { NativeTurn } from "./Sherpa.model.js";
import type { TranscriptionError } from "./Transcription.errors.js";
export interface RecognizerSession {
  readonly decode: (wave: PcmWave) => Effect.Effect<AsrRecognizerResult, TranscriptionError>;
  readonly probe: (samples: Float32Array) => Effect.Effect<number, TranscriptionError>;
}
export interface VadSession {
  readonly accept: (samples: Float32Array) => Effect.Effect<readonly TimeInterval[], TranscriptionError>;
  readonly flush: Effect.Effect<readonly TimeInterval[], TranscriptionError>;
  readonly windowSize: number;
}
export interface DiarizerSession {
  readonly process: (samples: Float32Array) => Effect.Effect<readonly NativeTurn[], TranscriptionError>;
}
export interface EmbeddingSession {
  readonly compute: (wave: PcmWave) => Effect.Effect<Float32Array | null, TranscriptionError>;
}
export class SherpaLoader extends Context.Service<
  SherpaLoader,
  {
    readonly load: Effect.Effect<Addon, TranscriptionError>;
    readonly readResult: (recognizer: Recognizer, stream: OfflineStream) => unknown;
  }
>()("@vidbee/transcription/Sherpa.service/SherpaLoader") {}
export interface SherpaOperations {
  readonly diarizer: (config: Record<string, unknown>) => Effect.Effect<DiarizerSession, TranscriptionError>;
  readonly embedding: (config: Record<string, unknown>) => Effect.Effect<EmbeddingSession | null, TranscriptionError>;
  readonly embeddingAvailable: Effect.Effect<boolean, TranscriptionError>;
  readonly punctuationAvailable: Effect.Effect<boolean, TranscriptionError>;
  readonly punctuator: (config: Record<string, unknown>) => Effect.Effect<Punctuator | null, TranscriptionError>;

  readonly recognizer: (config: Record<string, unknown>) => Effect.Effect<RecognizerSession, TranscriptionError>;
  readonly vad: (
    config: Record<string, unknown>,
    bufferSeconds: number,
    sampleRate: number
  ) => Effect.Effect<VadSession, TranscriptionError>;
}
export class Sherpa extends Context.Service<
  Sherpa,
  SherpaOperations & { readonly session: Effect.Effect<SherpaOperations, TranscriptionError> }
>()("@vidbee/transcription/Sherpa.service/Sherpa") {}
