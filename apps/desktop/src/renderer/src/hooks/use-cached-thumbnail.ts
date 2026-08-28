import { APP_PROTOCOL_SCHEME } from '@shared/constants'
import { useEffect, useState } from 'react'
import { ipcServices } from '../lib/ipc'
import { logger } from '../lib/logger'

/** True when the renderer can load this URL without fetching a remote host. */
const isLocalThumbnailUrl = (url: string): boolean => {
  return url.startsWith(APP_PROTOCOL_SCHEME) || url.startsWith('file://') || url.startsWith('data:')
}

/**
 * Resolve a thumbnail to a renderer-safe local URL via the main-process cache.
 */
export const useCachedThumbnail = (url?: string | null): string | undefined => {
  const [cachedUrl, setCachedUrl] = useState<string | undefined>()

  useEffect(() => {
    let isActive = true

    if (!url) {
      setCachedUrl(undefined)
      return
    }

    if (url.startsWith('blob:')) {
      setCachedUrl(undefined)
      return
    }

    if (isLocalThumbnailUrl(url)) {
      setCachedUrl(url)
      return
    }

    setCachedUrl(undefined)

    const loadThumbnail = async () => {
      try {
        const localUrl = await ipcServices.thumbnail.getThumbnailPath(url)
        if (!isActive) {
          return
        }
        setCachedUrl(localUrl ?? undefined)
      } catch (error) {
        logger.error('Failed to load cached thumbnail:', error)
        if (!isActive) {
          return
        }
        setCachedUrl(undefined)
      }
    }

    void loadThumbnail()

    return () => {
      isActive = false
    }
  }, [url])

  return cachedUrl
}
