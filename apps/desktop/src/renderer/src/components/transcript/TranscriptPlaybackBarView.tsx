import { TranscriptPlaybackSlot } from '@renderer/components/transcript/TranscriptPlaybackSlot'
import { Button } from '@renderer/components/ui/button'
import { RemoteImage } from '@renderer/components/ui/remote-image'
import { formatClock } from '@renderer/lib/format-clock'
import { playbackSeekPercent } from '@renderer/lib/transcript-playback'
import { FileAudio, Pause, Play, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export interface TranscriptPlaybackBarViewProps {
  compact?: boolean
  currentLine: string | null
  currentTime: number
  duration: number
  isAudio: boolean
  onClose: () => void
  onOpen: () => void
  onSeek: (seconds: number) => void
  onToggle: () => void
  playing: boolean
  thumbnail: string | null
  title: string
}

/**
 * Presentational now-playing bar used off the matching transcript page.
 *
 * Home-style pages use `px-6` to match list content. Transcript detail uses
 * `px-4` so the art and close control line up with speakers and captions.
 */
export function TranscriptPlaybackBarView({
  compact = false,
  currentLine,
  currentTime,
  duration,
  isAudio,
  onClose,
  onOpen,
  onSeek,
  onToggle,
  playing,
  thumbnail,
  title
}: TranscriptPlaybackBarViewProps): ReactNode {
  const { t } = useTranslation()
  const max = duration > 0 ? duration : 0
  const percent = playbackSeekPercent(currentTime, duration)
  const playLabel = playing ? t('transcript.player.pause') : t('transcript.player.play')
  return (
    <div
      className="relative shrink-0 bg-background"
      data-inset={compact ? 'detail' : 'home'}
      style={{ height: 64 }}
    >
      <div className="transcript-playback-bar-seek-wrap">
        <div aria-hidden="true" className="transcript-playback-bar-seek-track">
          <div className="transcript-playback-bar-seek-fill" style={{ width: `${percent}%` }} />
        </div>
        <div
          aria-hidden="true"
          className="transcript-playback-bar-seek-thumb"
          style={{ left: `${percent}%` }}
        />
        <input
          aria-label={t('transcript.player.seek')}
          aria-valuemax={max}
          aria-valuemin={0}
          aria-valuenow={Math.min(currentTime, max)}
          className="transcript-playback-bar-seek"
          disabled={max <= 0}
          max={max}
          min={0}
          onChange={(event) => {
            onSeek(Number(event.target.value))
          }}
          step={0.1}
          type="range"
          value={Math.min(currentTime, max)}
        />
      </div>
      <div className="transcript-playback-bar-inset flex h-full items-center gap-3">
        <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded bg-muted">
          {isAudio ? (
            <RemoteImage
              alt=""
              className="h-full w-full object-cover"
              fallbackIcon={<FileAudio className="h-5 w-5 text-primary" />}
              src={thumbnail ?? undefined}
            />
          ) : (
            <TranscriptPlaybackSlot className="h-full w-full" slot="bar" />
          )}
          <button
            aria-label={t('transcript.player.openTranscript')}
            className="absolute inset-0 cursor-pointer"
            onClick={onOpen}
            type="button"
          />
        </div>
        <button className="min-w-0 flex-1 cursor-pointer text-left" onClick={onOpen} type="button">
          <p className="truncate font-medium text-sm">{title}</p>
          <p className="truncate text-muted-foreground text-xs">
            {currentLine || t('transcript.player.nowPlaying')}
          </p>
        </button>
        <span className="hidden shrink-0 text-muted-foreground text-xs tabular-nums sm:block">
          {formatClock(currentTime)} / {formatClock(duration)}
        </span>
        <Button
          aria-label={playLabel}
          className="h-8 w-8"
          onClick={onToggle}
          size="icon"
          type="button"
          variant="ghost"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button
          aria-label={t('transcript.player.closeBar')}
          className="h-8 w-8"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
}
