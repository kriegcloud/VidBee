import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
import { DownloadRuntimeSettings, DownloadTask } from "./Download.model.js";

export const DownloaderOptions = S.Struct({
  downloadDir: S.String.pipe(S.optional, S.mutableKey),
  maxConcurrent: S.Finite.pipe(S.optional, S.mutableKey),
  runtimeSettings: DownloadRuntimeSettings.pipe(S.optional, S.mutableKey),
});
export type DownloaderOptions = typeof DownloaderOptions.Type;
export const DownloaderInitialization = S.Struct({ binary: S.String, ffmpeg: S.UndefinedOr(S.String) });
export type DownloaderInitialization = typeof DownloaderInitialization.Type;
export const DownloaderStatus = S.Struct({ active: S.Finite.pipe(S.mutableKey), pending: S.Finite.pipe(S.mutableKey) });
export type DownloaderStatus = typeof DownloaderStatus.Type;
export const DownloaderEvent = S.Union([
  S.Struct({ type: LiteralKit(["task-updated"]), value: DownloadTask }),
  S.Struct({ type: LiteralKit(["history-updated", "queue-updated"]), value: S.Array(DownloadTask).pipe(S.mutable) }),
]);
export type DownloaderEvent = typeof DownloaderEvent.Type;
