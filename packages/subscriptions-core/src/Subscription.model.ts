import { OneClickContainerOption, OneClickQualityPreset } from "@vidbee/downloader-core/format-preferences";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
export const SubscriptionDownloadType = LiteralKit(["video", "audio", "subtitles"]);
export const FeedPlatform = LiteralKit(["youtube", "bilibili", "custom"]);
export type FeedPlatform = typeof FeedPlatform.Type;

export const ProfilePlatform = LiteralKit(["instagram", "threads", "x", "tiktok", "snapchat"]);
export type ProfilePlatform = typeof ProfilePlatform.Type;

export const SubscriptionPlatform = LiteralKit([...FeedPlatform.literals, ...ProfilePlatform.literals]);
export type SubscriptionPlatform = typeof SubscriptionPlatform.Type;

export const SubscriptionSourceKind = LiteralKit(["feed", "profile"]);
export type SubscriptionSourceKind = typeof SubscriptionSourceKind.Type;

export const SubscriptionDownloadPreferences = S.Struct({
  downloadType: SubscriptionDownloadType.pipe(S.optional, S.mutableKey),
  downloadQuality: OneClickQualityPreset.pipe(S.optional, S.mutableKey),
  downloadContainer: OneClickContainerOption.pipe(S.optional, S.mutableKey),
});
export type SubscriptionDownloadPreferences = typeof SubscriptionDownloadPreferences.Type;

export const SubscriptionStatus = LiteralKit([
  "idle",
  "checking",
  "up-to-date",
  "failed",
  "rate-limited",
  "auth-required",
]);
export type SubscriptionStatus = typeof SubscriptionStatus.Type;

export const ResolvedFeed = S.Struct({
  sourceUrl: S.String.pipe(S.mutableKey),
  feedUrl: S.String.pipe(S.mutableKey),
  platform: SubscriptionPlatform.pipe(S.mutableKey),
  sourceKind: SubscriptionSourceKind.pipe(S.mutableKey),
  profileOwner: S.String.pipe(S.optional, S.mutableKey),
  availableCategories: S.Array(S.String).pipe(S.mutable, S.mutableKey),
});
export type ResolvedFeed = typeof ResolvedFeed.Type;

export const SubscriptionRule = S.Struct({
  ...SubscriptionDownloadPreferences.fields,
  id: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  sourceUrl: S.String.pipe(S.mutableKey),
  feedUrl: S.String.pipe(S.mutableKey),
  platform: SubscriptionPlatform.pipe(S.mutableKey),
  keywords: S.Array(S.String).pipe(S.mutable, S.mutableKey),
  tags: S.Array(S.String).pipe(S.mutable, S.mutableKey),
  onlyDownloadLatest: S.Boolean.pipe(S.mutableKey),
  autoDownload: S.Boolean.pipe(S.mutableKey),
  enabled: S.Boolean.pipe(S.mutableKey),
  coverUrl: S.String.pipe(S.optional, S.mutableKey),
  latestVideoTitle: S.String.pipe(S.optional, S.mutableKey),
  latestVideoPublishedAt: S.Finite.pipe(S.optional, S.mutableKey),
  lastCheckedAt: S.Finite.pipe(S.optional, S.mutableKey),
  lastSuccessAt: S.Finite.pipe(S.optional, S.mutableKey),
  status: SubscriptionStatus.pipe(S.mutableKey),
  lastError: S.String.pipe(S.optional, S.mutableKey),
  createdAt: S.Finite.pipe(S.mutableKey),
  updatedAt: S.Finite.pipe(S.mutableKey),
  downloadDirectory: S.String.pipe(S.optional, S.mutableKey),
  namingTemplate: S.String.pipe(S.optional, S.mutableKey),
  sourceKind: SubscriptionSourceKind.pipe(S.mutableKey),
  profileOwner: S.String.pipe(S.optional, S.mutableKey),
  categories: S.Array(S.String).pipe(S.mutable, S.mutableKey),
  checkIntervalMs: S.Finite.pipe(S.optional, S.mutableKey),
  nextCheckAt: S.Finite.pipe(S.optional, S.mutableKey),
});
export type SubscriptionRule = typeof SubscriptionRule.Type;

