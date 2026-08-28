import { flushSync } from 'react-dom'
import { prefersReducedMotion } from './transcript-follow'
import { isTranscriptDetailPathname } from './transcript-playback'

export const TRANSCRIPT_VT_OPEN = 'transcript-open'
export const TRANSCRIPT_VT_CLOSE = 'transcript-close'
export const TRANSCRIPT_VT_SWAP = 'transcript-swap'
export const TRANSCRIPT_VT_TAB = 'transcript-tab'

type ViewTransitionUpdate = () => void

type StartViewTransition = (
  param: ViewTransitionUpdate | { types: string[]; update: ViewTransitionUpdate }
) => unknown

/**
 * True when this document can start a View Transition with named types.
 */
export const supportsViewTransitionTypes = (): boolean => {
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') {
    return false
  }
  return typeof CSS !== 'undefined' && CSS.supports('selector(:active-view-transition-type(x))')
}

/**
 * Pick View Transition types for entering, leaving, or swapping a transcript detail page.
 *
 * @param input Navigation from/to pathnames and whether the path changed.
 * @returns Type names for `document.startViewTransition`, or `false` to skip.
 */
export const transcriptRouteTransitionTypes = (input: {
  fromPath?: string
  pathChanged: boolean
  toPath: string
}): string[] | false => {
  if (!input.pathChanged || prefersReducedMotion()) {
    return false
  }
  const fromDetail = isTranscriptDetailPathname(input.fromPath ?? '')
  const toDetail = isTranscriptDetailPathname(input.toPath)
  if (toDetail && !fromDetail) {
    return [TRANSCRIPT_VT_OPEN]
  }
  if (fromDetail && !toDetail) {
    return [TRANSCRIPT_VT_CLOSE]
  }
  if (fromDetail && toDetail) {
    return [TRANSCRIPT_VT_SWAP]
  }
  return false
}

/**
 * Apply a state update inside a typed same-document View Transition.
 *
 * Skips the API when the user prefers reduced motion, types are unsupported,
 * or `startViewTransition` is missing, so callers can stay animation-agnostic.
 *
 * @param update Synchronous DOM/state mutation. Flushed before the new snapshot.
 * @param types Active view-transition types for CSS `:active-view-transition-type()`.
 */
export const startTypedViewTransition = (
  update: ViewTransitionUpdate,
  types: readonly string[]
): void => {
  if (prefersReducedMotion() || !supportsViewTransitionTypes()) {
    update()
    return
  }
  const start = document.startViewTransition as StartViewTransition
  try {
    start({
      types: [...types],
      update: () => {
        flushSync(update)
      }
    })
  } catch {
    update()
  }
}
