import type {
  InstagramProfileCategory,
  InstagramProfileDownloadInput,
  InstagramProfileDownloadResult,
  InstagramProfileInspection
} from '@vidbee/downloader-core'
import type { SocialMediaDownloadRequest } from '@vidbee/downloader-core/social-media-service'
import { type IpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator'
import type {
  DownloadItem,
  DownloadOptions,
  PlaylistDownloadOptions,
  PlaylistDownloadResult,
  PlaylistInfo,
  VideoInfo,
  VideoInfoCommandResult
} from '../../../shared/types'
import { downloadEngine } from '../../lib/download-facade'

class DownloadService extends IpcService {
  static readonly groupName = 'download'

  @IpcMethod()
  inspectSocialMedia(_context: IpcContext, url: string) {
    return downloadEngine.inspectSocialMedia(url)
  }

  @IpcMethod()
  downloadSocialMedia(_context: IpcContext, request: SocialMediaDownloadRequest) {
    return downloadEngine.downloadSocialMedia(request)
  }

  @IpcMethod()
  async getVideoInfo(_context: IpcContext, url: string): Promise<VideoInfo> {
    return downloadEngine.getVideoInfo(url)
  }

  @IpcMethod()
  resolveUrl(_context: IpcContext, url: string): Promise<string> {
    return downloadEngine.resolveUrl(url)
  }

  @IpcMethod()
  async getVideoInfoWithCommand(
    _context: IpcContext,
    url: string
  ): Promise<VideoInfoCommandResult> {
    return downloadEngine.getVideoInfoWithCommand(url)
  }

  @IpcMethod()
  async getPlaylistInfo(_context: IpcContext, url: string): Promise<PlaylistInfo> {
    return downloadEngine.getPlaylistInfo(url)
  }

  @IpcMethod()
  listInstagramProfiles(_context: IpcContext) {
    return downloadEngine.listInstagramProfiles()
  }

  @IpcMethod()
  cancelInstagramProfileMapping(_context: IpcContext, url: string): boolean {
    return downloadEngine.cancelInstagramProfileMapping(url)
  }

  @IpcMethod()
  async inspectInstagramProfile(
    _context: IpcContext,
    url: string,
    categories?: InstagramProfileCategory[]
  ): Promise<InstagramProfileInspection> {
    return downloadEngine.inspectInstagramProfile(url, categories)
  }

  @IpcMethod()
  startDownload(_context: IpcContext, id: string, options: DownloadOptions): boolean {
    return downloadEngine.startDownload(id, options)
  }

  /**
   * Cancel a download after its terminal state has been persisted.
   *
   * @param _context IPC call context.
   * @param id Download id.
   * @returns A promise resolving to whether cancellation succeeded.
   */
  @IpcMethod()
  cancelDownload(_context: IpcContext, id: string): Promise<boolean> {
    return downloadEngine.cancelDownload(id)
  }

  /**
   * Pause a queued or in-flight download.
   *
   * @param _context IPC call context.
   * @param id Download id.
   * @returns false when the download is not in the queue.
   */
  @IpcMethod()
  pauseDownload(_context: IpcContext, id: string): boolean {
    return downloadEngine.pauseDownload(id)
  }

  /**
   * Resume a paused download from the last partial file.
   *
   * @param _context IPC call context.
   * @param id Download id.
   * @returns false when the download is not in the queue.
   */
  @IpcMethod()
  resumeDownload(_context: IpcContext, id: string): boolean {
    return downloadEngine.resumeDownload(id)
  }

  @IpcMethod()
  async retryDownload(_context: IpcContext, id: string): Promise<boolean> {
    return downloadEngine.retryDownload(id)
  }

  @IpcMethod()
  getQueueStatus(_context: IpcContext) {
    return downloadEngine.getQueueStatus()
  }

  @IpcMethod()
  getActiveDownloads(_context: IpcContext): DownloadItem[] {
    return downloadEngine.getActiveDownloads()
  }

  @IpcMethod()
  updateDownloadInfo(_context: IpcContext, id: string, updates: Partial<DownloadItem>): void {
    downloadEngine.updateDownloadInfo(id, updates)
  }

  @IpcMethod()
  async startPlaylistDownload(
    _context: IpcContext,
    options: PlaylistDownloadOptions
  ): Promise<PlaylistDownloadResult> {
    return downloadEngine.startPlaylistDownload(options)
  }

  @IpcMethod()
  async startInstagramProfileDownload(
    _context: IpcContext,
    input: InstagramProfileDownloadInput
  ): Promise<InstagramProfileDownloadResult> {
    return downloadEngine.startInstagramProfileDownload(input)
  }
}

export { DownloadService }
