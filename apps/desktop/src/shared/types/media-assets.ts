/**
 * Media inventory contract shared by the main process and renderer.
 *
 * A download record points at one path (or a directory, or a manifest). The
 * detail page needs the full list of files a download produced so it can pick
 * the right experience: the transcript player for a single audio/video file, or
 * the gallery for image-only and mixed downloads.
 */

/** Coarse file class used for layout, filtering, and viewer selection. */
export type MediaAssetKind = 'image' | 'animated' | 'video' | 'audio'

/** One file produced by a download. */
export interface MediaAsset {
  /** Stable id within the inventory: sha1 of the absolute path, hex, 16 chars. */
  id: string
  /** Absolute filesystem path. */
  path: string
  /** Basename including extension. */
  fileName: string
  /** Lowercase extension without the dot, e.g. `jpg`. */
  ext: string
  kind: MediaAssetKind
  /** Bytes on disk. */
  size: number
  /** Last-modified time, epoch ms. Part of the thumbnail cache key. */
  mtimeMs: number
  /** Pixel dimensions when already known (manifest or probe). */
  width?: number
  height?: number
  /** Duration for video/audio when already known. */
  durationMs?: number
}

/**
 * How the detail page should present a download.
 *
 * - `av`: exactly one audio/video asset and no images → transcript player.
 * - `image`: exactly one still/animated image.
 * - `gallery`: two or more images, no video/audio.
 * - `mixed`: images plus at least one video/audio file.
 * - `missing`: the record's files could not be found on disk.
 */
export type MediaPresentation = 'av' | 'image' | 'gallery' | 'mixed' | 'missing'

/** Where the inventory came from, for diagnostics and the info panel. */
export type MediaInventorySource =
  | 'single-file'
  | 'post-group'
  | 'social-manifest'
  | 'sidecar-manifest'
  | 'directory-scan'
  | 'none'

/**
 * - `download`: only the files this download produced.
 * - `folder`: everything in the download's folder (for batch members that share one).
 */
export type MediaInventoryScope = 'download' | 'folder'

export interface MediaInventory {
  downloadId: string
  scope: MediaInventoryScope
  /**
   * True when this download is one post inside a folder shared by a batch (e.g. an
   * Instagram profile's Posts folder), so the UI can offer the whole folder.
   */
  folderScopeAvailable: boolean
  presentation: MediaPresentation
  source: MediaInventorySource
  /** Root folder of the download, when one exists. */
  rootDirectory: string | null
  /** Sorted by natural file-name order within the root (stable across calls). */
  assets: MediaAsset[]
  /** True when the directory scan hit the asset cap and stopped early. */
  truncated: boolean
  counts: Record<MediaAssetKind, number>
  totalSize: number
}

/** Requested thumbnail edge length in CSS px; the main process snaps to a bucket. */
export type MediaThumbnailSize = 256 | 512

export interface MediaThumbnailRequest {
  path: string
  /** Must equal the asset's `mtimeMs`; used as part of the cache key. */
  mtimeMs: number
  size: MediaThumbnailSize
}

export interface MediaThumbnailResult {
  /** `vidbee://media-thumbs/<key>.webp`, or null when generation failed. */
  url: string | null
  /** Source dimensions discovered while generating, when available. */
  width?: number
  height?: number
}

/** Encoded image formats the editor can write. */
export type EditedImageFormat = 'png' | 'jpeg' | 'webp'

/**
 * - `copy`: write `<stem>_edited[-N].<ext>` next to the source.
 * - `overwrite`: atomically replace the source (temp file + rename).
 * - `save-as`: native save dialog, default name `<stem>_edited.<ext>`.
 */
export type EditedImageSaveMode = 'copy' | 'overwrite' | 'save-as'

export interface SaveEditedImageRequest {
  sourcePath: string
  data: ArrayBuffer
  format: EditedImageFormat
  mode: EditedImageSaveMode
}

export interface SaveEditedImageResult {
  /** Written path, or null when the user cancelled a save-as dialog. */
  path: string | null
}
