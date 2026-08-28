export interface LanguageDefinition {
  name: string
  hreflang: string
}

export const languages = {
  en: {
    name: 'English',
    hreflang: 'en'
  },
  es: {
    name: 'Español',
    hreflang: 'es'
  },
  ar: {
    name: 'العربية',
    hreflang: 'ar'
  },
  id: {
    name: 'Bahasa Indonesia',
    hreflang: 'id'
  },
  pt: {
    name: 'Português',
    hreflang: 'pt-BR'
  },
  fr: {
    name: 'Français',
    hreflang: 'fr'
  },
  it: {
    name: 'Italiano',
    hreflang: 'it'
  },
  zh: {
    name: '中文',
    hreflang: 'zh-CN'
  },
  'zh-TW': {
    name: '繁體中文',
    hreflang: 'zh-TW'
  },
  ko: {
    name: '한국어',
    hreflang: 'ko'
  },
  ja: {
    name: '日本語',
    hreflang: 'ja'
  },
  ru: {
    name: 'Русский',
    hreflang: 'ru'
  },
  tr: {
    name: 'Türkçe',
    hreflang: 'tr'
  },
  de: {
    name: 'Deutsch',
    hreflang: 'de'
  }
} as const satisfies Record<string, LanguageDefinition>

export type LanguageCode = keyof typeof languages

export const defaultLanguageCode: LanguageCode = 'en'

export const languageList = Object.entries(languages).map(([code, definition]) => ({
  value: code as LanguageCode,
  ...definition
}))

export const supportedLanguageCodes = languageList.map((language) => language.value)

export function normalizeLanguageCode(code: string | null | undefined): LanguageCode {
  if (!code) {
    return defaultLanguageCode
  }

  const normalizedInput = code.toLowerCase()
  const directMatch = supportedLanguageCodes.find(
    (languageCode) => languageCode.toLowerCase() === normalizedInput
  )
  if (directMatch) {
    return directMatch
  }

  const base = normalizedInput.split('-')[0] ?? ''
  const baseMatch = supportedLanguageCodes.find(
    (languageCode) => languageCode.split('-')[0]?.toLowerCase() === base
  )

  return baseMatch ?? defaultLanguageCode
}
