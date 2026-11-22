import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/types/auth')

/** Build a mutable pagination envelope around a caller-selected item codec; structural for legacy construction.
 * @category schemas
 * @since 0.0.0
 *
 * **Example** (Access the DesktopPaginatedResult contract)
 *
 * ```ts
 * import { DesktopPaginatedResult } from './auth.js'
 * void DesktopPaginatedResult
 * ```
 *
 */
export const DesktopPaginatedResult = <T extends S.Top>(item: T) =>
  S.Struct({
    items: S.Array(item).pipe(S.mutable, S.mutableKey),
    nextCursor: S.NullOr(S.String).pipe(S.mutableKey)
  }).pipe(
    $I.annoteSchema('DesktopPaginatedResult', {
      description: 'Mutable pagination around a caller-selected item codec.'
    })
  )
/** Mutable pagination used by the legacy account API.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DesktopPaginatedResult contract)
 *
 * ```ts
 * import { DesktopPaginatedResult } from './auth.js'
 * void DesktopPaginatedResult
 * ```
 *
 */
export type DesktopPaginatedResult<T> = ReturnType<
  typeof DesktopPaginatedResult<S.Codec<T>>
>['Type']

/** DesktopAuthUser data shared with account clients.
 *
 * **Example** (Validate DesktopAuthUser)
 *
 * ```ts
 * import * as S from "effect/Schema"
 * import { DesktopAuthUser } from "./auth.js"
 * const value = DesktopAuthUser.make({email: "fixture", id: "fixture", image: "fixture", name: "fixture"})
 * S.is(DesktopAuthUser)(value) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopAuthUser = S.Struct({
  email: S.String.pipe(S.mutableKey),
  id: S.String.pipe(S.mutableKey),
  image: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  name: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('DesktopAuthUser', { description: 'DesktopAuthUser account boundary data.' })
)
/** Decoded mutable DesktopAuthUser data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DesktopAuthUser contract)
 *
 * ```ts
 * import { DesktopAuthUser } from './auth.js'
 * void DesktopAuthUser
 * ```
 *
 */
export type DesktopAuthUser = typeof DesktopAuthUser.Type

/** DesktopAiCreditSourceUsage data shared with account clients.
 *
 * **Example** (Validate DesktopAiCreditSourceUsage)
 *
 * ```ts
 * import * as S from "effect/Schema"
 * import { DesktopAiCreditSourceUsage } from "./auth.js"
 * const value = DesktopAiCreditSourceUsage.make({expiringSoonCredits: 0, quotaCredits: 0, remainingCredits: 0, reservedCredits: 0, usedCredits: 0})
 * S.is(DesktopAiCreditSourceUsage)(value) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopAiCreditSourceUsage = S.Struct({
  expiringSoonCredits: S.Finite.pipe(S.mutableKey),
  quotaCredits: S.Finite.pipe(S.mutableKey),
  remainingCredits: S.Finite.pipe(S.mutableKey),
  reservedCredits: S.Finite.pipe(S.mutableKey),
  usedCredits: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('DesktopAiCreditSourceUsage', {
    description: 'DesktopAiCreditSourceUsage account boundary data.'
  })
)
/** Decoded mutable DesktopAiCreditSourceUsage data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DesktopAiCreditSourceUsage contract)
 *
 * ```ts
 * import { DesktopAiCreditSourceUsage } from './auth.js'
 * void DesktopAiCreditSourceUsage
 * ```
 *
 */
export type DesktopAiCreditSourceUsage = typeof DesktopAiCreditSourceUsage.Type

