import * as S from "effect/Schema";
import { ErrorEnvelope } from "./Envelope.model.js";
export const DescriptorPayload = S.Struct({
  version: S.Literal(1).pipe(S.mutableKey),
  schemaVersion: S.String.pipe(S.mutableKey),
  kind: S.Literal("desktop").pipe(S.mutableKey),
  host: S.String.pipe(S.mutableKey),
  port: S.Finite.pipe(S.mutableKey),
  tokenHash: S.NullOr(S.String).pipe(S.mutableKey),
  tokenIssuedAt: S.NullOr(S.Finite).pipe(S.mutableKey),
  tokenExpiresAt: S.NullOr(S.Finite).pipe(S.mutableKey),
  pid: S.Finite.pipe(S.mutableKey),
  pidStartedAt: S.Finite.pipe(S.mutableKey),
  updatedAt: S.Finite.pipe(S.mutableKey),
  appVersion: S.String.pipe(S.mutableKey),
});
export type DescriptorPayload = typeof DescriptorPayload.Type;
export const ResolveDescriptorOptions = S.Struct({
  pathOverride: S.optional(S.String).pipe(S.mutableKey),
  envOverride: S.String.pipe(S.NullOr, S.optional, S.mutableKey),
  platform: S.optional(S.String).pipe(S.mutableKey),
  homeDirectory: S.optional(S.String).pipe(S.mutableKey),
});
export type ResolveDescriptorOptions = typeof ResolveDescriptorOptions.Type;
export const ReadDescriptorResult = S.Union([
  S.Struct({
    ok: S.Literal(true).pipe(S.mutableKey),
    descriptor: DescriptorPayload.pipe(S.mutableKey),
    path: S.String.pipe(S.mutableKey),
  }),
  S.Struct({
    ok: S.Literal(false).pipe(S.mutableKey),
    envelope: ErrorEnvelope.pipe(S.mutableKey),
    path: S.String.pipe(S.mutableKey),
  }),
]);
export type ReadDescriptorResult = typeof ReadDescriptorResult.Type;
