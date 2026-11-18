import * as S from "effect/Schema";

/** Raw wrapper values remain unknown until the progress parser checks them. */
export const WrapperProgress = S.Struct({
  percent: S.optional(S.Unknown),
  currentSpeed: S.optional(S.String),
  eta: S.optional(S.String),
  downloaded: S.optional(S.String),
  total: S.optional(S.String),
  totalSize: S.optional(S.String),
});
export const WrapperObservation = S.Union([
  S.TaggedStruct("progress", { payload: WrapperProgress }),
  S.TaggedStruct("ytDlpEvent", { eventType: S.String, eventData: S.String }),
  S.TaggedStruct("error", { error: S.Unknown }),
  S.TaggedStruct("close", { code: S.NullOr(S.Finite) }),
  S.TaggedStruct("stdout", { chunk: S.Uint8Array }),
  S.TaggedStruct("stderr", { chunk: S.Uint8Array }),
]);
export type WrapperObservation = typeof WrapperObservation.Type;
export const WrapperState = S.Struct({ stderr: S.String, processError: S.Unknown });
export type WrapperState = typeof WrapperState.Type;