/** DesktopAiCreditUsage data shared with account clients.
 *
 * **Example** (Validate DesktopAiCreditUsage)
 *
 * ```ts
 * import * as S from "effect/Schema"
 * import { DesktopAiCreditUsage } from "./auth.js"
 * const value = DesktopAiCreditUsage.make({byFeature: {prompt: 0, transcription: 0}, expiringSoonCredits: 0, quotaCredits: 0, remainingCredits: 0, reservedCredits: 0, usedCredits: 0})
 * S.is(DesktopAiCreditUsage)(value) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopAiCreditUsage = S.Struct({
  byFeature: S.Struct({
    prompt: S.Finite.pipe(S.mutableKey),
    transcription: S.Finite.pipe(S.mutableKey)
  }).pipe(S.mutableKey),
  bySource: S.Struct({
    granted: DesktopAiCreditSourceUsage.pipe(S.mutableKey),
    purchased: DesktopAiCreditSourceUsage.pipe(S.mutableKey)
  }).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  expiringSoonCredits: S.Finite.pipe(S.mutableKey),
  interruptedCredits: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  quotaCredits: S.Finite.pipe(S.mutableKey),
  remainingCredits: S.Finite.pipe(S.mutableKey),
  reservedCredits: S.Finite.pipe(S.mutableKey),
  reconcilingCredits: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  usedCredits: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('DesktopAiCreditUsage', {
    description: 'DesktopAiCreditUsage account boundary data.'
  })
)
/** Decoded mutable DesktopAiCreditUsage data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DesktopAiCreditUsage contract)
 *
 * ```ts
 * import { DesktopAiCreditUsage } from './auth.js'
 * void DesktopAiCreditUsage
 * ```
 *
 */
export type DesktopAiCreditUsage = typeof DesktopAiCreditUsage.Type

/** DesktopInvitationOverview data shared with account clients.
 *
 * **Example** (Validate DesktopInvitationOverview)
 *
 * ```ts
 * import * as S from "effect/Schema"
 * import { DesktopInvitationOverview } from "./auth.js"
 * const value = DesktopInvitationOverview.make({code: "fixture", earnedCredits: 0, invitedUsers: 0, inviteUrl: "fixture"})
 * S.is(DesktopInvitationOverview)(value) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopInvitationOverview = S.Struct({
  code: S.String.pipe(S.mutableKey),
  earnedCredits: S.Finite.pipe(S.mutableKey),
  invitedUsers: S.Finite.pipe(S.mutableKey),
  inviteUrl: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('DesktopInvitationOverview', {
    description: 'DesktopInvitationOverview account boundary data.'
  })
)
/** Decoded mutable DesktopInvitationOverview data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DesktopInvitationOverview contract)
 *
 * ```ts
 * import { DesktopInvitationOverview } from './auth.js'
 * void DesktopInvitationOverview
 * ```
 *
 */
export type DesktopInvitationOverview = typeof DesktopInvitationOverview.Type

/** DesktopInvitedUser data shared with account clients.
 *
 * **Example** (Validate DesktopInvitedUser)
 *
 * ```ts
 * import * as S from "effect/Schema"
 * import { DesktopInvitedUser } from "./auth.js"
 * const value = DesktopInvitedUser.make({createdAt: "fixture", id: "fixture", image: "fixture", name: "fixture", rewardCredits: 0})
 * S.is(DesktopInvitedUser)(value) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopInvitedUser = S.Struct({
  createdAt: S.String.pipe(S.mutableKey),
  id: S.String.pipe(S.mutableKey),
  image: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  name: S.String.pipe(S.mutableKey),
  rewardCredits: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('DesktopInvitedUser', {
    description: 'DesktopInvitedUser account boundary data.'
  })
)
/** Decoded mutable DesktopInvitedUser data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DesktopInvitedUser contract)
 *
 * ```ts
 * import { DesktopInvitedUser } from './auth.js'
 * void DesktopInvitedUser
 * ```
 *
 */
export type DesktopInvitedUser = typeof DesktopInvitedUser.Type

