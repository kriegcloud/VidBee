import { shouldKeepPlaybackSession } from '@renderer/lib/transcript-playback'
import { atom } from 'jotai'

export type PlaybackSlotId = 'bar' | 'page'

export interface TranscriptPlaybackSession {
  downloadId: string
  filePath: string | null
  isAudio: boolean
  playWhenReady: boolean
  seekTo: number | null
  started: boolean
  subtitle: string | null
  thumbnail: string | null
  title: string
}

export interface TranscriptPlaybackClock {
  currentTime: number
  duration: number
  playing: boolean
}

export interface TranscriptPlaybackPresentation {
  currentSpeakerName: string | null
  currentSpeakerSortIndex: number | null
}

export interface TranscriptPlayerControls {
  pause: () => void
  play: () => void
  seek: (seconds: number) => void
  toggle: () => void
}

export interface EnsurePlaybackSessionInput {
  downloadId: string
  filePath: string | null
  isAudio: boolean
  subtitle: string | null
  thumbnail: string | null
  title: string
}

export interface TakePlaybackSessionInput extends EnsurePlaybackSessionInput {
  seekTo?: number | null
}

export const EMPTY_PLAYBACK_CLOCK: TranscriptPlaybackClock = {
  currentTime: 0,
  duration: 0,
  playing: false
}

export const EMPTY_PLAYBACK_PRESENTATION: TranscriptPlaybackPresentation = {
  currentSpeakerName: null,
  currentSpeakerSortIndex: null
}

export const playbackSessionAtom = atom<TranscriptPlaybackSession | null>(null)

export const playbackClockAtom = atom<TranscriptPlaybackClock>(EMPTY_PLAYBACK_CLOCK)

/**
 * Play/pause only, so list rows do not rerender on every clock tick.
 */
export const playbackPlayingAtom = atom((get) => get(playbackClockAtom).playing)

export const playbackPresentationAtom = atom<TranscriptPlaybackPresentation>(
  EMPTY_PLAYBACK_PRESENTATION
)

export const playbackControlsAtom = atom<TranscriptPlayerControls | null>(null)

export const playbackSlotsAtom = atom<{ bar: HTMLElement | null; page: HTMLElement | null }>({
  bar: null,
  page: null
})

/**
 * Create or refresh the now-playing session without resetting an in-flight one.
 */
export const ensurePlaybackSessionAtom = atom(
  null,
  (get, set, input: EnsurePlaybackSessionInput) => {
    const current = get(playbackSessionAtom)
    if (current?.downloadId === input.downloadId) {
      set(playbackSessionAtom, {
        ...current,
        filePath: input.filePath,
        isAudio: input.isAudio,
        subtitle: input.subtitle,
        thumbnail: input.thumbnail,
        title: input.title
      })
      return
    }
    if (shouldKeepPlaybackSession(current, input.downloadId)) {
      return
    }
    set(playbackSessionAtom, { ...input, playWhenReady: false, seekTo: null, started: false })
    set(playbackClockAtom, EMPTY_PLAYBACK_CLOCK)
    set(playbackPresentationAtom, EMPTY_PLAYBACK_PRESENTATION)
    set(playbackControlsAtom, null)
  }
)

/**
 * Replace the current session because the user started this transcript.
 */
export const takePlaybackSessionAtom = atom(null, (get, set, input: TakePlaybackSessionInput) => {
  const current = get(playbackSessionAtom)
  const seekTo = input.seekTo ?? null
  if (current?.downloadId === input.downloadId) {
    set(playbackSessionAtom, {
      ...current,
      filePath: input.filePath,
      isAudio: input.isAudio,
      playWhenReady: true,
      seekTo,
      started: true,
      subtitle: input.subtitle,
      thumbnail: input.thumbnail,
      title: input.title
    })
    return
  }
  set(playbackSessionAtom, {
    ...input,
    playWhenReady: true,
    seekTo,
    started: true
  })
  set(playbackClockAtom, EMPTY_PLAYBACK_CLOCK)
  set(playbackPresentationAtom, EMPTY_PLAYBACK_PRESENTATION)
  set(playbackControlsAtom, null)
})

/**
 * Clear one-shot autoplay flags after the host has applied them.
 */
export const consumePlaybackPlayWhenReadyAtom = atom(null, (get, set) => {
  const current = get(playbackSessionAtom)
  if (!current?.playWhenReady) {
    return
  }
  set(playbackSessionAtom, { ...current, playWhenReady: false, seekTo: null })
})

/**
 * Mark that the user has actually started playback so the bar may appear later.
 */
export const markPlaybackStartedAtom = atom(null, (get, set) => {
  const current = get(playbackSessionAtom)
  if (!current || current.started) {
    return
  }
  set(playbackSessionAtom, { ...current, started: true })
})

/**
 * Drop a session that never started when its transcript page unmounts.
 */
export const releaseIdlePlaybackAtom = atom(null, (get, set, downloadId: string) => {
  const current = get(playbackSessionAtom)
  if (!current || current.downloadId !== downloadId || current.started) {
    return
  }
  set(playbackSessionAtom, null)
  set(playbackClockAtom, EMPTY_PLAYBACK_CLOCK)
  set(playbackPresentationAtom, EMPTY_PLAYBACK_PRESENTATION)
  set(playbackControlsAtom, null)
})

/**
 * Stop playback and dispose the global player.
 */
export const closePlaybackSessionAtom = atom(null, (_get, set) => {
  set(playbackSessionAtom, null)
  set(playbackClockAtom, EMPTY_PLAYBACK_CLOCK)
  set(playbackPresentationAtom, EMPTY_PLAYBACK_PRESENTATION)
  set(playbackControlsAtom, null)
})

/**
 * Register a rehome target. Clearing only applies when the same node unmounts.
 */
export const setPlaybackSlotAtom = atom(
  null,
  (
    get,
    set,
    update: { el: HTMLElement | null; expected?: HTMLElement | null; slot: PlaybackSlotId }
  ) => {
    const prev = get(playbackSlotsAtom)
    if (update.el === null) {
      if (update.expected && prev[update.slot] !== update.expected) {
        return
      }
      if (prev[update.slot] === null) {
        return
      }
      set(playbackSlotsAtom, { ...prev, [update.slot]: null })
      return
    }
    if (prev[update.slot] === update.el) {
      return
    }
    set(playbackSlotsAtom, { ...prev, [update.slot]: update.el })
  }
)
