export const FOLLOW_INTERFACE_SUBTITLE_LANGUAGE = 'interface'
export const MAX_SUBTITLE_LANGUAGES = 5
export const DEFAULT_SUBTITLE_LANGUAGES = [FOLLOW_INTERFACE_SUBTITLE_LANGUAGE] as const

const SUBTITLE_LANGUAGE_CODE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i

/**
 * Convert an app locale into the closest subtitle language code used by yt-dlp.
 *
 * @param language VidBee locale or explicit subtitle language.
 * @returns A normalized subtitle language code.
 */
export const interfaceSubtitleLanguage = (language: string | null | undefined): string => {
  const normalized = language?.trim().replaceAll('_', '-') || 'en'
  const lower = normalized.toLowerCase()

  if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo' || lower === 'zh-hant') {
    return 'zh-Hant'
  }
  if (lower === 'zh' || lower === 'zh-cn' || lower === 'zh-sg' || lower === 'zh-hans') {
    return 'zh-Hans'
  }

  return normalized
}

/**
 * Sanitize persisted subtitle preferences and keep request volume bounded.
 *
 * @param languages Persisted language codes or the interface-language token.
 * @returns Valid, de-duplicated preferences with a safe default.
 */
export const normalizeSubtitleLanguages = (
  languages: readonly string[] | null | undefined
): string[] => {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const language of languages ?? []) {
    const trimmed = language.trim()
    const isInterfaceLanguage = trimmed === FOLLOW_INTERFACE_SUBTITLE_LANGUAGE
    const isReservedAllPattern = trimmed.toLowerCase() === 'all'
    if (isReservedAllPattern || !(isInterfaceLanguage || SUBTITLE_LANGUAGE_CODE.test(trimmed))) {
      continue
    }

    const key = trimmed.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    normalized.push(trimmed)

    if (normalized.length >= MAX_SUBTITLE_LANGUAGES) {
      break
    }
  }

  return normalized.length > 0 ? normalized : [...DEFAULT_SUBTITLE_LANGUAGES]
}

/**
 * Resolve dynamic preferences into exact yt-dlp subtitle language codes.
 *
 * @param languages Persisted subtitle language preferences.
 * @param interfaceLanguage Current VidBee interface language.
 * @returns Exact language codes, de-duplicated after interface-language expansion.
 */
export const resolveSubtitleLanguages = (
  languages: readonly string[] | null | undefined,
  interfaceLanguage: string | null | undefined
): string[] => {
  const resolved: string[] = []
  const seen = new Set<string>()

  for (const preference of normalizeSubtitleLanguages(languages)) {
    const language = interfaceSubtitleLanguage(
      preference === FOLLOW_INTERFACE_SUBTITLE_LANGUAGE ? interfaceLanguage : preference
    )
    const key = language.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    resolved.push(language)
  }

  return resolved
}
