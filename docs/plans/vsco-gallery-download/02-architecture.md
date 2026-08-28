# Architecture: VSCO Gallery Download

## Fit

VSCO gallery downloads will extend the same shared layers used by Instagram
profile downloads instead of introducing browser automation:

- `vendor/yt-dlp` owns the VSCO page/API extractor because its packaged
  `curl_cffi` transport can impersonate a current browser through VSCO's
  Cloudflare edge on Desktop and in the API container.
- `@vidbee/downloader-core` owns URL normalization, inspection caching, safe
  metadata projection, queue creation, output naming, and VSCO-specific yt-dlp
  arguments.
- `@vidbee/task-queue` owns retries, cancellation, persistence, concurrency, and
  individual image outcomes.
- Desktop IPC and the Web/API oRPC router expose the same inspect/download
  operations.
- The existing Profile tab shell recognizes a VSCO gallery URL and renders a
  dedicated VSCO preview; Instagram keeps its existing preview and behavior.
- Existing queue/history grouping uses a VSCO `batchId`, so the gallery appears
  as one grouped job while every image retains its own progress and failure.

The design intentionally does not scroll the VSCO page, click **Load more**,
open the lightbox, or walk the left chevron. Those are viewport behaviors over
the same cursor-paginated data that VSCO exposes to its page.

## Endpoints

Add the following shared contract under `downloaderContract.vscoGallery`, with
matching Desktop IPC methods:

### `vscoGallery.inspect`

Input:

```ts
interface VscoGalleryInspectInput {
  url: string
  settings?: DownloadRuntimeSettings
}
```

Output:

```ts
interface VscoGalleryInspection {
  inspectionId: string
  expiresAt: number
  complete: boolean
  profile: {
    username: string
    profileUrl: string
    displayName?: string
    avatarUrl?: string
  }
  sourceCount: number
  imageCount: number
  excludedVideoCount: number
}
```

`complete` is true only after pagination ends normally. Inspection fails rather
than presenting a partial gallery as complete when a page cannot be fetched.
The public response contains counts and display metadata, not VSCO bearer
tokens, response cookies, or the internal list of CDN URLs.

### `vscoGallery.download`

Input:

```ts
interface VscoGalleryDownloadInput {
  inspectionId: string
  customDownloadPath?: string
  settings?: DownloadRuntimeSettings
}
```

Output:

```ts
interface VscoGalleryDownloadResult {
  groupId: string
  username: string
  totalImageCount: number
  tasks: Array<{
    downloadId: string
    mediaId: string
    index: number
  }>
}
```

The download call consumes a still-valid inspection. An expired inspection
returns an actionable “scan again” error rather than silently performing a
second discovery with possibly different access.

## Data

No relational database migration is required. Task kind and options are stored
in the queue's existing text/JSON fields. The shared task/schema unions gain:

```ts
type TaskKind = /* existing kinds */ | 'vsco-gallery-image'
type BatchKind = 'instagram-profile' | 'vsco-gallery'
```

Each image task stores only the metadata needed after a restart:

- the resolved native image URL;
- media ID, upload timestamp, width, height, and stable gallery index;
- `batchId`, `batchKind`, batch title/order/count, and output directory;
- the user's existing runtime settings reference/path values; and
- the deterministic output filename.

The inspector keeps a bounded in-memory cache, following the Instagram
inspector's 15-minute TTL and maximum-entry policy. Cached entries are
whitelisted objects rather than raw yt-dlp output. VSCO bearer tokens and
response-cookie values are never returned, persisted, or logged.

The default layout is:

```text
<download root>/VSCO/<username>/Gallery/YYYY-MM-DD_<media-id>.<extension>
```

The media ID is the deduplication key within an inspection. A repeated cursor
entry creates no second task, and the deterministic filename lets yt-dlp treat
an already-present image as completed rather than overwriting it.

## Flow

