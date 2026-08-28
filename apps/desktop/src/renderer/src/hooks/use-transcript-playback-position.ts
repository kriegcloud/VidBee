import {
  applyPlaybackPositionWrite,
  clearPlaybackPosition,
  MIN_RESUME_SECONDS,
  PLAYBACK_POSITION_SAVE_INTERVAL_MS,
  readPlaybackPosition
} from '@renderer/lib/transcript-playback-position'
import { useCallback, useEffect, useMemo, useRef } from 'react'

interface UseTranscriptPlaybackPositionResult {
  getStartAt: () => number
  persistTime: (currentTime: number, duration: number) => void
  restartPlayback: () => void
  startAt: number
}

/**
 * Remember playback progress for a transcript and expose the resume point.
 *
 * @param downloadId Transcript download id used as the storage key.
 * @param mediaPath Playable file path; remounts should keep the resume point.
 * @returns The initial resume point and a throttled persist callback.
 */
export const useTranscriptPlaybackPosition = (
  downloadId: string,
  mediaPath: string | null
): UseTranscriptPlaybackPositionResult => {
  const startAt = useMemo(() => readPlaybackPosition(downloadId) ?? 0, [downloadId])
  const downloadIdRef = useRef(downloadId)
  const waitingForResumeRef = useRef(startAt >= MIN_RESUME_SECONDS)
  const latestRef = useRef({ duration: 0, time: startAt })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  downloadIdRef.current = downloadId

  /**
   * Write the latest clock immediately and cancel a pending throttled save.
   */
  const flush = useCallback((id: string, time: number, duration: number): void => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    applyPlaybackPositionWrite(id, time, duration)
  }, [])

  /**
   * Return the clock the player should restore, including progress from this visit.
   */
  const getStartAt = useCallback((): number => latestRef.current.time, [])

  /**
   * Forget the stored resume point so the next visit starts at 0:00.
   */
  const restartPlayback = useCallback((): void => {
    waitingForResumeRef.current = false
    latestRef.current = { duration: latestRef.current.duration, time: 0 }
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    clearPlaybackPosition(downloadIdRef.current)
  }, [])

  /**
   * Record a player clock sample, ignoring the initial 0s before resume sticks.
   */
  const persistTime = useCallback((currentTime: number, duration: number): void => {
    if (waitingForResumeRef.current && currentTime < MIN_RESUME_SECONDS) {
      if (duration > 0) {
        latestRef.current = { duration, time: latestRef.current.time }
      }
      return
    }
    if (currentTime < MIN_RESUME_SECONDS && latestRef.current.time >= MIN_RESUME_SECONDS) {
      return
    }
    waitingForResumeRef.current = false
    latestRef.current = { duration, time: currentTime }
    if (timerRef.current != null) {
      return
    }
    applyPlaybackPositionWrite(downloadIdRef.current, currentTime, duration)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      const latest = latestRef.current
      applyPlaybackPositionWrite(downloadIdRef.current, latest.time, latest.duration)
    }, PLAYBACK_POSITION_SAVE_INTERVAL_MS)
  }, [])

  useEffect(() => {
    waitingForResumeRef.current = startAt >= MIN_RESUME_SECONDS
    latestRef.current = { duration: 0, time: startAt }
    return () => {
      const latest = latestRef.current
      flush(downloadId, latest.time, latest.duration)
    }
  }, [downloadId, flush, startAt])

  useEffect(() => {
    waitingForResumeRef.current = mediaPath != null && latestRef.current.time >= MIN_RESUME_SECONDS
  }, [mediaPath])

  useEffect(() => {
    /**
     * Flush when the window hides so leaving the transcript still remembers progress.
     */
    const onLeave = (): void => {
      const latest = latestRef.current
      flush(downloadIdRef.current, latest.time, latest.duration)
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        onLeave()
      }
    }
    window.addEventListener('pagehide', onLeave)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flush])

  return { getStartAt, persistTime, restartPlayback, startAt }
}
