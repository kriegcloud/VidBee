import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
import type * as Effect from "effect/Effect";
import type { EffectContractClient } from "./Cli.model.js";
import type { ErrorEnvelope } from "./Envelope.model.js";
export const LocalClientOptions = S.Struct({
  defaultDownloadDir: S.optional(S.String),
  persist: S.optional(LiteralKit(["memory", "sqlite"])),
  sqlitePath: S.optional(S.String),
  ytDlpPath: S.optional(S.String),
  ffmpegLocation: S.optional(S.String),
  maxConcurrency: S.optional(S.Finite),
});
export type LocalClientOptions = typeof LocalClientOptions.Type;
export interface LocalSession extends EffectContractClient {
  readonly shutdown: Effect.Effect<void>;
}
export type ConnectResult =
  | { readonly kind: "connected"; readonly client: EffectContractClient; readonly shutdown: Effect.Effect<void> }
  | { readonly kind: "error"; readonly envelope: ErrorEnvelope };
export const AutostartResult = S.Union([
  S.Struct({ kind: LiteralKit(["ready", "autostart-disabled"]) }),
  S.Struct({ kind: S.Literal("unsupported-platform"), platform: S.String }),
  S.Struct({ kind: S.Literal("timeout"), waitedMs: S.Finite }),
  S.Struct({ kind: S.Literal("launch-failed"), reason: S.String }),
]);
export type AutostartResult = typeof AutostartResult.Type;
export const AutostartOptions = S.Struct({
  timeoutMs: S.optional(S.Finite),
  pollIntervalMs: S.optional(S.Finite),
  platform: S.optional(S.String),
});
export type AutostartOptions = typeof AutostartOptions.Type;
export const LauncherSpec = S.Struct({ command: S.String, argv: S.Array(S.String) });
export type LauncherSpec = typeof LauncherSpec.Type;
