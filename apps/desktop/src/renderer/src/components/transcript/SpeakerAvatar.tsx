import { speakerColor, speakerInitials } from '@renderer/lib/transcript-speakers'
import { cn } from '@renderer/lib/utils'

const AVATAR_SIZE_CLASS = {
  md: 'h-8 w-8 text-xs',
  sm: 'h-7 w-7 text-[10px]',
  xs: 'h-5 w-5 text-[9px]'
} as const

interface SpeakerAvatarProps {
  current?: boolean
  name: string
  size?: 'md' | 'sm' | 'xs'
  sortIndex: number | null
}

/**
 * Render a colored initials chip for a transcript speaker.
 */
export function SpeakerAvatar({
  current = false,
  name,
  size = 'md',
  sortIndex
}: SpeakerAvatarProps) {
  const color = speakerColor(sortIndex)

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-medium leading-none',
        AVATAR_SIZE_CLASS[size],
        color.avatar,
        current ? `ring-2 ${color.ring}` : ''
      )}
    >
      {speakerInitials(name)}
    </span>
  )
}
