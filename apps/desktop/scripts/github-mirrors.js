/**
 * GitHub download mirrors for mainland China. Keep prefixes in sync with
 * packages/transcription/src/download-mirrors.ts.
 */

export const GITHUB_MIRROR_PREFIXES = ['https://ghfast.top/', 'https://gh-proxy.com/']

const CHINA_TIME_ZONES = new Set([
  'Asia/Shanghai',
  'Asia/Chongqing',
  'Asia/Urumqi',
  'Asia/Harbin',
  'Asia/Kashgar',
  'Asia/Urumchi'
])

/**
 * True when the URL is a GitHub release, API, or user-content download.
 */
export function isGithubDownloadUrl(url) {
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
 * True when setup scripts should try China-friendly GitHub proxies first.
 */
export function detectPreferChina() {
  const env = process.env.VIDBEE_DOWNLOAD_MIRROR
  if (env === 'cn') {
    return true
  }
  if (env === 'global') {
    return false
  }
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (CHINA_TIME_ZONES.has(timeZone)) {
      return true
    }
  } catch {
    // Intl is always present on Node 22; ignore isolated test doubles.
  }
  const locale = `${process.env.LANG || ''} ${process.env.LC_ALL || ''}`
  if (/zh[-_]?(tw|hk|mo|hant)/i.test(locale)) {
    return false
  }
  return /(?:^|[._-])zh(?:[-_]?(?:cn|hans))?(?:[._-]|$)/i.test(locale)
}

/**
 * Official URL plus GitHub proxies. China-first when detected or requested.
 */
export function expandGithubMirrors(url, preferChina = detectPreferChina()) {
  if (!isGithubDownloadUrl(url)) {
    return [url]
  }
  const mirrors = GITHUB_MIRROR_PREFIXES.map((prefix) => `${prefix}${url}`)
  return preferChina ? [...mirrors, url] : [url, ...mirrors]
}
