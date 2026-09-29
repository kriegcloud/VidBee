import { ipcServices } from '@renderer/lib/ipc'
import type {
  MediaAsset,
  MediaInventory,
  MediaInventoryScope,
  MediaThumbnailResult,
  MediaThumbnailSize
} from '@shared/types/media-assets'
import { useCallback, useEffect, useState } from 'react'

const INVENTORY_TTL_MS = 15_000
const THUMBNAIL_CACHE_LIMIT = 4000

interface InventoryEntry {
  at: number
  promise: Promise<MediaInventory>
}

const inventoryCache = new Map<string, InventoryEntry>()
const thumbnailCache = new Map<string, Promise<MediaThumbnailResult>>()

/**
 * Fetch a download's media inventory, sharing one in-flight request per id.
 *
 * @param downloadId Download record id.
 * @param force Skip the short renderer cache (after an edit or trash).
 */
export const loadMediaInventory = (
  downloadId: string,
  force = false,
  scope: MediaInventoryScope = 'download'
): Promise<MediaInventory> => {
  const key = `${downloadId}|${scope}`
  const cached = inventoryCache.get(key)
  if (!force && cached && Date.now() - cached.at < INVENTORY_TTL_MS) {
    return cached.promise
  }
  const promise = ipcServices.media.getInventory(downloadId, scope) as Promise<MediaInventory>
  const entry = { at: Date.now(), promise }
  inventoryCache.set(key, entry)
  promise.catch(() => {
    if (inventoryCache.get(key) === entry) {
      inventoryCache.delete(key)
    }
  })
  return promise
}

export type MediaInventoryState =
  | { status: 'loading'; inventory: null; error: null }
  | { status: 'ready'; inventory: MediaInventory; error: null }
  | { status: 'error'; inventory: null; error: string }

/**
 * Subscribe a component to one download's inventory.
 *
 * @returns Current state plus a `reload` that bypasses the cache.
 */
export const useMediaInventory = (
  downloadId: string,
  scope: MediaInventoryScope = 'download'
): MediaInventoryState & { reload: () => void } => {
  const [state, setState] = useState<MediaInventoryState>({
    error: null,
    inventory: null,
    status: 'loading'
  })
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadMediaInventory(downloadId, generation > 0, scope)
      .then((inventory) => {
        if (!cancelled) {
          setState({ error: null, inventory, status: 'ready' })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            error: error instanceof Error ? error.message : String(error),
            inventory: null,
            status: 'error'
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [downloadId, generation, scope])

  const reload = useCallback(() => {
    setGeneration((value) => value + 1)
  }, [])

  return { ...state, reload }
}

const thumbnailKey = (asset: MediaAsset, size: MediaThumbnailSize): string =>
  `${asset.path}|${asset.mtimeMs}|${size}`

/**
 * Request a downsampled thumbnail once per asset and size for the renderer's lifetime.
 */
export const loadMediaThumbnail = (
  asset: MediaAsset,
  size: MediaThumbnailSize
): Promise<MediaThumbnailResult> => {
  const key = thumbnailKey(asset, size)
  const cached = thumbnailCache.get(key)
  if (cached) {
    return cached
  }
  if (thumbnailCache.size >= THUMBNAIL_CACHE_LIMIT) {
    const oldest = thumbnailCache.keys().next().value
    if (oldest !== undefined) {
      thumbnailCache.delete(oldest)
    }
  }
  const promise = (
    ipcServices.media.getThumbnail({
      mtimeMs: asset.mtimeMs,
      path: asset.path,
      size
    }) as Promise<MediaThumbnailResult>
  ).catch(() => ({ url: null }))
  thumbnailCache.set(key, promise)
  return promise
}

/**
 * Resolve an asset thumbnail URL; `undefined` while pending, `null` on failure.
 *
 * @param enabled Defer the request until the tile is actually on screen.
 */
export const useMediaThumbnail = (
  asset: MediaAsset | null,
  size: MediaThumbnailSize,
  enabled = true
): string | null | undefined => {
  const [url, setUrl] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!(asset && enabled)) {
      setUrl(undefined)
      return
    }
    let cancelled = false
    setUrl(undefined)
    loadMediaThumbnail(asset, size).then((result) => {
      if (!cancelled) {
        setUrl(result.url)
      }
    })
    return () => {
      cancelled = true
    }
  }, [asset, enabled, size])

  return url
}

/** Pick the smallest thumbnail bucket that stays sharp at this CSS size. */
export const thumbnailSizeFor = (cssPx: number): MediaThumbnailSize =>
  cssPx * (window.devicePixelRatio || 1) > 300 ? 512 : 256

export const isStillOrAnimated = (asset: MediaAsset): boolean =>
  asset.kind === 'image' || asset.kind === 'animated'

/** Drop cached thumbnails for one path after it was overwritten in place. */
export const forgetMediaThumbnails = (path: string): void => {
  for (const key of thumbnailCache.keys()) {
    if (key.startsWith(`${path}|`)) {
      thumbnailCache.delete(key)
    }
  }
}
