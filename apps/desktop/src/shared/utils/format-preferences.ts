import {
  buildAudioFormatPreference as buildSharedAudioFormatPreference,
  buildVideoFormatPreference as buildSharedVideoFormatPreference
} from '@vidbee/downloader-core/format-preferences'
import type { AppSettings } from '../types'

/** buildVideoFormatPreference shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the buildVideoFormatPreference contract)
 *
 * ```ts
 * import { buildVideoFormatPreference } from './format-preferences.js'
 * void buildVideoFormatPreference
 * ```
 *
 */
export const buildVideoFormatPreference = (settings: AppSettings): string =>
  buildSharedVideoFormatPreference({ oneClickQuality: settings.oneClickQuality })

/** buildAudioFormatPreference shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the buildAudioFormatPreference contract)
 *
 * ```ts
 * import { buildAudioFormatPreference } from './format-preferences.js'
 * void buildAudioFormatPreference
 * ```
 *
 */
export const buildAudioFormatPreference = (settings: AppSettings): string =>
  buildSharedAudioFormatPreference({ oneClickQuality: settings.oneClickQuality })
