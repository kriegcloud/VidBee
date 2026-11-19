import * as S from "effect/Schema";
export const WireTaskId = S.Unknown;
export type WireTaskId = typeof WireTaskId.Type;
export const HandshakeWire = S.StructWithRest(S.Struct({ token: S.String, expiresAt: S.Finite }), [
  S.Record(S.String, S.Unknown),
]);
export type HandshakeWire = typeof HandshakeWire.Type;
export const AutomationClientOptions = S.Struct({
  baseUrl: S.String,
  token: S.optional(S.String),
  skipHandshake: S.optional(S.Boolean),
  requestTimeoutMs: S.optional(S.Finite),
  expiresAtSlackMs: S.optional(S.Finite),
});
export type AutomationClientOptions = typeof AutomationClientOptions.Type;
export const HttpObservation = S.Struct({ status: S.Finite, statusText: S.String, bodyText: S.String });
export type HttpObservation = typeof HttpObservation.Type;
