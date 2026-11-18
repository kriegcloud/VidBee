import * as Effect from "effect/Effect";
import * as S from "effect/Schema";
import { BoundaryDecodeError } from "./Downloader.errors.js";
import { GALLERY_DL_MAP_ARGS, galleryDlUrlMetadata, runGalleryDlJson } from "./gallery-dl-json-run.js";
import { buildGalleryDlRuntimeArgs } from "./gallery-runtime-args.js";
import { mapPlaylistInfo } from "./playlist-plan.js";
import { buildPlaylistInfoArgs } from "./yt-dlp-args.js";
import type { GalleryDlProfileMapRuntime } from "./gallery-dl-json-run.js";
import type { SocialMappedItem } from "./ProfilePersistence.model.js";
import type { DownloadRuntimeSettings } from "./types.js";

const PHOTO_ID = /^\d+$/;

export type FacebookProfileMapRuntime = GalleryDlProfileMapRuntime;

/** Map stable photo/reel links; signed media URLs and cookies never enter the saved profile. */
const mapFacebookProfileUnchecked = Effect.fn("facebook-profile-map.mapFacebookProfileUnchecked")(function* (
  url: string,
  category: "photos" | "albums" | "reels",
  owner: string,
  runtime: FacebookProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => Effect.Effect<void>
) {
  if (category === "reels") {
    const playlistArgs = yield* buildPlaylistInfoArgs(url, settings ?? {});
    const result = yield* runGalleryDlJson(runtime.resolveYtDlpPath(), playlistArgs, signal, "Facebook");
    if (!result.complete) {
      return { complete: false, error: result.error };
    }
    const document = yield* S.decodeEffect(S.fromJsonString(S.Record(S.String, S.Unknown)))(result.stdout).pipe(
      Effect.mapError((cause) =>
        BoundaryDecodeError.make({ operation: "facebook.playlist", legacyMessage: cause.message, cause })
      )
    );
    const playlist = mapPlaylistInfo(document, url);
    for (const entry of playlist.entries) {
      yield* onItem({
        id: entry.id,
        url: entry.url,
        author: owner,
        title: entry.title,
        images: 0,
        videos: 1,
      });
    }
    return { complete: true };
  }
  let mappedCount = 0;
  const onLine = Effect.fn("facebook-profile-map.onLine")(function* (line: string) {
    const metadata = galleryDlUrlMetadata(line);
    const hasId = Boolean(metadata?.id);
    if (metadata === null || !hasId) {
      return;
    }
    const id = String(metadata.id);
    if (!PHOTO_ID.test(id)) {
      return;
    }
    mappedCount += 1;
    yield* onItem({
      id,
      url: `https://www.facebook.com/photo/?fbid=${id}`,
      author: owner,
      images: 1,
      videos: 0,
    });
  });
  const extraArgs = runtime.resolveGalleryDlArgs?.(settings, url) ?? (yield* buildGalleryDlRuntimeArgs(settings));
  const result = yield* runGalleryDlJson(
    runtime.resolveGalleryDlPath(),
    [...GALLERY_DL_MAP_ARGS, ...extraArgs, url],
    signal,
    "Facebook",
    onLine
  );
  if (result.complete && mappedCount === 0) {
    return {
      complete: false,
      error: "No accessible Facebook photos were found. Check profile access and cookie settings.",
    };
  }
  return { complete: result.complete, error: result.error };
});

export const mapFacebookProfile = Effect.fn("facebook-profile-map.mapFacebookProfile")(function* (
  url: string,
  category: "photos" | "albums" | "reels",
  owner: string,
  runtime: FacebookProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => Effect.Effect<void>
) {
  const release = yield* runtime.admission?.acquire(url, signal) ?? Effect.undefined;
  try {
    return yield* mapFacebookProfileUnchecked(url, category, owner, runtime, settings, signal, onItem);
  } finally {
    if (release !== undefined) yield* release;
  }
});
