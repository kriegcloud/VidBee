import * as A from "effect/Array";
import * as HashSet from "effect/HashSet";
import * as O from "effect/Option";
import * as Str from "effect/String";
import type {
  LegacyDownloadProgress,
  LegacyDownloadStatus,
  LegacySubStatus,
  LegacyTaskProjection,
  MaybeHostFields,
} from "../Projection.model.js";

export type {
  LegacyDownloadProgress,
  LegacyDownloadStatus,
  LegacySubStatus,
  LegacyTaskProjection,
} from "../Projection.model.js";

import { TERMINAL_STATUSES } from "../types.js";
/**
 * Legacy `DownloadTask` projection.
 *
 * Renderer / SDK / web client speak the pre-task-queue vocabulary
 * (`pending / downloading / processing / completed / error / cancelled`).
 * This module is the single place that maps internal `TaskStatus` →
 * legacy `DownloadStatus`, plus the augmented sub-status fields that let
 * UI distinguish `paused` and `retry-scheduled` from a generic `pending`.
 *
 * Reference: NEX-131 issue body §C, design doc §10.A.5.
 *
 * Rules:
 *   - Projection is one-way: hosts MUST NOT use legacy fields to write
 *     status back into a Task.
 *   - Projection has no host-specific knowledge: shared across Desktop,
 *     Web/API and CLI so all three render the same task identically.
 *   - The output shape intentionally avoids importing `@vidbee/downloader-core`
 *     to prevent a workspace cycle. Adapters narrow to their local
 *     `DownloadTask` type by spreading.
 */
import type { Task, TaskProgress, TaskStatus } from "../types.js";

/**
 * Legacy status kept for renderer / web client back-compat.
 */
/**
 * Sub-status for the buckets where multiple internal statuses collapse onto
 * the same legacy status. UIs that opt-in can show a richer label
 * ("Paused" / "Retrying in 23s") instead of a flat "pending".
 */

/**
 * Shape consumed by the renderer/web client. Intentionally a superset of
 * the historical `DownloadTask` shape — adapters spread this onto the
 * local `DownloadTask` and drop fields the local host does not surface.
 */

/**
 * Map an internal `TaskStatus` to the legacy `DownloadStatus`. Pure;
 * shared by Desktop/API/CLI to guarantee identical rendering.
 */
export function legacyDownloadStatusOf(status: TaskStatus): LegacyDownloadStatus {
  switch (status) {
    case "queued":
      return "pending";
    case "running":
      return "downloading";
    case "processing":
      return "processing";
    case "paused":
      return "pending";
    case "retry-scheduled":
      return "pending";
    case "completed":
      return "completed";
    case "failed":
      return "error";
    case "cancelled":
      return "cancelled";
    default:
      return status;
  }
}

/**
 * Map an internal status to its legacy sub-status, if any. Returns undefined
 * for statuses that map 1-to-1 onto a legacy status.
 */
export function legacySubStatusOf(status: TaskStatus): LegacySubStatus | undefined {
  switch (status) {
    case "queued":
      return "queued";
    case "paused":
      return "paused";
    case "retry-scheduled":
      return "retry-scheduled";
    default:
      return undefined;
  }
}

/**
 * Project a Task into the legacy shape. Host adapters call this and then
 * narrow to their concrete `DownloadTask` type.
 *
 * Pure; no I/O, no clock reads.
 */
