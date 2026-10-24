/** Active transfer locate call. Aborted on timeout, replacement, or list unmount. */
export interface DownloadTransferLocateSession {
  readonly deadline: number
  readonly signal: AbortSignal
  /** How the revealed row is placed in the viewport. */
  readonly align: 'auto' | 'center'
}

export interface DownloadTransferLocateOptions {
  align?: 'auto' | 'center'
  timeoutMs?: number
}

type DownloadTransferLocator = (
  downloadId: string | undefined,
  session: DownloadTransferLocateSession
) => Promise<void> | void

const LOCATE_TIMEOUT_MS = 300

let locator: DownloadTransferLocator | null = null
let activeController: AbortController | null = null
let activeTimer: number | null = null

/**
 * True when a virtual list has registered a locate callback.
 */
export const hasDownloadTransferLocator = (): boolean => locator !== null

/**
 * Register the mounted list's locate callback. The returned function clears it on unmount.
 */
export const registerDownloadTransferLocator = (locate: DownloadTransferLocator): (() => void) => {
  locator = locate
  return () => {
    if (locator !== locate) {
      return
    }
    locator = null
    cancelDownloadTransferLocate()
  }
}

/**
 * Abort the in-flight locate loop and clear its timeout.
 */
export const cancelDownloadTransferLocate = (): void => {
  const timer = activeTimer
  const controller = activeController
  activeTimer = null
  activeController = null
  if (timer !== null) {
    window.clearTimeout(timer)
  }
  controller?.abort()
}

/**
 * Ask the mounted list to reveal one download before the existing DOM lookup.
 * Also used to return to a row after the detail page, with a longer deadline.
 * With no registration this returns immediately so the web list stays unchanged.
 */
export const prepareDownloadTransferTarget = async (
  downloadId?: string,
  options?: DownloadTransferLocateOptions
): Promise<void> => {
  const locate = locator
  if (!locate) {
    return
  }
  cancelDownloadTransferLocate()
  const controller = new AbortController()
  const timeout = options?.timeoutMs ?? LOCATE_TIMEOUT_MS
  const deadline = Date.now() + timeout
  activeController = controller
  activeTimer = window.setTimeout(() => {
    controller.abort()
  }, timeout)
  try {
    await locate(downloadId, {
      align: options?.align ?? 'auto',
      deadline,
      signal: controller.signal
    })
  } catch {
    // A failed locate still falls through to the existing DOM lookup.
  } finally {
    if (activeController === controller) {
      if (activeTimer !== null) {
        window.clearTimeout(activeTimer)
      }
      activeTimer = null
      activeController = null
    }
  }
}
