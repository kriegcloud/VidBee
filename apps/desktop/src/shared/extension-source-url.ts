import * as P from 'effect/Predicate'
import * as Str from 'effect/String'

const PRIVATE_IPV4 =
  /^(?:127|10|0)\.\d+\.\d+\.\d+$|^192\.168\.\d+\.\d+$|^172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+$/

/**
 * True when the extension may send this watch URL to Desktop over loopback.
 *
 * @param value Candidate video page URL.
 *
 * **Example** (Access the isExtensionSourceUrl contract)
 *
 * ```ts
 * import { isExtensionSourceUrl } from './extension-source-url.js'
 * void isExtensionSourceUrl
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function isExtensionSourceUrl(value: string): boolean {
  if (!P.isString(value) || Str.trim(value).length === 0 || value.length > 2048) {
    return false
  }
  try {
    const url = new URL(value)
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      P.isTruthy(url.username) ||
      P.isTruthy(url.password)
    ) {
      return false
    }
    const host = Str.toLowerCase(url.hostname)
    if (
      host.length === 0 ||
      host === 'localhost' ||
      Str.endsWith('.localhost')(host) ||
      !Str.includes('.')(host)
    ) {
      return false
    }
    if (
      host === '0.0.0.0' ||
      host === '127.0.0.1' ||
      Str.includes(':')(host) ||
      PRIVATE_IPV4.test(host)
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}
