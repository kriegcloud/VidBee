import {
  buildAudioFormatPreference as buildSharedAudioFormatPreference,
  buildVideoFormatPreference as buildSharedVideoFormatPreference
} from '@vidbee/downloader-core/format-preferences'
import type { AppSettings } from '../types'

/** buildVideoFormatPreference shared contract.
 * @category utilities
 * @since 0.0.0
 * @example buildVideoFormatPreference
 */
export const buildVideoFormatPreference = (settings: AppSettings): string =>
  buildSharedVideoFormatPreference({ oneClickQuality: settings.oneClickQuality })

/** buildAudioFormatPreference shared contract.
 * @category utilities
 * @since 0.0.0
 * @example buildAudioFormatPreference
 */
export const buildAudioFormatPreference = (settings: AppSettings): string =>
  buildSharedAudioFormatPreference({ oneClickQuality: settings.oneClickQuality })