/** DesktopGiftedCreditRecord data shared with account clients.
 *
 * **Example** (Validate DesktopGiftedCreditRecord)
 *
 * ```ts
 * import * as S from "effect/Schema"
 * import { DesktopGiftedCreditRecord } from "./auth.js"
 * const value = DesktopGiftedCreditRecord.make({createdAt: "fixture", credits: 0, expiresAt: "fixture", id: "fixture", reason: "admin", relatedUser: {image: "fixture", name: "fixture"}})
 * S.is(DesktopGiftedCreditRecord)(value) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopGiftedCreditRecord = S.Struct({
  createdAt: S.String.pipe(S.mutableKey),
  credits: S.Finite.pipe(S.mutableKey),
  expiresAt: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  id: S.String.pipe(S.mutableKey),
  reason: LiteralKit(['admin', 'invite_invitee', 'invite_inviter', 'welcome']).pipe(S.mutableKey),
  relatedUser: S.Union([
    S.Struct({
      image: S.Union([S.String, S.Null]).pipe(S.mutableKey),
      name: S.String.pipe(S.mutableKey)
    }),
    S.Null
  ]).pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('DesktopGiftedCreditRecord', {
    description: 'DesktopGiftedCreditRecord account boundary data.'
  })
)
/** Decoded mutable DesktopGiftedCreditRecord data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DesktopGiftedCreditRecord contract)
 *
 * ```ts
 * import { DesktopGiftedCreditRecord } from './auth.js'
 * void DesktopGiftedCreditRecord
 * ```
 *
 */
export type DesktopGiftedCreditRecord = typeof DesktopGiftedCreditRecord.Type

/** DesktopCloudCacheStats data shared with account clients.
 *
 * **Example** (Validate DesktopCloudCacheStats)
 *
 * ```ts
 * import * as S from "effect/Schema"
 * import { DesktopCloudCacheStats } from "./auth.js"
 * const value = DesktopCloudCacheStats.make({today: {hits: 0, misses: 0, bypasses: 0, hitRate: null}, week: {hits: 0, misses: 0, bypasses: 0, hitRate: null}, month: {hits: 0, misses: 0, bypasses: 0, hitRate: null}, all: {hits: 0, misses: 0, bypasses: 0, hitRate: null}})
 * S.is(DesktopCloudCacheStats)(value) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopCloudCacheStats = S.Record(
  LiteralKit(['today', 'week', 'month', 'all']),
  S.Struct({
    hits: S.Finite.pipe(S.mutableKey),
    misses: S.Finite.pipe(S.mutableKey),
    bypasses: S.Finite.pipe(S.mutableKey),
    hitRate: S.Union([S.Finite, S.Null]).pipe(S.mutableKey)
  }).pipe(S.mutableKey)
).pipe(
  $I.annoteSchema('DesktopCloudCacheStats', {
    description: 'DesktopCloudCacheStats account boundary data.'
  })
)
/** Decoded mutable DesktopCloudCacheStats data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DesktopCloudCacheStats contract)
 *
 * ```ts
 * import { DesktopCloudCacheStats } from './auth.js'
 * void DesktopCloudCacheStats
 * ```
 *
 */
export type DesktopCloudCacheStats = typeof DesktopCloudCacheStats.Type

/** DesktopAiReservation data shared with account clients.
 *
 * **Example** (Validate DesktopAiReservation)
 *
 * ```ts
 * import * as S from "effect/Schema"
 * import { DesktopAiReservation } from "./auth.js"
 * const value = DesktopAiReservation.make({createdAt: 0, deadlineAt: 0, expiresAt: 0, lastHeartbeatAt: 0, lastProgressAt: 0, requestId: "fixture", reservedCredits: 0, status: "reserved", taskLabel: "fixture"})
 * S.is(DesktopAiReservation)(value) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopAiReservation = S.Struct({
  recoveryStoppedAt: S.Union([S.Finite, S.Null]).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  createdAt: S.Finite.pipe(S.mutableKey),
  deadlineAt: S.Finite.pipe(S.mutableKey),
  expiresAt: S.Finite.pipe(S.mutableKey),
  lastHeartbeatAt: S.Finite.pipe(S.mutableKey),
  lastProgressAt: S.Finite.pipe(S.mutableKey),
  requestId: S.String.pipe(S.mutableKey),
  reservedCredits: S.Finite.pipe(S.mutableKey),
  status: LiteralKit(['reserved', 'reconciling']).pipe(S.mutableKey),
  taskLabel: S.Union([S.String, S.Null]).pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('DesktopAiReservation', {
    description: 'DesktopAiReservation account boundary data.'
  })
)
/** Decoded mutable DesktopAiReservation data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DesktopAiReservation contract)
 *
 * ```ts
 * import { DesktopAiReservation } from './auth.js'
 * void DesktopAiReservation
 * ```
 *
 */
