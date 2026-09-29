import { BrowserWindow } from 'electron'
import { type IpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator'
import type {
  MediaInventory,
  MediaInventoryScope,
  MediaThumbnailRequest,
  MediaThumbnailResult,
  SaveEditedImageRequest,
  SaveEditedImageResult
} from '../../../shared/types/media-assets'
import { copyImageToClipboard, saveEditedImage, trashMediaAsset } from '../../lib/media-files'
import { resolveMediaInventory } from '../../lib/media-inventory'
import { getMediaThumbnail } from '../../lib/media-thumbnails'
import { startDesktopTaskQueue } from '../../lib/task-queue-host'

class MediaService extends IpcService {
  static readonly groupName = 'media'

  @IpcMethod()
  async getInventory(
    _context: IpcContext,
    downloadId: string,
    scope: MediaInventoryScope = 'download'
  ): Promise<MediaInventory> {
    // The task lookup needs a started queue; otherwise every record resolves as missing.
    await startDesktopTaskQueue()
    return resolveMediaInventory(downloadId, scope === 'folder' ? 'folder' : 'download')
  }

  @IpcMethod()
  getThumbnail(_context: IpcContext, req: MediaThumbnailRequest): Promise<MediaThumbnailResult> {
    return getMediaThumbnail(req)
  }

  @IpcMethod()
  saveEditedImage(
    context: IpcContext,
    req: SaveEditedImageRequest
  ): Promise<SaveEditedImageResult> {
    return saveEditedImage(req, BrowserWindow.fromWebContents(context.sender) ?? undefined)
  }

  @IpcMethod()
  trashAsset(_context: IpcContext, input: { downloadId: string; path: string }): Promise<void> {
    return trashMediaAsset(input.downloadId, input.path)
  }

  @IpcMethod()
  copyImageToClipboard(_context: IpcContext, path: string): Promise<void> {
    return copyImageToClipboard(path)
  }
}

export { MediaService }
