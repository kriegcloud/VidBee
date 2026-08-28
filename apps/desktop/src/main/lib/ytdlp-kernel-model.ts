import { isAbsolute, relative, resolve } from 'node:path'

const HOUR_MS = 60 * 60 * 1000
const MAX_RETRY_DELAY_MS = 24 * HOUR_MS

/**
 * Return the official yt-dlp release asset name for a supported target.
 */
export function getYtDlpReleaseAssetName(platform: string): string {
  if (platform === 'win32') {
    return 'yt-dlp.exe'
  }
  if (platform === 'darwin') {
    return 'yt-dlp_macos'
  }
  if (platform === 'linux') {
    return 'yt-dlp_linux'
  }
  throw new Error(`Unsupported platform: ${platform}`)
}

/**
 * Compare yt-dlp versions such as `2026.06.09` and `2026.08.19.020253`.
 * Returns negative when `left` is older, zero when equal, and positive when newer.
 */
export function compareYtDlpVersions(left: string, right: string): number {
  const parseParts = (version: string): number[] =>
    version.split('.').map((part) => {
      const value = Number.parseInt(part, 10)
      return Number.isFinite(value) ? value : 0
    })
  const leftParts = parseParts(left)
  const rightParts = parseParts(right)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

/**
 * Return the persisted exponential retry delay for a one-based failure count.
 */
export function getRetryDelayMs(failureCount: number): number {
  const exponent = Math.max(0, Math.floor(failureCount) - 1)
  if (exponent >= 4) {
    return MAX_RETRY_DELAY_MS
  }
  return Math.min(2 ** exponent * HOUR_MS, MAX_RETRY_DELAY_MS)
}

/**
 * Resolve a state-file path while preventing absolute paths and traversal.
 */
export function resolveKernelRelativePath(kernelRoot: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error('Kernel state must contain a relative path')
  }

  const resolvedRoot = resolve(kernelRoot)
  const resolvedPath = resolve(resolvedRoot, relativePath)
  const pathFromRoot = relative(resolvedRoot, resolvedPath)
  if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
    throw new Error('Kernel state path resolves outside kernel root')
  }
  return resolvedPath
}
