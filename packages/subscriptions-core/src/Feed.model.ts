import * as S from "effect/Schema";
import * as T from "./Subscription.model.js";

export const RawParsedFeed = S.Unknown;
export type RawParsedFeed = typeof RawParsedFeed.Type;
export const RawFeedItem = S.Unknown;
export type RawFeedItem = typeof RawFeedItem.Type;
export const InterpretableFeed = S.Struct({
  title: S.String.pipe(S.optional, S.mutableKey),
  link: S.String.pipe(S.optional, S.mutableKey),
  image: S.Struct({ url: S.String.pipe(S.optional, S.mutableKey) }).pipe(S.optional, S.mutableKey),
  itunes: S.Struct({ image: S.String.pipe(S.optional, S.mutableKey) }).pipe(S.optional, S.mutableKey),
  items: S.Array(RawFeedItem).pipe(S.mutable, S.mutableKey),
});
export type InterpretableFeed = typeof InterpretableFeed.Type;
export const FeedProbe = S.Struct({
  feed: InterpretableFeed.pipe(S.mutableKey),
  feedUrl: S.String.pipe(S.mutableKey),
  discovered: S.Boolean.pipe(S.mutableKey),
});
export type FeedProbe = typeof FeedProbe.Type;
export const InterpretedFeedItem = S.Struct({
  id: S.Unknown.pipe(S.mutableKey),
  url: S.Unknown.pipe(S.mutableKey),
  title: S.Unknown.pipe(S.mutableKey),
  publishedAt: S.Finite.pipe(S.mutableKey),
  thumbnail: S.Unknown.pipe(S.optional, S.mutableKey),
});
export type InterpretedFeedItem = typeof InterpretedFeedItem.Type;
export const StoredSubscriptionRule = S.Struct({
  ...T.SubscriptionRule.fields,
  platform: S.String.pipe(S.mutableKey),
  status: S.String.pipe(S.mutableKey),
  downloadType: S.String.pipe(S.optional, S.mutableKey),
  downloadQuality: S.String.pipe(S.optional, S.mutableKey),
  downloadContainer: S.String.pipe(S.optional, S.mutableKey),
});
export type StoredSubscriptionRule = typeof StoredSubscriptionRule.Type;
export const StoredSubscriptionWithItems = S.Struct({
  ...StoredSubscriptionRule.fields,
  items: S.Array(T.SubscriptionFeedItem).pipe(S.mutable, S.mutableKey),
});
export type StoredSubscriptionWithItems = typeof StoredSubscriptionWithItems.Type;
export const StoredSubscriptionPatch = S.Struct({
  ...T.SubscriptionUpdateInput.fields,
  id: StoredSubscriptionRule.fields.id.pipe(S.optional, S.mutableKey),
  title: StoredSubscriptionRule.fields.title.pipe(S.optional, S.mutableKey),
  sourceUrl: StoredSubscriptionRule.fields.sourceUrl.pipe(S.optional, S.mutableKey),
  feedUrl: StoredSubscriptionRule.fields.feedUrl.pipe(S.optional, S.mutableKey),
  platform: StoredSubscriptionRule.fields.platform.pipe(S.optional, S.mutableKey),
  keywords: StoredSubscriptionRule.fields.keywords.pipe(S.optional, S.mutableKey),
  tags: StoredSubscriptionRule.fields.tags.pipe(S.optional, S.mutableKey),
  onlyDownloadLatest: StoredSubscriptionRule.fields.onlyDownloadLatest.pipe(S.optional, S.mutableKey),
  autoDownload: StoredSubscriptionRule.fields.autoDownload.pipe(S.optional, S.mutableKey),
  enabled: StoredSubscriptionRule.fields.enabled.pipe(S.optional, S.mutableKey),
  coverUrl: StoredSubscriptionRule.fields.coverUrl.pipe(S.optional, S.mutableKey),
  latestVideoTitle: StoredSubscriptionRule.fields.latestVideoTitle.pipe(S.optional, S.mutableKey),
  latestVideoPublishedAt: StoredSubscriptionRule.fields.latestVideoPublishedAt.pipe(S.optional, S.mutableKey),
  lastCheckedAt: StoredSubscriptionRule.fields.lastCheckedAt.pipe(S.optional, S.mutableKey),
  lastSuccessAt: StoredSubscriptionRule.fields.lastSuccessAt.pipe(S.optional, S.mutableKey),
  status: StoredSubscriptionRule.fields.status.pipe(S.optional, S.mutableKey),
  lastError: StoredSubscriptionRule.fields.lastError.pipe(S.optional, S.mutableKey),
  createdAt: StoredSubscriptionRule.fields.createdAt.pipe(S.optional, S.mutableKey),
  updatedAt: StoredSubscriptionRule.fields.updatedAt.pipe(S.optional, S.mutableKey),
  downloadDirectory: StoredSubscriptionRule.fields.downloadDirectory.pipe(S.optional, S.mutableKey),
  namingTemplate: StoredSubscriptionRule.fields.namingTemplate.pipe(S.optional, S.mutableKey),
  sourceKind: StoredSubscriptionRule.fields.sourceKind.pipe(S.optional, S.mutableKey),
  profileOwner: StoredSubscriptionRule.fields.profileOwner.pipe(S.optional, S.mutableKey),
  categories: StoredSubscriptionRule.fields.categories.pipe(S.optional, S.mutableKey),
  nextCheckAt: StoredSubscriptionRule.fields.nextCheckAt.pipe(S.optional, S.mutableKey),
  downloadType: StoredSubscriptionRule.fields.downloadType.pipe(S.optional, S.mutableKey),
  downloadQuality: StoredSubscriptionRule.fields.downloadQuality.pipe(S.optional, S.mutableKey),
  downloadContainer: StoredSubscriptionRule.fields.downloadContainer.pipe(S.optional, S.mutableKey),
  checkIntervalMs: S.NullOr(S.Finite).pipe(S.optional, S.mutableKey),
});
export type StoredSubscriptionPatch = typeof StoredSubscriptionPatch.Type;
export const InterpretedFeedPatch = S.Struct({
  ...StoredSubscriptionPatch.fields,
  latestVideoTitle: S.Unknown.pipe(S.optional, S.mutableKey),
  coverUrl: S.Unknown.pipe(S.optional, S.mutableKey),
});
export type InterpretedFeedPatch = typeof InterpretedFeedPatch.Type;
// A mutation returns constructed values, independently of SQLite's coercions.
// Raw constructed numbers include NaN; they are not finite stored domain numbers.
const MutationNumber = S.declare((value): value is number => typeof value === "number");
const mutationField = <Field extends S.Constraint>(field: Field) =>
  S.Union([field, S.Null, S.String, MutationNumber, S.Boolean, S.Undefined]).pipe(S.optional, S.mutableKey);
