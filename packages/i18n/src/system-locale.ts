import { defaultLanguageCode, type LanguageCode } from './languages'

export interface SystemProfileInput {
  countryCode?: string
  env?: NodeJS.ProcessEnv
  locales?: readonly string[]
  timeZone?: string
}

export interface SystemProfile {
  language: LanguageCode
  preferChina: boolean
}

const MAINLAND_TIME_ZONES = new Set([
  'Asia/Shanghai',
  'Asia/Chongqing',
  'Asia/Urumqi',
  'Asia/Harbin',
  'Asia/Kashgar',
  'Asia/Urumchi'
])

const TIME_ZONE_LANGUAGE: Readonly<Record<string, LanguageCode>> = {
  'Asia/Shanghai': 'zh',
  'Asia/Chongqing': 'zh',
  'Asia/Urumqi': 'zh',
  'Asia/Harbin': 'zh',
  'Asia/Kashgar': 'zh',
  'Asia/Urumchi': 'zh',
  'Asia/Taipei': 'zh-TW',
  'Asia/Hong_Kong': 'zh-TW',
  'Asia/Macau': 'zh-TW',
  'Asia/Tokyo': 'ja',
  'Asia/Seoul': 'ko',
  'Europe/Berlin': 'de',
  'Europe/Paris': 'fr',
  'Europe/Rome': 'it',
  'Europe/Madrid': 'es',
  'Europe/Moscow': 'ru',
  'Europe/Istanbul': 'tr',
  'America/Sao_Paulo': 'pt',
  'Asia/Jakarta': 'id',
  'Asia/Riyadh': 'ar'
}

const COUNTRY_LANGUAGE: Readonly<Record<string, LanguageCode>> = {
  CN: 'zh',
  SG: 'zh',
  TW: 'zh-TW',
  HK: 'zh-TW',
  MO: 'zh-TW',
  JP: 'ja',
  KR: 'ko',
  DE: 'de',
  FR: 'fr',
  IT: 'it',
  ES: 'es',
  BR: 'pt',
  PT: 'pt',
  RU: 'ru',
  TR: 'tr',
  ID: 'id',
  SA: 'ar',
  AE: 'ar'
}

const BASE_LANGUAGE: Readonly<Record<string, LanguageCode>> = {
  ar: 'ar',
  de: 'de',
  en: 'en',
  es: 'es',
  fr: 'fr',
  id: 'id',
  it: 'it',
  ja: 'ja',
  ko: 'ko',
  pt: 'pt',
  ru: 'ru',
  tr: 'tr',
  zh: 'zh'
}

/**
 * Map one OS/BCP-47 tag onto a supported UI language, or null if unknown.
 */
export const languageFromTag = (tag: string | null | undefined): LanguageCode | null => {
  if (!tag) {
    return null
  }
  const cleaned = tag.trim().replaceAll('_', '-').toLowerCase().split('.')[0] ?? ''
  if (!cleaned || cleaned === 'c' || cleaned === 'posix') {
    return null
  }
  const [base = '', region = ''] = cleaned.split('-')
  if (base === 'zh') {
    return ['hant', 'tw', 'hk', 'mo'].includes(region) ? 'zh-TW' : 'zh'
  }
  return BASE_LANGUAGE[base] ?? null
}

/**
 * True when a locale tag is mainland / simplified Chinese, not TW/HK/MO.
 */
export const isMainlandChineseLocale = (tag: string | null | undefined): boolean => {
  const language = languageFromTag(tag)
  if (language !== 'zh') {
    return false
  }
  const region = (tag ?? '').trim().replaceAll('_', '-').toLowerCase().split(/[.-]/)[1] ?? ''
  return !['hant', 'tw', 'hk', 'mo'].includes(region)
}

/**
 * Infer UI language and China-mirror preference from OS language, timezone, and country.
 *
 * A specific non-English system language wins. English or unknown language falls
 * through to timezone, then country. `VIDBEE_LANGUAGE` pins only the UI language.
 */
export const detectSystemProfile = (input: SystemProfileInput = {}): SystemProfile => {
  const env = input.env ?? process.env
  const timeZone = input.timeZone ?? readDefaultTimeZone()
  const country = (input.countryCode ?? '').trim().toUpperCase()
  const hostLocales =
    input.locales && input.locales.length > 0
      ? input.locales
      : [env.LANG, env.LC_ALL, env.LC_MESSAGES, readDefaultLocale()]
  const locales = [env.VIDBEE_LANGUAGE, ...hostLocales]
  const primaryTag = locales.find((tag) => languageFromTag(tag))
  const primaryLanguage = languageFromTag(primaryTag)
  const forcedLanguage = languageFromTag(env.VIDBEE_LANGUAGE)
  const tzLanguage = TIME_ZONE_LANGUAGE[timeZone]
  const countryLanguage = country ? COUNTRY_LANGUAGE[country] : undefined
  const language =
    forcedLanguage ??
    (primaryLanguage && primaryLanguage !== 'en'
      ? primaryLanguage
      : (tzLanguage ?? countryLanguage ?? primaryLanguage ?? defaultLanguageCode))
  const preferChina =
    MAINLAND_TIME_ZONES.has(timeZone) || isMainlandChineseLocale(primaryTag) || country === 'CN'
  return { language, preferChina }
}

/**
 * Read the host timezone, or empty when Intl is unavailable.
 */
const readDefaultTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    return ''
  }
}

/**
 * Read the host locale, or empty when Intl is unavailable.
 */
const readDefaultLocale = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale ?? ''
  } catch {
    return ''
  }
}
