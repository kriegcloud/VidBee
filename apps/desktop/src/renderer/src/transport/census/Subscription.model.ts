import { OneClickContainerOption, OneClickQualityPreset } from "@vidbee/downloader-core/format-preferences";
import { $DesktopId } from "@vidbee/identity/packages";
import * as Stored from "@vidbee/subscriptions-core/Feed.model";
import * as Core from "@vidbee/subscriptions-core/Subscription.model";
import * as S from "effect/Schema";
import { RpcOptional } from "../RpcField.model.js";
import { RpcObserved } from "../RpcObservation.model.js";
export const RpcFinite = RpcObserved(S.Finite);
const $I = $DesktopId.create("shared/subscriptions/Subscription.model");
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
  items: S.Array(DesktopSubscriptionItem).pipe(S.mutable, S.mutableKey),
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
export class DesktopSubscription extends S.Opaque<DesktopSubscription, { readonly brand: unique symbol }>()(
  S.Struct(desktopFields).pipe(
    $I.annoteSchema("DesktopSubscription", { description: "Stored desktop snapshot in projector order." })
  )
) {}
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
export class CreateSubscription extends S.Opaque<CreateSubscription, { readonly brand: unique symbol }>()(
  S.Struct({
    ...preferences,
    url: S.String.pipe(S.mutableKey),
    keywords: S.Array(S.String).pipe(S.mutable, RpcOptional),
    tags: S.Array(S.String).pipe(S.mutable, RpcOptional),
    onlyDownloadLatest: RpcOptional(S.Boolean),
    autoDownload: RpcOptional(S.Boolean),
    downloadDirectory: RpcOptional(S.String),
    namingTemplate: RpcOptional(S.String),
    enabled: RpcOptional(S.Boolean),
    categories: S.Array(S.String).pipe(S.mutable, RpcOptional),
    checkIntervalMs: RpcOptional(RpcFinite),
  }).pipe($I.annoteSchema("CreateSubscription", { description: "Desktop create before defaults." }))
) {}
export class UpdateSubscription extends S.Opaque<UpdateSubscription, { readonly brand: unique symbol }>()(
  S.Struct({
    downloadType: RpcOptional(S.String),
    downloadQuality: RpcOptional(S.String),
    downloadContainer: RpcOptional(S.String),
    title: RpcOptional(S.String),
    sourceUrl: RpcOptional(S.String),
    feedUrl: RpcOptional(S.String),
    platform: RpcOptional(Core.SubscriptionPlatform),
    keywords: S.Array(S.String).pipe(S.mutable, RpcOptional),
    tags: S.Array(S.String).pipe(S.mutable, RpcOptional),
    onlyDownloadLatest: RpcOptional(S.Boolean),
    autoDownload: RpcOptional(S.Boolean),
    enabled: RpcOptional(S.Boolean),
    downloadDirectory: RpcOptional(S.String),
    namingTemplate: RpcOptional(S.String),
    categories: S.Array(S.String).pipe(S.mutable, RpcOptional),
    checkIntervalMs: S.NullOr(RpcFinite).pipe(RpcOptional),
    items: S.Array(DesktopSubscriptionItem).pipe(S.mutable, RpcOptional),
  }).pipe($I.annoteSchema("UpdateSubscription", { description: "Presence-preserving desktop patch." }))
) {}
export const DesktopSubscriptionList = S.Array(DesktopSubscription).pipe(S.mutable);
export type DesktopSubscriptionList = typeof DesktopSubscriptionList.Type;
export const DesktopSubscriptionView = S.Union([DesktopSubscription, DesktopSubscriptionMutation]);
export type DesktopSubscriptionView = typeof DesktopSubscriptionView.Type;
export const SubscriptionId = S.Struct({ id: S.String });
export const ResolveSubscription = S.Struct({ url: S.String });
export const UpdateSubscriptionRequest = S.Struct({ id: S.String, updates: UpdateSubscription });
export const RefreshSubscription = S.Struct({ id: RpcOptional(S.String) });
export const QueueSubscriptionItem = S.Struct({ id: S.String, itemId: S.String });
export const ResolvedFeed = S.Struct({ ...Core.ResolvedFeed.fields, profileOwner: RpcOptional(S.String) });
export const DesktopLegacyMutation = S.Struct({
  ...Stored.SubscriptionMutationResult.fields,
  items: S.Array(DesktopSubscriptionItem).pipe(S.mutable, S.mutableKey),
});
export type DesktopLegacyMutation = typeof DesktopLegacyMutation.Type;
