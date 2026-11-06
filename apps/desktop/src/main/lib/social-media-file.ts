import { existsSync } from 'node:fs'
import {
  type SocialAssetFile,
  selectPrimarySocialFile,
  socialManifestPostKeyPrefix
} from '@vidbee/downloader-core/social-media'
import type { Task } from '@vidbee/task-queue'
import DatabaseConstructor from 'better-sqlite3'
import log from 'electron-log/main'

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic'])
const AUDIO_EXTENSIONS = new Set(['m4a', 'mp3', 'aac', 'opus', 'ogg', 'wav', 'flac'])

// Completed social tasks never change their saved media, so one lookup per task suffices.
const resolved = new Map<string, string | null>()

/** Manifest asset keys end in `:<kind>`; fall back to the extension for aliases. */
const assetKind = (key: string, path: string): SocialAssetFile['kind'] => {
  const suffix = key.slice(key.lastIndexOf(':') + 1)
  if (suffix === 'image' || suffix === 'video' || suffix === 'audio') {
    return suffix
  }
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image'
  }
  return AUDIO_EXTENSIONS.has(extension) ? 'audio' : 'video'
}

/** Escape LIKE wildcards in a manifest key prefix. */
const likePrefix = (prefix: string): string => `${prefix.replace(/[\\%_]/g, '\\$&')}%`

const readPostAssets = (manifestPath: string, prefix: string): SocialAssetFile[] => {
  const db = new DatabaseConstructor(manifestPath, { readonly: true, fileMustExist: true })
  try {
    const rows = db
      .prepare("SELECT id, path FROM assets WHERE id LIKE ? ESCAPE '\\' ORDER BY id")
      .all(likePrefix(prefix)) as { id: string; path: string | null }[]
    return rows.flatMap((row) =>
      row.path && existsSync(row.path)
        ? [{ path: row.path, kind: assetKind(row.id, row.path) }]
        : []
    )
  } finally {
    db.close()
  }
}

/**
 * Find the media of a single social post whose run recorded only the shared
 * collection manifest as its output (runs before per-asset reporting).
 * Returns `null` for profiles/feeds, other task kinds and unreadable manifests.
 */
export const resolveLegacySocialMediaFile = (task: Readonly<Task>): string | null => {
  const output = task.output
  const manifestPath = output?.collectionSummary?.manifestPath
  if (
    task.kind !== 'social-media' ||
    task.status !== 'completed' ||
    !manifestPath ||
    output.filePath !== manifestPath
  ) {
    return null
  }
  const cached = resolved.get(task.id)
  if (cached !== undefined) {
    return cached
  }
  const prefix = socialManifestPostKeyPrefix(task.input.url)
  let filePath: string | null = null
  if (prefix && existsSync(manifestPath)) {
    try {
      filePath = selectPrimarySocialFile(readPostAssets(manifestPath, prefix))
    } catch (error) {
      log.warn('[social-media-file] failed to read collection manifest', error)
    }
  }
  resolved.set(task.id, filePath)
  return filePath
}
