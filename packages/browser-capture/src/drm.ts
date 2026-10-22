const onlyFansChatPath = (value: string): URL | null => {
  try {
    const parsed = new URL(value)
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'onlyfans.com' || parsed.hostname === 'www.onlyfans.com') &&
      parts[0] === 'my' &&
      parts[1] === 'chats' &&
      parts[2] === 'chat' &&
      /^\d+$/.test(parts[3] ?? '')
    ) {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

/**
 * Chat captures keep the conversation URL, including `firstId`.
 * Other pages still drop media suffixes so the player can open them.
 */
export const capturePageUrl = (value: string, videoOrdinal?: number): string => {
  if (videoOrdinal && videoOrdinal > 0) {
    const chat = onlyFansChatPath(value)
    if (chat) {
      chat.hash = ''
      return chat.toString()
    }
  }
  return playbackPageUrl(value)
}

/** Strip site-specific media suffixes so the player opens the watchable page. */
export const playbackPageUrl = (value: string): string => {
  try {
    const parsed = new URL(value)
    parsed.hash = ''
    const mediaMatch = parsed.pathname.match(/\/media\/(\d+)\/?$/)
    parsed.pathname = parsed.pathname.replace(/\/media\/\d+\/?$/, '')
    parsed.search = ''
    if (mediaMatch?.[1]) {
      parsed.searchParams.set('media', mediaMatch[1])
    }
    if (/\/my\/chats\/chat\/\d+$/i.test(parsed.pathname)) {
      parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/gallery`
    }
    return parsed.toString()
  } catch {
    return value
  }
}

const DRM_PATTERNS = ['drm protected', 'known to use drm protection'] as const

export const DRM_FALLBACK_MESSAGE =
  '[VidBee] Source is DRM protected; recording in-browser playback on a virtual display.'

/** True when a yt-dlp finish event is the expected CDM/DRM failure. */
export const isDrmProtectedMessage = (text: string): boolean => {
  const normalized = text.toLowerCase()
  return DRM_PATTERNS.some((pattern) => normalized.includes(pattern))
}