export const SubscriptionFeedItem = S.Struct({
  id: S.String.pipe(S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  publishedAt: S.Finite.pipe(S.mutableKey),
  thumbnail: S.String.pipe(S.optional, S.mutableKey),
  addedToQueue: S.Boolean.pipe(S.mutableKey),
  taskId: S.String.pipe(S.optional, S.mutableKey),
});
export type SubscriptionFeedItem = typeof SubscriptionFeedItem.Type;

export const SubscriptionWithItems = S.Struct({
  ...SubscriptionRule.fields,
  items: S.Array(SubscriptionFeedItem).pipe(S.mutable, S.mutableKey),
});
export type SubscriptionWithItems = typeof SubscriptionWithItems.Type;

export const SubscriptionCreateInput = S.Struct({
  ...SubscriptionDownloadPreferences.fields,
  sourceUrl: S.String.pipe(S.mutableKey),
  feedUrl: S.String.pipe(S.mutableKey),
  platform: SubscriptionPlatform.pipe(S.mutableKey),
  title: S.String.pipe(S.optional, S.mutableKey),
  keywords: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  tags: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  onlyDownloadLatest: S.Boolean.pipe(S.optional, S.mutableKey),
  autoDownload: S.Boolean.pipe(S.optional, S.mutableKey),
  downloadDirectory: S.String.pipe(S.optional, S.mutableKey),
  namingTemplate: S.String.pipe(S.optional, S.mutableKey),
  enabled: S.Boolean.pipe(S.optional, S.mutableKey),
  sourceKind: SubscriptionSourceKind.pipe(S.optional, S.mutableKey),
  profileOwner: S.String.pipe(S.optional, S.mutableKey),
  categories: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  checkIntervalMs: S.Finite.pipe(S.optional, S.mutableKey),
});
export type SubscriptionCreateInput = typeof SubscriptionCreateInput.Type;

export const SubscriptionUpdateInput = S.Struct({
  ...SubscriptionDownloadPreferences.fields,
  title: S.String.pipe(S.optional, S.mutableKey),
  sourceUrl: S.String.pipe(S.optional, S.mutableKey),
  feedUrl: S.String.pipe(S.optional, S.mutableKey),
  platform: SubscriptionPlatform.pipe(S.optional, S.mutableKey),
  keywords: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  tags: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  onlyDownloadLatest: S.Boolean.pipe(S.optional, S.mutableKey),
  autoDownload: S.Boolean.pipe(S.optional, S.mutableKey),
  enabled: S.Boolean.pipe(S.optional, S.mutableKey),
  downloadDirectory: S.String.pipe(S.optional, S.mutableKey),
  namingTemplate: S.String.pipe(S.optional, S.mutableKey),
  categories: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  checkIntervalMs: S.Union([S.Finite, S.Null]).pipe(S.optional, S.mutableKey),
});
export type SubscriptionUpdateInput = typeof SubscriptionUpdateInput.Type;

export const ParsedFeedItem = S.StructWithRest(
  S.Struct({
    title: S.String.pipe(S.optional, S.mutableKey),
    link: S.String.pipe(S.optional, S.mutableKey),
    guid: S.String.pipe(S.optional, S.mutableKey),
    id: S.String.pipe(S.optional, S.mutableKey),
    isoDate: S.String.pipe(S.optional, S.mutableKey),
    pubDate: S.String.pipe(S.optional, S.mutableKey),
    youtubeId: S.String.pipe(S.optional, S.mutableKey),
    content: S.String.pipe(S.optional, S.mutableKey),
    contentSnippet: S.String.pipe(S.optional, S.mutableKey),
    contentEncoded: S.String.pipe(S.optional, S.mutableKey),
    summary: S.String.pipe(S.optional, S.mutableKey),
    description: S.String.pipe(S.optional, S.mutableKey),
    mediaThumbnail: S.Union([
      S.Array(
        S.Struct({
          url: S.String.pipe(S.optional, S.mutableKey),
        })
      ).pipe(S.mutable),
      S.Struct({
        url: S.String.pipe(S.optional, S.mutableKey),
      }),
    ]).pipe(S.optional, S.mutableKey),
    mediaContent: S.Union([
      S.Array(
        S.Struct({
          url: S.String.pipe(S.optional, S.mutableKey),
        })
      ).pipe(S.mutable),
      S.Struct({
        url: S.String.pipe(S.optional, S.mutableKey),
      }),
    ]).pipe(S.optional, S.mutableKey),
    enclosure: S.Union([
      S.Array(
        S.Struct({
          url: S.String.pipe(S.optional, S.mutableKey),
          type: S.String.pipe(S.optional, S.mutableKey),
        })
      ).pipe(S.mutable),
      S.Struct({
        url: S.String.pipe(S.optional, S.mutableKey),
        type: S.String.pipe(S.optional, S.mutableKey),
      }),
    ]).pipe(S.optional, S.mutableKey),
    itunes: S.Struct({
      image: S.Union([
        S.String,
        S.Struct({
          href: S.String.pipe(S.optional, S.mutableKey),
          url: S.String.pipe(S.optional, S.mutableKey),
        }),
      ]).pipe(S.optional, S.mutableKey),
    }).pipe(S.optional, S.mutableKey),
  }),
  [S.Record(S.String, S.mutableKey(S.Unknown))]
);
export type ParsedFeedItem = typeof ParsedFeedItem.Type;

export const ParsedFeed = S.Struct({
  title: S.String.pipe(S.optional, S.mutableKey),
  link: S.String.pipe(S.optional, S.mutableKey),
  image: S.Struct({
    url: S.String.pipe(S.optional, S.mutableKey),
  }).pipe(S.optional, S.mutableKey),
  itunes: S.Struct({
    image: S.String.pipe(S.optional, S.mutableKey),
  }).pipe(S.optional, S.mutableKey),
  items: S.Array(ParsedFeedItem).pipe(S.mutable, S.mutableKey),
});
export type ParsedFeed = typeof ParsedFeed.Type;

export const NormalizedFeedItem = S.Struct({
  id: S.String.pipe(S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  publishedAt: S.Finite.pipe(S.mutableKey),
  thumbnail: S.String.pipe(S.optional, S.mutableKey),
});
export type NormalizedFeedItem = typeof NormalizedFeedItem.Type;

export const ProfileFeedItem = S.Struct({
  id: S.String.pipe(S.mutableKey),
  category: S.String.pipe(S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.optional, S.mutableKey),
  publishedAt: S.Finite.pipe(S.optional, S.mutableKey),
  thumbnail: S.String.pipe(S.optional, S.mutableKey),
  versioned: S.Boolean.pipe(S.optional, S.mutableKey),
});
export type ProfileFeedItem = typeof ProfileFeedItem.Type;

export const ProfileCategoryError = LiteralKit(["rate-limited", "auth-required", "error"]);
export type ProfileCategoryError = typeof ProfileCategoryError.Type;

export const ProfileCheckResult = S.Struct({
  title: S.String.pipe(S.optional, S.mutableKey),
  avatarUrl: S.String.pipe(S.optional, S.mutableKey),
  items: S.Array(ProfileFeedItem).pipe(S.mutable, S.mutableKey),
  categoryErrors: S.Record(S.String, S.UndefinedOr(ProfileCategoryError).pipe(S.mutableKey)).pipe(S.mutableKey),
  error: S.String.pipe(S.optional, S.mutableKey),
  retryAfter: S.Finite.pipe(S.optional, S.mutableKey),
});
export type ProfileCheckResult = typeof ProfileCheckResult.Type;

export const LeaderKind = LiteralKit(["desktop", "api"]);
export type LeaderKind = typeof LeaderKind.Type;

export const LeaderState = S.Struct({
  kind: S.Union([LeaderKind, S.Null]).pipe(S.mutableKey),
  pid: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  startedAt: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  heartbeatAt: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  lockExpiresAt: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  leaseId: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  preferred: S.Union([LeaderKind, S.Null]).pipe(S.mutableKey),
});
export type LeaderState = typeof LeaderState.Type;

export const AutoDownloadDecision = S.Struct({
  subscription: SubscriptionRule.pipe(S.mutableKey),
  items: S.Array(NormalizedFeedItem).pipe(S.mutable, S.mutableKey),
  feedItemsToPersist: S.Array(NormalizedFeedItem).pipe(S.mutable, S.mutableKey),
  latestPublishedAt: S.Union([S.Finite, S.Null]).pipe(S.mutableKey),
  latestVideoTitle: S.String.pipe(S.optional, S.mutableKey),
  coverUrl: S.String.pipe(S.optional, S.mutableKey),
});
export type AutoDownloadDecision = typeof AutoDownloadDecision.Type;

export const SubscriptionStatusMeta = S.Struct({
  dotClass: S.String.pipe(S.mutableKey),
  textClass: S.String.pipe(S.mutableKey),
  label: S.String.pipe(S.mutableKey),
});
export type SubscriptionStatusMeta = typeof SubscriptionStatusMeta.Type;
export const SubscriptionItemQueueStatus = LiteralKit([
  "notQueued",
  "queued",
  "pending",
  "downloading",
  "processing",
  "completed",
  "error",
  "cancelled",
]);
export type SubscriptionItemQueueStatus = typeof SubscriptionItemQueueStatus.Type;
export const QueueLinkSelector = S.Struct({
  taskIds: S.Array(S.String).pipe(S.optional, S.mutableKey),
  items: S.Array(
    S.Struct({
      subscriptionId: S.String.pipe(S.mutableKey),
      itemId: S.String.pipe(S.mutableKey),
    })
  ).pipe(S.optional, S.mutableKey),
});
export type QueueLinkSelector = typeof QueueLinkSelector.Type;
export const ItemsQueueOutput = S.Struct({
  queued: S.Boolean.pipe(S.mutableKey),
  taskId: S.NullOr(S.String).pipe(S.mutableKey),
});
export type ItemsQueueOutput = typeof ItemsQueueOutput.Type;
export const SubscriptionListOutput = S.Struct({
  items: S.Array(SubscriptionWithItems).pipe(S.mutable, S.mutableKey),
  total: S.Finite.pipe(S.mutableKey),
});
export type SubscriptionListOutput = typeof SubscriptionListOutput.Type;
export const SubscriptionItemsListOutput = S.Struct({
  items: S.Array(SubscriptionFeedItem).pipe(S.mutable, S.mutableKey),
  total: S.Finite.pipe(S.mutableKey),
});
export type SubscriptionItemsListOutput = typeof SubscriptionItemsListOutput.Type;
export const ProfileDownloadDecision = S.Struct({
  items: S.Array(NormalizedFeedItem).pipe(S.mutable, S.mutableKey),
  itemsToPersist: S.Array(NormalizedFeedItem).pipe(S.mutable, S.mutableKey),
  latest: NormalizedFeedItem.pipe(S.optional, S.mutableKey),
});
export type ProfileDownloadDecision = typeof ProfileDownloadDecision.Type;

export const SubscriptionDownloadDefaults = S.Struct({
  oneClickDownloadType: SubscriptionDownloadType.pick(["video", "audio"]).pipe(S.optional, S.mutableKey),
  oneClickQuality: OneClickQualityPreset.pipe(S.optional, S.mutableKey),
  oneClickContainer: OneClickContainerOption.pipe(S.optional, S.mutableKey),
});
export type SubscriptionDownloadDefaults = typeof SubscriptionDownloadDefaults.Type;
export const SubscriptionDownloadOptions = S.Union([
  S.Struct({
    type: SubscriptionDownloadType.pick(["subtitles"]).pipe(S.mutableKey),
    format: S.Literal("srt").pipe(S.mutableKey),
  }),
  S.Struct({
    type: SubscriptionDownloadType.pick(["video", "audio"]).pipe(S.mutableKey),
    format: S.String.pipe(S.mutableKey),
    containerFormat: OneClickContainerOption.pipe(S.optional, S.mutableKey),
  }),
]);
export type SubscriptionDownloadOptions = typeof SubscriptionDownloadOptions.Type;
