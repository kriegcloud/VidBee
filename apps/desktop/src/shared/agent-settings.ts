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
const text = S.String.check(S.isMaxLength(4096))

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
    downloadPath: fields.downloadPath.pipe(S.optional),
    maxConcurrentDownloads: fields.maxConcurrentDownloads.pipe(S.optional),
    downloadWithoutChannelSubfolders: fields.downloadWithoutChannelSubfolders.pipe(S.optional),
    browserForCookies: fields.browserForCookies.pipe(S.optional),
    cookiesPath: fields.cookiesPath.pipe(S.optional),
    proxy: fields.proxy.pipe(S.optional),
    configPath: fields.configPath.pipe(S.optional),
    language: fields.language.pipe(S.optional),
    theme: fields.theme.pipe(S.optional),
    oneClickDownload: fields.oneClickDownload.pipe(S.optional),
    oneClickDownloadType: fields.oneClickDownloadType.pipe(S.optional),
    oneClickQuality: fields.oneClickQuality.pipe(S.optional),
    oneClickContainer: fields.oneClickContainer.pipe(S.optional),
    closeToTray: fields.closeToTray.pipe(S.optional),
    hideDockIcon: fields.hideDockIcon.pipe(S.optional),
    launchAtLogin: fields.launchAtLogin.pipe(S.optional),
    subscriptionOnlyLatestDefault: fields.subscriptionOnlyLatestDefault.pipe(S.optional),
    enableDownloadNotifications: fields.enableDownloadNotifications.pipe(S.optional),
    rememberLastAudioLanguage: fields.rememberLastAudioLanguage.pipe(S.optional),
    preferredAudioLanguage: fields.preferredAudioLanguage.pipe(S.optional),
    downloadSubtitles: fields.downloadSubtitles.pipe(S.optional),
    subtitleLanguages: fields.subtitleLanguages.pipe(S.optional),
    embedSubs: fields.embedSubs.pipe(S.optional),
    writeAutoSubs: fields.writeAutoSubs.pipe(S.optional),
    embedThumbnail: fields.embedThumbnail.pipe(S.optional),
    embedMetadata: fields.embedMetadata.pipe(S.optional),
    embedChapters: fields.embedChapters.pipe(S.optional),
    filenameStyle: fields.filenameStyle.pipe(S.optional),
    filenameViaVidBee: fields.filenameViaVidBee.pipe(S.optional),
    shareWatermark: fields.shareWatermark.pipe(S.optional),
    sequentialFilenames: fields.sequentialFilenames.pipe(S.optional),
    autoTranscribeAfterDownload: fields.autoTranscribeAfterDownload.pipe(S.optional),
    maxConcurrentTranscriptions: fields.maxConcurrentTranscriptions.pipe(S.optional),
    asrTier: fields.asrTier.pipe(S.optional),
    ttsModelId: fields.ttsModelId.pipe(S.optional),
    transcriptionProvider: fields.transcriptionProvider.pipe(S.optional),
    cloudTranscriptionModelId: fields.cloudTranscriptionModelId.pipe(S.optional),
    downloadMirror: fields.downloadMirror.pipe(S.optional)
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
  modelId: TtsModelId.pipe(S.optional, S.mutableKey),
  query: S.String.check(S.isMaxLength(200)).pipe(S.optional, S.mutableKey),
  language: S.String.check(S.isMaxLength(30)).pipe(S.optional, S.mutableKey),
  family: LiteralKit(TTS_FAMILIES).pipe(S.optional, S.mutableKey),
  offset: S.Finite.check(S.isInt())
    .check(S.isGreaterThanOrEqualTo(0))
    .pipe(S.optional, S.mutableKey),
  limit: S.Finite.check(S.isInt())
    .check(S.isGreaterThanOrEqualTo(1))
    .check(S.isLessThanOrEqualTo(30))
    .pipe(S.optional, S.mutableKey),
  refresh: S.Boolean.pipe(S.optional, S.mutableKey)
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
    S.optional,
    S.mutableKey
  ),
  presetId: S.String.check(S.isMinLength(1))
    .check(S.isMaxLength(100))
    .pipe(S.optional, S.mutableKey),
  copyApiKeyFromId: S.String.check(S.isMinLength(1))
    .check(S.isMaxLength(200))
    .pipe(S.optional, S.mutableKey),
  baseUrl: S.String.check(S.isMaxLength(4096)).pipe(S.optional, S.mutableKey),
  modelId: S.String.check(S.isMinLength(1))
    .check(S.isMaxLength(200))
    .pipe(S.optional, S.mutableKey),
  name: S.String.check(S.isMinLength(1)).check(S.isMaxLength(200)).pipe(S.optional, S.mutableKey),
  contextWindow: S.Finite.check(S.isInt())
    .check(S.isGreaterThanOrEqualTo(4096))
    .check(S.isLessThanOrEqualTo(2_000_000))
    .pipe(S.optional, S.mutableKey),
  maxTokens: S.Finite.check(S.isInt())
    .check(S.isGreaterThanOrEqualTo(1))
    .check(S.isLessThanOrEqualTo(2_000_000))
    .pipe(S.optional, S.mutableKey),
  vision: S.Boolean.pipe(S.optional, S.mutableKey),
  tools: S.Boolean.pipe(S.optional, S.mutableKey),
  reasoning: S.Boolean.pipe(S.optional, S.mutableKey),
  thinkingOnly: S.Boolean.pipe(S.optional, S.mutableKey),
  allowDisableThinking: S.Boolean.pipe(S.optional, S.mutableKey),
  thinkingLevels: S.Array(LiteralKit(AGENT_THINKING_LEVELS))
    .pipe(S.mutable)
    .check(S.isMaxLength(AGENT_THINKING_LEVELS.length))
    .pipe(S.optional, S.mutableKey),
  defaultThinkingLevel: LiteralKit(['auto', ...AGENT_THINKING_LEVELS]).pipe(
    S.optional,
    S.mutableKey
  ),
  description: S.String.check(S.isMinLength(1))
    .check(S.isMaxLength(1024))
    .pipe(S.optional, S.mutableKey),
  content: S.String.check(S.isMinLength(1))
    .check(S.isMaxLength(50_000))
    .pipe(S.optional, S.mutableKey),
  autoRun: S.Boolean.pipe(S.optional, S.mutableKey)
}).pipe(
  strictObject,
  $I.annoteSchema('AgentAiSettingsInput', {
    description: 'AgentAiSettingsInput shared boundary data.'
  })
)

/** Decoded AgentSettingsPatch data.
 * @category type-level
 * @since 0.0.0
 * @example AgentSettingsPatch
 */
export type AgentSettingsPatch = typeof AgentSettingsPatch.Type

/** Decoded AgentTtsModelInput data.
 * @category type-level
 * @since 0.0.0
 * @example AgentTtsModelInput
 */
export type AgentTtsModelInput = typeof AgentTtsModelInput.Type

/** Decoded AgentAiSettingsInput data.
 * @category type-level
 * @since 0.0.0
 * @example AgentAiSettingsInput
 */
export type AgentAiSettingsInput = typeof AgentAiSettingsInput.Type
