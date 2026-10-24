import { type IpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator'
import { type LocalPosterRequest, localPosterCache } from '../../lib/local-poster'
import { thumbnailCache } from '../../lib/thumbnail-cache'

class ThumbnailService extends IpcService {
  static readonly groupName = 'thumbnail'

  @IpcMethod()
  async getThumbnailPath(
    _context: IpcContext,
    url: string | null | undefined
  ): Promise<string | null> {
    if (!url) {
      return null
    }

    return thumbnailCache.getThumbnailUrl(url)
  }

  /**
   * Poster rendered from the media this task saved, for the sites that hand us
   * no thumbnail URL of their own.
   */
  @IpcMethod()
  async getLocalPoster(
    _context: IpcContext,
    request: LocalPosterRequest | null | undefined
  ): Promise<string | null> {
    if (!(request?.filePath || request?.directory)) {
      return null
    }

    return localPosterCache.getPosterUrl(request)
  }
}

export { ThumbnailService }