export function projectTaskToLegacy(task: Readonly<Task>): LegacyTaskProjection {
  const status = legacyDownloadStatusOf(task.status);
  const subStatus = legacySubStatusOf(task.status);
  const opts = (task.input.options ?? {}) as MaybeHostFields;
  const proj: LegacyTaskProjection = {
    id: task.id,
    url: task.input.url,
    title: task.input.title,
    thumbnail: task.input.thumbnail,
    type:
      task.kind === "audio" || (task.kind === "conversion" && task.input.options?.type === "audio") ? "audio" : "video",
    status,
    internalStatus: task.status,
    statusReason: task.statusReason,
    createdAt: task.createdAt,
    description: opts.description,
    channel: opts.channel,
    uploader: opts.uploader,
    viewCount: opts.viewCount,
    tags: opts.tags != null ? [...opts.tags] : undefined,
    duration: opts.duration,
    playlistId: task.input.playlistId,
    playlistTitle: opts.playlistTitle,
    playlistIndex: task.input.playlistIndex,
    playlistSize: opts.playlistSize,
    sourceMediaKind: opts.sourceMediaKind,
    collectionSummary: task.output?.collectionSummary ?? task.progress.collectionSummary,
    mediaKind: opts.mediaKind,
    batchId: opts.batchId,
    batchKind: opts.batchKind,
    batchTitle: opts.batchTitle,
    batchCategory: opts.batchCategory,
    batchOrder: opts.batchOrder,
    batchSourceCount: opts.batchSourceCount,
    batchAssetCount: opts.batchAssetCount,
    fileSize: opts.fileSize,
    startedAt: opts.startedAt,
    completedAt: opts.completedAt ?? (HashSet.has(TERMINAL_STATUSES, task.status) ? task.enteredStatusAt : undefined),
    downloadPath: opts.downloadPath,
    attempt: task.attempt,
    maxAttempts: task.maxAttempts,
  };

  if (task.kind === "social-media" && proj.collectionSummary != null) {
    const { images, videos, manifestPath } = proj.collectionSummary;
    proj.sourceMediaKind =
      images > 0 && videos === 0 ? "image" : videos > 0 && images === 0 ? "video" : opts.sourceMediaKind;
    proj.outputDirectory = dirnameOf(dirnameOf(manifestPath));
    proj.downloadPath = proj.outputDirectory;
  }

  if (subStatus !== undefined) {
    proj.subStatus = subStatus;
  }

  // Progress is meaningful for running/processing AND for paused/retry, where
  // we want the UI to remember "you were 47% in" rather than reset to 0.
  if (task.progress.percent != null || task.progress.bytesDownloaded != null) {
    proj.progress = projectProgress(task.progress);
    if (task.progress.speedBps != null) {
      proj.speed = formatSpeed(task.progress.speedBps);
    }
  }

  if (task.output != null) {
    const out = task.output;
    if (out.cookieSources != null) {
      proj.cookieSources = A.map(out.cookieSources, (source) => ({ ...source }));
    }
    proj.fileSize = out.size;
    // Social runs report the shared collection manifest when no single media
    // file was recorded (runs before per-asset reporting, empty inspections).
    const manifestPath = proj.collectionSummary?.manifestPath;
    const mediaFilePath =
      out.filePath !== "" && !(task.kind === "social-media" && out.filePath === manifestPath)
        ? out.filePath
        : undefined;
    proj.filePath = mediaFilePath;
    proj.savedFileName =
      task.kind === "social-media"
        ? mediaFilePath !== undefined
          ? basenameOf(mediaFilePath)
          : undefined
        : basenameOf(out.filePath);
    proj.downloadPath = out.outputDirectory ?? dirnameOf(out.filePath);
    proj.outputDirectory = out.outputDirectory;
    proj.fileCount = out.fileCount;
    proj.downloadedCount = out.downloadedCount;
    proj.skippedCount = out.skippedCount;
    proj.failedCount = out.failedCount;
    proj.totalSize = out.totalSize;
    if (out.durationMs != null) {
      proj.duration = Math.round(out.durationMs / 1000);
    }
    if (out.formatId != null && out.formatId !== "") {
      proj.resolvedFormatId = out.formatId;
    }
    if (out.subtitleStatus !== undefined) {
      proj.subtitleStatus = out.subtitleStatus;
    }
    if (out.subtitleLanguages != null) {
      proj.subtitleLanguages = [...out.subtitleLanguages];
    }
  }

  if (task.lastError != null) {
    const err = task.lastError;
    proj.errorCategory = err.category;
    proj.uiMessageKey = err.uiMessageKey;
    if (status === "error") {
      proj.error = err.rawMessage;
    }
  }

  if (task.status === "retry-scheduled" && task.nextRetryAt != null) {
    proj.nextRetryAt = task.nextRetryAt;
  }

  return proj;
}

function projectProgress(p: Readonly<TaskProgress>): LegacyDownloadProgress {
  const percent = p.percent == null ? 0 : Math.max(0, Math.min(100, p.percent * 100));
  return {
    percent,
    indeterminate: p.percent == null,
    currentSpeed: p.speedBps == null ? undefined : formatSpeed(p.speedBps),
    eta: p.etaMs == null ? undefined : formatEta(p.etaMs),
    downloaded: p.bytesDownloaded == null ? undefined : formatBytes(p.bytesDownloaded),
    total: p.bytesTotal == null ? undefined : formatBytes(p.bytesTotal),
  };
}

function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n}B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(2)}${units[i]}`;
}

function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

function formatEta(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${Str.padStart(2, "0")(String(m % 60))}:${Str.padStart(2, "0")(String(r))}`;
  }
  return `${m}:${Str.padStart(2, "0")(String(r))}`;
}

function basenameOf(p: string): string {
  const i = Math.max(
    O.getOrElse(Str.lastIndexOf("/")(p), () => -1),
    O.getOrElse(Str.lastIndexOf("\\")(p), () => -1)
  );
  return i >= 0 ? Str.slice(i + 1)(p) : p;
}

function dirnameOf(p: string): string {
  const i = Math.max(
    O.getOrElse(Str.lastIndexOf("/")(p), () => -1),
    O.getOrElse(Str.lastIndexOf("\\")(p), () => -1)
  );
  return i >= 0 ? Str.slice(0, i)(p) : "";
}
