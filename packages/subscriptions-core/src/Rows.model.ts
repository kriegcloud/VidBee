import { DbRowDecodeError } from "@vidbee/db";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as HashSet from "effect/HashSet";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Getter from "effect/SchemaGetter";
import * as Issue from "effect/SchemaIssue";
import * as Str from "effect/String";
import type { StoredSubscriptionRule } from "./Feed.model.js";
import type { SubscriptionFeedItem } from "./Subscription.model.js";

export const SqlNumber = S.Union([S.Finite, S.BigInt]).pipe(
  S.decodeTo(S.Finite, {
    decode: Getter.transform((value) => Number(value)),
    encode: Getter.transform((value) => value),
  })
);
export const SubscriptionRawRow = S.Struct({
  id: S.String,
  title: S.String,
  sourceUrl: S.String,
  feedUrl: S.String,
  platform: S.String,
  keywords: S.String,
  tags: S.String,
  onlyDownloadLatest: SqlNumber,
  autoDownload: SqlNumber,
  enabled: SqlNumber,
  coverUrl: S.NullOr(S.String),
  latestVideoTitle: S.NullOr(S.String),
  latestVideoPublishedAt: S.NullOr(SqlNumber),
  lastCheckedAt: S.NullOr(SqlNumber),
  lastSuccessAt: S.NullOr(SqlNumber),
  status: S.String,
  lastError: S.NullOr(S.String),
  createdAt: SqlNumber,
  updatedAt: SqlNumber,
  downloadDirectory: S.NullOr(S.String),
  namingTemplate: S.NullOr(S.String),
  downloadType: S.NullOr(S.String),
  downloadQuality: S.NullOr(S.String),
  downloadContainer: S.NullOr(S.String),
  sourceKind: S.String,
  profileOwner: S.NullOr(S.String),
  categories: S.String,
  checkIntervalMs: S.NullOr(SqlNumber),
  nextCheckAt: S.NullOr(SqlNumber),
});
export const SubscriptionRawRowFromSql = SubscriptionRawRow.pipe(
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
export const SubscriptionItemRawRow = S.Struct({
  subscriptionId: S.String,
  itemId: S.String,
  title: S.String,
  url: S.String,
  publishedAt: SqlNumber,
  thumbnail: S.NullOr(S.String),
  added: SqlNumber,
  taskId: S.NullOr(S.String),
  createdAt: SqlNumber,
  updatedAt: SqlNumber,
});
export const SubscriptionItemRawRowFromSql = SubscriptionItemRawRow.pipe(
  S.encodeKeys({
    subscriptionId: "subscription_id",
    itemId: "item_id",
    publishedAt: "published_at",
    taskId: "task_id",
    createdAt: "created_at",
    updatedAt: "updated_at",
  })
);
export const SubscriptionsMetaRawRow = S.Struct({
  key: S.String,
  value: S.String,
  updatedAt: SqlNumber,
});
export const SubscriptionsMetaRawRowFromSql = SubscriptionsMetaRawRow.pipe(S.encodeKeys({ updatedAt: "updated_at" }));
export const DuplicateFeedRow = S.Struct({ id: S.String, feedUrl: S.String });
export const DuplicateFeedRowFromSql = DuplicateFeedRow.pipe(S.encodeKeys({ feedUrl: "feed_url" }));
export const ItemIdRow = S.Struct({ itemId: S.String });
export const ItemIdRowFromSql = ItemIdRow.pipe(S.encodeKeys({ itemId: "item_id" }));
export const QueueLinkRow = S.Struct({
  subscriptionId: S.String,
  itemId: S.String,
  taskId: S.NullOr(S.String),
  added: SqlNumber,
});
export const QueueLinkRowFromSql = QueueLinkRow.pipe(
  S.encodeKeys({ subscriptionId: "subscription_id", itemId: "item_id", taskId: "task_id" })
);
export const ChangesRow = S.Struct({ changes: SqlNumber });
export const sanitizeList = (values?: readonly string[]): string[] => {
  const hasValues = Boolean(values);
  if (!hasValues || values === undefined || values.length === 0) return [];
  let seen = HashSet.empty<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = Str.trim(value);
    const hasTrimmed = Boolean(trimmed);
    if (!hasTrimmed || HashSet.has(seen, trimmed)) continue;
    seen = HashSet.add(seen, trimmed);
    out.push(trimmed);
  }
  return out;
};
const StringArrayJson = S.String.pipe(S.Array, S.fromJsonString);
export const parseStringArray = (value: string | null | undefined): string[] => {
  const hasValue = Boolean(value);
  if (!hasValue || value === undefined || value === null) return [];
  const result = S.decodeResult(StringArrayJson)(value);
  return Result.isSuccess(result) ? sanitizeList(result.success) : [];
};
const stringifyArray = (values: string[]): string =>
  Result.getOrElse(S.encodeResult(StringArrayJson)(sanitizeList(values)), () => "[]");
