import { FILENAME_STYLES } from '@vidbee/downloader-core/filename-style'
import { MAX_SUBTITLE_LANGUAGES } from '@vidbee/downloader-core/subtitle-languages'
import { LanguageCode } from '@vidbee/i18n/languages'
import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import { ASR_TIER_IDS } from '@vidbee/transcription/asr'
import * as S from 'effect/Schema'
import { strictObject } from './StrictObject'

const $I = $DesktopId.create('shared/agent-settings')

import { AGENT_THINKING_LEVELS } from './agent-chat'
import { TtsModelId } from './Tts.model'

const TTS_FAMILIES = [
  'vits',
  'matcha',
  'kokoro',
  'kitten',
  'zipvoice',
  'pocket',
  'supertonic'
] as const
const text = S.String.check(S.isMaxLength(4096)).pipe(
  $I.annoteSchema('text', { description: 'Shared text schema used by the boundary models.' })
)

/** Explicit public setting fields; internal migration markers and enforced updates are excluded. */
/** AgentSettingsPatch; structural for legacy construction.
 * **Example** (Reject invalid AgentSettingsPatch input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentSettingsPatch } from './agent-settings.js'
 * strictEqual(S.is(AgentSettingsPatch)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentSettingsPatch = S.Struct({
  downloadPath: text.check(S.isMinLength(1)).pipe(S.mutableKey),
  maxConcurrentDownloads: S.Finite.check(S.isInt())
    .check(S.isGreaterThanOrEqualTo(1))
    .check(S.isLessThanOrEqualTo(10))
    .pipe(S.mutableKey),
  downloadWithoutChannelSubfolders: S.Boolean.pipe(S.mutableKey),
  browserForCookies: text.pipe(S.mutableKey),
  cookiesPath: text.pipe(S.mutableKey),
  proxy: text.pipe(S.mutableKey),
  configPath: text.pipe(S.mutableKey),
  language: LanguageCode.pipe(S.mutableKey),
  theme: LiteralKit(['system', 'light', 'dark']).pipe(S.mutableKey),
  oneClickDownload: S.Boolean.pipe(S.mutableKey),
  oneClickDownloadType: LiteralKit(['video', 'audio']).pipe(S.mutableKey),
  oneClickQuality: LiteralKit(['best', 'good', 'normal', 'bad', 'worst']).pipe(S.mutableKey),
  oneClickContainer: LiteralKit(['auto', 'mp4', 'mkv', 'webm', 'original']).pipe(S.mutableKey),
  closeToTray: S.Boolean.pipe(S.mutableKey),
  hideDockIcon: S.Boolean.pipe(S.mutableKey),
  launchAtLogin: S.Boolean.pipe(S.mutableKey),
  subscriptionOnlyLatestDefault: S.Boolean.pipe(S.mutableKey),
  enableDownloadNotifications: S.Boolean.pipe(S.mutableKey),
  rememberLastAudioLanguage: S.Boolean.pipe(S.mutableKey),
  preferredAudioLanguage: text.pipe(S.mutableKey),
  downloadSubtitles: S.Boolean.pipe(S.mutableKey),
  subtitleLanguages: S.Array(S.String.check(S.isMinLength(1)).check(S.isMaxLength(100)))
    .pipe(S.mutable)
    .check(S.isMinLength(1))
    .check(S.isMaxLength(MAX_SUBTITLE_LANGUAGES))
    .pipe(S.mutableKey),
  embedSubs: S.Boolean.pipe(S.mutableKey),
  writeAutoSubs: S.Boolean.pipe(S.mutableKey),
  embedThumbnail: S.Boolean.pipe(S.mutableKey),
  embedMetadata: S.Boolean.pipe(S.mutableKey),
  embedChapters: S.Boolean.pipe(S.mutableKey),
  filenameStyle: LiteralKit(FILENAME_STYLES).pipe(S.mutableKey),
  filenameViaVidBee: S.Boolean.pipe(S.mutableKey),
  shareWatermark: S.Boolean.pipe(S.mutableKey),
  sequentialFilenames: S.Boolean.pipe(S.mutableKey),
  autoTranscribeAfterDownload: S.Boolean.pipe(S.mutableKey),
  maxConcurrentTranscriptions: S.Finite.check(S.isInt())
    .check(S.isGreaterThanOrEqualTo(1))
    .check(S.isLessThanOrEqualTo(4))
    .pipe(S.mutableKey),
  asrTier: LiteralKit(ASR_TIER_IDS).pipe(S.mutableKey),
  ttsModelId: TtsModelId.pipe(S.mutableKey),
  transcriptionProvider: LiteralKit(['local', 'cloud']).pipe(S.mutableKey),
  cloudTranscriptionModelId: S.String.check(S.isMinLength(1))
    .check(S.isMaxLength(200))
    .pipe(S.mutableKey),
  downloadMirror: LiteralKit(['auto', 'cn', 'global']).pipe(S.mutableKey)
})
  .mapFields((fields) => ({
    downloadPath: fields.downloadPath.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    maxConcurrentDownloads: fields.maxConcurrentDownloads.pipe(
      S.UndefinedOr,
      S.optionalKey,
      S.mutableKey
    ),
    downloadWithoutChannelSubfolders: fields.downloadWithoutChannelSubfolders.pipe(
      S.UndefinedOr,
      S.optionalKey,
      S.mutableKey
    ),
    browserForCookies: fields.browserForCookies.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    cookiesPath: fields.cookiesPath.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    proxy: fields.proxy.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    configPath: fields.configPath.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    language: fields.language.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    theme: fields.theme.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    oneClickDownload: fields.oneClickDownload.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    oneClickDownloadType: fields.oneClickDownloadType.pipe(
      S.UndefinedOr,
      S.optionalKey,
      S.mutableKey
    ),
    oneClickQuality: fields.oneClickQuality.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    oneClickContainer: fields.oneClickContainer.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    closeToTray: fields.closeToTray.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    hideDockIcon: fields.hideDockIcon.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    launchAtLogin: fields.launchAtLogin.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    subscriptionOnlyLatestDefault: fields.subscriptionOnlyLatestDefault.pipe(
      S.UndefinedOr,
      S.optionalKey,
      S.mutableKey
    ),
    enableDownloadNotifications: fields.enableDownloadNotifications.pipe(
      S.UndefinedOr,
      S.optionalKey,
      S.mutableKey
    ),
    rememberLastAudioLanguage: fields.rememberLastAudioLanguage.pipe(
      S.UndefinedOr,
      S.optionalKey,
      S.mutableKey
    ),
    preferredAudioLanguage: fields.preferredAudioLanguage.pipe(
      S.UndefinedOr,
      S.optionalKey,
      S.mutableKey
    ),
    downloadSubtitles: fields.downloadSubtitles.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    subtitleLanguages: fields.subtitleLanguages.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    embedSubs: fields.embedSubs.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    writeAutoSubs: fields.writeAutoSubs.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    embedThumbnail: fields.embedThumbnail.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    embedMetadata: fields.embedMetadata.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    embedChapters: fields.embedChapters.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    filenameStyle: fields.filenameStyle.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    filenameViaVidBee: fields.filenameViaVidBee.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    shareWatermark: fields.shareWatermark.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    sequentialFilenames: fields.sequentialFilenames.pipe(
      S.UndefinedOr,
      S.optionalKey,
      S.mutableKey
    ),
    autoTranscribeAfterDownload: fields.autoTranscribeAfterDownload.pipe(
      S.UndefinedOr,
      S.optionalKey,
      S.mutableKey
    ),
    maxConcurrentTranscriptions: fields.maxConcurrentTranscriptions.pipe(
      S.UndefinedOr,
      S.optionalKey,
      S.mutableKey
    ),
    asrTier: fields.asrTier.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    ttsModelId: fields.ttsModelId.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    transcriptionProvider: fields.transcriptionProvider.pipe(
      S.UndefinedOr,
      S.optionalKey,
      S.mutableKey
    ),
    cloudTranscriptionModelId: fields.cloudTranscriptionModelId.pipe(
      S.UndefinedOr,
      S.optionalKey,
      S.mutableKey
    ),
    downloadMirror: fields.downloadMirror.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
  }))
  .pipe(
    strictObject,
    $I.annoteSchema('AgentSettingsPatch', {
      description: 'AgentSettingsPatch shared boundary data.'
    })
  )

/** Inspect available speech models or persist a validated default without downloading it. */
/** AgentTtsModelInput; structural for legacy construction.
 * **Example** (Reject invalid AgentTtsModelInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentTtsModelInput } from './agent-settings.js'
 * strictEqual(S.is(AgentTtsModelInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentTtsModelInput = S.Struct({
  action: LiteralKit(['status', 'select', 'prepare']).pipe(S.mutableKey),
  modelId: TtsModelId.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  query: S.String.check(S.isMaxLength(200)).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  language: S.String.check(S.isMaxLength(30)).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  family: LiteralKit(TTS_FAMILIES).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  offset: S.Finite.check(S.isInt())
    .check(S.isGreaterThanOrEqualTo(0))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  limit: S.Finite.check(S.isInt())
    .check(S.isGreaterThanOrEqualTo(1))
    .check(S.isLessThanOrEqualTo(30))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  refresh: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  strictObject,
  $I.annoteSchema('AgentTtsModelInput', {
    description: 'AgentTtsModelInput shared boundary data.'
  })
)

/** AI writes reuse existing secrets and expose only model and prompt configuration. */
/** AgentAiSettingsInput; structural for legacy construction.
 * **Example** (Reject invalid AgentAiSettingsInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentAiSettingsInput } from './agent-settings.js'
 * strictEqual(S.is(AgentAiSettingsInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentAiSettingsInput = S.Struct({
  action: LiteralKit([
    'list',
    'catalog',
    'select_cloud_model',
    'select_provider',
    'save_provider',
    'update_provider',
    'test_provider',
    'delete_provider',
    'save_prompt',
    'delete_prompt',
    'restore_prompts'
  ]).pipe(S.mutableKey),
  id: S.NullOr(S.String.check(S.isMinLength(1)).check(S.isMaxLength(200))).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  presetId: S.String.check(S.isMinLength(1))
    .check(S.isMaxLength(100))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  copyApiKeyFromId: S.String.check(S.isMinLength(1))
    .check(S.isMaxLength(200))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  baseUrl: S.String.check(S.isMaxLength(4096)).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  modelId: S.String.check(S.isMinLength(1))
    .check(S.isMaxLength(200))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  name: S.String.check(S.isMinLength(1))
    .check(S.isMaxLength(200))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  contextWindow: S.Finite.check(S.isInt())
    .check(S.isGreaterThanOrEqualTo(4096))
    .check(S.isLessThanOrEqualTo(2_000_000))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  maxTokens: S.Finite.check(S.isInt())
    .check(S.isGreaterThanOrEqualTo(1))
    .check(S.isLessThanOrEqualTo(2_000_000))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  vision: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  tools: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  reasoning: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  thinkingOnly: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  allowDisableThinking: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  thinkingLevels: S.Array(LiteralKit(AGENT_THINKING_LEVELS))
    .pipe(S.mutable)
    .check(S.isMaxLength(AGENT_THINKING_LEVELS.length))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  defaultThinkingLevel: LiteralKit(['auto', ...AGENT_THINKING_LEVELS]).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  description: S.String.check(S.isMinLength(1))
    .check(S.isMaxLength(1024))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  content: S.String.check(S.isMinLength(1))
    .check(S.isMaxLength(50_000))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  autoRun: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  strictObject,
  $I.annoteSchema('AgentAiSettingsInput', {
    description: 'AgentAiSettingsInput shared boundary data.'
  })
)

/** Decoded AgentSettingsPatch data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AgentSettingsPatch contract)
 *
 * ```ts
 * import { AgentSettingsPatch } from './agent-settings.js'
 * void AgentSettingsPatch
 * ```
 *
 */
export type AgentSettingsPatch = typeof AgentSettingsPatch.Type

/** Decoded AgentTtsModelInput data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AgentTtsModelInput contract)
 *
 * ```ts
 * import { AgentTtsModelInput } from './agent-settings.js'
 * void AgentTtsModelInput
 * ```
 *
 */
export type AgentTtsModelInput = typeof AgentTtsModelInput.Type

/** Decoded AgentAiSettingsInput data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AgentAiSettingsInput contract)
 *
 * ```ts
 * import { AgentAiSettingsInput } from './agent-settings.js'
 * void AgentAiSettingsInput
 * ```
 *
 */
export type AgentAiSettingsInput = typeof AgentAiSettingsInput.Type
