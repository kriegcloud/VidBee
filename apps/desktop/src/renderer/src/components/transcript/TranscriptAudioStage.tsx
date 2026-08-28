import { SpeakerAvatar } from '@renderer/components/transcript/SpeakerAvatar'
import { TranscriptAudioEqualizer } from '@renderer/components/transcript/TranscriptAudioEqualizer'
import { RemoteImage } from '@renderer/components/ui/remote-image'
import { FileAudio } from 'lucide-react'
import type { ReactNode } from 'react'

interface TranscriptAudioStageProps {
  currentSpeakerName?: string | null
  currentSpeakerSortIndex?: number | null
  playing?: boolean
  subtitle?: string | null
  thumbnail?: string | null
  title: string
}

/**
 * Listening artwork for audio-only transcript playback.
 */
export function TranscriptAudioStage({
  currentSpeakerName,
  currentSpeakerSortIndex = null,
  playing = false,
  subtitle,
  thumbnail,
  title
}: TranscriptAudioStageProps): ReactNode {
  const speaker = currentSpeakerName?.trim() || null
  const detail = speaker ?? (subtitle?.trim() || null)
  return (
    <div className="relative flex min-h-36 flex-1 items-center overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {thumbnail ? (
          <RemoteImage
            alt=""
            className="h-full w-full scale-110 object-cover opacity-30 blur-2xl"
            src={thumbnail}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/25 via-muted to-sky-500/15" />
        )}
      </div>
      <div className="relative flex w-full items-center gap-4 px-4 py-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded bg-background/80 shadow-sm">
          <RemoteImage
            alt={title}
            className="h-full w-full object-cover"
            fallbackIcon={<FileAudio className="h-10 w-10 text-primary" />}
            src={thumbnail ?? undefined}
          />
          <TranscriptAudioEqualizer playing={playing} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-semibold text-sm">{title}</p>
          {speaker ? (
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <SpeakerAvatar
                current={playing}
                name={speaker}
                size="xs"
                sortIndex={currentSpeakerSortIndex}
              />
              <span className="truncate text-muted-foreground text-sm">{speaker}</span>
            </div>
          ) : detail ? (
            <p className="mt-2 truncate text-muted-foreground text-sm">{detail}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