const boolToInt = (value: boolean): number => (value ? 1 : 0);
const intToBool = (value: number | null | undefined): boolean => value === 1;
export const LIST_PROFILE_ITEM_LIMIT = 300;
export const rowToSubscription = (row: typeof SubscriptionRawRow.Type): StoredSubscriptionRule => {
  const rule: StoredSubscriptionRule = {
    id: row.id,
    title: row.title,
    sourceUrl: row.sourceUrl,
    feedUrl: row.feedUrl,
    platform: row.platform,
    keywords: parseStringArray(row.keywords),
    tags: parseStringArray(row.tags),
    onlyDownloadLatest: intToBool(row.onlyDownloadLatest),
    autoDownload: intToBool(row.autoDownload),
    enabled: intToBool(row.enabled),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sourceKind: row.sourceKind === "profile" ? "profile" : "feed",
    categories: parseStringArray(row.categories),
  };
  const hasprofileOwner = Boolean(row.profileOwner);
  if (hasprofileOwner && row.profileOwner !== null) {
    rule.profileOwner = row.profileOwner;
  }
  if (row.checkIntervalMs !== null && row.checkIntervalMs !== undefined) {
    rule.checkIntervalMs = row.checkIntervalMs;
  }
  if (row.nextCheckAt !== null && row.nextCheckAt !== undefined) {
    rule.nextCheckAt = row.nextCheckAt;
  }
  const hascoverUrl = Boolean(row.coverUrl);
  if (hascoverUrl && row.coverUrl !== null) {
    rule.coverUrl = row.coverUrl;
  }
  const haslatestVideoTitle = Boolean(row.latestVideoTitle);
  if (haslatestVideoTitle && row.latestVideoTitle !== null) {
    rule.latestVideoTitle = row.latestVideoTitle;
  }
  if (row.latestVideoPublishedAt !== null) {
    rule.latestVideoPublishedAt = row.latestVideoPublishedAt;
  }
  if (row.lastCheckedAt !== null) {
    rule.lastCheckedAt = row.lastCheckedAt;
  }
  if (row.lastSuccessAt !== null) {
    rule.lastSuccessAt = row.lastSuccessAt;
  }
  const haslastError = Boolean(row.lastError);
  if (haslastError && row.lastError !== null) {
    rule.lastError = row.lastError;
  }
  const hasdownloadDirectory = Boolean(row.downloadDirectory);
  if (hasdownloadDirectory && row.downloadDirectory !== null) {
    rule.downloadDirectory = row.downloadDirectory;
  }
  const hasnamingTemplate = Boolean(row.namingTemplate);
  if (hasnamingTemplate && row.namingTemplate !== null) {
    rule.namingTemplate = row.namingTemplate;
  }
  const hasdownloadType = Boolean(row.downloadType);
  if (hasdownloadType && row.downloadType !== null) {
    rule.downloadType = row.downloadType;
  }
  const hasdownloadQuality = Boolean(row.downloadQuality);
  if (hasdownloadQuality && row.downloadQuality !== null) {
    rule.downloadQuality = row.downloadQuality;
  }
  const hasdownloadContainer = Boolean(row.downloadContainer);
  if (hasdownloadContainer && row.downloadContainer !== null) {
    rule.downloadContainer = row.downloadContainer;
  }
  return rule;
};
export const rowToFeedItem = (row: typeof SubscriptionItemRawRow.Type): SubscriptionFeedItem => {
  const item: SubscriptionFeedItem = {
    id: row.itemId,
    url: row.url,
    title: row.title,
    publishedAt: row.publishedAt,
    addedToQueue: intToBool(row.added),
  };
  const hasthumbnail = Boolean(row.thumbnail);
  if (hasthumbnail && row.thumbnail !== null) {
    item.thumbnail = row.thumbnail;
  }
  const hastaskId = Boolean(row.taskId);
  if (hastaskId && row.taskId !== null) {
    item.taskId = row.taskId;
  }
  return item;
};
type WriteRule = Omit<
  { [K in keyof StoredSubscriptionRule]?: StoredSubscriptionRule[K] | undefined },
  "coverUrl" | "latestVideoTitle" | "checkIntervalMs"
