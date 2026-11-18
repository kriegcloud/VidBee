import * as S from "effect/Schema";
// Text primary keys follow Drizzle, rejecting physically possible NULL values.
// SQLite numeric affinity also permits real numbers; no integer refinements apply.
// Stored non-finite numbers fail decoding with DbRowDecodeError, like NULL primary keys.

export class SubscriptionRow extends S.Class<SubscriptionRow, { readonly brand: unique symbol }>(
  "@vidbee/db/SubscriptionRow"
)({
  id: S.String,
  title: S.String,
  sourceUrl: S.String,
  feedUrl: S.String,
  platform: S.String,
  keywords: S.String,
  tags: S.String,
  onlyDownloadLatest: S.Finite,
  autoDownload: S.Finite,
  enabled: S.Finite,
  coverUrl: S.NullOr(S.String),
  latestVideoTitle: S.NullOr(S.String),
  latestVideoPublishedAt: S.NullOr(S.Finite),
  lastCheckedAt: S.NullOr(S.Finite),
  lastSuccessAt: S.NullOr(S.Finite),
  status: S.String,
  lastError: S.NullOr(S.String),
  createdAt: S.Finite,
  updatedAt: S.Finite,
  downloadDirectory: S.NullOr(S.String),
  namingTemplate: S.NullOr(S.String),
  downloadType: S.NullOr(S.String),
  downloadQuality: S.NullOr(S.String),
  downloadContainer: S.NullOr(S.String),
  sourceKind: S.String,
  profileOwner: S.NullOr(S.String),
  categories: S.String,
  checkIntervalMs: S.NullOr(S.Finite),
  nextCheckAt: S.NullOr(S.Finite),
}) {}
export const SubscriptionRowFromSql = SubscriptionRow.pipe(
  S.encodeKeys({
    sourceUrl: "source_url",
    feedUrl: "feed_url",
    onlyDownloadLatest: "only_latest",
    autoDownload: "auto_download",
    coverUrl: "cover_url",
    latestVideoTitle: "latest_video_title",
    latestVideoPublishedAt: "latest_video_published_at",
    lastCheckedAt: "last_checked_at",
    lastSuccessAt: "last_success_at",
    lastError: "last_error",
    createdAt: "created_at",
    updatedAt: "updated_at",
    downloadDirectory: "download_directory",
    namingTemplate: "naming_template",
    downloadType: "download_type",
    downloadQuality: "download_quality",
    downloadContainer: "download_container",
    sourceKind: "source_kind",
    profileOwner: "profile_owner",
    checkIntervalMs: "check_interval_ms",
    nextCheckAt: "next_check_at",
  })
);
export const SubscriptionInsert = S.Struct({
  id: S.String,
  title: S.String,
  sourceUrl: S.String,
  feedUrl: S.String,
  platform: S.String,
  keywords: S.String,
  tags: S.String,
  onlyDownloadLatest: S.Finite,
  autoDownload: S.Finite,
  enabled: S.Finite,
  coverUrl: S.String.pipe(S.NullOr, S.optional),
  latestVideoTitle: S.String.pipe(S.NullOr, S.optional),
  latestVideoPublishedAt: S.Finite.pipe(S.NullOr, S.optional),
  lastCheckedAt: S.Finite.pipe(S.NullOr, S.optional),
  lastSuccessAt: S.Finite.pipe(S.NullOr, S.optional),
  status: S.String,
  lastError: S.String.pipe(S.NullOr, S.optional),
  createdAt: S.Finite,
  updatedAt: S.Finite,
  downloadDirectory: S.String.pipe(S.NullOr, S.optional),
  namingTemplate: S.String.pipe(S.NullOr, S.optional),
  downloadType: S.String.pipe(S.NullOr, S.optional),
  downloadQuality: S.String.pipe(S.NullOr, S.optional),
  downloadContainer: S.String.pipe(S.NullOr, S.optional),
  sourceKind: S.optional(S.String),
  profileOwner: S.String.pipe(S.NullOr, S.optional),
  categories: S.optional(S.String),
  checkIntervalMs: S.Finite.pipe(S.NullOr, S.optional),
  nextCheckAt: S.Finite.pipe(S.NullOr, S.optional),
});
export type SubscriptionInsert = typeof SubscriptionInsert.Type;

export class SubscriptionItemRow extends S.Class<SubscriptionItemRow, { readonly brand: unique symbol }>(
  "@vidbee/db/SubscriptionItemRow"
)({
  subscriptionId: S.String,
  itemId: S.String,
  title: S.String,
  url: S.String,
  publishedAt: S.Finite,
  thumbnail: S.NullOr(S.String),
  added: S.Finite,
  taskId: S.NullOr(S.String),
  createdAt: S.Finite,
  updatedAt: S.Finite,
}) {}
export const SubscriptionItemRowFromSql = SubscriptionItemRow.pipe(
  S.encodeKeys({
    subscriptionId: "subscription_id",
    itemId: "item_id",
    publishedAt: "published_at",
    taskId: "task_id",
    createdAt: "created_at",
    updatedAt: "updated_at",
  })
);
export const SubscriptionItemInsert = S.Struct({
  subscriptionId: S.String,
  itemId: S.String,
  title: S.String,
  url: S.String,
  publishedAt: S.Finite,
  thumbnail: S.String.pipe(S.NullOr, S.optional),
  added: S.Finite,
  taskId: S.String.pipe(S.NullOr, S.optional),
  createdAt: S.Finite,
  updatedAt: S.Finite,
});
export type SubscriptionItemInsert = typeof SubscriptionItemInsert.Type;

export class SubscriptionsMetaRow extends S.Class<SubscriptionsMetaRow, { readonly brand: unique symbol }>(
  "@vidbee/db/SubscriptionsMetaRow"
)({
  key: S.String,
  value: S.String,
  updatedAt: S.Finite,
}) {}
export const SubscriptionsMetaRowFromSql = SubscriptionsMetaRow.pipe(S.encodeKeys({ updatedAt: "updated_at" }));
export const SubscriptionsMetaInsert = S.Struct({
  key: S.String,
  value: S.String,
  updatedAt: S.Finite,
});
export type SubscriptionsMetaInsert = typeof SubscriptionsMetaInsert.Type;
