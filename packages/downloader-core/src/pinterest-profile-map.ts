import * as Effect from "effect/Effect";
import * as MutableHashMap from "effect/MutableHashMap";
import * as MutableHashSet from "effect/MutableHashSet";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { GALLERY_DL_MAP_ARGS, galleryDlUrlMetadata, runGalleryDlJson } from "./gallery-dl-json-run.js";
import { buildGalleryDlRuntimeArgs } from "./gallery-runtime-args.js";
import { finalizeProfile } from "./ProfileFinalization.js";
import { normalizePinterestUrl, PINTEREST_EXTRACTOR_ARGS } from "./pinterest.js";
import type { GalleryDlProfileMapRuntime } from "./gallery-dl-json-run.js";
import type { SocialMappedItem } from "./ProfilePersistence.model.js";
import type { DownloadRuntimeSettings } from "./types.js";

const IMAGE_EXTENSIONS = MutableHashSet.fromIterable(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
const VIDEO_EXTENSIONS = MutableHashSet.fromIterable(["mp4", "webm", "mov", "m4v"]);

/** Save stable pin references, aggregating carousel/story assets per pin. */
export const mapPinterestProfile = Effect.fn("pinterest-profile-map.mapPinterestProfile")(function* (
  url: string,
  owner: string,
  runtime: GalleryDlProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => Effect.Effect<void>
) {
  const release = yield* runtime.admission?.acquire(url, signal) ?? Effect.undefined;
  return yield* finalizeProfile(
    Effect.gen(function* () {
      const posts = MutableHashMap.empty<string, SocialMappedItem>();
      const assets = MutableHashSet.empty<string>();
      const onLine = Effect.fn("pinterest-profile-map.onLine")(function* (line: string) {
        const metadata = galleryDlUrlMetadata(line);
        // Pinterest IDs exceed Number.MAX_SAFE_INTEGER; never round a numeric ID.
        if (typeof metadata?.id !== "string") {
          return;
        }
        const pin = normalizePinterestUrl(`https://www.pinterest.com/pin/${metadata.id}/`);
        const extension = Str.toLowerCase(String(metadata.extension));
        const video = MutableHashSet.has(VIDEO_EXTENSIONS, extension);
        if (pin?.kind !== "pin" || !(video || MutableHashSet.has(IMAGE_EXTENSIONS, extension))) {
          return;
        }
        const asset = `${pin.id}:${metadata.num ?? ""}:${metadata.media_id ?? ""}:${metadata.page_id ?? ""}`;
        if (MutableHashSet.has(assets, asset)) {
          return;
        }
        MutableHashSet.add(assets, asset);
        const current = Option.getOrUndefined(MutableHashMap.get(posts, pin.id));
        const title = typeof metadata.title === "string" ? Str.trim(metadata.title) : "";
        const next: SocialMappedItem = {
          id: pin.id,
          url: pin.url,
          author: owner,
          title: title || current?.title,
          images: (current?.images ?? 0) + (video ? 0 : 1),
          videos: (current?.videos ?? 0) + (video ? 1 : 0),
        };
        MutableHashMap.set(posts, pin.id, next);
        yield* onItem(next);
      });
      const args = runtime.resolveGalleryDlArgs?.(settings, url) ?? (yield* buildGalleryDlRuntimeArgs(settings));
      const result = yield* runGalleryDlJson(
        runtime.resolveGalleryDlPath(),
        [...GALLERY_DL_MAP_ARGS, ...PINTEREST_EXTRACTOR_ARGS, ...args, url],
        signal,
        "Pinterest",
        onLine
      );
      if (result.complete && MutableHashMap.size(posts) === 0) {
        return {
          complete: false,
          error: "No media pins were found. Check that the Pinterest created feed is public and accessible.",
        };
      }
      return { complete: result.complete, error: result.error };
    }),
    Effect.gen(function* () {
      if (release !== undefined) yield* release;
    })
  );
});
