import { dual } from "effect/Function";
import * as HashSet from "effect/HashSet";
import type { TaskKind, TaskPriority, TaskProgress, TaskStatus } from "./Task.model.js";

export * from "./Task.model.js";
/** Media download kinds that may receive a transcription child task. */
export const TRANSCRIBABLE_TASK_KINDS: HashSet.HashSet<TaskKind> = HashSet.fromIterable<TaskKind>([
  "video",
  "audio",
  "subscription-item",
]);

export const TRANSCRIPTION_GROUP_KEY = "transcription";

/** Identify tasks handled by downloader-specific services. */
export const isDownloadTaskKind = (kind: TaskKind): boolean =>
  kind !== "transcription" && kind !== "conversion" && kind !== "model-download";

/**
 * Return whether a new ASR task may start.
 * Transcription waits while active downloads fill the download cap, then starts when a slot frees.
 *
 * @param activeDownloads Download tasks currently occupying a scheduler slot.
 * @param maxConcurrentDownloads Configured download cap.
 */
export const canAdmitTranscription: {
  (activeDownloads: number, maxConcurrentDownloads: number): boolean;
  (maxConcurrentDownloads: number): (activeDownloads: number) => boolean;
} = dual(
  2,
  (activeDownloads: number, maxConcurrentDownloads: number): boolean => activeDownloads < maxConcurrentDownloads
);

/** Media-producing tasks share file, playback and history surfaces. */
export const isMediaTaskKind = (kind: TaskKind): boolean =>
  (isDownloadTaskKind(kind) && kind !== "subtitles") || kind === "conversion";

/** Library entries include subtitle sources that have no playable audio or video. */
export const isLibraryTaskKind = (kind: TaskKind): boolean => isMediaTaskKind(kind) || kind === "subtitles";

export const TERMINAL_STATUSES = HashSet.fromIterable<TaskStatus>(["completed", "failed", "cancelled"]);
export const PRIORITY_USER: TaskPriority = 0;
export const PRIORITY_SUBSCRIPTION: TaskPriority = 10;
export const PRIORITY_BACKGROUND: TaskPriority = 20;
export const EMPTY_PROGRESS: TaskProgress = {
  percent: null,
  bytesDownloaded: null,
  bytesTotal: null,
  speedBps: null,
  etaMs: null,
  ticks: 0,
};
