import * as Effect from "effect/Effect";
import * as Str from "effect/String";
import { cookieBrowserLabel } from "./cookie-setup.js";
import { GALLERY_DL_MAP_ARGS, galleryDlUrlMetadata, runGalleryDlJson } from "./gallery-dl-json-run.js";
import { buildGalleryDlRuntimeArgs } from "./gallery-runtime-args.js";
import { finalizeProfile } from "./ProfileFinalization.js";
import { vscoPostUrl } from "./vsco.js";
import type { GalleryDlProfileMapRuntime } from "./gallery-dl-json-run.js";
import type { SocialMappedItem } from "./ProfilePersistence.model.js";
import type { DownloadRuntimeSettings } from "./types.js";

/** gallery-dl's warning when VSCO serves a Cloudflare page instead of the gallery. */
const CLOUDFLARE_CHALLENGE = /Cloudflare (?:challenge|CAPTCHA)/;

/**
 * Waits before each fresh read of the browser's cookies after an empty map.
 * Chromium writes new cookies to disk on a 30 s timer, so a clearance or login
 * the user just completed can be missing from the first read; the two re-reads
 * together span that window.
 */
const COOKIE_REFRESH_DELAYS_MS = [10_000, 25_000] as const;

export interface VscoProfileMapResult {
  /** VSCO refused the request until the browser passes its Cloudflare check. */
  authRequired?: boolean;
  complete: boolean;
  error?: string;
}

export interface VscoProfileMapOptions {
  /** Overrides {@link COOKIE_REFRESH_DELAYS_MS}; tests pass short delays. */
  cookieRefreshDelaysMs?: readonly number[];
}

const wait = Effect.fn("Vsco.wait")(function* (ms: number, signal: AbortSignal) {
  if (signal.aborted) return;
  yield* Effect.callback<void>((resume) => {
    const abort = () => resume(Effect.void);
    signal.addEventListener("abort", abort, { once: true });
    return Effect.sync(() => signal.removeEventListener("abort", abort));
  }).pipe(Effect.timeoutOrElse({ duration: ms, orElse: () => Effect.void }));
});

const emptyGalleryError = (
  url: string,
  browser: string | undefined,
  refreshes: number,
  challenged: boolean
): string => {
  const reread =
    refreshes > 0
      ? ` VidBeep re-read ${browser ?? "browser"} cookies ${refreshes === 1 ? "once" : `${refreshes} times`} and got the same answer.`
      : "";
  if (challenged) {
    const where =
      browser !== undefined && browser !== null && browser !== ""
        ? `Open ${url} in ${browser} until the posts load, then map again.`
        : `Choose your browser for cookies in Settings, open ${url} there until the posts load, then map again.`;
    return `VSCO answered with a Cloudflare check instead of the gallery.${reread} ${where}`;
  }
  const where =
    browser !== undefined && browser !== null && browser !== ""
      ? `If the gallery shows posts in ${browser}, reload it there so its VSCO cookies update, then map again; otherwise import fresh VSCO cookies.`
      : "If the gallery shows posts in your browser, choose that browser for cookies in Settings or import fresh VSCO cookies, then map again.";
  return `VSCO returned no posts for this session.${reread} ${where}`;
};

/**
 * VSCO's gallery extractor yields one `Message.Url` per post with the post's
 * own `_id` as `id`, so a traversal of `/<user>/gallery` names every post
 * without downloading a byte. Each mapped item is the post's own page, which
 * the image and video extractors can fetch on its own later.
 *
 * VSCO sits behind Cloudflare. Without a clearance cookie gallery-dl logs a
 * warning and exits 0 with no posts, so an empty result is retried with a
 * fresh read of the browser's cookies before it is reported.
 */
const mapVscoProfileUnchecked = Effect.fn("vsco-profile-map.mapVscoProfileUnchecked")(function* (
  url: string,
  owner: string,
  runtime: GalleryDlProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => Effect.Effect<void>,
  options: VscoProfileMapOptions
) {
  let mappedCount = 0;
  const onLine = Effect.fn("vsco-profile-map.onLine")(function* (line: string) {
    const metadata = galleryDlUrlMetadata(line);
    const hasId = Boolean(metadata?.id);
    if (metadata === null || !hasId) {
      return;
    }
    const id = String(metadata.id);
    const video = metadata.video === true;
    const postUrl = vscoPostUrl(owner, id, video);
    if (!(postUrl !== undefined && postUrl !== null && postUrl !== "")) {
      return;
    }
    const description = typeof metadata.description === "string" ? Str.trim(metadata.description) : "";
    mappedCount += 1;
    yield* onItem({
      id,
      url: postUrl,
      author: owner,
      title: description || undefined,
      images: video ? 0 : 1,
      videos: video ? 1 : 0,
    });
  });
  const extraArgs = runtime.resolveGalleryDlArgs?.(settings, url) ?? (yield* buildGalleryDlRuntimeArgs(settings));
  // Each gallery-dl run extracts the browser's cookies anew, so a rerun is a
  // cookie refresh. A cookies.txt file would only change on a manual import.
  const readsBrowserCookies = extraArgs.includes("--cookies-from-browser");
  const refreshDelays = readsBrowserCookies ? (options.cookieRefreshDelaysMs ?? COOKIE_REFRESH_DELAYS_MS) : [];
  const args = [
    ...GALLERY_DL_MAP_ARGS,
    "-o",
    "extractor.vsco.tls12=true",
    "-o",
    "extractor.vsco.videos=true",
    ...extraArgs,
    url,
  ];
  let refreshes = 0;
  while (true) {
    const result = yield* runGalleryDlJson(runtime.resolveGalleryDlPath(), args, signal, "VSCO", onLine);
    const challenged = CLOUDFLARE_CHALLENGE.test(result.stderr);
    if (mappedCount > 0 || signal.aborted || !(result.complete || challenged)) {
      return { complete: result.complete, error: result.error };
    }
    const delay = refreshDelays[refreshes];
    if (delay === undefined) {
      return {
        complete: false,
        authRequired: challenged,
        error: emptyGalleryError(
          url,
          readsBrowserCookies ? cookieBrowserLabel(settings?.browserForCookies) : undefined,
          refreshes,
          challenged
        ),
      };
    }
    refreshes += 1;
    yield* wait(delay, signal);
    if (signal.aborted) {
      return { complete: false };
    }
  }
});

export const mapVscoProfile = Effect.fn("vsco-profile-map.mapVscoProfile")(function* (
  url: string,
  owner: string,
  runtime: GalleryDlProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => Effect.Effect<void>,
  options: VscoProfileMapOptions = {}
) {
  const release = yield* runtime.admission?.acquire(url, signal) ?? Effect.undefined;
  return yield* finalizeProfile(
    mapVscoProfileUnchecked(url, owner, runtime, settings, signal, onItem, options),
    Effect.gen(function* () {
      if (release !== undefined) yield* release;
    })
  );
});
