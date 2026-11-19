import * as S from "effect/Schema";
import { LeaderKind, LeaderState } from "./Subscription.model.js";
export const AcquireResult = S.Struct({
  acquired: S.Boolean.pipe(S.mutableKey),
  state: LeaderState.pipe(S.mutableKey),
});
export type AcquireResult = typeof AcquireResult.Type;
export const LeaderOptions = S.Struct({
  kind: LeaderKind,
  pid: S.Finite,
  heartbeatIntervalMs: S.Finite.pipe(S.optional),
  lockTtlMs: S.Finite.pipe(S.optional),
});
export type LeaderOptions = typeof LeaderOptions.Type;
