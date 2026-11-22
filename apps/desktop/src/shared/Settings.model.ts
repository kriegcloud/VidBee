import { $DesktopId } from "@vidbee/identity/packages";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as A from "effect/Array";
import * as HashSet from "effect/HashSet";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import { RpcArray } from "../renderer/src/transport/RpcField.model.js";
import { RpcObserved } from "../renderer/src/transport/RpcObservation.model.js";
import { AppSettings } from "./types/Desktop.model.js";

const $I = $DesktopId.create("shared/Settings.model");
/** Open persistence document; decoding never repairs or writes storage.
 *
 * **Example** (SettingsDocument at the settings boundary)
 *
 * ```ts
 * import { SettingsDocument } from './Settings.model.js'
 * const document = SettingsDocument.make({ future: { enabled: true } })
 * document.future // => { enabled: true }
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SettingsDocument = S.Record(S.String, S.Unknown).pipe(
  $I.annoteSchema("SettingsDocument", { description: "Uninterpreted settings persistence document." })
);
/** Schema-derived persistence data.
 *
 * **Example** (SettingsDocument at the settings boundary)
 *
 * ```ts
 * import type { SettingsDocument } from './Settings.model.js'
 * const document: SettingsDocument = {}
 * document.future // => undefined
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export type SettingsDocument = typeof SettingsDocument.Type;

/** Known keys accepted on the typed path.
 *
 * **Example** (SettingKey at the settings boundary)
 *
 * ```ts
 * import { SettingKey } from './Settings.model.js'
 * SettingKey.make('theme') // => 'theme'
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SettingKey = LiteralKit([
  "downloadPath",
  "maxConcurrentDownloads",
  "downloadWithoutChannelSubfolders",
  "browserForCookies",
  "cookiesPath",
  "extensionCookieSources",
  "proxy",
  "configPath",
  "language",
  "theme",
  "oneClickDownload",
  "oneClickDownloadType",
  "oneClickQuality",
  "oneClickContainer",
  "closeToTray",
  "hideDockIcon",
  "launchAtLogin",
  "subscriptionOnlyLatestDefault",
  "enableDownloadNotifications",
  "rememberLastAudioLanguage",
  "preferredAudioLanguage",
  "downloadSubtitles",
  "subtitleLanguages",
  "embedSubs",
  "writeAutoSubs",
  "embedThumbnail",
  "embedMetadata",
  "embedChapters",
  "filenameStyle",
  "filenameViaVidBee",
  "shareWatermark",
  "sequentialFilenames",
  "autoTranscribeAfterDownload",
  "maxConcurrentTranscriptions",
  "asrTier",
  "ttsModelId",
  "transcriptionProvider",
  "cloudTranscriptionModelId",
  "downloadMirror",
  "lastSeenWhatsNew",
  "agentManagementTools",
]).pipe($I.annoteSchema("SettingKey", { description: "Known application setting key." }));
/** Schema-derived known setting key.
 *
 * **Example** (SettingKey at the settings boundary)
 *
 * ```ts
 * import type { SettingKey } from './Settings.model.js'
 * const key: SettingKey = 'theme'
 * key // => 'theme'
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export type SettingKey = typeof SettingKey.Type;

/** A correlated key and value; unrelated key/value unions are never asserted.
 *
 * **Example** (SettingUpdate at the settings boundary)
 *
 * ```ts
 * import { SettingUpdate } from './Settings.model.js'
 * SettingUpdate.make({ key: 'closeToTray', value: true }).value // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SettingUpdate = S.Union([
  S.Struct({ key: S.Literal("downloadPath"), value: RpcObserved(AppSettings.fields.downloadPath) }),
  S.Struct({ key: S.Literal("maxConcurrentDownloads"), value: RpcObserved(AppSettings.fields.maxConcurrentDownloads) }),
  S.Struct({
    key: S.Literal("downloadWithoutChannelSubfolders"),
    value: RpcObserved(AppSettings.fields.downloadWithoutChannelSubfolders),
  }),
  S.Struct({ key: S.Literal("browserForCookies"), value: RpcObserved(AppSettings.fields.browserForCookies) }),
  S.Struct({ key: S.Literal("cookiesPath"), value: RpcObserved(AppSettings.fields.cookiesPath) }),
  S.Struct({ key: S.Literal("extensionCookieSources"), value: RpcObserved(AppSettings.fields.extensionCookieSources) }),
  S.Struct({ key: S.Literal("proxy"), value: RpcObserved(AppSettings.fields.proxy) }),
  S.Struct({ key: S.Literal("configPath"), value: RpcObserved(AppSettings.fields.configPath) }),
  S.Struct({ key: S.Literal("language"), value: RpcObserved(AppSettings.fields.language) }),
  S.Struct({ key: S.Literal("theme"), value: RpcObserved(AppSettings.fields.theme) }),
  S.Struct({ key: S.Literal("oneClickDownload"), value: RpcObserved(AppSettings.fields.oneClickDownload) }),
  S.Struct({ key: S.Literal("oneClickDownloadType"), value: RpcObserved(AppSettings.fields.oneClickDownloadType) }),
  S.Struct({ key: S.Literal("oneClickQuality"), value: RpcObserved(AppSettings.fields.oneClickQuality) }),
  S.Struct({ key: S.Literal("oneClickContainer"), value: RpcObserved(AppSettings.fields.oneClickContainer) }),
  S.Struct({ key: S.Literal("closeToTray"), value: RpcObserved(AppSettings.fields.closeToTray) }),
  S.Struct({ key: S.Literal("hideDockIcon"), value: RpcObserved(AppSettings.fields.hideDockIcon) }),
  S.Struct({ key: S.Literal("launchAtLogin"), value: RpcObserved(AppSettings.fields.launchAtLogin) }),
  S.Struct({
    key: S.Literal("subscriptionOnlyLatestDefault"),
    value: RpcObserved(AppSettings.fields.subscriptionOnlyLatestDefault),
  }),
  S.Struct({
    key: S.Literal("enableDownloadNotifications"),
    value: RpcObserved(AppSettings.fields.enableDownloadNotifications),
  }),
  S.Struct({
    key: S.Literal("rememberLastAudioLanguage"),
    value: RpcObserved(AppSettings.fields.rememberLastAudioLanguage),
  }),
  S.Struct({ key: S.Literal("preferredAudioLanguage"), value: RpcObserved(AppSettings.fields.preferredAudioLanguage) }),
  S.Struct({ key: S.Literal("downloadSubtitles"), value: RpcObserved(AppSettings.fields.downloadSubtitles) }),
  S.Struct({ key: S.Literal("subtitleLanguages"), value: RpcObserved(AppSettings.fields.subtitleLanguages) }),
  S.Struct({ key: S.Literal("embedSubs"), value: RpcObserved(AppSettings.fields.embedSubs) }),
  S.Struct({ key: S.Literal("writeAutoSubs"), value: RpcObserved(AppSettings.fields.writeAutoSubs) }),
  S.Struct({ key: S.Literal("embedThumbnail"), value: RpcObserved(AppSettings.fields.embedThumbnail) }),
  S.Struct({ key: S.Literal("embedMetadata"), value: RpcObserved(AppSettings.fields.embedMetadata) }),
  S.Struct({ key: S.Literal("embedChapters"), value: RpcObserved(AppSettings.fields.embedChapters) }),
  S.Struct({ key: S.Literal("filenameStyle"), value: RpcObserved(AppSettings.fields.filenameStyle) }),
  S.Struct({ key: S.Literal("filenameViaVidBee"), value: RpcObserved(AppSettings.fields.filenameViaVidBee) }),
  S.Struct({ key: S.Literal("shareWatermark"), value: RpcObserved(AppSettings.fields.shareWatermark) }),
  S.Struct({ key: S.Literal("sequentialFilenames"), value: RpcObserved(AppSettings.fields.sequentialFilenames) }),
  S.Struct({
    key: S.Literal("autoTranscribeAfterDownload"),
    value: RpcObserved(AppSettings.fields.autoTranscribeAfterDownload),
  }),
  S.Struct({
    key: S.Literal("maxConcurrentTranscriptions"),
    value: RpcObserved(AppSettings.fields.maxConcurrentTranscriptions),
  }),
  S.Struct({ key: S.Literal("asrTier"), value: RpcObserved(AppSettings.fields.asrTier) }),
  S.Struct({ key: S.Literal("ttsModelId"), value: RpcObserved(AppSettings.fields.ttsModelId) }),
  S.Struct({ key: S.Literal("transcriptionProvider"), value: RpcObserved(AppSettings.fields.transcriptionProvider) }),
  S.Struct({
    key: S.Literal("cloudTranscriptionModelId"),
    value: RpcObserved(AppSettings.fields.cloudTranscriptionModelId),
  }),
  S.Struct({ key: S.Literal("downloadMirror"), value: RpcObserved(AppSettings.fields.downloadMirror) }),
  S.Struct({ key: S.Literal("lastSeenWhatsNew"), value: RpcObserved(AppSettings.fields.lastSeenWhatsNew) }),
  S.Struct({ key: S.Literal("agentManagementTools"), value: RpcObserved(AppSettings.fields.agentManagementTools) }),
]).pipe($I.annoteSchema("SettingUpdate", { description: "One correlated typed setting write." }));
/** Schema-derived correlated setting update.
 *
 * **Example** (SettingUpdate at the settings boundary)
 *
 * ```ts
 * import type { SettingUpdate } from './Settings.model.js'
 * const update: SettingUpdate = { key: 'theme', value: 'system' }
 * update.key // => 'theme'
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export type SettingUpdate = typeof SettingUpdate.Type;

/** Ordered writes, rejecting duplicates before persistence starts.
 *
 * **Example** (SettingsPatch at the settings boundary)
 *
 * ```ts
 * import { SettingsPatch } from './Settings.model.js'
 * SettingsPatch.make([{ key: 'theme', value: 'dark' }]).length // => 1
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SettingsPatch = RpcArray(SettingUpdate)
  .check(
    S.makeFilter((updates) => {
      let seen = HashSet.empty<SettingKey>();
      for (const update of updates) {
        if (HashSet.has(seen, update.key)) return "Duplicate setting key";
        seen = HashSet.add(seen, update.key);
      }
      return true;
    })
  )
  .pipe($I.annoteSchema("SettingsPatch", { description: "Ordered unique correlated settings writes." }));
/** Schema-derived ordered patch.
 *
 * **Example** (SettingsPatch at the settings boundary)
 *
 * ```ts
 * import type { SettingsPatch } from './Settings.model.js'
 * const patch: SettingsPatch = []
 * patch.length // => 0
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export type SettingsPatch = typeof SettingsPatch.Type;

/** Typed presentation preserving unknown root and nested preference values.
 *
 * **Example** (SettingsView at the settings boundary)
 *
 * ```ts
 * import { SettingsView } from './Settings.model.js'
 * import * as S from 'effect/Schema'
 * S.is(SettingsView)(null) // => false
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SettingsView = S.StructWithRest(AppSettings, [SettingsDocument]).pipe(
  $I.annoteSchema("SettingsView", { description: "Open typed settings presentation." })
);
/** Schema-derived typed view.
 *
 * **Example** (SettingsView at the settings boundary)
 *
 * ```ts
 * import type { SettingsView } from './Settings.model.js'
 * const downloadPath = (settings: SettingsView) => settings.downloadPath
 * downloadPath
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export type SettingsView = typeof SettingsView.Type;

/** Project normalized manager values field by field without mutating the document. Host supplies effective defaults after its existing startup repairs.
 *
 * **Example** (projectSettings at the settings boundary)
 *
 * ```ts
 * import { projectSettings } from './Settings.model.js'
 * import { defaultSettings } from './types/index.js'
 * const result = projectSettings({ document: { theme: null }, defaults: defaultSettings })
 * import * as Result from 'effect/Result'
 * Result.isSuccess(result) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const projectSettings = ({
  document,
  defaults,
}: {
  readonly document: SettingsDocument;
  readonly defaults: AppSettings;
}) => {
  const invalidKeys: Array<SettingKey> = [];
  const projected = { ...document };
  for (const key of SettingKey.literals) {
    const field: S.ConstraintDecoder<unknown> = AppSettings.fields[key].pipe(
      $I.annoteSchema("field", { description: "Selected known setting field for independent projection." })
    );
    const value = document[key];
    if (!S.is(field)(value)) {
      invalidKeys.push(key);
      projected[key] = defaults[key];
    } else projected[key] = value;
  }
  return S.decodeUnknownResult(SettingsView.pipe(RpcObserved, S.toType))(projected).pipe(
    Result.map((settings) => ({ settings, invalidKeys }))
  );
};
/** Capture object enumeration once and decode each correlated update in that sequence.
 *
 * **Example** (settingsPatchFromEntries at the settings boundary)
 *
 * ```ts
 * import { settingsPatchFromEntries } from './Settings.model.js'
 * settingsPatchFromEntries([['launchAtLogin', false], ['hideDockIcon', true]])
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const settingsPatchFromEntries = (entries: ReadonlyArray<readonly [string, unknown]>) =>
  S.decodeUnknownResult(S.toType(SettingsPatch))(A.map(entries, ([key, value]) => ({ key, value })));

/** Union of typed setting values. Selected-key clients additionally decode with that key's schema.
 *
 * **Example** (Validate a typed value)
 * ```ts
 * import * as S from 'effect/Schema'
 * import { SettingValue } from './Settings.model.js'
 * S.is(SettingValue)(null) // => false
 * ```
 * @category schemas
 * @since 0.0.0
 */
