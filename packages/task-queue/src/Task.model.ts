import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";

export const TaskKind = LiteralKit([
  "video",
  "audio",
  "subtitles",
  "playlist",
  "instagram-profile-category",
  "pinterest-gallery",
  "vsco-gallery",
  "facebook-gallery",
  "social-media",
  "tiktok-photo",
  "threads-post",
  "threads-profile",
  "snapchat-media",
  "subscription-item",
  "yt-dlp-forward",
  "transcription",
  "conversion",
  "model-download",
]);
export type TaskKind = typeof TaskKind.Type;

export const TaskStatus = LiteralKit([
  "queued",
  "running",
  "processing",
  "paused",
  "retry-scheduled",
  "completed",
  "failed",
  "cancelled",
]);
export type TaskStatus = typeof TaskStatus.Type;

export const TaskPriority = LiteralKit([0, 10, 20]);
export type TaskPriority = typeof TaskPriority.Type;

export const ErrorCategory = LiteralKit([
  "http-429",
  "auth-required",
  "geo-blocked",
  "not-found",
  "disk-full",
  "permission-denied",
  "binary-missing",
  "ffmpeg",
  "network-transient",
  "stalled",
  "cancelled-by-user",
  "output-missing",
  "unknown",
]);
export type ErrorCategory = typeof ErrorCategory.Type;

export const TaskOrigin = LiteralKit(["manual", "subscription", "agent"]);
export type TaskOrigin = typeof TaskOrigin.Type;
export const CookieSourceType = LiteralKit(["extension", "browser", "file", "config"]);
export type CookieSourceType = typeof CookieSourceType.Type;
export const CollectionReason = LiteralKit(["exhausted", "limit", "incomplete"]);
export type CollectionReason = typeof CollectionReason.Type;
export const StdStream = LiteralKit(["stdout", "stderr"]);
export type StdStream = typeof StdStream.Type;
export const SubtitleVisibility = LiteralKit(["public", "private", "unlisted"]);
export type SubtitleVisibility = typeof SubtitleVisibility.Type;

export const TaskCreationMetadata = S.Struct({
  origin: TaskOrigin.pipe(S.mutableKey),
  agentConversation: S.Struct({
    downloadId: S.mutableKey(S.String),
    threadId: S.mutableKey(S.String),
    promptId: S.mutableKey(S.String),
  }).pipe(S.optional, S.mutableKey),
});
export type TaskCreationMetadata = typeof TaskCreationMetadata.Type;

export const TaskInput = S.Struct({
  url: S.mutableKey(S.String),
  kind: S.mutableKey(TaskKind),
  title: S.optional(S.String).pipe(S.mutableKey),
  thumbnail: S.optional(S.String).pipe(S.mutableKey),
  subscriptionId: S.optional(S.String).pipe(S.mutableKey),
  playlistId: S.optional(S.String).pipe(S.mutableKey),
  playlistIndex: S.optional(S.Finite).pipe(S.mutableKey),
  rawArgs: S.Array(S.String).pipe(S.optional, S.mutableKey),
  options: S.Record(S.String, S.mutableKey(S.Unknown)).pipe(S.optional, S.mutableKey),
});
export type TaskInput = typeof TaskInput.Type;

export const TranscriptResultKind = LiteralKit(["transcript", "no-speech"]);
export type TranscriptResultKind = typeof TranscriptResultKind.Type;

export const TranscriptTaskResult = S.Struct({
  resultKind: S.mutableKey(TranscriptResultKind),
  transcriptId: S.mutableKey(S.String),
});
export type TranscriptTaskResult = typeof TranscriptTaskResult.Type;

export const SubtitleDownloadStatus = LiteralKit(["downloaded", "unavailable", "skipped-auth", "failed"]);
export type SubtitleDownloadStatus = typeof SubtitleDownloadStatus.Type;