export const SubscriptionMutationResult = S.Struct({
  id: mutationField(StoredSubscriptionRule.fields.id),
  title: mutationField(StoredSubscriptionRule.fields.title),
  sourceUrl: mutationField(StoredSubscriptionRule.fields.sourceUrl),
  feedUrl: mutationField(StoredSubscriptionRule.fields.feedUrl),
  platform: mutationField(StoredSubscriptionRule.fields.platform),
  keywords: mutationField(StoredSubscriptionRule.fields.keywords),
  tags: mutationField(StoredSubscriptionRule.fields.tags),
  onlyDownloadLatest: mutationField(StoredSubscriptionRule.fields.onlyDownloadLatest),
  autoDownload: mutationField(StoredSubscriptionRule.fields.autoDownload),
  enabled: mutationField(StoredSubscriptionRule.fields.enabled),
  coverUrl: mutationField(S.Union([StoredSubscriptionRule.fields.coverUrl, S.BigInt])),
  latestVideoTitle: mutationField(StoredSubscriptionRule.fields.latestVideoTitle),
  latestVideoPublishedAt: mutationField(StoredSubscriptionRule.fields.latestVideoPublishedAt),
  lastCheckedAt: mutationField(StoredSubscriptionRule.fields.lastCheckedAt),
  lastSuccessAt: mutationField(StoredSubscriptionRule.fields.lastSuccessAt),
  status: mutationField(StoredSubscriptionRule.fields.status),
  lastError: mutationField(StoredSubscriptionRule.fields.lastError),
  createdAt: mutationField(StoredSubscriptionRule.fields.createdAt),
  updatedAt: mutationField(StoredSubscriptionRule.fields.updatedAt),
  downloadDirectory: mutationField(StoredSubscriptionRule.fields.downloadDirectory),
  namingTemplate: mutationField(StoredSubscriptionRule.fields.namingTemplate),
  sourceKind: mutationField(StoredSubscriptionRule.fields.sourceKind),
  profileOwner: mutationField(StoredSubscriptionRule.fields.profileOwner),
  categories: mutationField(StoredSubscriptionRule.fields.categories),
  checkIntervalMs: mutationField(StoredSubscriptionRule.fields.checkIntervalMs),
  nextCheckAt: mutationField(StoredSubscriptionRule.fields.nextCheckAt),
  downloadType: mutationField(StoredSubscriptionRule.fields.downloadType),
  downloadQuality: mutationField(StoredSubscriptionRule.fields.downloadQuality),
  downloadContainer: mutationField(StoredSubscriptionRule.fields.downloadContainer),
  items: StoredSubscriptionWithItems.fields.items,
});
export type SubscriptionMutationResult = typeof SubscriptionMutationResult.Type;
export const StoredAutoDownloadInputs = S.Struct({
  subscription: StoredSubscriptionRule.pipe(S.mutableKey),
  knownItems: S.Array(T.SubscriptionFeedItem).pipe(S.mutable, S.mutableKey),
  feed: InterpretableFeed.pipe(S.mutableKey),
});
export type StoredAutoDownloadInputs = typeof StoredAutoDownloadInputs.Type;
export const StoredAutoDownloadDecision = S.Struct({
  subscription: StoredSubscriptionRule.pipe(S.mutableKey),
  items: S.Array(InterpretedFeedItem).pipe(S.mutable, S.mutableKey),
  feedItemsToPersist: S.Array(InterpretedFeedItem).pipe(S.mutable, S.mutableKey),
  latestPublishedAt: S.NullOr(S.Finite).pipe(S.mutableKey),
  latestVideoTitle: S.Unknown.pipe(S.optional, S.mutableKey),
  coverUrl: S.Unknown.pipe(S.optional, S.mutableKey),
});
export type StoredAutoDownloadDecision = typeof StoredAutoDownloadDecision.Type;

export const StoredProfileDownloadInputs = S.Struct({
  subscription: StoredSubscriptionRule.pipe(S.mutableKey),
  knownItems: S.Array(T.SubscriptionFeedItem).pipe(S.mutable, S.mutableKey),
  result: T.ProfileCheckResult.pipe(S.mutableKey),
});
export type StoredProfileDownloadInputs = typeof StoredProfileDownloadInputs.Type;
