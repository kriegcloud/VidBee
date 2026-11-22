import { CookieSiteMatch, NetscapeCookieInput } from '@vidbee/downloader-core/Cookie.model'
import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/extension-cookies')

/** Remembered browser profiles in cookie priority order, without credentials. */
const ExtensionCookieSourcePreferenceFields = S.Struct({
  id: S.String.pipe(S.mutableKey),
  browser: S.String.pipe(S.mutableKey),
  variant: LiteralKit(['dev', 'store']).pipe(S.optional, S.mutableKey),
  lastConnectedAt: S.Finite.pipe(S.optional, S.mutableKey)
})

/** ExtensionCookieSourcePreference shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionCookieSourcePreference input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionCookieSourcePreference } from './extension-cookies.js'
 * strictEqual(S.is(ExtensionCookieSourcePreference)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionCookieSourcePreference: S.Codec<
  typeof ExtensionCookieSourcePreferenceFields.Type,
  typeof ExtensionCookieSourcePreferenceFields.Encoded
> = S.StructWithRest(ExtensionCookieSourcePreferenceFields, [S.Record(S.String, S.Unknown)]).pipe(
  $I.annoteSchema('ExtensionCookieSourcePreference', {
    description: 'ExtensionCookieSourcePreference shared boundary data.'
  })
)
/** Decoded mutable ExtensionCookieSourcePreference data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionCookieSourcePreference
 */
export type ExtensionCookieSourcePreference = typeof ExtensionCookieSourcePreference.Type

/** One remembered extension, retained in Settings even while it is offline. */
/** ExtensionCookieSource shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionCookieSource input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionCookieSource } from './extension-cookies.js'
 * strictEqual(S.is(ExtensionCookieSource)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionCookieSource = S.Struct({
  ...ExtensionCookieSourcePreferenceFields.fields,
  ...S.Struct({
    legacy: S.Boolean.pipe(S.optional, S.mutableKey),
    connected: S.Boolean.pipe(S.mutableKey),
    lastSeenAt: S.Finite.pipe(S.optional, S.mutableKey),
    sites: S.Array(CookieSiteMatch).pipe(S.mutable, S.mutableKey)
  }).fields
}).pipe(
  $I.annoteSchema('ExtensionCookieSource', {
    description: 'ExtensionCookieSource shared boundary data.'
  })
)
/** Decoded mutable ExtensionCookieSource data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionCookieSource
 */
export type ExtensionCookieSource = typeof ExtensionCookieSource.Type

/** Live browser-extension cookie bridge shown on the cookies settings page. */
/** ExtensionCookieConnection shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionCookieConnection input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionCookieConnection } from './extension-cookies.js'
 * strictEqual(S.is(ExtensionCookieConnection)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionCookieConnection = S.Struct({
  connected: S.Boolean.pipe(S.mutableKey),
  browser: S.String.pipe(S.optional, S.mutableKey),
  lastSeenAt: S.Finite.pipe(S.optional, S.mutableKey),
  sites: S.Array(CookieSiteMatch).pipe(S.mutable, S.mutableKey),
  activeSourceId: S.String.pipe(S.optional, S.mutableKey),
  sources: S.Array(ExtensionCookieSource).pipe(S.mutable, S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionCookieConnection', {
    description: 'ExtensionCookieConnection shared boundary data.'
  })
)
/** Decoded mutable ExtensionCookieConnection data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionCookieConnection
 */
export type ExtensionCookieConnection = typeof ExtensionCookieConnection.Type

/** Cookie rows the extension posts back for one download URL. */
/** ExtensionCookieRow shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionCookieRow input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionCookieRow } from './extension-cookies.js'
 * strictEqual(S.is(ExtensionCookieRow)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionCookieRow = NetscapeCookieInput.pipe(
  $I.annoteSchema('ExtensionCookieRow', { description: 'ExtensionCookieRow shared boundary data.' })
)
/** Decoded mutable ExtensionCookieRow data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionCookieRow
 */
export type ExtensionCookieRow = typeof ExtensionCookieRow.Type
