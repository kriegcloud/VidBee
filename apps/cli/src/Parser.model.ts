import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";

export const Target = LiteralKit(["desktop", "api", "local"]);
export const Priority = LiteralKit(["user", "subscription", "background"]);
export const VidbeeFlags = S.Struct({
  api: S.optional(S.String).pipe(S.mutableKey),
  local: S.Boolean.pipe(S.mutableKey),
  target: S.optional(Target).pipe(S.mutableKey),
  json: S.Boolean.pipe(S.mutableKey),
  pretty: S.Boolean.pipe(S.mutableKey),
  wait: S.Boolean.pipe(S.mutableKey),
  detach: S.Boolean.pipe(S.mutableKey),
  priority: S.optional(Priority).pipe(S.mutableKey),
  maxAttempts: S.optional(S.Finite).pipe(S.mutableKey),
  noRetry: S.Boolean.pipe(S.mutableKey),
  groupKey: S.optional(S.String).pipe(S.mutableKey),
  timeoutMs: S.optional(S.Finite).pipe(S.mutableKey),
  noAutostart: S.Boolean.pipe(S.mutableKey),
  token: S.optional(S.String).pipe(S.mutableKey),
});
export type VidbeeFlags = typeof VidbeeFlags.Type;
export type Flags = VidbeeFlags;
export const ParsedArgv = S.Union([
  S.Struct({
    kind: S.Literal("subcommand").pipe(S.mutableKey),
    flags: VidbeeFlags.pipe(S.mutableKey),
    subcommand: S.String.pipe(S.mutableKey),
    subArgs: S.Array(S.String).pipe(S.mutableKey),
  }),
  S.Struct({
    kind: S.Literal("ytdlp").pipe(S.mutableKey),
    flags: VidbeeFlags.pipe(S.mutableKey),
    mode: LiteralKit(["probe", "download"]).pipe(S.mutableKey),
    ytArgs: S.Array(S.String).pipe(S.mutableKey),
    probeFlag: S.NullOr(S.String).pipe(S.mutableKey),
  }),
]);
export type ParsedArgv = typeof ParsedArgv.Type;
export const ListStatus = LiteralKit([
  "queued",
  "running",
  "processing",
  "paused",
  "retry-scheduled",
  "completed",
  "failed",
  "cancelled",
]);
export const ListInput = S.Struct({
  status: S.optional(ListStatus).pipe(S.mutableKey),
  groupKey: S.optional(S.String).pipe(S.mutableKey),
  parentId: S.optional(S.String).pipe(S.mutableKey),
  limit: S.optional(S.Finite).pipe(S.mutableKey),
  cursor: S.String.pipe(S.NullOr, S.optional, S.mutableKey),
});
export type ListInput = typeof ListInput.Type;
