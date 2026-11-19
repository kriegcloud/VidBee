export * from "@vidbee/downloader-core/cookie-setup";
import { parseNetscapeCookieLines, looksLikeNetscapeCookies, DataFirst as CookieSetupFunctions } from "@vidbee/downloader-core/cookie-setup";
import type { CookieHealth, CookieSiteMatch } from "@vidbee/downloader-core/cookie-setup";
export const inspectNetscapeCookies = (text: string, cookiesPath?: string): CookieHealth => {
  if (!looksLikeNetscapeCookies(text)) {
    return {
      cookiesPath,
      reason: 'invalid-format',
      source: 'file',
      status: 'invalid',
      sites: []
    }
  }

  const cookies = parseNetscapeCookieLines(text)
  if (cookies.length === 0) {
    return {
      cookiesPath,
      reason: 'no-session',
      source: 'file',
      status: 'empty',
      sites: []
    }
  }

  const sites = matchCookieSites(cookies)
  if (sites.some((site) => !site.expired)) {
    return {
      cookiesPath,
      source: 'file',
      status: 'ok',
      sites: sites.filter((site) => !site.expired)
    }
  }
  if (sites.some((site) => site.expired)) {
    return {
      cookiesPath,
      reason: 'expired',
      source: 'file',
      status: 'expired',
      sites
    }
  }

  return {
    cookiesPath,
    reason: 'no-session',
    source: 'file',
    status: 'empty',
    sites: []
  }
}
export const matchCookieSites = (cookies: readonly {domain: string; name: string; expires: number}[]): CookieSiteMatch[] => CookieSetupFunctions.matchCookieSites(cookies, Date.now());