export const SettingValue = S.Union([
  AppSettings.fields.downloadPath,
  AppSettings.fields.maxConcurrentDownloads,
  AppSettings.fields.downloadWithoutChannelSubfolders,
  AppSettings.fields.browserForCookies,
  AppSettings.fields.cookiesPath,
  AppSettings.fields.extensionCookieSources,
  AppSettings.fields.proxy,
  AppSettings.fields.configPath,
  AppSettings.fields.language,
  AppSettings.fields.theme,
  AppSettings.fields.oneClickDownload,
  AppSettings.fields.oneClickDownloadType,
  AppSettings.fields.oneClickQuality,
  AppSettings.fields.oneClickContainer,
  AppSettings.fields.closeToTray,
  AppSettings.fields.hideDockIcon,
  AppSettings.fields.launchAtLogin,
  AppSettings.fields.subscriptionOnlyLatestDefault,
  AppSettings.fields.enableDownloadNotifications,
  AppSettings.fields.rememberLastAudioLanguage,
  AppSettings.fields.preferredAudioLanguage,
  AppSettings.fields.downloadSubtitles,
  AppSettings.fields.subtitleLanguages,
  AppSettings.fields.embedSubs,
  AppSettings.fields.writeAutoSubs,
  AppSettings.fields.embedThumbnail,
  AppSettings.fields.embedMetadata,
  AppSettings.fields.embedChapters,
  AppSettings.fields.filenameStyle,
  AppSettings.fields.filenameViaVidBee,
  AppSettings.fields.shareWatermark,
  AppSettings.fields.sequentialFilenames,
  AppSettings.fields.autoTranscribeAfterDownload,
  AppSettings.fields.maxConcurrentTranscriptions,
  AppSettings.fields.asrTier,
  AppSettings.fields.ttsModelId,
  AppSettings.fields.transcriptionProvider,
  AppSettings.fields.cloudTranscriptionModelId,
  AppSettings.fields.downloadMirror,
  AppSettings.fields.lastSeenWhatsNew,
  AppSettings.fields.agentManagementTools,
]).pipe($I.annoteSchema("SettingValue", { description: "Known setting value union." }));

/** Schema-derived setting value.
 *
 * **Example** (Name a setting value)
 * ```ts
 * import type { SettingValue } from './Settings.model.js'
 * const value: SettingValue = 'system'
 * value // => 'system'
 * ```
 * @category type-level
 * @since 0.0.0
 */
export type SettingValue = typeof SettingValue.Type;