> & { coverUrl?: unknown; latestVideoTitle?: unknown; checkIntervalMs?: number | null | undefined };
export const subscriptionToInsert: {
  (now: number): (rule: WriteRule) => Record<string, unknown>;
  (rule: WriteRule, now: number): Record<string, unknown>;
} = dual(2, (rule: WriteRule, now: number): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    id: rule.id,
    title: rule.title,
    sourceUrl: rule.sourceUrl,
    feedUrl: rule.feedUrl,
    platform: rule.platform,
    keywords: stringifyArray(rule.keywords ?? []),
    tags: stringifyArray(rule.tags ?? []),
    onlyDownloadLatest: boolToInt(Boolean(rule.onlyDownloadLatest)),
    autoDownload: boolToInt(Boolean(rule.autoDownload)),
    enabled: boolToInt(Boolean(rule.enabled)),
    status: rule.status,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt ?? now,
    sourceKind: rule.sourceKind,
    categories: stringifyArray(rule.categories ?? []),
    // Written as null when absent so clearing an override sticks on upsert.
    profileOwner: rule.profileOwner ?? null,
    checkIntervalMs: rule.checkIntervalMs ?? null,
    nextCheckAt: rule.nextCheckAt ?? null,
  };
  if (rule.coverUrl !== undefined) {
    payload.coverUrl = rule.coverUrl;
  }
  if (rule.latestVideoTitle !== undefined) {
    payload.latestVideoTitle = rule.latestVideoTitle;
  }
  if (rule.latestVideoPublishedAt !== undefined) {
    payload.latestVideoPublishedAt = rule.latestVideoPublishedAt;
  }
  if (rule.lastCheckedAt !== undefined) {
    payload.lastCheckedAt = rule.lastCheckedAt;
  }
  if (rule.lastSuccessAt !== undefined) {
    payload.lastSuccessAt = rule.lastSuccessAt;
  }
  if (rule.lastError !== undefined) {
    payload.lastError = rule.lastError;
  }
  if (rule.downloadDirectory !== undefined) {
    payload.downloadDirectory = rule.downloadDirectory;
  }
  if (rule.namingTemplate !== undefined) {
    payload.namingTemplate = rule.namingTemplate;
  }
  if (rule.downloadType !== undefined) {
    payload.downloadType = rule.downloadType;
  }
  if (rule.downloadQuality !== undefined) {
    payload.downloadQuality = rule.downloadQuality;
  }
  if (rule.downloadContainer !== undefined) {
    payload.downloadContainer = rule.downloadContainer;
  }
  return payload;
});

/** Schema paths only; neither schema messages nor private row values escape. */
type SubscriptionTable = "subscriptions" | "subscription_items" | "subscriptions_meta";
const formatRowIssue = (
  table: "subscriptions" | "subscription_items" | "subscriptions_meta",
  issue: Issue.Issue
): string => {
  const formatted = Issue.makeFormatterStandardSchemaV1({ leafHook: () => "invalid", checkHook: () => "invalid" })(
    issue
  );
  return Arr.join(
    Arr.map(formatted.issues, (entry) => Arr.join([table, ...Arr.map(entry.path ?? [], String)], ".")),
    ", "
  );
};
export const rowIssue: {
  (table: SubscriptionTable, issue: Issue.Issue): string;
  (issue: Issue.Issue): (table: SubscriptionTable) => string;
} = dual(2, formatRowIssue);
export const decodeRow =
  (table: "subscriptions" | "subscription_items" | "subscriptions_meta") =>
  <Schema extends S.Constraint>(schema: Schema) =>
  (input: unknown) =>
    S.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError((error) => DbRowDecodeError.make({ table, issue: rowIssue(table, error.issue) }))
    );
