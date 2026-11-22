import { OneClickContainerOption, OneClickQualityPreset } from "@vidbee/downloader-core/format-preferences";
import { $DesktopId } from "@vidbee/identity/packages";
import * as Stored from "@vidbee/subscriptions-core/Feed.model";
import * as Core from "@vidbee/subscriptions-core/Subscription.model";
import * as S from "effect/Schema";
import { RpcMutableArray, RpcOptional } from "../RpcField.model.js";
import { RpcObserved } from "../RpcObservation.model.js";

const $I = $DesktopId.create("shared/subscriptions/Subscription.model");
/**
 * Restricts renderer-authored numeric input to finite values before native command dispatch.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { RpcFinite } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(RpcFinite)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const RpcFinite = RpcObserved(S.Finite).pipe(
  $I.annoteSchema("RpcFinite", { description: "Rpc Finite boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link RpcFinite}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RpcFinite = typeof RpcFinite.Type;

/**
 * Projects a feed item with publication time and its queued download association.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { DesktopSubscriptionItem } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(DesktopSubscriptionItem)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class DesktopSubscriptionItem extends S.Opaque<DesktopSubscriptionItem, { readonly brand: unique symbol }>()(
  S.Struct({
    id: S.String.pipe(S.mutableKey),
    url: S.String.pipe(S.mutableKey),
    title: S.String.pipe(S.mutableKey),
    publishedAt: RpcFinite.pipe(S.mutableKey),
    addedToQueue: S.Boolean.pipe(S.mutableKey),
    thumbnail: RpcOptional(S.String),
    downloadId: RpcOptional(S.String),
  }).pipe($I.annoteSchema("DesktopSubscriptionItem", { description: "Attached item linked under downloadId." }))
) {}
const f = Stored.StoredSubscriptionRule.fields;
/**
 * Defines the projected desktop feed subscription fields reused by full reads and mutations; observation codecs preserve the native values beyond this projection.
 *
 * **Example** (Use desktopFields with its owner)
 *
 * ```ts
 * import { desktopFields } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const codec = S.Struct(desktopFields);
 * export const decoded = S.decodeUnknownResult(codec)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const desktopFields = {
  id: f.id,
  title: f.title,
  sourceUrl: f.sourceUrl,
  feedUrl: f.feedUrl,
  platform: f.platform,
  keywords: f.keywords,
  tags: f.tags,
  onlyDownloadLatest: f.onlyDownloadLatest,
  autoDownload: f.autoDownload,
  enabled: f.enabled,
  status: f.status,
  createdAt: f.createdAt,
  updatedAt: f.updatedAt,
  sourceKind: f.sourceKind,
  categories: f.categories,
  items: RpcMutableArray(DesktopSubscriptionItem).pipe(S.mutableKey),
  profileOwner: RpcOptional(S.String),
  checkIntervalMs: RpcOptional(RpcFinite),
  nextCheckAt: RpcOptional(RpcFinite),
  coverUrl: RpcOptional(S.String),
  latestVideoTitle: RpcOptional(S.String),
  latestVideoPublishedAt: RpcOptional(RpcFinite),
  lastCheckedAt: RpcOptional(RpcFinite),
  lastSuccessAt: RpcOptional(RpcFinite),
  lastError: RpcOptional(S.String),
  downloadDirectory: RpcOptional(S.String),
  namingTemplate: RpcOptional(S.String),
  downloadType: RpcOptional(S.String),
  downloadQuality: RpcOptional(S.String),
  downloadContainer: RpcOptional(S.String),
};
/**
 * Preserves the desktop feed subscription view and its observed item collection.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { DesktopSubscription } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(DesktopSubscription)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class DesktopSubscription extends S.Opaque<DesktopSubscription, { readonly brand: unique symbol }>()(
  S.Struct(desktopFields).pipe(
    $I.annoteSchema("DesktopSubscription", { description: "Stored desktop snapshot in projector order." })
  )
) {}
/**
 * Preserves the native subscription mutation result, including omitted and explicitly undefined fields.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { DesktopSubscriptionMutation } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(DesktopSubscriptionMutation)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class DesktopSubscriptionMutation extends S.Opaque<
  DesktopSubscriptionMutation,
  { readonly brand: unique symbol }
>()(
  S.Struct(desktopFields).pipe(
    $I.annoteSchema("DesktopSubscriptionMutation", {
      description: "Successful typed update projection, independently decoded without a reread.",
    })
  )
) {}
const preferences = {
  downloadType: RpcOptional(Core.SubscriptionDownloadType),
  downloadQuality: RpcOptional(OneClickQualityPreset),
  downloadContainer: RpcOptional(OneClickContainerOption),
};
/**
 * Validates authored feed subscription settings, source URL and initial download policy.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { CreateSubscription } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(CreateSubscription)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class CreateSubscription extends S.Opaque<CreateSubscription, { readonly brand: unique symbol }>()(
  S.Struct({
    ...preferences,
    url: S.String.pipe(S.mutableKey),
    keywords: RpcMutableArray(S.String).pipe(RpcOptional),
    tags: RpcMutableArray(S.String).pipe(RpcOptional),
    onlyDownloadLatest: RpcOptional(S.Boolean),
    autoDownload: RpcOptional(S.Boolean),
    downloadDirectory: RpcOptional(S.String),
    namingTemplate: RpcOptional(S.String),
    enabled: RpcOptional(S.Boolean),
    categories: RpcMutableArray(S.String).pipe(RpcOptional),
    checkIntervalMs: RpcOptional(RpcFinite),
  }).pipe($I.annoteSchema("CreateSubscription", { description: "Desktop create before defaults." }))
) {}
/**
 * Validates a partial feed subscription edit; omitted fields retain their existing values.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { UpdateSubscription } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(UpdateSubscription)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class UpdateSubscription extends S.Opaque<UpdateSubscription, { readonly brand: unique symbol }>()(
  S.Struct({
    downloadType: RpcOptional(S.String),
    downloadQuality: RpcOptional(S.String),
    downloadContainer: RpcOptional(S.String),
    title: RpcOptional(S.String),
    sourceUrl: RpcOptional(S.String),
    feedUrl: RpcOptional(S.String),
    platform: RpcOptional(Core.SubscriptionPlatform),
    keywords: RpcMutableArray(S.String).pipe(RpcOptional),
    tags: RpcMutableArray(S.String).pipe(RpcOptional),
    onlyDownloadLatest: RpcOptional(S.Boolean),
    autoDownload: RpcOptional(S.Boolean),
    enabled: RpcOptional(S.Boolean),
    downloadDirectory: RpcOptional(S.String),
    namingTemplate: RpcOptional(S.String),
    categories: RpcMutableArray(S.String).pipe(RpcOptional),
    checkIntervalMs: S.NullOr(RpcFinite).pipe(RpcOptional),
    items: RpcMutableArray(DesktopSubscriptionItem).pipe(RpcOptional),
  }).pipe($I.annoteSchema("UpdateSubscription", { description: "Presence-preserving desktop patch." }))
) {}
/**
 * Preserves the observed list of desktop feed subscriptions.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { DesktopSubscriptionList } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(DesktopSubscriptionList)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const DesktopSubscriptionList = RpcMutableArray(DesktopSubscription).pipe(
  $I.annoteSchema("DesktopSubscriptionList", {
    description: "Desktop Subscription List boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link DesktopSubscriptionList}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type DesktopSubscriptionList = typeof DesktopSubscriptionList.Type;
/**
 * Preserves a desktop subscription read without discarding additional native fields.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { DesktopSubscriptionView } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(DesktopSubscriptionView)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const DesktopSubscriptionView = S.Union([DesktopSubscription, DesktopSubscriptionMutation]).pipe(
  $I.annoteSchema("DesktopSubscriptionView", {
    description: "Desktop Subscription View boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link DesktopSubscriptionView}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type DesktopSubscriptionView = typeof DesktopSubscriptionView.Type;
/**
 * Identifies the feed subscription targeted by a command.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { SubscriptionId } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(SubscriptionId)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SubscriptionId = S.Struct({ id: S.String }).pipe(
  $I.annoteSchema("SubscriptionId", { description: "Subscription Id boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link SubscriptionId}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type SubscriptionId = typeof SubscriptionId.Type;
/**
 * Selects a source URL for feed discovery.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ResolveSubscription } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ResolveSubscription)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ResolveSubscription = S.Struct({ url: S.String }).pipe(
  $I.annoteSchema("ResolveSubscription", {
    description: "Resolve Subscription boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link ResolveSubscription}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ResolveSubscription = typeof ResolveSubscription.Type;
/**
 * Pairs a subscription ID with the validated partial settings edit.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { UpdateSubscriptionRequest } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(UpdateSubscriptionRequest)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const UpdateSubscriptionRequest = S.Struct({ id: S.String, updates: UpdateSubscription }).pipe(
  $I.annoteSchema("UpdateSubscriptionRequest", {
    description: "Update Subscription Request boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link UpdateSubscriptionRequest}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type UpdateSubscriptionRequest = typeof UpdateSubscriptionRequest.Type;
/**
 * Identifies the subscription whose feed should be refreshed.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { RefreshSubscription } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(RefreshSubscription)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const RefreshSubscription = S.Struct({ id: RpcOptional(S.String) }).pipe(
  $I.annoteSchema("RefreshSubscription", {
    description: "Refresh Subscription boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link RefreshSubscription}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RefreshSubscription = typeof RefreshSubscription.Type;
/**
 * Identifies a feed item within its subscription for download queue admission.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { QueueSubscriptionItem } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(QueueSubscriptionItem)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const QueueSubscriptionItem = S.Struct({ id: S.String, itemId: S.String }).pipe(
  $I.annoteSchema("QueueSubscriptionItem", {
    description: "Queue Subscription Item boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link QueueSubscriptionItem}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type QueueSubscriptionItem = typeof QueueSubscriptionItem.Type;
/**
 * Preserves feed discovery results, including the observed profile owner.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ResolvedFeed } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ResolvedFeed)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ResolvedFeed = S.Struct({ ...Core.ResolvedFeed.fields, profileOwner: RpcOptional(S.String) }).pipe(
  $I.annoteSchema("ResolvedFeed", { description: "Resolved Feed boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link ResolvedFeed}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ResolvedFeed = typeof ResolvedFeed.Type;
/**
 * Projects legacy mutation results while preserving the observed item payload.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { DesktopLegacyMutation } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(DesktopLegacyMutation)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const DesktopLegacyMutation = S.Struct({
  ...Stored.SubscriptionMutationResult.fields,
  items: RpcMutableArray(DesktopSubscriptionItem).pipe(S.mutableKey),
}).pipe(
  $I.annoteSchema("DesktopLegacyMutation", {
    description: "Desktop Legacy Mutation boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link DesktopLegacyMutation}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type DesktopLegacyMutation = typeof DesktopLegacyMutation.Type;
