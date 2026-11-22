import { normalizeSubtitleLanguages } from "@vidbee/downloader-core/subtitle-languages";
import { $DesktopId } from "@vidbee/identity/packages";
import { DEFAULT_ASR_TIER, parseAsrTier } from "@vidbee/transcription/asr";
import { parseTranscriptionProvider } from "@vidbee/transcription/cloud";
import { DEFAULT_DOWNLOAD_MIRROR, parseDownloadMirror } from "@vidbee/transcription/download-mirrors";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { RpcObserved } from "../renderer/src/transport/RpcObservation.model.js";
import { parseAgentPermissionMode } from "../shared/agent-permissions.js";
import { SettingsDecodeError } from "../shared/Settings.errors.js";
import { projectSettings, SettingValue } from "../shared/Settings.model.js";
import { DEFAULT_TTS_MODEL_ID, TtsModelId } from "../shared/Tts.model.js";
import { WHATS_NEW_ID } from "../shared/whats-new.js";
import type { SettingsOperations } from "./Settings.service.js";
import type { SettingsStoreOperations } from "./SettingsStore.service.js";

const $I = $DesktopId.create("main/settings");
const tts = (value: unknown) => S.decodeUnknownOption(TtsModelId)(value).pipe(O.getOrElse(() => DEFAULT_TTS_MODEL_ID));
const logError = (message: string, original: unknown) =>
  Effect.logError(message, original).pipe(Effect.annotateLogs("electron-log.scope", "system"));

/** Implements normalization, startup repairs and persistence sequencing over qualified synchronous drivers. Building this service performs no host work; initialize runs at the original import-time point.
 * **Example** (Use an injected settings implementation)
 * ```ts
 * import { makeSettings } from './settings.js'
 * import type { SettingsStoreOperations } from './SettingsStore.service.js'
 * export const readTheme = (store: SettingsStoreOperations) => makeSettings(store).get('theme')
 * // initialize the implementation once, then execute reads with the current authority.
 * ```
 * @category constructors
 * @since 0.0.0
 */
