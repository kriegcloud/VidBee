import { randomUUID } from 'node:crypto'
import { rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, parse, resolve } from 'node:path'
import type { BrowserWindow } from 'electron'
import type { SaveEditedImageRequest, SaveEditedImageResult } from '../../shared/types/media-assets'
import { invalidateMediaInventory, resolveMediaInventory } from './media-inventory'

export const saveEditedImage = async (
  req: SaveEditedImageRequest,
  parentWindow?: BrowserWindow
): Promise<SaveEditedImageResult> => {
  if (!['png', 'jpeg', 'webp'].includes(req.format)) {
    throw new Error('Unsupported edited image format')
  }
  if (!['copy', 'overwrite', 'save-as'].includes(req.mode)) {
    throw new Error('Unsupported edited image save mode')
  }
  if (!(isAbsolute(req.sourcePath) && (await stat(req.sourcePath)).isFile())) {
    throw new Error('Source must be an existing absolute file path')
  }
  const extension = req.format === 'jpeg' ? 'jpg' : req.format
  const sourceExtension = extname(req.sourcePath).slice(1).toLowerCase()
  const extensionMatches = sourceExtension === extension
  if (req.mode === 'overwrite' && !extensionMatches) {
    throw new Error(
      'Cannot overwrite an image with a different format extension; use copy or save-as'
    )
  }
  const stem = parse(req.sourcePath).name
  const directory = dirname(req.sourcePath)
  const defaultPath = join(directory, `${stem}_edited.${extension}`)
  const bytes = Buffer.from(req.data)
  let destination = defaultPath
  if (req.mode === 'copy') {
    for (let number = 1; ; number += 1) {
      destination = join(
        directory,
        `${stem}_edited${number === 1 ? '' : `-${number}`}.${extension}`
      )
      try {
        await writeFile(destination, bytes, { flag: 'wx' })
        break
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
          throw error
        }
      }
    }
  } else {
    if (req.mode === 'save-as') {
      const { dialog } = await import('electron')
      const options = {
        defaultPath,
        filters: [{ name: req.format.toUpperCase(), extensions: [extension] }]
      }
      const result = parentWindow
        ? await dialog.showSaveDialog(parentWindow, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) {
        return { path: null }
      }
      destination = result.filePath
    } else {
      destination = req.sourcePath
    }
    // Save-as may select the original, so retain the overwrite format guard.
    if (resolve(destination) === resolve(req.sourcePath) && !extensionMatches) {
      throw new Error('Cannot overwrite an image with a different format extension')
    }
    const temporary = join(dirname(destination), `.${parse(destination).base}.${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, bytes, { flag: 'wx' })
      await rename(temporary, destination)
    } finally {
      await rm(temporary, { force: true })
    }
  }
  invalidateMediaInventory()
  return { path: destination }
}

export const trashMediaAsset = async (downloadId: string, path: string): Promise<void> => {
  if (!isAbsolute(path)) {
    throw new Error('Asset path must be absolute')
  }
  invalidateMediaInventory(downloadId)
  const inventory = await resolveMediaInventory(downloadId)
  if (!inventory.assets.some((asset) => asset.path === resolve(path))) {
    throw new Error('Asset does not belong to this download')
  }
  const { shell } = await import('electron')
  await shell.trashItem(path)
  invalidateMediaInventory(downloadId)
}

export const copyImageToClipboard = async (path: string): Promise<void> => {
  const { clipboard, nativeImage } = await import('electron')
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) {
    throw new Error('Unable to load image for clipboard')
  }
  clipboard.writeImage(image)
}
