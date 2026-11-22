import { OneClickContainerOption, OneClickQualityPreset } from "@vidbee/downloader-core/format-preferences";
import { $DesktopId } from "@vidbee/identity/packages";
import * as Stored from "@vidbee/subscriptions-core/Feed.model";
import * as Core from "@vidbee/subscriptions-core/Subscription.model";
import * as S from "effect/Schema";
import { RpcMutableArray, RpcOptional } from "../RpcField.model.js";
import { RpcObserved } from "../RpcObservation.model.js";

const $I = $DesktopId.create("shared/subscriptions/Subscription.model");
/**
 * Validates Rpc Finite at the desktop capability boundary before dispatch.
 *
 * **Example** (Use RpcFinite at its owning boundary)
 *
 * ```ts
 * import { RpcFinite } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(RpcFinite);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const RpcFinite = RpcObserved(S.Finite).pipe(
  $I.annoteSchema("RpcFinite", { description: "Rpc Finite boundary in the desktop transport contract." })
);
/**
 * Describes Rpc Finite ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RpcFinite = typeof RpcFinite.Type;

/**
 * Validates Desktop Subscription Item at the desktop capability boundary before dispatch.
 *
 * **Example** (Use DesktopSubscriptionItem at its owning boundary)
 *
 * ```ts
 * import { DesktopSubscriptionItem } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(DesktopSubscriptionItem);
 * const validated = decode({});
 * void validated;
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
 * Validates desktop Fields at the desktop capability boundary before dispatch.
 *
 * **Example** (Use desktopFields at its owning boundary)
 *
 * ```ts
 * import { desktopFields } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const schema = S.Struct(desktopFields);
 * void S.decodeUnknownEffect(schema)({});
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
 * Validates Desktop Subscription at the desktop capability boundary before dispatch.
 *
 * **Example** (Use DesktopSubscription at its owning boundary)
 *
 * ```ts
 * import { DesktopSubscription } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(DesktopSubscription);
 * const validated = decode({});
 * void validated;
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
 * Validates Desktop Subscription Mutation at the desktop capability boundary before dispatch.
 *
 * **Example** (Use DesktopSubscriptionMutation at its owning boundary)
 *
 * ```ts
 * import { DesktopSubscriptionMutation } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(DesktopSubscriptionMutation);
 * const validated = decode({});
 * void validated;
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
 * Validates Create Subscription at the desktop capability boundary before dispatch.
 *
 * **Example** (Use CreateSubscription at its owning boundary)
 *
 * ```ts
 * import { CreateSubscription } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(CreateSubscription);
 * const validated = decode({});
 * void validated;
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
 * Validates Update Subscription at the desktop capability boundary before dispatch.
 *
 * **Example** (Use UpdateSubscription at its owning boundary)
 *
 * ```ts
 * import { UpdateSubscription } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(UpdateSubscription);
 * const validated = decode({});
 * void validated;
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
 * Validates Desktop Subscription List at the desktop capability boundary before dispatch.
 *
 * **Example** (Use DesktopSubscriptionList at its owning boundary)
 *
 * ```ts
 * import { DesktopSubscriptionList } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(DesktopSubscriptionList);
 * const validated = decode({});
 * void validated;
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
 * Describes Desktop Subscription List ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type DesktopSubscriptionList = typeof DesktopSubscriptionList.Type;
/**
 * Validates Desktop Subscription View at the desktop capability boundary before dispatch.
 *
 * **Example** (Use DesktopSubscriptionView at its owning boundary)
 *
 * ```ts
 * import { DesktopSubscriptionView } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(DesktopSubscriptionView);
 * const validated = decode({});
 * void validated;
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
 * Describes Desktop Subscription View ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type DesktopSubscriptionView = typeof DesktopSubscriptionView.Type;
/**
 * Validates Subscription Id at the desktop capability boundary before dispatch.
 *
 * **Example** (Use SubscriptionId at its owning boundary)
 *
 * ```ts
 * import { SubscriptionId } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(SubscriptionId);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SubscriptionId = S.Struct({ id: S.String }).pipe(
  $I.annoteSchema("SubscriptionId", { description: "Subscription Id boundary in the desktop transport contract." })
);
/**
 * Describes Subscription Id ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type SubscriptionId = typeof SubscriptionId.Type;
/**
 * Validates Resolve Subscription at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ResolveSubscription at its owning boundary)
 *
 * ```ts
 * import { ResolveSubscription } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ResolveSubscription);
 * const validated = decode({});
 * void validated;
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
 * Describes Resolve Subscription ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ResolveSubscription = typeof ResolveSubscription.Type;
/**
 * Validates Update Subscription Request at the desktop capability boundary before dispatch.
 *
 * **Example** (Use UpdateSubscriptionRequest at its owning boundary)
 *
 * ```ts
 * import { UpdateSubscriptionRequest } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(UpdateSubscriptionRequest);
 * const validated = decode({});
 * void validated;
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
 * Describes Update Subscription Request ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type UpdateSubscriptionRequest = typeof UpdateSubscriptionRequest.Type;
/**
 * Validates Refresh Subscription at the desktop capability boundary before dispatch.
 *
 * **Example** (Use RefreshSubscription at its owning boundary)
 *
 * ```ts
 * import { RefreshSubscription } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(RefreshSubscription);
 * const validated = decode({});
 * void validated;
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
 * Describes Refresh Subscription ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RefreshSubscription = typeof RefreshSubscription.Type;
/**
 * Validates Queue Subscription Item at the desktop capability boundary before dispatch.
 *
 * **Example** (Use QueueSubscriptionItem at its owning boundary)
 *
 * ```ts
 * import { QueueSubscriptionItem } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(QueueSubscriptionItem);
 * const validated = decode({});
 * void validated;
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
 * Describes Queue Subscription Item ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type QueueSubscriptionItem = typeof QueueSubscriptionItem.Type;
/**
 * Validates Resolved Feed at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ResolvedFeed at its owning boundary)
 *
 * ```ts
 * import { ResolvedFeed } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ResolvedFeed);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ResolvedFeed = S.Struct({ ...Core.ResolvedFeed.fields, profileOwner: RpcOptional(S.String) }).pipe(
  $I.annoteSchema("ResolvedFeed", { description: "Resolved Feed boundary in the desktop transport contract." })
);
/**
 * Describes Resolved Feed ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ResolvedFeed = typeof ResolvedFeed.Type;
/**
 * Validates Desktop Legacy Mutation at the desktop capability boundary before dispatch.
 *
 * **Example** (Use DesktopLegacyMutation at its owning boundary)
 *
 * ```ts
 * import { DesktopLegacyMutation } from "./Subscription.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(DesktopLegacyMutation);
 * const validated = decode({});
 * void validated;
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
 * Describes Desktop Legacy Mutation ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type DesktopLegacyMutation = typeof DesktopLegacyMutation.Type;
