import { TranscriptPlaybackBarView } from '@renderer/components/transcript/TranscriptPlaybackBarView'
import { prefersReducedMotion } from '@renderer/lib/transcript-follow'
import { segmentAtTime } from '@renderer/lib/transcript-index'
import {
  isTranscriptDetailPathname,
  PLAYBACK_BAR_TOGGLE_MS,
  shouldShowPlaybackBar
} from '@renderer/lib/transcript-playback'
import {
  closePlaybackSessionAtom,
  playbackClockAtom,
  playbackControlsAtom,
  playbackSessionAtom
} from '@renderer/store/transcript-playback'
import { transcriptMapAtom } from '@renderer/store/transcripts'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useAtomValue, useSetAtom } from 'jotai'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

/**
 * Run `fn` after the current View Transition, so CSS transforms are not
 * hidden under the snapshot overlay.
 */
const afterViewTransition = (fn: () => void): (() => void) => {
  const reduce = prefersReducedMotion()
  const transition = document.activeViewTransition
  if (!transition || reduce) {
    fn()
    return () => undefined
  }
  let cancelled = false
  void transition.finished.finally(() => {
    if (!cancelled) {
      fn()
    }
  })
  return () => {
    cancelled = true
  }
}

/**
 * Shell now-playing bar: visible after playback starts and the user leaves that page.
 */
export function TranscriptPlaybackBar(): ReactNode {
  const session = useAtomValue(playbackSessionAtom)
  const clock = useAtomValue(playbackClockAtom)
  const controls = useAtomValue(playbackControlsAtom)
  const transcriptMap = useAtomValue(transcriptMapAtom)
  const closeSession = useSetAtom(closePlaybackSessionAtom)
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [closing, setClosing] = useState(false)
  const [open, setOpen] = useState(false)
  const [held, setHeld] = useState(false)
  const wantOpen =
    !closing &&
    shouldShowPlaybackBar({
      downloadId: session?.downloadId ?? null,
      pathname,
      started: Boolean(session?.started)
    })
  const downloadId = session?.downloadId
  const compact = isTranscriptDetailPathname(pathname)
  const currentLine = useMemo(() => {
    if (!session) {
      return null
    }
    const segments = transcriptMap[session.downloadId]?.record?.segments ?? []
    return segmentAtTime(segments, Math.round(clock.currentTime * 1000))?.text ?? null
  }, [clock.currentTime, session, transcriptMap])

  useEffect(() => {
    if (downloadId) {
      setClosing(false)
    }
  }, [downloadId])

  useEffect(() => {
    let hideTimer: number | undefined
    const cancelWait = afterViewTransition(() => {
      if (wantOpen) {
        setHeld(true)
        setOpen(true)
        return
      }
      setOpen(false)
      const delay = prefersReducedMotion() ? 0 : PLAYBACK_BAR_TOGGLE_MS
      hideTimer = window.setTimeout(() => setHeld(false), delay)
    })
    return () => {
      cancelWait()
      if (hideTimer !== undefined) {
        window.clearTimeout(hideTimer)
      }
    }
  }, [wantOpen])

  useEffect(() => {
    if (!closing) {
      return
    }
    const delay = prefersReducedMotion() ? 0 : PLAYBACK_BAR_TOGGLE_MS
    const id = window.setTimeout(() => {
      controls?.pause()
      closeSession()
      setClosing(false)
    }, delay)
    return () => window.clearTimeout(id)
  }, [closeSession, closing, controls])

  if (!(session?.started && (open || held))) {
    return null
  }

  return (
    <div className="transcript-playback-bar-slot" data-open={open ? 'true' : 'false'} inert={!open}>
      <div className="transcript-playback-bar-slot-clip">
        <TranscriptPlaybackBarView
          compact={compact}
          currentLine={currentLine}
          currentTime={clock.currentTime}
          duration={clock.duration}
          isAudio={session.isAudio}
          onClose={() => setClosing(true)}
          onOpen={() => {
            void navigate({
              params: { downloadId: session.downloadId },
              to: '/downloads/$downloadId/transcript'
            })
          }}
          onSeek={(seconds) => {
            controls?.seek(seconds)
          }}
          onToggle={() => {
            controls?.toggle()
          }}
          playing={clock.playing}
          thumbnail={session.thumbnail}
          title={session.title}
        />
      </div>
    </div>
  )
}
