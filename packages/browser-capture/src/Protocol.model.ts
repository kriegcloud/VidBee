import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";

export const SidecarEventType = LiteralKit(["spawn", "log", "progress", "done", "error"]);
export const SidecarSpawn = S.Struct({
  type: SidecarEventType.pick(["spawn"]).pipe(S.mutableKey),
  pid: S.Finite.pipe(S.mutableKey),
});
export const SidecarLog = S.Struct({
  type: SidecarEventType.pick(["log"]).pipe(S.mutableKey),
  message: S.String.pipe(S.mutableKey),
});
export const SidecarProgress = S.Struct({
  type: SidecarEventType.pick(["progress"]).pipe(S.mutableKey),
  percent: S.Finite.pipe(S.mutableKey),
  currentTime: S.Finite.pipe(S.mutableKey),
  duration: S.Finite.pipe(S.mutableKey),
});
export const SidecarDone = S.Struct({
  type: SidecarEventType.pick(["done"]).pipe(S.mutableKey),
  filePath: S.String.pipe(S.mutableKey),
  size: S.Finite.pipe(S.mutableKey),
  durationMs: S.Finite.pipe(S.NullOr, S.mutableKey),
});
export const SidecarError = S.Struct({
  type: SidecarEventType.pick(["error"]).pipe(S.mutableKey),
  message: S.String.pipe(S.mutableKey),
});
export const SidecarEvent = S.Union([SidecarSpawn, SidecarLog, SidecarProgress, SidecarDone, SidecarError]);
export type SidecarEvent = typeof SidecarEvent.Type;
export const RawSidecarEvent = S.Record(S.String, S.Unknown);
export type RawSidecarEvent = typeof RawSidecarEvent.Type;
// The executor ignores spawn and done.size. Only consumed fields cross the typed boundary.
export const ConsumedDone = S.Struct({
  type: SidecarEventType.pick(["done"]),
  filePath: S.String,
  durationMs: S.Finite.pipe(S.NullOr, S.optional),
});
export const ConsumedSidecarEvent = S.Union([SidecarLog, SidecarProgress, ConsumedDone, SidecarError]);
export type ConsumedSidecarEvent = typeof ConsumedSidecarEvent.Type;
