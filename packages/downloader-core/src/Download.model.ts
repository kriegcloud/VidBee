import { PlaylistMediaKind, VideoFormat } from "./MediaInfo.model.js";
import { InstagramProfileCategory } from "./Profile.model.js";

export { PlaylistEntry, PlaylistInfo, PlaylistMediaKind, VideoFormat, VideoInfo } from "./MediaInfo.model.js";
export {
  InstagramCategoryState,
  InstagramCategorySummary,
  InstagramInspectionErrorCode,
  InstagramProfileCategory,
  InstagramProfileInspection,
  InstagramProfileItem,
} from "./Profile.model.js";

import { LiteralKit } from "@vidbee/schema/LiteralKit";
import { DownloadCookieSource, SocialCollectionSummary } from "@vidbee/task-queue/Task.model";
import * as S from "effect/Schema";
import { FilenameStyle } from "./filename-style.js";
import { OneClickContainerOption } from "./format-preferences.js";
import { SocialMediaOptionsSchema } from "./social-media.js";

const SocialMediaOptions = SocialMediaOptionsSchema;
export const DownloadType = LiteralKit(["video", "audio"]);
export type DownloadType = typeof DownloadType.Type;

export const DownloadStatus = LiteralKit(["pending", "downloading", "processing", "completed", "error", "cancelled"]);
export type DownloadStatus = typeof DownloadStatus.Type;

export const DownloadProgress = S.Struct({
  indeterminate: S.Boolean.pipe(S.optional, S.mutableKey),
  percent: S.Finite.pipe(S.mutableKey),
  currentSpeed: S.String.pipe(S.optional, S.mutableKey),
  eta: S.String.pipe(S.optional, S.mutableKey),
  downloaded: S.String.pipe(S.optional, S.mutableKey),
  total: S.String.pipe(S.optional, S.mutableKey),
});
export type DownloadProgress = typeof DownloadProgress.Type;

export const TaskQueueInternalStatus = LiteralKit([
  "queued",
  "running",
  "processing",
  "paused",
  "retry-scheduled",
  "completed",
  "failed",
  "cancelled",
]);
export type TaskQueueInternalStatus = typeof TaskQueueInternalStatus.Type;

export const TaskQueueSubStatus = LiteralKit(["queued", "paused", "retry-scheduled"]);
export type TaskQueueSubStatus = typeof TaskQueueSubStatus.Type;