export type DesktopAiReservation = typeof DesktopAiReservation.Type

/** DesktopAiCreditHistoryCursor data shared with account clients.
 *
 * **Example** (Validate DesktopAiCreditHistoryCursor)
 *
 * ```ts
 * import * as S from "effect/Schema"
 * import { DesktopAiCreditHistoryCursor } from "./auth.js"
 * const value = DesktopAiCreditHistoryCursor.make({at: 0, id: "fixture"})
 * S.is(DesktopAiCreditHistoryCursor)(value) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopAiCreditHistoryCursor = S.Struct({
  at: S.Finite.pipe(S.mutableKey),
  id: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('DesktopAiCreditHistoryCursor', {
    description: 'DesktopAiCreditHistoryCursor account boundary data.'
  })
)
/** Decoded mutable DesktopAiCreditHistoryCursor data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DesktopAiCreditHistoryCursor contract)
 *
 * ```ts
 * import { DesktopAiCreditHistoryCursor } from './auth.js'
 * void DesktopAiCreditHistoryCursor
 * ```
 *
 */
export type DesktopAiCreditHistoryCursor = typeof DesktopAiCreditHistoryCursor.Type

/** DesktopAiCreditReceipt data shared with account clients.
 *
 * **Example** (Validate DesktopAiCreditReceipt)
 *
 * ```ts
 * import * as S from "effect/Schema"
 * import { DesktopAiCreditReceipt } from "./auth.js"
 * const value = DesktopAiCreditReceipt.make({id: "fixture", requestId: "fixture", createdAt: 0, feature: "fixture", taskLabel: "fixture", status: "fixture", credits: 0, refundedCredits: 0, basis: "fixture", pricingVersion: "fixture", model: "fixture", inputTokens: 0, outputTokens: 0})
 * S.is(DesktopAiCreditReceipt)(value) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopAiCreditReceipt = S.Struct({
  id: S.String.pipe(S.mutableKey),
  requestId: S.String.pipe(S.mutableKey),
  createdAt: S.Finite.pipe(S.mutableKey),
  feature: S.String.pipe(S.mutableKey),
  taskLabel: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  status: S.String.pipe(S.mutableKey),
  credits: S.Finite.pipe(S.mutableKey),
  refundedCredits: S.Finite.pipe(S.mutableKey),
  basis: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  pricingVersion: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  model: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  inputTokens: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  outputTokens: S.Union([S.Finite, S.Null]).pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('DesktopAiCreditReceipt', {
    description: 'DesktopAiCreditReceipt account boundary data.'
  })
)
/** Decoded mutable DesktopAiCreditReceipt data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DesktopAiCreditReceipt contract)
 *
 * ```ts
 * import { DesktopAiCreditReceipt } from './auth.js'
 * void DesktopAiCreditReceipt
 * ```
 *
 */
export type DesktopAiCreditReceipt = typeof DesktopAiCreditReceipt.Type

