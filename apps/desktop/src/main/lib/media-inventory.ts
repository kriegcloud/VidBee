import { createHash } from 'node:crypto'
import { opendir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import type { Task } from '@vidbee/task-queue'
import Database from 'better-sqlite3'
import type {
  MediaAsset,
  MediaAssetKind,
  MediaInventory,
  MediaInventoryScope,
  MediaInventorySource,
  MediaPresentation
} from '../../shared/types/media-assets'
import { getDesktopTaskQueueRef } from './queue-ref'

const extensions: Record<MediaAssetKind, ReadonlySet<string>> = {
  image: new Set('jpg jpeg png webp avif bmp heic heif tif tiff jxl'.split(' ')),
  animated: new Set(['gif', 'apng']),
  video: new Set('mp4 m4v mov webm mkv avi flv ts'.split(' ')),
  audio: new Set('mp3 m4a aac opus ogg flac wav'.split(' '))
}
const collator = new Intl.Collator(undefined, { numeric: true })
const cache = new Map<string, { expires: number; value: MediaInventory }>()
const legacyGalleryKinds = new Set([
  'gallery',
  'social',
  'social-media',
  'instagram-profile-category',
  'vsco-gallery',
  'facebook-gallery',
  'tiktok-photo',
  'threads-post',
  'threads-profile'
])
const ASSET_CAP = 5000
let generation = 0

export const classifyMediaPath = (path: string): MediaAssetKind | undefined => {
  const ext = extname(path).slice(1).toLowerCase()
  return (Object.keys(extensions) as MediaAssetKind[]).find((kind) => extensions[kind].has(ext))
}

export const mediaPresentation = (
  assets: readonly Pick<MediaAsset, 'kind'>[]
): MediaPresentation => {
  if (!assets.length) {
    return 'missing'
  }
  const images = assets.filter(
    (asset) => asset.kind === 'image' || asset.kind === 'animated'
  ).length
  if (images && images < assets.length) {
    return 'mixed'
  }
  // The contract has no separate AV-collection presentation; use the gallery.
  if (assets.length > 1) {
    return 'gallery'
  }
  return images ? 'image' : 'av'
}

export const invalidateMediaInventory = (downloadId?: string): void => {
  generation += 1
  if (downloadId) {
    cache.delete(`${downloadId}|download`)
    cache.delete(`${downloadId}|folder`)
  } else {
    cache.clear()
  }
}

const readAsset = async (
  path: string,
  dimensions?: { width?: number; height?: number }
): Promise<MediaAsset | null> => {
  const absolute = resolve(path)
  const kind = classifyMediaPath(absolute)
  if (!kind) {
    return null
  }
  try {
    const info = await stat(absolute)
    if (!info.isFile()) {
      return null
    }
    return {
      id: createHash('sha1').update(absolute).digest('hex').slice(0, 16),
      path: absolute,
      fileName: basename(absolute),
      ext: extname(absolute).slice(1).toLowerCase(),
      kind,
      size: info.size,
      mtimeMs: info.mtimeMs,
      ...dimensions
    }
  } catch {
    return null
  }
}

const readSocialManifest = async (manifest: string, root: string): Promise<MediaAsset[] | null> => {
  try {
    if (!(await stat(manifest)).isFile()) {
      return null
    }
  } catch {
    return null
  }
  let db: Database.Database | undefined
  try {
    db = new Database(manifest, { readonly: true, fileMustExist: true })
    const rows = db.prepare('SELECT path, size, width, height FROM assets').all() as {
      path: string
      width: number | null
      height: number | null
    }[]
    const assets: MediaAsset[] = []
    for (const row of rows) {
      if (typeof row.path !== 'string') {
        continue
      }
      const asset = await readAsset(resolve(root, row.path), {
        width: row.width && row.width > 0 ? row.width : undefined,
        height: row.height && row.height > 0 ? row.height : undefined
      })
      if (asset) {
        assets.push(asset)
      }
    }
    return assets
  } catch {
    return null
  } finally {
    db?.close()
  }
}

const readSidecar = async (filePath: string): Promise<MediaAsset[] | null> => {
  try {
    const manifest: unknown = JSON.parse(await readFile(`${filePath}.manifest.json`, 'utf8'))
    if (
      !(
        manifest &&
        typeof manifest === 'object' &&
        'files' in manifest &&
        Array.isArray(manifest.files)
      )
    ) {
      return null
    }
    const assets: MediaAsset[] = []
    for (const path of manifest.files) {
      if (typeof path !== 'string') {
        continue
      }
      const asset = await readAsset(resolve(dirname(filePath), path))
      if (asset) {
        assets.push(asset)
      }
    }
    return assets
  } catch {
    return null
  }
}

const scanDirectory = async (
  root: string
): Promise<{ assets: MediaAsset[]; truncated: boolean }> => {
  const assets: MediaAsset[] = []
  let truncated = false
  const visit = async (directory: string, depth: number): Promise<void> => {
    try {
      const entries = await opendir(directory)
      for await (const entry of entries) {
        if (entry.name.startsWith('.')) {
          continue
        }
        const path = join(directory, entry.name)
        if (entry.isDirectory() && depth < 4) {
          await visit(path, depth + 1)
        }
        if (assets.length >= ASSET_CAP) {
          truncated = true
          return
        }
        if (entry.isFile()) {
          const asset = await readAsset(path)
          if (asset) {
            assets.push(asset)
          }
        }
        if (assets.length >= ASSET_CAP) {
          truncated = true
          return
        }
      }
    } catch {
      /* Unreadable subdirectories do not hide other assets. */
    }
  }
  await visit(root, 0)
  return { assets, truncated }
}

const RUN_WINDOW_SLACK_MS = 5000

/**
 * Generic social downloads write one manifest at the download root, shared by
 * every run. The schema has no asset→run link, so when the manifest lives at the
 * task's shared download root, keep only files written during this run's window.
 */
const scopeSharedManifest = (
  assets: MediaAsset[],
  root: string | null,
  task: Readonly<Task> | undefined
): MediaAsset[] => {
  const options = (task?.input.options ?? {}) as Record<string, unknown>
  const settings = (options.settings ?? {}) as Record<string, unknown>
  const downloadRoot = [
    options.customDownloadPath,
    options.downloadPath,
    settings.downloadPath
  ].find((value): value is string => typeof value === 'string' && value.length > 0)
  if (!(root && downloadRoot) || resolve(downloadRoot) !== resolve(root)) {
    return assets
  }
  const summary = task?.output?.collectionSummary as
    | { startedAt?: number; finishedAt?: number }
    | undefined
  if (!(summary?.startedAt && summary.finishedAt)) {
    return assets
  }
  const from = summary.startedAt - RUN_WINDOW_SLACK_MS
  const to = summary.finishedAt + RUN_WINDOW_SLACK_MS
  return assets.filter((asset) => asset.mtimeMs >= from && asset.mtimeMs <= to)
}

/** Resolve a raw record without loading the desktop database or Electron in tests. */
const DATED_FILE = /^(\d{4}-\d{2}-\d{2})_/

/**
 * Pick one post's files out of a folder shared by a batch.
 *
 * Instagram batch items write `{date}_{media_id}.{ext}` into one shared folder and
 * persist only the first file, so a carousel is recovered as the files sharing the
 * first file's date; when several posts share that day, keep the `fileCount` files
 * whose mtimes sit closest to the first file's (gallery-dl stamps post time).
 */
export const groupPostAssets = (
  assets: readonly MediaAsset[],
  firstFilePath: string,
  fileCount: number | undefined
): MediaAsset[] | null => {
  const firstName = basename(firstFilePath)
  const day = DATED_FILE.exec(firstName)?.[1]
  const folder = dirname(resolve(firstFilePath))
  if (!day) {
    return null
  }
  const sameDay = assets.filter(
    (asset) => dirname(asset.path) === folder && asset.fileName.startsWith(`${day}_`)
  )
  const first = sameDay.find((asset) => asset.fileName === firstName)
  if (!first) {
    return null
  }
  if (!fileCount || sameDay.length <= fileCount) {
    return sameDay
  }
  const nearest = [...sameDay]
    .sort((a, b) => Math.abs(a.mtimeMs - first.mtimeMs) - Math.abs(b.mtimeMs - first.mtimeMs))
    .slice(0, fileCount)
  return nearest.includes(first) ? nearest : [first, ...nearest.slice(0, fileCount - 1)]
}

const isBatchMember = (task: Readonly<Task> | undefined): boolean => {
  const options = (task?.input.options ?? {}) as Record<string, unknown>
  return typeof options.batchId === 'string' && options.batchId.length > 0
}

export const resolveTaskMediaInventory = async (
  downloadId: string,
  task?: Readonly<Task>,
  scope: MediaInventoryScope = 'download'
): Promise<MediaInventory> => {
  const options = task?.input.options ?? {}
  const optionDirectory =
    typeof options.customDownloadPath === 'string'
      ? options.customDownloadPath
      : options.downloadPath
  const fallback =
    typeof optionDirectory === 'string' && typeof options.savedFileName === 'string'
      ? join(optionDirectory, options.savedFileName)
      : undefined
  const filePath = task?.output?.filePath || fallback
  const outputDirectory = task?.output?.outputDirectory
  let root = outputDirectory
    ? resolve(outputDirectory)
    : filePath
      ? dirname(resolve(filePath))
      : null
  let source: MediaInventorySource = 'none'
  let assets: MediaAsset[] = []
  let truncated = false
  const isManifest =
    filePath &&
    basename(filePath) === 'social-media.sqlite' &&
    basename(dirname(filePath)) === '.vidbee'
  if (isManifest) {
    root = dirname(dirname(resolve(filePath)))
  }
  const manifest = isManifest
    ? filePath
    : outputDirectory
      ? join(outputDirectory, '.vidbee', 'social-media.sqlite')
      : undefined
  const manifestAssets = manifest && root ? await readSocialManifest(manifest, root) : null
  const social = manifestAssets ? scopeSharedManifest(manifestAssets, root, task) : null
  const sidecar = !social && filePath ? await readSidecar(filePath) : null
  if (social) {
    assets = social
    source = 'social-manifest'
  } else if (sidecar) {
    assets = sidecar
    source = 'sidecar-manifest'
  } else if (
    filePath &&
    (!outputDirectory || (task?.output?.fileCount ?? Number.POSITIVE_INFINITY) <= 1)
  ) {
    const asset = await readAsset(filePath)
    if (asset) {
      assets = [asset]
      source = 'single-file'
    }
  }
  // A task that names one media file (e.g. one OnlyFans photo in a shared creator folder)
  // owns that file only: if it is gone the download is missing, not "the whole folder".
  const namesSingleMediaFile =
    Boolean(filePath) &&
    !isManifest &&
    classifyMediaPath(filePath as string) !== undefined &&
    (task?.output?.fileCount ?? 1) <= 1
  if (
    source === 'none' &&
    root &&
    !namesSingleMediaFile &&
    (outputDirectory || (task && legacyGalleryKinds.has(task.kind)))
  ) {
    const scanned = await scanDirectory(root)
    assets = scanned.assets
    truncated = scanned.truncated
    source = 'directory-scan'
  }
  let folderScopeAvailable = false
  if (source === 'directory-scan' && filePath && isBatchMember(task)) {
    const group = groupPostAssets(assets, filePath, task?.output?.fileCount)
    if (group && group.length < assets.length) {
      folderScopeAvailable = true
      if (scope === 'download') {
        assets = group
        truncated = false
        source = 'post-group'
      }
    }
  }
  assets = [...new Map(assets.map((asset) => [asset.path, asset])).values()]
  assets.sort((a, b) =>
    collator.compare(relative(root ?? '', a.path), relative(root ?? '', b.path))
  )
  const counts = { image: 0, animated: 0, video: 0, audio: 0 }
  let totalSize = 0
  for (const asset of assets) {
    counts[asset.kind] += 1
    totalSize += asset.size
  }
  return {
    downloadId,
    scope: folderScopeAvailable ? scope : 'download',
    folderScopeAvailable,
    presentation: mediaPresentation(assets),
    source: assets.length ? source : 'none',
    rootDirectory: root,
    assets,
    truncated,
    counts,
    totalSize
  }
}

export const resolveMediaInventory = async (
  downloadId: string,
  scope: MediaInventoryScope = 'download'
): Promise<MediaInventory> => {
  const cacheKey = `${downloadId}|${scope}`
  const hit = cache.get(cacheKey)
  if (hit && hit.expires > Date.now()) {
    return hit.value
  }
  const startedGeneration = generation
  const value = await resolveTaskMediaInventory(
    downloadId,
    getDesktopTaskQueueRef().get(downloadId) ?? undefined,
    scope
  )
  if (generation === startedGeneration) {
    cache.delete(cacheKey)
    if (cache.size >= 64) {
      const oldest = cache.keys().next().value
      if (oldest) {
        cache.delete(oldest)
      }
    }
    cache.set(cacheKey, { expires: Date.now() + 20_000, value })
  }
  return value
}
