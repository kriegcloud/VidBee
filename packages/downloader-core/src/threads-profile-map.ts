import * as Effect from "effect/Effect";
import * as MutableHashMap from "effect/MutableHashMap";
import * as MutableHashSet from "effect/MutableHashSet";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { BoundaryDecodeError } from "./Downloader.errors.js";
import { DownloadFiles } from "./DownloadFiles.service.js";
import { DownloadHost } from "./DownloadHost.service.js";
import { GALLERY_DL_MAP_ARGS, galleryDlUrlMetadata, runGalleryDlJson } from "./gallery-dl-json-run.js";
import { buildGalleryDlRuntimeArgs } from "./gallery-runtime-args.js";
import { DataFirst as ProfileFinalizationFunctions } from "./ProfileFinalization.js";
import { writeKnownItemsFile } from "./social-media-service.js";
import { normalizeThreadsUrl } from "./threads.js";
import type { GalleryDlProfileMapRuntime } from "./gallery-dl-json-run.js";
import type { SocialMappedItem } from "./ProfilePersistence.model.js";
import type { ProfileMapOptions } from "./social-media-service.js";
import type { DownloadRuntimeSettings } from "./types.js";

const VIDEO_EXTENSIONS = MutableHashSet.fromIterable(["mp4", "webm"]);
const AUTH_FAILURE =
  /AuthRequired|Threads session|login required|authenticated cookies|Extracted 0 cookies|not logged in/i;

/**
 * The Threads media tab yields one `Message.Url` per asset, so a carousel post
 * arrives as several events sharing one id. Counts are accumulated per post and
 * the item is re-emitted, which keeps a partial map honest if the run is
 * stopped midway through a carousel.
 */
const mapThreadsProfileUnchecked = Effect.fn("threads-profile-map.mapThreadsProfileUnchecked")(function* (
  url: string,
  owner: string,
  runtime: GalleryDlProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => Effect.Effect<void>,
  knownItemsFile: string | undefined
) {
  const posts = MutableHashMap.empty<string, SocialMappedItem>();
  const onLine = Effect.fn("threads-profile-map.onLine")(function* (line: string) {
    const metadata = galleryDlUrlMetadata(line);
    if (!(metadata !== null)) {
      return;
    }
    const id = metadata.id;
    const shortcode = metadata.shortcode;
    if (typeof id !== "string" || typeof shortcode !== "string") {
      return;
    }
    const post = normalizeThreadsUrl(`https://www.threads.com/@${owner}/post/${shortcode}`);
    if (post?.kind !== "post") {
      return;
    }
    const video = MutableHashSet.has(VIDEO_EXTENSIONS, Str.toLowerCase(String(metadata.extension)));
    const current = Option.getOrUndefined(MutableHashMap.get(posts, id)) ?? {
      id,
      url: post.url,
      author: owner,
      images: 0,
      videos: 0,
    };
    const next: SocialMappedItem = {
      ...current,
      images: current.images + (video ? 0 : 1),
      videos: current.videos + (video ? 1 : 0),
    };
    if (typeof metadata.taken_at === "number" && metadata.taken_at > 0) {
      next.publishedAt = metadata.taken_at * 1000;
    }
    MutableHashMap.set(posts, id, next);
    yield* onItem(next);
  });
  const extraArgs = runtime.resolveGalleryDlArgs?.(settings, url) ?? (yield* buildGalleryDlRuntimeArgs(settings));
  const encodedKnownFile =
    knownItemsFile === undefined
      ? undefined
      : yield* S.encodeEffect(S.fromJsonString(S.String))(knownItemsFile).pipe(
          Effect.mapError((cause) =>
            BoundaryDecodeError.make({ operation: "threads.known-items", legacyMessage: cause.message, cause })
          )
        );
  const result = yield* runGalleryDlJson(
    runtime.resolveGalleryDlPath(),
    [
      ...GALLERY_DL_MAP_ARGS,
      ...extraArgs,
      ...(knownItemsFile !== undefined && knownItemsFile !== null && knownItemsFile !== ""
        ? ["-o", `extractor.threads.known-items-file=${encodedKnownFile}`]
        : []),
      url,
    ],
    signal,
    "Threads",
    onLine
  );
  if (result.error !== undefined && result.error !== null && result.error !== "" && AUTH_FAILURE.test(result.error)) {
    return {
      complete: false,
      error: "AuthRequired: sign in to Threads in the browser set for cookies in Settings, then retry mapping.",
    };
  }
  if (result.complete && MutableHashMap.size(posts) === 0) {
    return {
      complete: false,
      error: "No posts were found on this Threads media tab. Check profile access and cookies.",
    };
  }
  return { complete: result.complete, error: result.error };
});

export const mapThreadsProfile = Effect.fn("threads-profile-map.mapThreadsProfile")(function* (
  url: string,
  owner: string,
  runtime: GalleryDlProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => Effect.Effect<void>,
  options: ProfileMapOptions = {}
) {
  const release = yield* runtime.admission?.acquire(url, signal) ?? Effect.undefined;
  const files = yield* DownloadFiles;
  const host = yield* DownloadHost;
  const path = yield* Path.Path;
  const directory =
    options.knownIds != null && options.knownIds.length > 0
      ? yield* files.makeTempDirectory(path.join(host.tempDirectory(), "vidbee-threads-map-"))
      : undefined;
  return yield* ProfileFinalizationFunctions.finalizeProfile(
    Effect.gen(function* () {
      const knownItemsFile =
        directory !== undefined && directory !== null && directory !== ""
          ? yield* writeKnownItemsFile(directory, options.knownIds)
          : undefined;
      return yield* mapThreadsProfileUnchecked(url, owner, runtime, settings, signal, onItem, knownItemsFile);
    }),
    Effect.gen(function* () {
      if (release !== undefined) yield* release;
      if (directory !== undefined && directory !== null && directory !== "") {
        yield* files.remove(directory, true);
      }
    })
  );
});