/** DesktopAiCreditHistory data shared with account clients.
 *
 * **Example** (Validate DesktopAiCreditHistory)
 *
 * ```ts
 * import * as S from "effect/Schema"
 * import { DesktopAiCreditHistory } from "./auth.js"
 * const value = DesktopAiCreditHistory.make({items: [], nextCursor: {at: 0, id: "fixture"}})
 * S.is(DesktopAiCreditHistory)(value) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopAiCreditHistory = S.Struct({
  items: S.Array(DesktopAiCreditReceipt).pipe(S.mutable, S.mutableKey),
  nextCursor: S.Union([DesktopAiCreditHistoryCursor, S.Null]).pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('DesktopAiCreditHistory', {
    description: 'DesktopAiCreditHistory account boundary data.'
  })
)
/** Decoded mutable DesktopAiCreditHistory data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DesktopAiCreditHistory contract)
 *
 * ```ts
 * import { DesktopAiCreditHistory } from './auth.js'
 * void DesktopAiCreditHistory
 * ```
 *
 */
export type DesktopAiCreditHistory = typeof DesktopAiCreditHistory.Type

/** DesktopAiCreditSnapshot data shared with account clients.
 *
 * **Example** (Validate DesktopAiCreditSnapshot)
 *
 * ```ts
 * import * as S from "effect/Schema"
 * import { DesktopAiCreditSnapshot } from "./auth.js"
 * const value = DesktopAiCreditSnapshot.make({credits: {byFeature: {prompt: 0, transcription: 0}, expiringSoonCredits: 0, quotaCredits: 0, remainingCredits: 0, reservedCredits: 0, usedCredits: 0}, reservations: []})
 * S.is(DesktopAiCreditSnapshot)(value) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopAiCreditSnapshot = S.Struct({
  credits: DesktopAiCreditUsage.pipe(S.mutableKey),
  reservations: S.Array(DesktopAiReservation).pipe(S.mutable, S.mutableKey)
}).pipe(
  $I.annoteSchema('DesktopAiCreditSnapshot', {
    description: 'DesktopAiCreditSnapshot account boundary data.'
  })
)
/** Decoded mutable DesktopAiCreditSnapshot data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DesktopAiCreditSnapshot contract)
 *
 * ```ts
 * import { DesktopAiCreditSnapshot } from './auth.js'
 * void DesktopAiCreditSnapshot
 * ```
 *
 */
export type DesktopAiCreditSnapshot = typeof DesktopAiCreditSnapshot.Type

/** DesktopAccountOverview data shared with account clients.
 *
 * **Example** (Validate DesktopAccountOverview)
 *
 * ```ts
 * import * as S from "effect/Schema"
 * import { DesktopAccountOverview } from "./auth.js"
 * const value = DesktopAccountOverview.make({...{credits: {byFeature: {prompt: 0, transcription: 0}, expiringSoonCredits: 0, quotaCredits: 0, remainingCredits: 0, reservedCredits: 0, usedCredits: 0}, reservations: []}, ...{invitationOverview: {code: "fixture", earnedCredits: 0, invitedUsers: 0, inviteUrl: "fixture"}, invitedUsers: {items: [], nextCursor: null}, giftedCreditRecords: {items: [], nextCursor: null}}})
 * S.is(DesktopAccountOverview)(value) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const DesktopAccountOverview = S.Struct({
  ...DesktopAiCreditSnapshot.fields,
  ...S.Struct({
    invitationOverview: DesktopInvitationOverview.pipe(S.mutableKey),
    invitedUsers: DesktopPaginatedResult(DesktopInvitedUser).pipe(S.mutableKey),
    giftedCreditRecords: DesktopPaginatedResult(DesktopGiftedCreditRecord).pipe(S.mutableKey)
  }).fields
}).pipe(
  $I.annoteSchema('DesktopAccountOverview', {
    description: 'DesktopAccountOverview account boundary data.'
  })
)
/** Decoded mutable DesktopAccountOverview data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DesktopAccountOverview contract)
 *
 * ```ts
 * import { DesktopAccountOverview } from './auth.js'
 * void DesktopAccountOverview
 * ```
 *
 */
export type DesktopAccountOverview = typeof DesktopAccountOverview.Type
