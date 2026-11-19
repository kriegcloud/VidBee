import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HashSet from "effect/HashSet";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Layer from "effect/Layer";
import * as Str from "effect/String";

const SHORT_LINK_HOSTS = HashSet.make("vm.tiktok.com", "vt.tiktok.com");
const CANONICAL_HOSTS = HashSet.make("tiktok.com", "www.tiktok.com", "m.tiktok.com");
const SHORT_CODE = /^\w{4,32}$/;
const POST_PATH = /^\/(@[\w.-]{0,64}|share)\/(photo|video)\/(\d{6,32})\/?$/;
const REDIRECT_STATUS_MIN = 300;
const REDIRECT_STATUS_MAX = 399;
const DEFAULT_TIMEOUT_MS = 10_000;
/** TikTok only answers short links with a real 302 for link-preview crawlers. */
const SHORT_LINK_USER_AGENT = "facebookexternalhit/1.1";

const parseHttpUrl = (value: string): URL | null => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
};

/** Recognize share-sheet links: `vm.tiktok.com/CODE`, `vt.tiktok.com/CODE`, `tiktok.com/t/CODE`. */
export const isTikTokShortLink = (value: string): boolean => {
  const parsed = parseHttpUrl(Str.trim(value));
  if (!(parsed !== null)) {
    return false;
  }
  const segments = A.filter(Str.split(parsed.pathname, "/"), Boolean);
  const host = Str.toLowerCase(parsed.hostname);
  if (HashSet.has(SHORT_LINK_HOSTS, host)) {
    return segments.length === 1 && SHORT_CODE.test(segments[0] ?? "");
  }
  return (
    HashSet.has(CANONICAL_HOSTS, host) &&
    segments.length === 2 &&
    segments[0] === "t" &&
    SHORT_CODE.test(segments[1] ?? "")
  );
};

/**
 * Accept only redirect targets that name a concrete post; TikTok sends dead or
 * region-blocked codes to `https://www.tiktok.com/?_r=1`.
 */
const toCanonicalPostUrl = (location: string, base: string): string | null => {
  try {
    const target = new URL(location, base);
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return null;
    }
    const match = HashSet.has(CANONICAL_HOSTS, Str.toLowerCase(target.hostname))
      ? POST_PATH.exec(target.pathname)
      : null;
    if (!(match !== null)) {
      return null;
    }
    const [, owner, mediaType, postId] = match;
    if (owner !== "@") {
      return `https://www.tiktok.com/${owner}/${mediaType}/${postId}`;
    }
    // Share fallbacks drop the handle (`/@/photo/ID`); only photo posts have a
    // handle-less canonical form that gallery-dl accepts.
    return mediaType === "photo" ? `https://www.tiktok.com/share/photo/${postId}` : null;
  } catch {
    return null;
  }
};

/** Resolve one redirect; failures retain the caller's original URL. */
export const expandTikTokShortLink = Effect.fn("TikTokShortLink.expand")(function* (
  value: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  const url = Str.trim(value);
  if (!isTikTokShortLink(url)) return value;
  const client = yield* HttpClient.HttpClient;
  const request = HttpClientRequest.head(url, { headers: { "User-Agent": SHORT_LINK_USER_AGENT } });
  return yield* client.execute(request).pipe(
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }),
    Effect.timeout(timeoutMs),
    Effect.map((response) => {
      const location = response.headers.location;
      return response.status >= REDIRECT_STATUS_MIN &&
        response.status <= REDIRECT_STATUS_MAX &&
        location !== undefined &&
        location !== null &&
        location !== ""
        ? (toCanonicalPostUrl(location, url) ?? value)
        : value;
    }),
    Effect.orElseSucceed(() => value)
  );
});

export class TikTokShortLink extends Context.Service<
  TikTokShortLink,
  {
    readonly expand: (value: string, timeoutMs?: number) => Effect.Effect<string>;
  }
>()("@vidbee/downloader-core/tiktok-short-link/TikTokShortLink") {}

export const TikTokShortLinkLive = Layer.effect(
  TikTokShortLink,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    return TikTokShortLink.of({
      expand: Effect.fn("TikTokShortLink.expand")((value, timeoutMs) =>
        expandTikTokShortLink(value, timeoutMs).pipe(Effect.provideService(HttpClient.HttpClient, client))
      ),
    });
  })
);
