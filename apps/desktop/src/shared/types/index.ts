import {
  AppSettings as ReexportAppSettings,
  DownloadHistoryItem as ReexportDownloadHistoryItem,
  DownloadItem as ReexportDownloadItem,
  DownloadOptions as ReexportDownloadOptions,
  DownloadProgress as ReexportDownloadProgress,
  DownloadStatus as ReexportDownloadStatus,
  OneClickQualityPreset as ReexportOneClickQualityPreset,
  PlaylistDownloadEntry as ReexportPlaylistDownloadEntry,
  PlaylistDownloadOptions as ReexportPlaylistDownloadOptions,
  PlaylistDownloadResult as ReexportPlaylistDownloadResult,
  PlaylistEntry as ReexportPlaylistEntry,
  PlaylistInfo as ReexportPlaylistInfo,
  SubscriptionCreatePayload as ReexportSubscriptionCreatePayload,
  SubscriptionFeedItem as ReexportSubscriptionFeedItem,
  SubscriptionResolvedFeed as ReexportSubscriptionResolvedFeed,
  SubscriptionRule as ReexportSubscriptionRule,
  SubscriptionUpdatePayload as ReexportSubscriptionUpdatePayload,
  VideoFormat as ReexportVideoFormat,
  VideoInfo as ReexportVideoInfo,
  VideoInfoCommandResult as ReexportVideoInfoCommandResult,
} from "./Desktop.model.js";
import type { AppSettings } from "./Desktop.model.js";

export {
  ReexportAppSettings as AppSettings,
  ReexportDownloadHistoryItem as DownloadHistoryItem,
  ReexportDownloadItem as DownloadItem,
  ReexportDownloadOptions as DownloadOptions,
  ReexportDownloadProgress as DownloadProgress,
  ReexportDownloadStatus as DownloadStatus,
  ReexportOneClickQualityPreset as OneClickQualityPreset,
  ReexportPlaylistDownloadEntry as PlaylistDownloadEntry,
  ReexportPlaylistDownloadOptions as PlaylistDownloadOptions,
  ReexportPlaylistDownloadResult as PlaylistDownloadResult,
  ReexportPlaylistEntry as PlaylistEntry,
  ReexportPlaylistInfo as PlaylistInfo,
  ReexportSubscriptionCreatePayload as SubscriptionCreatePayload,
  ReexportSubscriptionFeedItem as SubscriptionFeedItem,
  ReexportSubscriptionResolvedFeed as SubscriptionResolvedFeed,
  ReexportSubscriptionRule as SubscriptionRule,
  ReexportSubscriptionUpdatePayload as SubscriptionUpdatePayload,
  ReexportVideoFormat as VideoFormat,
  ReexportVideoInfo as VideoInfo,
  ReexportVideoInfoCommandResult as VideoInfoCommandResult,
};

import { DEFAULT_SUBTITLE_LANGUAGES } from "@vidbee/downloader-core/subtitle-languages";
import { defaultLanguageCode } from "@vidbee/i18n/languages";
import { DEFAULT_CLOUD_TRANSCRIPTION_MODEL } from "@vidbee/transcription/cloud";
import { DEFAULT_AGENT_PERMISSION_MODE } from "../agent-permissions";
import { DEFAULT_TTS_MODEL_ID } from "../Tts.model.js";
import type { FilenameStyle as ReexportFilenameStyle } from "@vidbee/downloader-core/filename-style";

export type { ReexportFilenameStyle as FilenameStyle };

import type { OneClickContainerOption as ReexportOneClickContainerOption } from "@vidbee/downloader-core/format-preferences";

export type { ReexportOneClickContainerOption as OneClickContainerOption };

import type { DownloadMirror as ReexportDownloadMirror } from "@vidbee/transcription/Mirror.model";

export type { ReexportDownloadMirror as DownloadMirror };

