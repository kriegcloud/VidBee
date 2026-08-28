import { TranscriptVideoJsPlayer } from '@renderer/components/transcript/TranscriptVideoJsPlayer'
import './transcript-player.css'
import { useTranscriptMediaPlayer } from '@renderer/hooks/use-transcript-media-player'
import { useTranscriptPlaybackPosition } from '@renderer/hooks/use-transcript-playback-position'
import { formatClock } from '@renderer/lib/format-clock'
import { toLocalFileSrc } from '@renderer/lib/local-file-src'
import {
  attachPlaybackPlayer,
  setPlaybackParkingEl,
  setPlaybackPlayerWrapEl
} from '@renderer/lib/transcript-playback'
import { planResumeSeek } from '@renderer/lib/transcript-playback-position'
import { buildVttText } from '@renderer/lib/transcript-vtt'
import {
  consumePlaybackPlayWhenReadyAtom,
  markPlaybackStartedAtom,
  playbackClockAtom,
  playbackControlsAtom,
  playbackPresentationAtom,
  playbackSessionAtom,
  playbackSlotsAtom,
  type TranscriptPlaybackClock,
  type TranscriptPlayerControls
} from '@renderer/store/transcript-playback'
import { type TranscriptSegmentView, transcriptMapAtom } from '@renderer/store/transcripts'
import { useAtomValue, useSetAtom } from 'jotai'
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const EMPTY_SEGMENTS: TranscriptSegmentView[] = []

/**
 * Keep a single Video.js instance alive across routes and rehome it into page or bar slots.
 */
