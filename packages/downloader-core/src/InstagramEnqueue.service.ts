import { InstagramTaskIdentityJson } from "./InstagramEnqueue.model.js";
import type { InspectionCacheEntry, InstagramEnqueueInput } from "./InstagramEnqueue.model.js";

export { InspectionCacheEntry, InstagramEnqueueInput } from "./InstagramEnqueue.model.js";

import { PRIORITY_USER } from "@vidbee/task-queue/types";
import { sha256 } from "@vidbee/task-queue/util/sha256";
import * as A from "effect/Array";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as O from "effect/Option";
import * as Order from "effect/Order";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { BoundaryDecodeError, InvalidDownload } from "./Downloader.errors.js";
import { DownloadHost } from "./DownloadHost.service.js";
import { DownloadQueue } from "./DownloadQueue.service.js";
import type { InstagramCategorySummary } from "./Download.model.js";
import type { DownloaderError } from "./Downloader.errors.js";
import type { InstagramProfileDownloadResult } from "./types.js";

/** A narrow lookup permits borrowing the owner's inspector without exposing its runtime. */
export class InstagramInspectionLookup extends Context.Service<
  InstagramInspectionLookup,
  {
    readonly get: (id: string) => Effect.Effect<InspectionCacheEntry | null, DownloaderError>;
  }
>()("@vidbee/downloader-core/InstagramEnqueue.service/InstagramInspectionLookup") {}
const labels = { posts: "Posts", reels: "Reels", stories: "Stories", highlights: "Highlights", tagged: "Tagged" };
const orders = { posts: 0, reels: 1, stories: 2, highlights: 3, tagged: 4 };
const downloadOrders = { stories: 0, highlights: 1, reels: 2, posts: 3, tagged: 4 };
const cleanSegment = (value: string): string => {
  const cleaned = pipe(Str.trim(value), Str.replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_"), Str.replace(/[.\s]+$/g, ""));
  return cleaned.length === 0 ? "instagram-profile" : cleaned;
};

export const enqueueInstagramProfileDownload = Effect.fn("Instagram.enqueue")(function* ({
  input,
  defaultDownloadDir,
  batch,
  priority = PRIORITY_USER,
}: InstagramEnqueueInput) {
  const inspector = yield* InstagramInspectionLookup;
  const queue = yield* DownloadQueue;
  const host = yield* DownloadHost;
  const path = yield* Path.Path;
  const cached = yield* inspector.get(input.inspectionId);
  if (cached === null)
    return yield* InvalidDownload.make({
      operation: "instagram.enqueue",
      legacyMessage: "Instagram profile inspection expired. Scan the profile again.",
    });
  const selectedCategories = A.dedupe(input.categories);
  const selected: InstagramCategorySummary[] = [];
  for (const category of selectedCategories) {
    const summary = O.getOrUndefined(
      A.findFirst(cached.inspection.categories, (candidate) => candidate.category === category)
    );
    if (
      summary === undefined ||
      (summary.state !== "ready" && (summary.items?.length ?? 0) === 0) ||
      summary.assetCount === 0
    )
      return yield* InvalidDownload.make({
        operation: "instagram.enqueue",
        legacyMessage: `Instagram category "${category}" is not ready to download.`,
      });
    selected.push(summary);
  }
  const summaries = A.sort(selected, (left: InstagramCategorySummary, right: InstagramCategorySummary) =>
    Order.Number(downloadOrders[left.category], downloadOrders[right.category])
  );
  const groupId =
    batch?.id ?? `instagram_profile_group_${yield* Clock.currentTimeMillis}_${Str.slice(0, 8)(host.uuid())}`;
  yield* queue.setMaxPerGroup("instagram-profile", 1);
  const requested = Str.trim(input.customDownloadPath ?? "");
  const configured = Str.trim(input.settings?.downloadPath ?? "");
  const base = requested.length > 0 ? requested : configured.length > 0 ? configured : defaultDownloadDir;
  const profileDirectory = path.join(base, "Instagram", cleanSegment(cached.inspection.profile.username));
  const tasks: InstagramProfileDownloadResult["tasks"] = [];
  for (const summary of summaries) {
    const categoryLabel = labels[summary.category];
    const outputDirectory = path.join(profileDirectory, categoryLabel);
    const highlights = summary.category === "highlights";
    const references =
      summary.items !== undefined && summary.items.length > 0
        ? summary.items
        : [
            {
              id: summary.category,
              downloaded: false,
              url: cached.categoryUrls[summary.category],
              assetCount: summary.assetCount,
            },
          ];
    for (const reference of references) {
      if (reference.downloaded === true || (input.itemIds !== undefined && !A.contains(input.itemIds, reference.id)))
        continue;
      const encoded = yield* S.encodeEffect(InstagramTaskIdentityJson)([
        input.inspectionId,
        summary.category,
        reference.id,
        reference.assetCount,
        path.resolve(outputDirectory),
      ]).pipe(
        Effect.mapError((cause) =>
          BoundaryDecodeError.make({ operation: "instagram.identity", legacyMessage: cause.message, cause })
        )
      );
      const id = `instagram_item_${sha256(encoded)}`;
      const existing = yield* queue.get(id);
      if (existing !== undefined && existing.status !== "failed" && existing.status !== "cancelled") continue;
      if (existing !== undefined) yield* queue.retryManual(id, { ...existing.input.options, settings: input.settings });
      const result = yield* queue.add({
        id,
        input: {
          url: reference.url,
          kind: "instagram-profile-category",
          title: `@${cached.inspection.profile.username} · ${categoryLabel}`,
          thumbnail: cached.inspection.profile.avatarUrl,
          options: {
            type: "video",
            customDownloadPath: outputDirectory,
            settings: input.settings,
            galleryDlBaseDirectory: highlights ? profileDirectory : undefined,
            galleryDlDirectorySegments: highlights ? [categoryLabel, "{highlight_title}"] : undefined,
            galleryDlDirectoryTemplate: outputDirectory,
            galleryDlFilenameTemplate: "{date:%Y-%m-%d}_{media_id}.{extension}",
            expectedAssetCount: reference.assetCount,
            batchId: groupId,
            batchKind: "instagram-profile",
            batchTitle: batch?.title ?? `@${cached.inspection.profile.username}`,
            batchCategory: summary.category,
            batchOrder: orders[summary.category],
            batchSourceCount: 1,
            batchAssetCount: reference.assetCount,
            downloadPath: outputDirectory,
          },
        },
        priority,
        groupKey: "instagram-profile",
        maxAttempts: 3,
      });
      tasks.push({
        downloadId: result.id,
        category: summary.category,
        sourceCount: 1,
        assetCount: reference.assetCount,
      });
    }
  }
  return {
    groupId,
    username: cached.inspection.profile.username,
    totalSourceCount: A.reduce(tasks, 0, (n, task) => n + task.sourceCount),
    totalAssetCount: A.reduce(tasks, 0, (n, task) => n + task.assetCount),
    tasks,
  };
});
export const restoreInstagramProfileGroupCaps = Effect.fn("Instagram.restoreCaps")(function* () {
  const queue = yield* DownloadQueue;
  const groups: string[] = [];
  let cursor: string | null = null;
  do {
    const page: Effect.Success<ReturnType<typeof queue.list>> = yield* queue.list({ limit: 200, cursor });
    for (const task of page.tasks)
      if (task.kind === "instagram-profile-category" && !A.contains(groups, task.groupKey)) groups.push(task.groupKey);
    cursor = page.nextCursor;
  } while (cursor !== null && cursor !== "");
  for (const group of groups) yield* queue.setMaxPerGroup(group, 1);
});
