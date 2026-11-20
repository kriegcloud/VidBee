import * as S from "effect/Schema";
import { AsrRecognizerResult } from "./Pipeline.model.js";
import { FloatSamples } from "./WaveSamples.model.js";
export const NativeAsrResult = S.StructWithRest(AsrRecognizerResult, [S.Record(S.String, S.Unknown)]);
export const NativeTurn = S.Struct({ start: S.Finite, end: S.Finite, speaker: S.Finite });
export type NativeTurn = typeof NativeTurn.Type;
export const NativeVadFront = S.Struct({ start: S.optional(S.Finite), samples: S.optional(FloatSamples) });
export const NativeVadConfig = S.Struct({ sileroVad: S.optional(S.Struct({ windowSize: S.optional(S.Finite) })) });
export const NativeTurnsHandle = S.Struct({
  size: S.optional(S.Finite),
  get: S.optional(S.declare((input): input is (index: number) => unknown => typeof input === "function")),
});
