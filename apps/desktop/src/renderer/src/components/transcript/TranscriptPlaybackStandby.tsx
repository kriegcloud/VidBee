import { TranscriptAudioStage } from '@renderer/components/transcript/TranscriptAudioStage'
import { Button } from '@renderer/components/ui/button'
import { RemoteImage } from '@renderer/components/ui/remote-image'
import {
  DEFAULT_VIDEO_ASPECT_RATIO,
  transcriptPlayerAspectStyle
} from '@renderer/lib/transcript-player-frame'
import { cn } from '@renderer/lib/utils'
import { Play } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface TranscriptPlaybackStandbyProps {
  isAudio: boolean
  onPlay: () => void
  subtitle: string | null
  thumbnail: string | null
  title: string
}

/**
 * Poster for a transcript that is not the current now-playing session.
 */
export function TranscriptPlaybackStandby({
  isAudio,
  onPlay,
  subtitle,
  thumbnail,
  title
}: TranscriptPlaybackStandbyProps): ReactNode {
  const { t } = useTranslation()
  const playLabel = t('transcript.player.play')
  return (
    <div
      className={cn(
        'transcript-player-host flex w-full justify-center',
        isAudio ? 'h-full min-h-0' : 'max-h-full min-h-0 overflow-hidden'
      )}
    >
      <div
        className={cn(
          'transcript-player relative',
          isAudio
            ? 'transcript-player--audio flex h-full min-h-0 w-full flex-col'
            : 'transcript-player--fit min-h-0 bg-black'
        )}
        style={isAudio ? undefined : transcriptPlayerAspectStyle(DEFAULT_VIDEO_ASPECT_RATIO)}
      >
        {isAudio ? (
          <TranscriptAudioStage
            playing={false}
            subtitle={subtitle}
            thumbnail={thumbnail}
            title={title}
          />
        ) : (
          <RemoteImage
            alt=""
            className="h-full w-full object-cover opacity-80"
            src={thumbnail ?? undefined}
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <Button
            aria-label={playLabel}
            className="h-12 w-12 rounded-full"
            onClick={onPlay}
            size="icon"
            type="button"
          >
            <Play className="size-5 fill-current" />
          </Button>
        </div>
      </div>
    </div>
  )
}