export const makeSettings = (store: SettingsStoreOperations): SettingsOperations => {
  const configuration = store.configuration;
  const mkdir = (value: unknown) =>
    store.mkdir(value).pipe(Effect.catch((error) => logError("Failed to ensure download directory:", error.original)));
  const get = Effect.fn("Settings.get")(function* (key: string) {
    const config = yield* configuration;
    if (config.portable && key === "launchAtLogin") return false;
    const value = yield* store.get(key);
    if (key === "asrTier") return parseAsrTier(value, DEFAULT_ASR_TIER);
    if (key === "ttsModelId") return tts(value);
    if (key === "transcriptionProvider") return parseTranscriptionProvider(value);
    if (key === "downloadMirror") return parseDownloadMirror(value, DEFAULT_DOWNLOAD_MIRROR);
    if (key === "agentManagementTools") return parseAgentPermissionMode(value);
    return value;
  });
  const set = Effect.fn("Settings.set")(function* (key: string, value: unknown) {
    const config = yield* configuration;
    if (config.portable && key === "launchAtLogin") return yield* store.set(key, false);
    if (key === "downloadPath" && P.isString(value)) yield* mkdir(value);
    yield* store.set(key, key === "agentManagementTools" ? parseAgentPermissionMode(value) : value);
  });
  const getAll = Effect.gen(function* () {
    const config = yield* configuration;
    const raw = yield* store.document;
    const login = config.portable
      ? false
      : ((yield* store.document).launchAtLogin ?? config.effectiveDefaults.launchAtLogin);
    const tier = parseAsrTier((yield* store.document).asrTier, DEFAULT_ASR_TIER);
    const model = tts((yield* store.document).ttsModelId);
    const provider = parseTranscriptionProvider((yield* store.document).transcriptionProvider);
    const permission = parseAgentPermissionMode((yield* store.document).agentManagementTools);
    const mirror = parseDownloadMirror((yield* store.document).downloadMirror, DEFAULT_DOWNLOAD_MIRROR);
    return {
      ...config.effectiveDefaults,
      ...raw,
      launchAtLogin: login,
      asrTier: tier,
      ttsModelId: model,
      transcriptionProvider: provider,
      agentManagementTools: permission,
      downloadMirror: mirror,
    };
  });
  const shouldPromptWhatsNew = Effect.gen(function* () {
    const config = yield* configuration;
    const raw = yield* get("lastSeenWhatsNew");
    const lastSeen = raw === null || raw === undefined ? "" : yield* store.trim(raw);
    return lastSeen !== WHATS_NEW_ID && (P.isTruthy(lastSeen) || config.hadExistingStore);
  });
  const markWhatsNewSeen = set("lastSeenWhatsNew", WHATS_NEW_ID);
  const ensureDownloadDirectory = Effect.gen(function* () {
    const config = yield* configuration;
    const current = yield* store.get("downloadPath");
    let normalized: unknown = current;
    if (!P.isTruthy(current) || current === config.oldDefaultDownloadPath) normalized = config.defaultDownloadPath;
    else if (config.portable && P.isTruthy(config.previousPortableRoot)) {
      const from = yield* store.resolve(config.previousPortableRoot);
      const to = yield* store.resolve(current);
      const relative = yield* store.relative(from, to);
      if (
        relative === "" ||
        (P.isTruthy(relative) && !Str.startsWith("..")(relative) && !(yield* store.isAbsolute(relative)))
      ) {
        const suffix = yield* store.relative(config.previousPortableRoot, current);
        normalized = yield* store.join(config.portableRoot, suffix);
      }
    }
    if (normalized !== current) yield* store.set("downloadPath", normalized);
    yield* mkdir(normalized);
  }).pipe(Effect.catch((error) => logError("Failed to verify download directory:", error.original)));
  const ensureRequiredSettings = Effect.gen(function* () {
    const config = yield* configuration;
    const storedPermission = yield* store.get("agentManagementTools");
    const permission = parseAgentPermissionMode(storedPermission);
    if (permission !== storedPermission) yield* store.set("agentManagementTools", permission);
    if (config.portable && (yield* store.get("launchAtLogin")) !== false) yield* store.set("launchAtLogin", false);
    const storedTier = yield* store.get("asrTier");
    const tier = parseAsrTier(storedTier, DEFAULT_ASR_TIER);
    if (storedTier !== tier) yield* store.set("asrTier", tier);
    const languages = yield* store.get("subtitleLanguages");
    const parsed = normalizeSubtitleLanguages(A.isArray(languages) ? A.filter(languages, P.isString) : undefined);
    if (
      !A.isArray(languages) ||
      languages.length !== parsed.length ||
      A.some(A.zip(languages, parsed), ([left, right]) => left !== right)
    )
      yield* store.set("subtitleLanguages", parsed);
  }).pipe(Effect.catch((error) => logError("Failed to enforce required settings:", error.original)));
  const initialize = Effect.gen(function* () {
    yield* store.initialize;
    yield* ensureDownloadDirectory;
    yield* ensureRequiredSettings;
    if (!(yield* shouldPromptWhatsNew)) yield* markWhatsNewSeen;
    yield* store.marker;
  });
  const freshLocale = Effect.gen(function* () {
    if ((yield* configuration).hadExistingStore) return;
    const profile = yield* store.locale;
    if ((yield* store.get("language")) !== profile.language) yield* store.set("language", profile.language);
    yield* Effect.logInfo(`Fresh install locale ${profile.language} (china mirrors ${profile.preferChina})`).pipe(
      Effect.annotateLogs("electron-log.scope", "system")
    );
  });
  const setAll = Effect.fn("Settings.setAll")(function* (entries: ReadonlyArray<readonly [string, unknown]>) {
    for (const [key, value] of entries) yield* set(key, value);
  });
  const reset = Effect.gen(function* () {
    const config = yield* configuration;
    yield* store.clear;
    yield* store.replace(config.effectiveDefaults);
  });
  const view = Effect.gen(function* () {
    const raw = yield* getAll;
    const config = yield* configuration;
    const result = projectSettings({ document: raw, defaults: config.effectiveDefaults });
    if (Result.isFailure(result))
      return yield* SettingsDecodeError.make({ operation: "getAll", issue: "Invalid effective settings defaults" });
    if (result.success.invalidKeys.length > 0)
      yield* Effect.logWarning("Invalid setting keys:", result.success.invalidKeys).pipe(
        Effect.annotateLogs("electron-log.scope", "system")
      );
    return result.success.settings;
  });
  const getTyped = Effect.fn("Settings.getTyped")(function* (key: Parameters<SettingsOperations["getTyped"]>[0]) {
    const raw = yield* get(key);
    const config = yield* configuration;
    // Type-side validation retains ordered unknown preference subgraphs.
    const projected = projectSettings({
      document: { ...config.effectiveDefaults, [key]: raw },
      defaults: config.effectiveDefaults,
    });
    if (Result.isFailure(projected))
      return yield* SettingsDecodeError.make({ operation: "get", issue: "Invalid effective settings defaults" });
    if (projected.success.invalidKeys.length > 0)
      yield* Effect.logWarning("Invalid setting keys:", [key]).pipe(
        Effect.annotateLogs("electron-log.scope", "system")
      );
    return yield* S.decodeEffect(
      SettingValue.pipe(
        RpcObserved,
        S.toType,
        $I.annoteSchema("selectedValue", { description: "Selected normalized setting value." })
      )
    )(projected.success.settings[key]).pipe(
      Effect.mapError(() => SettingsDecodeError.make({ operation: "get", issue: "Invalid normalized setting value" }))
    );
  });
  return {
    initialize,
    get,
    getAll,
    set,
    setAll,
    reset,
    freshLocale,
    shouldPromptWhatsNew,
    markWhatsNewSeen,
    view,
    getTyped,
    setTyped: (updates) => setAll(A.map(updates, (update): readonly [string, unknown] => [update.key, update.value])),
  };
};
