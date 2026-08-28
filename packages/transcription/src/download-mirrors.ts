import { detectSystemProfile } from '@vidbee/i18n/system-locale'

export const DOWNLOAD_MIRROR_IDS = ['auto', 'cn', 'global'] as const

export type DownloadMirror = (typeof DOWNLOAD_MIRROR_IDS)[number]

export const DEFAULT_DOWNLOAD_MIRROR: DownloadMirror = 'auto'

/** GitHub release/API proxies that work from mainland China. Keep in sync with desktop scripts/github-mirrors.js. */
export const GITHUB_MIRROR_PREFIXES = ['https://ghfast.top/', 'https://gh-proxy.com/'] as const

const MODELSCOPE_RESOLVE = 'https://www.modelscope.cn/models'

/**
 * Official sherpa-onnx files mirrored on ModelScope as extracted files (not the GitHub tar).
 * Keys are the on-disk model directory, or the bare file name for single-file assets.
 */
const MODELSCOPE_DIR_REPOS: Readonly<Record<string, string>> = {
  'sherpa-onnx-whisper-tiny': 'pengzhendong/sherpa-onnx-whisper-tiny',
  'sherpa-onnx-whisper-base': 'pengzhendong/sherpa-onnx-whisper-base',
  'sherpa-onnx-whisper-small': 'pengzhendong/sherpa-onnx-whisper-small',
  'sherpa-onnx-whisper-medium': 'pengzhendong/sherpa-onnx-whisper-medium',
  'sherpa-onnx-whisper-turbo': 'pengzhendong/sherpa-onnx-whisper-turbo',
  'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17':
    'pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue',
  'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09':
    'aistoy/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09',
  'sherpa-onnx-pyannote-segmentation-3-0': 'pengzhendong/sherpa-onnx-pyannote-segmentation-3-0',
  'sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25':
    'jkman2023/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25',
  'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8':
    'liaowenbin/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8'
}

const MODELSCOPE_FILE_REPOS: Readonly<Record<string, string>> = {
  'silero_vad.onnx': 'liaowenbin/silero_vad',
  '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx':
    'liaowenbin/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k'
}

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
  typeof value === 'string' && (DOWNLOAD_MIRROR_IDS as readonly string[]).includes(value)

/**
 * Coerce an unknown setting/env value to a download-mirror id.
 */
export const parseDownloadMirror = (
  value: unknown,
  fallback: DownloadMirror = DEFAULT_DOWNLOAD_MIRROR
): DownloadMirror => (isDownloadMirror(value) ? value : fallback)

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
export const isGithubDownloadUrl = (url: string): boolean => {
  try {
    const host = new URL(url).hostname
    return (
      host === 'github.com' || host === 'api.github.com' || host.endsWith('.githubusercontent.com')
    )
  } catch {
    return false
  }
}

/**
 * Official URL plus GitHub proxies. China-first when `preferChina` is set.
 */
export const githubDownloadUrls = (url: string, preferChina = false): string[] => {
  if (!isGithubDownloadUrl(url)) {
    return [url]
  }
  const mirrors = GITHUB_MIRROR_PREFIXES.map((prefix) => `${prefix}${url}`)
  return uniqueUrls(preferChina ? [...mirrors, url] : [url, ...mirrors])
}

/**
 * ModelScope resolve URL for one extracted sherpa-onnx file, when a mapping exists.
 */
export const modelScopeFileUrl = (spec: ModelDownloadSpec): string | null => {
  const parts = spec.fileName.split(/[/\\]/).filter(Boolean)
  const baseName = parts.at(-1)
  if (!baseName?.includes('.') || baseName === 'tokenizer') {
    return null
  }
  const fileRepo = MODELSCOPE_FILE_REPOS[baseName]
  if (fileRepo) {
    return `${MODELSCOPE_RESOLVE}/${fileRepo}/resolve/master/${encodeURIComponent(baseName)}`
  }
  const dir = parts.length > 1 ? parts[0] : null
  const dirRepo = dir ? MODELSCOPE_DIR_REPOS[dir] : null
  if (!dirRepo) {
    return null
  }
  return `${MODELSCOPE_RESOLVE}/${dirRepo}/resolve/master/${encodeURIComponent(baseName)}`
}

/**
 * Ordered download candidates for one catalog file: ModelScope and/or GitHub mirrors.
 */
export const modelDownloadUrls = (spec: ModelDownloadSpec, preferChina = false): string[] => {
  const modelscope = modelScopeFileUrl(spec)
  const github = githubDownloadUrls(spec.url, preferChina)
  return uniqueUrls(preferChina ? [modelscope, ...github] : [...github, modelscope])
}

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
 * Drop nulls and keep the first occurrence of each URL.
 */
const uniqueUrls = (urls: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const url of urls) {
    if (!url || seen.has(url)) {
      continue
    }
    seen.add(url)
    out.push(url)
  }
  return out
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
