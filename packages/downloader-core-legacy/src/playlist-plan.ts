export { BROWSER_CAPTURE_GROUP_KEY, BROWSER_CAPTURE_MAX_PER_GROUP, parsePlaylistMediaKind, resolvePlaylistEntryUrl, mapPlaylistInfo, planPlaylistDownloadOrder, playlistEntryGroupKey } from '../../downloader-core/src/playlist-plan.js'
export type { RawPlaylistEntry, PlaylistMediaKind } from '../../downloader-core/src/playlist-plan.js'
import { BROWSER_CAPTURE_GROUP_KEY, BROWSER_CAPTURE_MAX_PER_GROUP } from '../../downloader-core/src/playlist-plan.js'
export const restoreBrowserCaptureGroupCap = async (queue: {setMaxPerGroup: (groupKey: string, n: number | null) => Promise<void>}): Promise<void> => {
  await queue.setMaxPerGroup(BROWSER_CAPTURE_GROUP_KEY, BROWSER_CAPTURE_MAX_PER_GROUP)
}