export function TranscriptPlaybackHost(): ReactNode {
  const session = useAtomValue(playbackSessionAtom)
  const presentation = useAtomValue(playbackPresentationAtom)
  const slots = useAtomValue(playbackSlotsAtom)
  const transcriptMap = useAtomValue(transcriptMapAtom)
  const setClock = useSetAtom(playbackClockAtom)
  const setControls = useSetAtom(playbackControlsAtom)
  const markStarted = useSetAtom(markPlaybackStartedAtom)
  const consumePlayWhenReady = useSetAtom(consumePlaybackPlayWhenReadyAtom)
  const controls = useAtomValue(playbackControlsAtom)
  const pendingSeekRef = useRef<number | null>(null)
  const seekToRef = useRef<number | null>(null)
  seekToRef.current = session?.seekTo ?? null
  const { t } = useTranslation()
  const parkingRef = useRef<HTMLDivElement>(null)
  const playerWrapRef = useRef<HTMLDivElement>(null)
  const seekRef = useRef<(seconds: number) => void>(() => undefined)
  const transportRef = useRef<Pick<TranscriptPlayerControls, 'pause' | 'play' | 'toggle'>>({
    pause: () => undefined,
    play: () => undefined,
    toggle: () => undefined
  })
  const resumeStateRef = useRef({ attempts: 0, done: false, notified: false })
  const clockRef = useRef<TranscriptPlaybackClock>({
    currentTime: 0,
    duration: 0,
    playing: false
  })

  const downloadId = session?.downloadId ?? ''
  const filePath = session?.filePath ?? null
  const player = useTranscriptMediaPlayer({ filePath })
  const { error: playerError, playablePath, retry: retryPrepare } = player
  const { getStartAt, persistTime, restartPlayback } = useTranscriptPlaybackPosition(
    downloadId,
    playablePath
  )
  const mediaSrc = playablePath ? toLocalFileSrc(playablePath) : null
  const segments = transcriptMap[downloadId]?.record?.segments ?? EMPTY_SEGMENTS
  const vttText = useMemo(() => buildVttText(segments), [segments])
  const captionsSrc = useMemo(() => {
    if (!vttText) {
      return null
    }
    return URL.createObjectURL(new Blob([vttText], { type: 'text/vtt' }))
  }, [vttText])

  useEffect(() => {
    return () => {
      if (captionsSrc) {
        URL.revokeObjectURL(captionsSrc)
      }
    }
  }, [captionsSrc])

  const publishControls = useCallback(() => {
    setControls({
      pause: () => transportRef.current.pause(),
      play: () => transportRef.current.play(),
      seek: (seconds: number) => seekRef.current(seconds),
      toggle: () => transportRef.current.toggle()
    })
  }, [setControls])

  const handleSeekReady = useCallback(
    (nextSeek: (seconds: number) => void) => {
      seekRef.current = nextSeek
      publishControls()
    },
    [publishControls]
  )

  const handleControlsReady = useCallback(
    (next: Pick<TranscriptPlayerControls, 'pause' | 'play' | 'toggle'>) => {
      transportRef.current = next
      publishControls()
    },
    [publishControls]
  )

  const handleResumed = useCallback(
    (seconds: number) => {
      toast.info(t('transcript.player.resumed', { time: formatClock(seconds) }), {
        action: {
          label: t('transcript.player.startOver'),
          onClick: () => {
            restartPlayback()
            seekRef.current(0)
          }
        }
      })
    },
    [restartPlayback, t]
  )

  const tryRestore = useCallback(
    (nextTime: number, nextDuration: number): void => {
      if (resumeStateRef.current.done) {
        return
      }
      const forcedStartAt = pendingSeekRef.current
      const startAt = forcedStartAt ?? getStartAt()
      const plan = planResumeSeek(startAt, nextTime, nextDuration)
      if (plan === 'wait') {
        return
      }
      if (plan === 'skip') {
        resumeStateRef.current.done = true
        return
      }
      if (plan === 'done') {
        resumeStateRef.current.done = true
        if (!resumeStateRef.current.notified && forcedStartAt == null) {
          resumeStateRef.current.notified = true
          handleResumed(startAt)
        }
        return
      }
      resumeStateRef.current.attempts += 1
      if (resumeStateRef.current.attempts > 40) {
        resumeStateRef.current.done = true
        return
      }
      seekRef.current(startAt)
    },
    [getStartAt, handleResumed]
  )

  const handleTime = useCallback(
    (nextTime: number, nextDuration: number) => {
      clockRef.current = {
        ...clockRef.current,
        currentTime: nextTime,
        duration: nextDuration
      }
      setClock(clockRef.current)
      persistTime(nextTime, nextDuration)
      tryRestore(nextTime, nextDuration)
    },
    [persistTime, setClock, tryRestore]
  )

  const handlePlaying = useCallback(
    (playing: boolean) => {
      clockRef.current = { ...clockRef.current, playing }
      setClock(clockRef.current)
      if (playing) {
        markStarted()
      }
    },
    [markStarted, setClock]
  )

  useEffect(() => {
    clockRef.current = { currentTime: 0, duration: 0, playing: false }
    resumeStateRef.current = { attempts: 0, done: false, notified: false }
    pendingSeekRef.current = seekToRef.current
    seekRef.current = () => undefined
    transportRef.current = {
      pause: () => undefined,
      play: () => undefined,
      toggle: () => undefined
    }
    setControls(null)
    setClock({ currentTime: 0, duration: 0, playing: false })
    if (!(downloadId && filePath)) {
      return
    }
  }, [downloadId, filePath, setClock, setControls])

  useEffect(() => {
    if (!(session?.playWhenReady && mediaSrc && controls)) {
      return
    }
    if (session.seekTo != null) {
      controls.seek(session.seekTo)
    }
    controls.play()
    consumePlayWhenReady()
  }, [consumePlayWhenReady, controls, mediaSrc, session?.playWhenReady, session?.seekTo])

  useEffect(() => {
    const id = window.setInterval(() => {
      tryRestore(clockRef.current.currentTime, clockRef.current.duration)
    }, 250)
    return () => {
      window.clearInterval(id)
    }
  }, [tryRestore])

  const chrome = slots.page ? 'full' : 'mini'
  const liveVideoTarget = session && !session.isAudio ? slots.bar : null
  useLayoutEffect(() => {
    setPlaybackParkingEl(parkingRef.current)
    setPlaybackPlayerWrapEl(playerWrapRef.current)
    return () => {
      setPlaybackPlayerWrapEl(null)
      setPlaybackParkingEl(null)
    }
  }, [])

  useLayoutEffect(() => {
    attachPlaybackPlayer(slots.page ?? liveVideoTarget)
  }, [liveVideoTarget, slots.page])

  return (
    <div aria-hidden="true" className="transcript-playback-parking" ref={parkingRef}>
      <div className={slots.page ? 'contents' : 'h-full min-h-0 w-full'} ref={playerWrapRef}>
        {session ? (
          <TranscriptVideoJsPlayer
            captionsSrc={captionsSrc}
            chrome={chrome}
            currentSpeakerName={presentation.currentSpeakerName}
            currentSpeakerSortIndex={presentation.currentSpeakerSortIndex}
            isAudio={session.isAudio}
            onControlsReady={handleControlsReady}
            onPlaying={handlePlaying}
            onRetryPrepare={retryPrepare}
            onSeekReady={handleSeekReady}
            onTime={handleTime}
            prepareError={playerError}
            preparing={Boolean(filePath) && !playablePath && !playerError}
            src={mediaSrc}
            subtitle={session.subtitle}
            thumbnail={session.thumbnail}
            title={session.title}
          />
        ) : null}
      </div>
    </div>
  )
}