export const SocialCollectionSummary = S.Struct({
  posts: S.mutableKey(S.Finite),
  images: S.mutableKey(S.Finite),
  videos: S.mutableKey(S.Finite),
  downloaded: S.mutableKey(S.Finite),
  existing: S.mutableKey(S.Finite),
  failed: S.mutableKey(S.Finite),
  totalSize: S.mutableKey(S.Finite),
  reason: CollectionReason.pipe(S.mutableKey),
  manifestPath: S.mutableKey(S.String),
  startedAt: S.mutableKey(S.Finite),
  finishedAt: S.optional(S.Finite).pipe(S.mutableKey),
});
export type SocialCollectionSummary = typeof SocialCollectionSummary.Type;

export const DownloadCookieSource = S.Struct({
  type: CookieSourceType.pipe(S.mutableKey),
  browser: S.optional(S.String).pipe(S.mutableKey),
});
export type DownloadCookieSource = typeof DownloadCookieSource.Type;

export const TaskOutput = S.Struct({
  collectionSummary: S.optional(SocialCollectionSummary).pipe(S.mutableKey),
  cookieSources: S.Array(DownloadCookieSource).pipe(S.mutable, S.optional, S.mutableKey),
  subtitleAcquisition: S.Struct({
    id: S.mutableKey(S.String),
    acquiredAt: S.mutableKey(S.Finite),
    credentialsUsed: S.Boolean.pipe(S.optional, S.mutableKey),
    visibility: SubtitleVisibility.pipe(S.optional, S.mutableKey),
  }).pipe(S.optional, S.mutableKey),
  filePath: S.mutableKey(S.String),
  size: S.mutableKey(S.Finite),
  durationMs: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  sha256: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  formatId: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  outputDirectory: S.optional(S.String).pipe(S.mutableKey),
  fileCount: S.optional(S.Finite).pipe(S.mutableKey),
  downloadedCount: S.optional(S.Finite).pipe(S.mutableKey),
  skippedCount: S.optional(S.Finite).pipe(S.mutableKey),
  failedCount: S.optional(S.Finite).pipe(S.mutableKey),
  totalSize: S.optional(S.Finite).pipe(S.mutableKey),
  subtitleStatus: S.optional(SubtitleDownloadStatus).pipe(S.mutableKey),
  subtitleLanguages: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  transcript: S.optional(TranscriptTaskResult).pipe(S.mutableKey),
});
export type TaskOutput = typeof TaskOutput.Type;

export const TaskProgress = S.Struct({
  collectionSummary: S.optional(SocialCollectionSummary).pipe(S.mutableKey),
  percent: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  bytesDownloaded: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  bytesTotal: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  speedBps: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  etaMs: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  ticks: S.mutableKey(S.Finite),
});
export type TaskProgress = typeof TaskProgress.Type;

export const ClassifiedError = S.Struct({
  category: S.mutableKey(ErrorCategory),
  exitCode: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  rawMessage: S.mutableKey(S.String),
  uiMessageKey: S.mutableKey(S.String),
  uiActionHints: S.Array(S.String).pipe(S.mutableKey),
  retryable: S.mutableKey(S.Boolean),
  suggestedRetryAfterMs: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
});
export type ClassifiedError = typeof ClassifiedError.Type;

export const Task = S.Struct({
  id: S.mutableKey(S.String),
  kind: S.mutableKey(TaskKind),
  parentId: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  input: S.mutableKey(TaskInput),
  priority: S.mutableKey(TaskPriority),
  groupKey: S.mutableKey(S.String),
  status: S.mutableKey(TaskStatus),
  prevStatus: S.Union([TaskStatus, S.Null]).pipe(S.mutableKey),
  statusReason: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  enteredStatusAt: S.mutableKey(S.Finite),
  attempt: S.mutableKey(S.Finite),
  maxAttempts: S.mutableKey(S.Finite),
  nextRetryAt: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  progress: S.mutableKey(TaskProgress),
  output: S.Union([TaskOutput, S.Null]).pipe(S.mutableKey),
  lastError: S.Union([ClassifiedError, S.Null]).pipe(S.mutableKey),
  pid: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  pidStartedAt: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  createdAt: S.mutableKey(S.Finite),
  updatedAt: S.mutableKey(S.Finite),
});
export type Task = typeof Task.Type;

