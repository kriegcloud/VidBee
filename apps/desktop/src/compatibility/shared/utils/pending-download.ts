import type { DownloadItem, DownloadOptions } from '../../../shared/types'
import * as Native from '../../../shared/utils/pending-download'
export const hasDisplayMetadata = Native.hasDisplayMetadata
export const buildPendingDownloadItem = (id: string, options: DownloadOptions): DownloadItem =>
  Native.buildPendingDownloadItem({
    id,
    options,
    now: Date.now()
  })
