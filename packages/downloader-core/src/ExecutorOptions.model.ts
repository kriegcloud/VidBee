import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
import { DownloadRuntimeSettings } from "./Download.model.js";
import { OneClickContainerOption } from "./format-preferences.js";
export const YtDlpTaskOptions = S.Struct({
  type: LiteralKit(["video", "audio"]).pipe(S.optional, S.mutableKey),
  format: S.String.pipe(S.optional, S.mutableKey),
  audioFormat: S.String.pipe(S.optional, S.mutableKey),
  audioFormatIds: S.Array(S.String).pipe(S.optional, S.mutableKey),
  startTime: S.String.pipe(S.optional, S.mutableKey),
  endTime: S.String.pipe(S.optional, S.mutableKey),
  customDownloadPath: S.String.pipe(S.optional, S.mutableKey),
  customFilenameTemplate: S.String.pipe(S.optional, S.mutableKey),
  containerFormat: OneClickContainerOption.pipe(S.optional, S.mutableKey),
  settings: DownloadRuntimeSettings.pipe(S.optional, S.mutableKey),
  title: S.String.pipe(S.optional, S.mutableKey),
  thumbnail: S.String.pipe(S.optional, S.mutableKey),
  description: S.String.pipe(S.optional, S.mutableKey),
  channel: S.String.pipe(S.optional, S.mutableKey),
  uploader: S.String.pipe(S.optional, S.mutableKey),
  duration: S.Finite.pipe(S.optional, S.mutableKey),
  viewCount: S.Finite.pipe(S.optional, S.mutableKey),
  tags: S.Array(S.String).pipe(S.optional, S.mutableKey),
  playlistTitle: S.String.pipe(S.optional, S.mutableKey),
  playlistSize: S.Finite.pipe(S.optional, S.mutableKey),
  mediaKind: LiteralKit(["photo", "video", "recording"]).pipe(S.optional, S.mutableKey),
  batchId: S.String.pipe(S.optional, S.mutableKey),
  batchKind: S.Literal("instagram-profile").pipe(S.optional, S.mutableKey),
  batchTitle: S.String.pipe(S.optional, S.mutableKey),
  batchCategory: S.String.pipe(S.optional, S.mutableKey),
  batchOrder: S.Finite.pipe(S.optional, S.mutableKey),
  batchSourceCount: S.Finite.pipe(S.optional, S.mutableKey),
  batchAssetCount: S.Finite.pipe(S.optional, S.mutableKey),
  galleryDlDirectoryTemplate: S.String.pipe(S.optional, S.mutableKey),
  galleryDlFilenameTemplate: S.String.pipe(S.optional, S.mutableKey),
  expectedAssetCount: S.Finite.pipe(S.optional, S.mutableKey),
  fileSize: S.Finite.pipe(S.optional, S.mutableKey),
  startedAt: S.Finite.pipe(S.optional, S.mutableKey),
  completedAt: S.Finite.pipe(S.optional, S.mutableKey),
  downloadPath: S.String.pipe(S.optional, S.mutableKey),
});
export type YtDlpTaskOptions = typeof YtDlpTaskOptions.Type;
export const GalleryDlTaskOptions = S.Struct({
  ...YtDlpTaskOptions.fields,
  galleryDlBaseDirectory: S.String.pipe(S.optional, S.mutableKey),
  galleryDlDirectorySegments: S.Array(S.String).pipe(S.optional, S.mutableKey),
  galleryDlDirectoryTemplate: S.String.pipe(S.optional, S.mutableKey),
  galleryDlFilenameTemplate: S.String.pipe(S.optional, S.mutableKey),
  galleryDlFilter: S.String.pipe(S.optional, S.mutableKey),
  expectedAssetCount: S.Finite.pipe(S.optional, S.mutableKey),
});
export type GalleryDlTaskOptions = typeof GalleryDlTaskOptions.Type;