export const TaskQueueErrorCategory = LiteralKit([
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
export type TaskQueueErrorCategory = typeof TaskQueueErrorCategory.Type;

export const DownloadTask = S.Struct({
  sourceMediaKind: LiteralKit(["image", "video", "mixed"]).pipe(S.optional, S.mutableKey),
  socialMedia: SocialMediaOptions.pipe(S.optional, S.mutableKey),
  collectionSummary: SocialCollectionSummary.pipe(S.optional, S.mutableKey),
  id: S.String.pipe(S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.optional, S.mutableKey),
  thumbnail: S.String.pipe(S.optional, S.mutableKey),
  type: DownloadType.pipe(S.mutableKey),
  status: DownloadStatus.pipe(S.mutableKey),
  createdAt: S.Finite.pipe(S.mutableKey),
  startedAt: S.Finite.pipe(S.optional, S.mutableKey),
  completedAt: S.Finite.pipe(S.optional, S.mutableKey),
  duration: S.Finite.pipe(S.optional, S.mutableKey),
  fileSize: S.Finite.pipe(S.optional, S.mutableKey),
  speed: S.String.pipe(S.optional, S.mutableKey),
  ytDlpCommand: S.String.pipe(S.optional, S.mutableKey),
  ytDlpLog: S.String.pipe(S.optional, S.mutableKey),
  cookieSources: S.Array(DownloadCookieSource).pipe(S.mutable, S.optional, S.mutableKey),
  downloadPath: S.String.pipe(S.optional, S.mutableKey),
  savedFileName: S.String.pipe(S.optional, S.mutableKey),
  description: S.String.pipe(S.optional, S.mutableKey),
  channel: S.String.pipe(S.optional, S.mutableKey),
  uploader: S.String.pipe(S.optional, S.mutableKey),
  viewCount: S.Finite.pipe(S.optional, S.mutableKey),
  tags: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  selectedFormat: VideoFormat.pipe(S.optional, S.mutableKey),
  playlistId: S.String.pipe(S.optional, S.mutableKey),
  playlistTitle: S.String.pipe(S.optional, S.mutableKey),
  playlistIndex: S.Finite.pipe(S.optional, S.mutableKey),
  playlistSize: S.Finite.pipe(S.optional, S.mutableKey),
  mediaKind: PlaylistMediaKind.pipe(S.optional, S.mutableKey),
  batchId: S.String.pipe(S.optional, S.mutableKey),
  batchKind: LiteralKit(["instagram-profile", "social-media"]).pipe(S.optional, S.mutableKey),
  batchTitle: S.String.pipe(S.optional, S.mutableKey),
  batchCategory: S.String.pipe(S.optional, S.mutableKey),
  batchOrder: S.Finite.pipe(S.optional, S.mutableKey),
  batchSourceCount: S.Finite.pipe(S.optional, S.mutableKey),
  batchAssetCount: S.Finite.pipe(S.optional, S.mutableKey),
  outputDirectory: S.String.pipe(S.optional, S.mutableKey),
  fileCount: S.Finite.pipe(S.optional, S.mutableKey),
  downloadedCount: S.Finite.pipe(S.optional, S.mutableKey),
  skippedCount: S.Finite.pipe(S.optional, S.mutableKey),
  failedCount: S.Finite.pipe(S.optional, S.mutableKey),
  totalSize: S.Finite.pipe(S.optional, S.mutableKey),
  progress: DownloadProgress.pipe(S.optional, S.mutableKey),
  error: S.String.pipe(S.optional, S.mutableKey),
  internalStatus: TaskQueueInternalStatus.pipe(S.optional, S.mutableKey),
  subStatus: TaskQueueSubStatus.pipe(S.optional, S.mutableKey),
  statusReason: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  errorCategory: TaskQueueErrorCategory.pipe(S.optional, S.mutableKey),
  uiMessageKey: S.String.pipe(S.optional, S.mutableKey),
  nextRetryAt: S.Finite.pipe(S.optional, S.mutableKey),
  attempt: S.Finite.pipe(S.optional, S.mutableKey),
  maxAttempts: S.Finite.pipe(S.optional, S.mutableKey),
});
export type DownloadTask = typeof DownloadTask.Type;

export const DownloadRuntimeSettings = S.Struct({
  downloadPath: S.String.pipe(S.optional, S.mutableKey),
  browserForCookies: S.String.pipe(S.optional, S.mutableKey),
  cookiesPath: S.String.pipe(S.optional, S.mutableKey),
  cookieSource: DownloadCookieSource.pipe(S.optional, S.mutableKey),
  proxy: S.String.pipe(S.optional, S.mutableKey),
  configPath: S.String.pipe(S.optional, S.mutableKey),
  downloadSubtitles: S.Boolean.pipe(S.optional, S.mutableKey),
  subtitleLanguages: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  interfaceLanguage: S.String.pipe(S.optional, S.mutableKey),
  embedSubs: S.Boolean.pipe(S.optional, S.mutableKey),
  writeAutoSubs: S.Boolean.pipe(S.optional, S.mutableKey),
  embedThumbnail: S.Boolean.pipe(S.optional, S.mutableKey),
  embedMetadata: S.Boolean.pipe(S.optional, S.mutableKey),
  embedChapters: S.Boolean.pipe(S.optional, S.mutableKey),
  filenameStyle: FilenameStyle.pipe(S.optional, S.mutableKey),
  filenameViaVidBee: S.Boolean.pipe(S.optional, S.mutableKey),
  shareWatermark: S.Boolean.pipe(S.optional, S.mutableKey),
  downloadWithoutChannelSubfolders: S.Boolean.pipe(S.optional, S.mutableKey),
  downloadMirror: LiteralKit(["auto", "cn", "global"]).pipe(S.optional, S.mutableKey),
});
export type DownloadRuntimeSettings = typeof DownloadRuntimeSettings.Type;

export const VideoInfoInput = S.Struct({
  url: S.String.pipe(S.mutableKey),
  settings: DownloadRuntimeSettings.pipe(S.optional, S.mutableKey),
});
export type VideoInfoInput = typeof VideoInfoInput.Type;

export const PlaylistInfoInput = S.Struct({
  url: S.String.pipe(S.mutableKey),
  settings: DownloadRuntimeSettings.pipe(S.optional, S.mutableKey),
});
export type PlaylistInfoInput = typeof PlaylistInfoInput.Type;

export const CreateDownloadInput = S.Struct({
  socialMedia: SocialMediaOptions.pipe(S.optional, S.mutableKey),
  singleVideo: S.Boolean.pipe(S.optional, S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  type: DownloadType.pipe(S.mutableKey),
  title: S.String.pipe(S.optional, S.mutableKey),
  thumbnail: S.String.pipe(S.optional, S.mutableKey),
  duration: S.Finite.pipe(S.optional, S.mutableKey),
  description: S.String.pipe(S.optional, S.mutableKey),
  channel: S.String.pipe(S.optional, S.mutableKey),
  uploader: S.String.pipe(S.optional, S.mutableKey),
  viewCount: S.Finite.pipe(S.optional, S.mutableKey),
  tags: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  selectedFormat: VideoFormat.pipe(S.optional, S.mutableKey),
  playlistId: S.String.pipe(S.optional, S.mutableKey),
  playlistTitle: S.String.pipe(S.optional, S.mutableKey),
  playlistIndex: S.Finite.pipe(S.optional, S.mutableKey),
  playlistSize: S.Finite.pipe(S.optional, S.mutableKey),
  format: S.String.pipe(S.optional, S.mutableKey),
  audioFormat: S.String.pipe(S.optional, S.mutableKey),
  audioFormatIds: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  startTime: S.String.pipe(S.optional, S.mutableKey),
  endTime: S.String.pipe(S.optional, S.mutableKey),
  customDownloadPath: S.String.pipe(S.optional, S.mutableKey),
  customFilenameTemplate: S.String.pipe(S.optional, S.mutableKey),
  containerFormat: OneClickContainerOption.pipe(S.optional, S.mutableKey),
  settings: DownloadRuntimeSettings.pipe(S.optional, S.mutableKey),
});
export type CreateDownloadInput = typeof CreateDownloadInput.Type;

export const PlaylistDownloadInput = S.Struct({
  url: S.String.pipe(S.mutableKey),
  type: DownloadType.pipe(S.mutableKey),
  format: S.String.pipe(S.optional, S.mutableKey),
  audioFormat: S.String.pipe(S.optional, S.mutableKey),
  audioFormatIds: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  customDownloadPath: S.String.pipe(S.optional, S.mutableKey),
  customFilenameTemplate: S.String.pipe(S.optional, S.mutableKey),
  entryIds: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  startIndex: S.Finite.pipe(S.optional, S.mutableKey),
  endIndex: S.Finite.pipe(S.optional, S.mutableKey),
  containerFormat: OneClickContainerOption.pipe(S.optional, S.mutableKey),
  settings: DownloadRuntimeSettings.pipe(S.optional, S.mutableKey),
});
export type PlaylistDownloadInput = typeof PlaylistDownloadInput.Type;

export const PlaylistDownloadEntry = S.Struct({
  downloadId: S.String.pipe(S.mutableKey),
  entryId: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  index: S.Finite.pipe(S.mutableKey),
});
export type PlaylistDownloadEntry = typeof PlaylistDownloadEntry.Type;

export const PlaylistDownloadResult = S.Struct({
  groupId: S.String.pipe(S.mutableKey),
  playlistId: S.String.pipe(S.mutableKey),
  playlistTitle: S.String.pipe(S.mutableKey),
  type: DownloadType.pipe(S.mutableKey),
  totalCount: S.Finite.pipe(S.mutableKey),
  startIndex: S.Finite.pipe(S.mutableKey),
  endIndex: S.Finite.pipe(S.mutableKey),
  entries: S.Array(PlaylistDownloadEntry).pipe(S.mutable, S.mutableKey),
});
export type PlaylistDownloadResult = typeof PlaylistDownloadResult.Type;

export const InstagramProfileInspectInput = S.Struct({
  url: S.String.pipe(S.mutableKey),
  categories: S.Array(InstagramProfileCategory).pipe(S.mutable, S.optional, S.mutableKey),
  settings: DownloadRuntimeSettings.pipe(S.optional, S.mutableKey),
});
export type InstagramProfileInspectInput = typeof InstagramProfileInspectInput.Type;

export const InstagramProfileDownloadInput = S.Struct({
  inspectionId: S.String.pipe(S.mutableKey),
  itemIds: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  categories: S.Array(InstagramProfileCategory).pipe(S.mutable, S.mutableKey),
  customDownloadPath: S.String.pipe(S.optional, S.mutableKey),
  settings: DownloadRuntimeSettings.pipe(S.optional, S.mutableKey),
});
export type InstagramProfileDownloadInput = typeof InstagramProfileDownloadInput.Type;

export const InstagramProfileDownloadTask = S.Struct({
  downloadId: S.String.pipe(S.mutableKey),
  category: InstagramProfileCategory.pipe(S.mutableKey),
  sourceCount: S.Finite.pipe(S.mutableKey),
  assetCount: S.Finite.pipe(S.mutableKey),
});
export type InstagramProfileDownloadTask = typeof InstagramProfileDownloadTask.Type;

export const InstagramProfileDownloadResult = S.Struct({
  groupId: S.String.pipe(S.mutableKey),
  username: S.String.pipe(S.mutableKey),
  totalSourceCount: S.Finite.pipe(S.mutableKey),
  totalAssetCount: S.Finite.pipe(S.mutableKey),
  tasks: S.Array(InstagramProfileDownloadTask).pipe(S.mutable, S.mutableKey),
});
export type InstagramProfileDownloadResult = typeof InstagramProfileDownloadResult.Type;

export const FilePathInput = S.Struct({
  path: S.String.pipe(S.mutableKey),
});
export type FilePathInput = typeof FilePathInput.Type;

export const DirectoryListInput = S.Struct({
  path: S.String.pipe(S.optional, S.mutableKey),
});
export type DirectoryListInput = typeof DirectoryListInput.Type;

export const UploadSettingsFileKind = LiteralKit(["cookies", "config"]);
export type UploadSettingsFileKind = typeof UploadSettingsFileKind.Type;

export const UploadSettingsFileInput = S.Struct({
  kind: UploadSettingsFileKind.pipe(S.mutableKey),
  fileName: S.String.pipe(S.mutableKey),
  content: S.String.pipe(S.mutableKey),
});
export type UploadSettingsFileInput = typeof UploadSettingsFileInput.Type;

export const DirectoryEntry = S.Struct({
  name: S.String.pipe(S.mutableKey),
  path: S.String.pipe(S.mutableKey),
});
export type DirectoryEntry = typeof DirectoryEntry.Type;

export const FileExistsOutput = S.Struct({
  exists: S.Boolean.pipe(S.mutableKey),
});
export type FileExistsOutput = typeof FileExistsOutput.Type;

export const FileOperationOutput = S.Struct({
  success: S.Boolean.pipe(S.mutableKey),
});
export type FileOperationOutput = typeof FileOperationOutput.Type;

export const ListDirectoriesOutput = S.Struct({
  currentPath: S.String.pipe(S.mutableKey),
  parentPath: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  directories: S.Array(DirectoryEntry).pipe(S.mutable, S.mutableKey),
});
export type ListDirectoriesOutput = typeof ListDirectoriesOutput.Type;

export const UploadSettingsFileOutput = S.Struct({
  path: S.String.pipe(S.mutableKey),
});
export type UploadSettingsFileOutput = typeof UploadSettingsFileOutput.Type;
