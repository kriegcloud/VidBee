import fs from 'node:fs'
import { basename } from 'node:path'

/** Keep a missing-binary oracle independent from generated packaged resources. */
export function hideBundledYtDlp(t: { after: (cleanup: () => void) => void }): void {
  const original = fs.existsSync
  const names = new Set(['yt-dlp_linux', 'yt-dlp_macos', 'yt-dlp.exe'])
  fs.existsSync = (file) => names.has(basename(String(file))) ? false : original(file)
  t.after(() => { fs.existsSync = original })
}
