import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type { AudioExtractInput } from "./Audio.model.js";
import type { ExtractedAudio, PcmWave } from "./Pipeline.model.js";
import type { AudioFailure, HostFailure, SourceUnavailable } from "./Transcription.errors.js";
export type AudioError = AudioFailure | SourceUnavailable | HostFailure;
export class AudioAbort extends Context.Service<
  AudioAbort,
  {
    readonly subscribe: (
      signal: AbortSignal,
      action: Effect.Effect<void, HostFailure>
    ) => Effect.Effect<Effect.Effect<void>, never, Scope.Scope>;
  }
>()("@vidbee/transcription/Audio.service/AudioAbort") {}
export class Audio extends Context.Service<
  Audio,
  {
    readonly extract: (input: AudioExtractInput) => Effect.Effect<ExtractedAudio, AudioError>;
    readonly readPcm: (path: string) => Effect.Effect<PcmWave, AudioFailure | HostFailure>;
  }
>()("@vidbee/transcription/Audio.service/Audio") {}