import type {
  YtDlpKernelPreparationStep as ReexportYtDlpKernelPreparationStep,
  YtDlpKernelState as ReexportYtDlpKernelState,
  YtDlpKernelStatus as ReexportYtDlpKernelStatus,
} from "./ytdlp-kernel";

export type {
  ReexportYtDlpKernelPreparationStep as YtDlpKernelPreparationStep,
  ReexportYtDlpKernelState as YtDlpKernelState,
  ReexportYtDlpKernelStatus as YtDlpKernelStatus,
};

import type {
  SubscriptionPlatform as ReexportSubscriptionPlatform,
  SubscriptionSourceKind as ReexportSubscriptionSourceKind,
  SubscriptionStatus as ReexportSubscriptionStatus,
} from "@vidbee/subscriptions-core/types";

export type {
  ReexportSubscriptionPlatform as SubscriptionPlatform,
  ReexportSubscriptionSourceKind as SubscriptionSourceKind,
  ReexportSubscriptionStatus as SubscriptionStatus,
};
/** SUBSCRIPTION_DUPLICATE_FEED_ERROR shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the SUBSCRIPTION_DUPLICATE_FEED_ERROR contract)
 *
 * ```ts
 * import { SUBSCRIPTION_DUPLICATE_FEED_ERROR } from './index.js'
 * void SUBSCRIPTION_DUPLICATE_FEED_ERROR
 * ```
 *
 */
export const SUBSCRIPTION_DUPLICATE_FEED_ERROR = "SUBSCRIPTION_DUPLICATE_FEED_URL";

// Settings types

/** DEFAULT_SUBSCRIPTION_FILENAME_TEMPLATE shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the DEFAULT_SUBSCRIPTION_FILENAME_TEMPLATE contract)
 *
 * ```ts
 * import { DEFAULT_SUBSCRIPTION_FILENAME_TEMPLATE } from './index.js'
 * void DEFAULT_SUBSCRIPTION_FILENAME_TEMPLATE
 * ```
 *
 */
export const DEFAULT_SUBSCRIPTION_FILENAME_TEMPLATE = "%(uploader)s/%(title)s.%(ext)s";

/** defaultSettings shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the defaultSettings contract)
 *
 * ```ts
 * import { defaultSettings } from './index.js'
 * void defaultSettings
 * ```
 *
 */
export const defaultSettings: AppSettings = {
  downloadPath: "",
  maxConcurrentDownloads: 5,
  downloadWithoutChannelSubfolders: false,
  browserForCookies: "none",
  cookiesPath: "",
  extensionCookieSources: [],
  proxy: "",
  configPath: "",
  language: defaultLanguageCode,
  theme: "system",
  oneClickDownload: true,
  oneClickDownloadType: "video",
  oneClickQuality: "best",
  oneClickContainer: "auto",
  closeToTray: true,
  hideDockIcon: true,
  launchAtLogin: true,
  subscriptionOnlyLatestDefault: true,
  enableDownloadNotifications: true,
  rememberLastAudioLanguage: true,
  preferredAudioLanguage: "",
  downloadSubtitles: true,
  subtitleLanguages: [...DEFAULT_SUBTITLE_LANGUAGES],
  embedSubs: true,
  writeAutoSubs: true,
  embedThumbnail: false,
  embedMetadata: true,
  embedChapters: true,
  filenameStyle: "pretty",
  filenameViaVidBee: true,
  shareWatermark: false,
  sequentialFilenames: true,
  autoTranscribeAfterDownload: true,
  maxConcurrentTranscriptions: 1,
  asrTier: "minimal",
  ttsModelId: DEFAULT_TTS_MODEL_ID,
  transcriptionProvider: "local",
  cloudTranscriptionModelId: DEFAULT_CLOUD_TRANSCRIPTION_MODEL,
  downloadMirror: "auto",
  lastSeenWhatsNew: "",
  agentManagementTools: DEFAULT_AGENT_PERMISSION_MODE,
};
