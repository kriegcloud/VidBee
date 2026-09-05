import { Globe } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/cn'

interface DownloadPlatformIconProps {
  className?: string
  domain?: string | null
}

/**
 * Favicon for a download platform; falls back to a globe if loading fails.
 */
export const DownloadPlatformIcon = ({ className, domain }: DownloadPlatformIconProps) => {
  const [failed, setFailed] = useState(false)
  if (!domain || failed) {
    return <Globe aria-hidden className={cn('size-4 shrink-0 text-muted-foreground', className)} />
  }
  return (
    <img
      alt=""
      aria-hidden
      className={cn('size-4 shrink-0 rounded-[4px]', className)}
      onError={() => {
        setFailed(true)
      }}
      src={`https://favicon.im/${encodeURIComponent(domain)}`}
    />
  )
}
