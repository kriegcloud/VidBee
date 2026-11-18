import * as Effect from 'effect/Effect'
import * as Path from 'effect/Path'
import * as os from 'node:os'
import * as Native from '../../downloader-core/src/yt-dlp-args.js'
import { DownloadTiming } from '../../downloader-core/src/DownloadTiming.service.js'
import { runLegacySync, runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import { argumentsRuntime, argumentError } from './arguments-runtime.js'
export type { YtDlpDownloadOptions, YtDlpDownloadSettings, SubtitleDownloadSkipReason } from '../../downloader-core/src/yt-dlp-args.js'
export {
  resolveDownloadSubtitleLanguages, isTransientYtDlpNetworkError, METADATA_NETWORK_ATTEMPTS,
  METADATA_NETWORK_RETRY_DELAY_MS, parseDownloadTimecode, isDirectMediaSegmentUrl,
  isYouTubeUrl, appendYouTubeSafeExtractorArgs,
  formatYtDlpCommand, resolveVideoFormatSelector, THUMBNAIL_EMBED_UNSUPPORTED_LOG,
  resolveThumbnailDownloadArgs, isUnsupportedThumbnailEmbedOnlyFailure,
  resolveAudioFormatSelector, cookieSourcesFromArgs, VIDBEE_OUTPUT_PATH_PREFIX
} from '../../downloader-core/src/yt-dlp-args.js'

const sync = <A, E>(effect: Effect.Effect<A, E, Effect.Services<ReturnType<typeof Native.buildVideoInfoArgs>>>) => runLegacySync(argumentsRuntime, effect, argumentError)
export const normalizeBrowserCookiesSettingForYtDlp = (value?: string | null): string => sync(Native.normalizeBrowserCookiesSettingForYtDlp(value))
export const validateDownloadTimeRange = (start?: string, end?: string): void => sync(Effect.fromResult(Native.validateDownloadTimeRange(start, end)))
export const assertDownloadSourceUrl = (value: string): void => sync(Effect.fromResult(Native.assertDownloadSourceUrl(value)))
export const resolveSubtitleDownloadSkipReason = (options: Pick<Native.YtDlpDownloadOptions, 'type' | 'url'>, settings: Native.YtDlpDownloadSettings) => Native.resolveSubtitleDownloadSkipReason(options, settings, normalizeBrowserCookiesSettingForYtDlp(settings.browserForCookies))
export const resolvePathWithHome = (raw?: string | null): string | undefined => sync(Effect.map(Path.Path, path => Native.resolvePathWithHome(raw, os.homedir(), path)))
export const appendPlatformFilenameSafetyArgs = (args: string[], platform: NodeJS.Platform = process.platform): void => Native.appendPlatformFilenameSafetyArgs(args, platform)
export const resolveFfmpegLocationFromPath = (file: string): string => sync(Effect.map(Path.Path, path => Native.resolveFfmpegLocationFromPath(file, path)))
export const buildDownloadArgs = (...args: Parameters<typeof Native.buildDownloadArgs>): string[] => sync(Native.buildDownloadArgs(...args))
export const buildVideoInfoArgs = (...args: Parameters<typeof Native.buildVideoInfoArgs>): string[] => sync(Native.buildVideoInfoArgs(...args))
export const buildPlaylistInfoArgs = (...args: Parameters<typeof Native.buildPlaylistInfoArgs>): string[] => sync(Native.buildPlaylistInfoArgs(...args))
export const buildCaptionExtractArgs = (...args: Parameters<typeof Native.buildCaptionExtractArgs>): string[] => sync(Native.buildCaptionExtractArgs(...args))
// Keep opaque rejections distinct from native tagged failures, and stringify only at the retry predicate.
class RetryRejection {
  readonly original: unknown
  constructor(original: unknown) { this.original = original }
  toString(): string { return this.original instanceof Error ? this.original.message : String(this.original) }
}
const retryError = (cause: Parameters<typeof argumentError>[0]): unknown => {
  const error = argumentError(cause)
  return error instanceof RetryRejection ? error.original : error
}
export const retryTransientYtDlpNetworkError = <A>(run: () => Promise<A>, sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<A> => runLegacyPromise(argumentsRuntime, Native.retryTransientYtDlpNetworkError(() => Effect.tryPromise({ try: run, catch: error => new RetryRejection(error) })).pipe(Effect.provideService(DownloadTiming, { turn: () => Effect.void, sleep: milliseconds => Effect.tryPromise({ try: () => sleep(milliseconds), catch: error => new RetryRejection(error) }).pipe(Effect.orDie) })), retryError)


export const sanitizeFilenameTemplate = (template: string, fallbackTemplate?: string): string => fallbackTemplate === undefined ? Native.sanitizeFilenameTemplate(template) : Native.sanitizeFilenameTemplateWithFallback(template, fallbackTemplate)
