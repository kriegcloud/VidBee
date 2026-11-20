import * as Core from '../../transcription/src/download-mirrors'
import { detectSystemProfile } from '@vidbee/i18n/legacy/system-locale'

export const DOWNLOAD_MIRROR_IDS = ['auto', 'cn', 'global'] as const

export type DownloadMirror = (typeof DOWNLOAD_MIRROR_IDS)[number]

export const DEFAULT_DOWNLOAD_MIRROR: DownloadMirror = 'auto'

/** GitHub release/API proxies that work from mainland China. Keep in sync with desktop scripts/github-mirrors.js. */
export const GITHUB_MIRROR_PREFIXES = ['https://ghfast.top/', 'https://gh-proxy.com/'] as const

export interface MirrorDecisionInput {
  countryCode?: string
  env?: NodeJS.ProcessEnv
  language?: string
  locales?: readonly string[]
  mirror?: string
  timeZone?: string
}

export interface ModelDownloadSpec {
  fileName: string
  url: string
}

/**
 * Return true when the value is a known download-mirror setting.
 */
export const isDownloadMirror = (value: unknown): value is DownloadMirror =>
  { return Core.isDownloadMirror(value) }

/**
 * Coerce an unknown setting/env value to a download-mirror id.
 */
export const parseDownloadMirror = (
  value: unknown,
  fallback: DownloadMirror = DEFAULT_DOWNLOAD_MIRROR
): DownloadMirror => Core.parseDownloadMirror(value, fallback)

/**
 * True when mainland-China mirrors should be tried first.
 *
 * Uses the same system-language + timezone profile as first-run UI language.
 */
export const preferChinaMirrors = (input: MirrorDecisionInput = {}): boolean => {
  const env = input.env ?? process.env
  const fromEnv = parseDownloadMirror(env.VIDBEE_DOWNLOAD_MIRROR, DEFAULT_DOWNLOAD_MIRROR)
  if (fromEnv === 'cn') {
    return true
  }
  if (fromEnv === 'global') {
    return false
  }
  const fromSetting = parseDownloadMirror(input.mirror)
  if (fromSetting === 'cn') {
    return true
  }
  if (fromSetting === 'global') {
    return false
  }
  return detectSystemProfile({
    countryCode: input.countryCode,
    env,
    locales: input.locales ?? (input.language ? [input.language] : undefined),
    timeZone: input.timeZone
  }).preferChina
}

/**
 * True when the URL is a GitHub release, API, or user-content download.
 */
export const isGithubDownloadUrl = (url: string): boolean => { return Core.isGithubDownloadUrl(url) }

/**
 * Official URL plus GitHub proxies. China-first when `preferChina` is set.
 */
export const githubDownloadUrls = (url: string, preferChina = false): string[] => { return Core.githubDownloadUrls(Boolean(preferChina))(url) }

/**
 * ModelScope resolve URL for one extracted sherpa-onnx file, when a mapping exists.
 */
export const modelScopeFileUrl = (spec: ModelDownloadSpec): string | null => { return Core.modelScopeFileUrl(spec) }

/**
 * Ordered download candidates for one catalog file: ModelScope and/or GitHub mirrors.
 */
export const modelDownloadUrls = (spec: ModelDownloadSpec, preferChina = false): string[] => { return Core.modelDownloadUrls(Boolean(preferChina))(spec) }

/**
 * Fetch the first URL that returns an OK response. User abort is not retried.
 */
export const fetchFirstOk = async (
  urls: readonly string[],
  fetchImpl: typeof fetch,
  init?: RequestInit,
  timeoutMs = 15_000
): Promise<{ response: Response; url: string }> => {
  let lastError: unknown = new Error('no download URLs')
  for (const url of urls) {
    if (init?.signal?.aborted) {
      throw abortError(init.signal)
    }
    const attempt = new AbortController()
    const onUserAbort = () => attempt.abort(init?.signal?.reason)
    init?.signal?.addEventListener('abort', onUserAbort)
    const timer = setTimeout(() => {
      attempt.abort(
        Object.assign(new Error(`download timed out: ${url}`), { name: 'TimeoutError' })
      )
    }, timeoutMs)
    try {
      const response = await fetchImpl(url, { ...init, signal: attempt.signal })
      if (response.ok) {
        return { response, url }
      }
      lastError = new Error(`download failed for ${url} (${response.status})`)
    } catch (error) {
      if (init?.signal?.aborted) {
        throw abortError(init.signal)
      }
      lastError = error
    } finally {
      clearTimeout(timer)
      init?.signal?.removeEventListener('abort', onUserAbort)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * Wrap `fetch` so GitHub URLs automatically try China-friendly mirrors.
 */
export const createGithubMirrorFetch = (
  fetchImpl: typeof fetch,
  preferChina: () => boolean,
  timeoutMs = 15_000
): typeof fetch => {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const urls = githubDownloadUrls(url, preferChina())
    const { response } = await fetchFirstOk(urls, fetchImpl, init, timeoutMs)
    return response
  }
}

/**
 * Rebuild a cancelled error that matches the caller's abort reason.
 */
const abortError = (signal: AbortSignal): Error => {
  if (signal.reason instanceof Error) {
    return signal.reason
  }
  return Object.assign(new Error('download cancelled'), { name: 'AbortError' })
}