1. The shared URL classifier recognizes only
   `https://vsco.co/<username>/gallery` (and VSCO's equivalent `/images` alias)
   as a VSCO gallery. This check runs before one-click single-media routing.
2. Desktop or Web opens the existing Profile tab shell in VSCO mode and calls
   `vscoGallery.inspect`.
3. `VscoGalleryInspector` invokes the resolved vendored yt-dlp with proxy,
   browser-cookie, Netscape-cookie, and config settings already supported by
   VidBee. Child output is captured in a bounded buffer, parsed, whitelisted,
   and never echoed verbatim.
4. The vendored `VscoGalleryIE` uses browser impersonation to fetch the gallery
   page, reads the page's preloaded state for the site ID and short-lived API
   token, then follows `next_cursor` through
   `/api/3.0/medias/profile?site_id=...&limit=14` until the cursor ends.
5. The extractor ignores video media for this release (including records marked
   by either `is_video` or `playback_url`), deduplicates stills by media ID, and
   emits the unscaled `responsive_url` plus native dimensions and upload
   metadata. It never selects DOM `srcset` thumbnails or adds a `w=` scaling
   parameter.
6. The preview shows the discovered still-image count and any excluded video
   count. The user starts the complete gallery with one action.
7. `enqueueVscoGalleryDownload` creates one `vsco-gallery-image` task per still,
   all sharing the same `batchId`. A VSCO group cap of three allows useful
   parallelism without issuing an unbounded burst to the image CDN; the cap is
   restored for persisted tasks after restart.
8. `YtDlpExecutor` uses a dedicated image argument builder for this task kind:
   browser impersonation, retries, timeout, cookies/proxy/config, `--continue`,
   deterministic output, and no video format selection, remuxing, subtitle, or
   metadata-embedding flags.
9. The existing projections and grouped queue/history UI report each image's
   queued, running, retrying, completed, failed, or cancelled state and derive
   gallery-level progress from the batch.

## External integration

### VSCO

- Page: `https://vsco.co/<username>/gallery`
- Pagination API: `https://vsco.co/api/3.0/medias/profile`
- Page size: 14, advanced with `next_cursor` until absent
- Original image candidate: each still's `responsive_url` without a viewport
  width query
- Authentication: public access when available, otherwise VidBee's already
  configured browser-cookie source or Netscape cookie file

The endpoint and preloaded-state shape are private VSCO implementation details,
so parsing lives behind one extractor with fixture coverage and explicit errors
for a changed page shape. There is no new secret, environment variable, browser
extension permission, credential prompt, or remote service.

### Vendored yt-dlp

Add a VidBee-maintained VSCO extractor to the tracked source snapshot and
register it with yt-dlp's extractor index. The normal vendored build regenerates
lazy extractors and source-digest markers. `curl_cffi` is a required build extra
for both the standalone Desktop executable and the API image; verification must
fail if a Chrome impersonation target is unavailable.

### Host parity

- Desktop resolves the packaged yt-dlp binary through `ytdlpManager`.
- API/Docker resolves the yt-dlp installation built from the same tracked
  source under `/usr/bin/yt-dlp`.
- Both hosts construct `VscoGalleryInspector` and restore VSCO group caps next
  to their existing Instagram setup.
- Web and Desktop use the same Zod/oRPC domain types and the same shared VSCO
  preview component and English-first i18n keys.

## Failure and privacy behavior

- 401/403 or a private gallery without usable access maps to `auth-required`.
- 429 maps to `rate-limited`/`http-429` and uses the queue's bounded retry
  behavior.
- Missing user or media maps to `not-found`.
- A cursor loop, malformed state, missing native URL, or truncated pagination
  fails inspection; it cannot be labeled a complete gallery.
- A failed image task remains visible and does not erase successful siblings.
- Cancellation stops pending/running image tasks through the existing queue
  controls.
- Logs may contain URLs and media IDs but must not contain raw cookie values,
  Authorization headers, the page token, or unfiltered yt-dlp JSON.

## Decisions and rejected alternatives

1. Use VSCO's cursor API, not scroll/lightbox automation; it is faster, more
   deterministic, and exposes the native image URL directly.
2. Extend vendored yt-dlp rather than gallery-dl because gallery-dl's current
   requests transport receives VSCO Cloudflare 403s, while the verified
   curl-cffi-backed yt-dlp transport reaches the page and API.
3. Queue one task per image and group them visually; one monolithic process
   would hide which image failed and would not fit the queue's single-file
   output contract.
4. Use a dedicated image argument path rather than pretending JPEG files are
   videos; video format/remux/embed flags are incorrect for image assets.
5. Cache discovery behind an inspection ID; this prevents a preview/download
   race and keeps temporary VSCO API material out of public contracts.
6. Keep the first release still-only and single-profile, matching the approved
   product boundary.

## Validation evidence

On 2026-08-27, the packaged Linux yt-dlp binary successfully exposed a
curl-cffi Chrome impersonation target and reached the example VSCO page through
the Cloudflare edge. An authenticated, metadata-only probe using a
user-supplied Netscape jar followed the example gallery to cursor exhaustion:

- 130 API pages;
- 1,812 unique media records;
- 1,801 still images eligible for v1;
- 11 videos excluded by the approved boundary;
- zero duplicate IDs; and
- zero unusable media records.

The cookie values, page bearer token, and raw API responses were not printed or
written into the repository.
