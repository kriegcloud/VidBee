const MAX_YTDLP_WRAP_DEFAULT_DEPTH = 3

/**
 * Unwrap CJS/ESM interop so `new` receives the yt-dlp-wrap-plus class.
 *
 * electron-vite externalizes `yt-dlp-wrap-plus` and compiles
 * `import Ctor from 'yt-dlp-wrap-plus'` to `require(...)`, which yields
 * `{ default: class }` instead of the class itself.
 */
export function resolveYtDlpWrapCtor<T extends new (binaryPath: string) => unknown>(
  exported: unknown
): T {
  let current: unknown = exported
  for (let depth = 0; depth < MAX_YTDLP_WRAP_DEFAULT_DEPTH; depth += 1) {
    if (typeof current === 'function') {
      return current as T
    }
    if (current && typeof current === 'object' && 'default' in current) {
      current = current.default
      continue
    }
    break
  }
  throw new TypeError('yt-dlp-wrap-plus did not export a constructor')
}
