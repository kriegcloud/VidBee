export const PLAYBACK_BAR_HEIGHT_PX = 64

export const PLAYBACK_BAR_HEIGHT_VAR = '--playback-bar-height'

export const PLAYBACK_BAR_TOGGLE_MS = 240

let parkingEl: HTMLElement | null = null
let playerWrapEl: HTMLElement | null = null

/**
 * Remember the always-mounted parking lot for the live player node.
 */
export const setPlaybackParkingEl = (el: HTMLElement | null): void => {
  parkingEl = el
}

/**
 * Remember the live player wrap so route unmounts can park it first.
 */
export const setPlaybackPlayerWrapEl = (el: HTMLElement | null): void => {
  playerWrapEl = el
}

const TRANSCRIPT_DETAIL_PATH = /^\/downloads\/[^/]+\/transcript$/

/**
 * Strip trailing slashes so `/` and `/foo/` compare the same.
 *
 * @param pathname Raw router pathname.
 * @returns A pathname with no trailing slash, except for root.
 */
const normalizePlaybackPathname = (pathname: string): string => {
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/**
 * True when the hash path is any transcript detail page.
 *
 * @param pathname Current router pathname.
 * @returns Whether this is `/downloads/:id/transcript`.
 */
export const isTranscriptDetailPathname = (pathname: string): boolean =>
  TRANSCRIPT_DETAIL_PATH.test(normalizePlaybackPathname(pathname))

/**
 * Match a transcript detail pathname to a download id.
 *
 * @param pathname Current router pathname.
 * @param downloadId Download id that owns the open transcript.
 * @returns Whether this path is that download's transcript page.
 */
export const isTranscriptDetailPath = (pathname: string, downloadId: string): boolean => {
  if (!downloadId) {
    return false
  }
  return normalizePlaybackPathname(pathname) === `/downloads/${downloadId}/transcript`
}

/**
 * Clamp currentTime/duration into a 0–100 fill percent for the mini seek bar.
 */
export const playbackSeekPercent = (currentTime: number, duration: number): number => {
  if (!Number.isFinite(currentTime)) {
    return 0
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0
  }
  return Math.min(100, Math.max(0, (currentTime / duration) * 100))
}

/**
 * Keep a started session when opening a different transcript.
 */
export const shouldKeepPlaybackSession = (
  current: { downloadId: string; started: boolean } | null,
  nextDownloadId: string
): boolean => {
  if (!current?.started) {
    return false
  }
  return current.downloadId !== nextDownloadId
}

/**
 * Show the now-playing bar only after playback has started and the user left that page.
 */
export const shouldShowPlaybackBar = (input: {
  downloadId: string | null
  pathname: string
  started: boolean
}): boolean => {
  if (!(input.started && input.downloadId)) {
    return false
  }
  return !isTranscriptDetailPath(input.pathname, input.downloadId)
}

/**
 * Mark a library row when it owns the started now-playing session.
 *
 * @param session Current playback session, if any.
 * @param downloadId Library row download id.
 */
export const isNowPlayingLibraryItem = (
  session: { downloadId: string; started: boolean } | null,
  downloadId: string
): boolean => {
  if (!(session?.started && downloadId)) {
    return false
  }
  return session.downloadId === downloadId
}

/**
 * Move a live player node into `target`, or park it without leaving the document.
 *
 * `appendChild` keeps the media element in the document so Chromium does not pause it.
 */
export const rehomePlaybackNode = (
  node: HTMLElement | null,
  target: HTMLElement | null,
  parking: HTMLElement | null
): void => {
  if (!node) {
    return
  }
  const liveTarget = target && document.contains(target) ? target : null
  const parent = liveTarget ?? parking
  if (!parent || node.parentElement === parent) {
    return
  }
  parent.appendChild(node)
}

/**
 * Attach the live player wrap to a slot, or park it if the slot is gone.
 */
export const attachPlaybackPlayer = (target: HTMLElement | null): void => {
  rehomePlaybackNode(playerWrapEl, target, parkingEl)
}

/**
 * Pull the live player out of a slot before React removes that slot.
 */
export const parkPlaybackPlayer = (): void => {
  rehomePlaybackNode(playerWrapEl, null, parkingEl)
}
