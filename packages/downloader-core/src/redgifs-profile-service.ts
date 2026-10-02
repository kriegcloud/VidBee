import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { SourceAdmission } from '@vidbee/task-queue/source-admission'
import { redGifsWatchUrl } from './mapped-profile-source'
import type { SocialMappedItem } from './social-media-service'

interface RedGifsEntry {
  id?: unknown
  title?: unknown
  extractor_key?: unknown
}

/** yt-dlp exposes CDN URLs in flat entries; save only canonical watch pages. */
export const mapRedGifsProfile = async (
  url: string,
  resolveYtDlpPath: () => string,
  admission: SourceAdmission | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => void
): Promise<{ complete: boolean; error?: string }> => {
  const owner = new URL(url).pathname.split('/')[2] ?? 'redgifs'
  const release = await admission?.acquire(url, signal)
  try {
    if (signal.aborted) {
      return { complete: false }
    }
    const child = spawn(
      resolveYtDlpPath(),
      ['--ignore-config', '--flat-playlist', '--dump-json', '--no-progress', url],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const closed = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code) => resolve(code))
    })
    const abort = () => child.kill('SIGTERM')
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
    }
    try {
      for await (const line of createInterface({ input: child.stdout })) {
        if (signal.aborted || line.length > 100_000) {
          continue
        }
        let entry: RedGifsEntry
        try {
          entry = JSON.parse(line) as RedGifsEntry
        } catch {
          continue
        }
        const postUrl = typeof entry.id === 'string' ? redGifsWatchUrl(entry.id) : null
        if (entry.extractor_key !== 'RedGifs' || !postUrl) {
          continue
        }
        onItem({
          id: entry.id as string,
          url: postUrl,
          author: owner,
          images: 0,
          videos: 1,
          title: typeof entry.title === 'string' ? entry.title : undefined
        })
      }
      const exitCode = await closed
      if (signal.aborted) {
        return { complete: false }
      }
      return exitCode === 0
        ? { complete: true }
        : { complete: false, error: 'Redgifs mapping stopped before traversal completed.' }
    } finally {
      signal.removeEventListener('abort', abort)
      if (child.exitCode === null) {
        child.kill('SIGTERM')
      }
    }
  } finally {
    release?.()
  }
}