export const AttemptRow = S.Struct({
  id: S.mutableKey(S.String),
  taskId: S.mutableKey(S.String),
  attemptNumber: S.mutableKey(S.Finite),
  startedAt: S.mutableKey(S.Finite),
  endedAt: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  exitCode: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  errorCategory: S.Union([ErrorCategory, S.Null]).pipe(S.mutableKey),
  stdoutTail: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  stderrTail: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  rawArgsHash: S.mutableKey(S.String),
});
export type AttemptRow = typeof AttemptRow.Type;

export const ProcessJournalOp = LiteralKit(["spawn", "close", "killed", "panic"]);
export type ProcessJournalOp = typeof ProcessJournalOp.Type;

export const ProcessJournalRow = S.Struct({
  seq: S.mutableKey(S.Finite),
  ts: S.mutableKey(S.Finite),
  op: S.mutableKey(ProcessJournalOp),
  taskId: S.mutableKey(S.String),
  attemptId: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  pid: S.mutableKey(S.Finite),
  pidStartedAt: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  exitCode: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  signal: S.Union([S.String, S.Null]).pipe(S.mutableKey),
});
export type ProcessJournalRow = typeof ProcessJournalRow.Type;

export const ProcessKind = LiteralKit(["yt-dlp", "gallery-dl", "ffmpeg", "ffprobe", "ai-worker"]);
export type ProcessKind = typeof ProcessKind.Type;

export const TaskReadonly = S.Struct({
  id: S.readonlyKey(Task.fields.id),
  kind: S.readonlyKey(Task.fields.kind),
  parentId: S.readonlyKey(Task.fields.parentId),
  input: S.readonlyKey(Task.fields.input),
  priority: S.readonlyKey(Task.fields.priority),
  groupKey: S.readonlyKey(Task.fields.groupKey),
  status: S.readonlyKey(Task.fields.status),
  prevStatus: S.readonlyKey(Task.fields.prevStatus),
  statusReason: S.readonlyKey(Task.fields.statusReason),
  enteredStatusAt: S.readonlyKey(Task.fields.enteredStatusAt),
  attempt: S.readonlyKey(Task.fields.attempt),
  maxAttempts: S.readonlyKey(Task.fields.maxAttempts),
  nextRetryAt: S.readonlyKey(Task.fields.nextRetryAt),
  progress: S.readonlyKey(Task.fields.progress),
  output: S.readonlyKey(Task.fields.output),
  lastError: S.readonlyKey(Task.fields.lastError),
  pid: S.readonlyKey(Task.fields.pid),
  pidStartedAt: S.readonlyKey(Task.fields.pidStartedAt),
  createdAt: S.readonlyKey(Task.fields.createdAt),
  updatedAt: S.readonlyKey(Task.fields.updatedAt),
});
export const TaskProgressReadonly = S.Struct({
  collectionSummary: S.readonlyKey(TaskProgress.fields.collectionSummary),
  percent: S.readonlyKey(TaskProgress.fields.percent),
  bytesDownloaded: S.readonlyKey(TaskProgress.fields.bytesDownloaded),
  bytesTotal: S.readonlyKey(TaskProgress.fields.bytesTotal),
  speedBps: S.readonlyKey(TaskProgress.fields.speedBps),
  etaMs: S.readonlyKey(TaskProgress.fields.etaMs),
  ticks: S.readonlyKey(TaskProgress.fields.ticks),
});

export const TaskSnapshot = S.Struct({
  task: TaskReadonly,
});
export type TaskSnapshot = typeof TaskSnapshot.Type;

export const TaskQueueStats = S.Struct({
  total: S.mutableKey(S.Finite),
  byStatus: S.Record(TaskStatus, S.mutableKey(S.Finite)).pipe(S.mutableKey),
  running: S.mutableKey(S.Finite),
  queued: S.mutableKey(S.Finite),
  capacity: S.mutableKey(S.Finite),
  perGroup: S.Record(S.String, S.mutableKey(S.Finite)).pipe(S.mutableKey),
});
export type TaskQueueStats = typeof TaskQueueStats.Type;
