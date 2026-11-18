import * as Effect from "effect/Effect";
import * as Str from "effect/String";
import { GALLERY_DL_MAP_ARGS, galleryDlUrlMetadata, runGalleryDlJson } from "./gallery-dl-json-run.js";
import { buildGalleryDlRuntimeArgs } from "./gallery-runtime-args.js";
import { snapchatCategoryUrl, snapchatSpotlightUrl, snapchatStorySnapUrl } from "./snapchat.js";
import type { GalleryDlProfileMapRuntime } from "./gallery-dl-json-run.js";
import type { SocialMappedItem } from "./ProfilePersistence.model.js";
import type { SnapchatCategory } from "./snapchat.js";
import type { DownloadRuntimeSettings } from "./types.js";

const RATE_LIMITED = /\b429\b|Too Many Requests/i;

/** gallery-dl serializes `date` as UTC `YYYY-MM-DD HH:MM:SS`. */
export const parseGalleryDlDate = (value: unknown): number | undefined => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return;
  }
  const time = Date.parse(`${Str.replace(" ", "T")(value)}Z`);
  return Number.isNaN(time) ? undefined : time;
};

const mapSnapchatProfileUnchecked = Effect.fn("snapchat-profile-map.mapSnapchatProfileUnchecked")(function* (
  owner: string,
  category: SnapchatCategory,
  runtime: GalleryDlProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => Effect.Effect<void>
) {
  const url = snapchatCategoryUrl(owner, category);
  const onLine = Effect.fn("snapchat-profile-map.onLine")(function* (line: string) {
    const metadata = galleryDlUrlMetadata(line);
    if (!(metadata !== null) || metadata.vidbee_category !== category) {
      return;
    }
    const fileId = metadata.file_id;
    const spotlightId = metadata.spotlight_id;
    const id = category === "spotlight" ? spotlightId : fileId;
    if (typeof id !== "string" || !(id !== undefined && id !== null && id !== "")) {
      return;
    }
    const video = metadata.extension === "mp4";
    const uploadMs = typeof metadata.upload_ms === "number" ? metadata.upload_ms : 0;
    const title =
      typeof metadata.title === "string" &&
      Str.trim(metadata.title) !== undefined &&
      Str.trim(metadata.title) !== null &&
      Str.trim(metadata.title) !== ""
        ? Str.trim(metadata.title)
        : undefined;
    const item: SocialMappedItem = {
      id,
      url: category === "spotlight" ? snapchatSpotlightUrl(owner, id) : snapchatStorySnapUrl(owner, id),
      author: owner,
      images: video ? 0 : 1,
      videos: video ? 1 : 0,
    };
    const publishedAt = uploadMs > 0 ? uploadMs : parseGalleryDlDate(metadata.date);
    if (publishedAt !== undefined) {
      item.publishedAt = publishedAt;
    }
    if (title !== undefined && title !== null && title !== "") {
      item.title = title;
    }
    yield* onItem(item);
  });
  const extraArgs = runtime.resolveGalleryDlArgs?.(settings, url) ?? (yield* buildGalleryDlRuntimeArgs(settings));
  const result = yield* runGalleryDlJson(
    runtime.resolveGalleryDlPath(),
    [...GALLERY_DL_MAP_ARGS, ...extraArgs, url],
    signal,
    "Snapchat",
    onLine
  );
  if (result.error !== undefined && result.error !== null && result.error !== "" && RATE_LIMITED.test(result.error)) {
    return {
      complete: false,
      error: "RateLimited: Snapchat is limiting requests from this network. Retry later.",
    };
  }
  return { complete: result.complete, error: result.error };
});

/**
 * Map one category of a public Snapchat profile. `stories` covers the current
 * 24h story and saved highlights, one item per snap; `spotlight` is one item
 * per post. Only the first page the public web exposes is reachable.
 */
export const mapSnapchatProfile = Effect.fn("snapchat-profile-map.mapSnapchatProfile")(function* (
  owner: string,
  category: SnapchatCategory,
  runtime: GalleryDlProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => Effect.Effect<void>
) {
  const url = snapchatCategoryUrl(owner, category);
  const release = yield* runtime.admission?.acquire(url, signal) ?? Effect.undefined;
  try {
    return yield* mapSnapchatProfileUnchecked(owner, category, runtime, settings, signal, onItem);
  } finally {
    if (release !== undefined) yield* release;
  }
});
