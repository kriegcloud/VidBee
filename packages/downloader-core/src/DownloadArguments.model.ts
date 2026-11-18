import * as S from "effect/Schema";
import { DownloadType } from "./Download.model.js";
import { FilenameStyle } from "./filename-style.js";
import { OneClickContainerOption } from "./format-preferences.js";
export const YtDlpDownloadSettings = S.Struct({
  browserForCookies: S.String.pipe(S.optional, S.mutableKey),
  configPath: S.String.pipe(S.optional, S.mutableKey),
  cookiesPath: S.String.pipe(S.optional, S.mutableKey),
  downloadPath: S.String.pipe(S.optional, S.mutableKey),
  downloadSubtitles: S.Boolean.pipe(S.optional, S.mutableKey),
  embedChapters: S.Boolean.pipe(S.optional, S.mutableKey),
  embedMetadata: S.Boolean.pipe(S.optional, S.mutableKey),
  embedSubs: S.Boolean.pipe(S.optional, S.mutableKey),
  embedThumbnail: S.Boolean.pipe(S.optional, S.mutableKey),
  filenameStyle: FilenameStyle.pipe(S.optional, S.mutableKey),
  filenameViaVidBee: S.Boolean.pipe(S.optional, S.mutableKey),
  interfaceLanguage: S.String.pipe(S.optional, S.mutableKey),
  proxy: S.String.pipe(S.optional, S.mutableKey),
  shareWatermark: S.Boolean.pipe(S.optional, S.mutableKey),
  subtitleLanguages: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  writeAutoSubs: S.Boolean.pipe(S.optional, S.mutableKey),
});
export type YtDlpDownloadSettings = typeof YtDlpDownloadSettings.Type;

export const YtDlpDownloadOptions = S.Struct({
  audioFormat: S.String.pipe(S.optional, S.mutableKey),
  audioFormatIds: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  containerFormat: OneClickContainerOption.pipe(S.optional, S.mutableKey),
  customDownloadPath: S.String.pipe(S.optional, S.mutableKey),
  customFilenameTemplate: S.String.pipe(S.optional, S.mutableKey),
  endTime: S.String.pipe(S.optional, S.mutableKey),
  format: S.String.pipe(S.optional, S.mutableKey),
  startTime: S.String.pipe(S.optional, S.mutableKey),
  type: DownloadType.pipe(S.mutableKey),
  url: S.String.pipe(S.mutableKey),
});
export type YtDlpDownloadOptions = typeof YtDlpDownloadOptions.Type;
