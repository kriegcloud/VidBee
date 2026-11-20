import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { TranscriptionError } from "./Transcription.errors.js";
import type { TranscriptionProcessSpec } from "./TranscriptionProcess.model.js";

/** Capture lifetime belongs to the composition root, including after timeout. */
export class CaptionProcessOwner extends Context.Service<
  CaptionProcessOwner,
  {
    readonly capture: (spec: TranscriptionProcessSpec, timeoutMs: number) => Effect.Effect<string, TranscriptionError>;
  }
>()("@vidbee/transcription/CaptionProcessOwner.service/CaptionProcessOwner") {}
