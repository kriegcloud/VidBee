import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
export class TranscriptionIds extends Context.Service<
  TranscriptionIds,
  {
    readonly uuid: Effect.Effect<string>;
    readonly hex: (bytes: number) => Effect.Effect<string>;
  }
>()("@vidbee/transcription/TranscriptionIds.service/TranscriptionIds") {}
