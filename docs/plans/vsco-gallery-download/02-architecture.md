# Architecture: VSCO Gallery Download

## Fit

VSCO gallery downloads extend VidBee's existing one-click and gallery-dl path:

- `@vidbee/ui` recognizes only `https://vsco.co/<username>/gallery` and the
  equivalent `/images` alias as full-gallery URLs, then starts the download in
  one action even when ordinary single-video one-click mode is disabled.
- `@vidbee/downloader-core` normalizes those URLs, selects the dedicated
  `vsco-gallery` task kind, routes the host to `GalleryDlExecutor`, supplies the
  VSCO extractor settings, and aggregates the output directory and file counts.
- `@vidbee/task-queue` persists the new task kind with no database migration.
  The kind is deliberately not transcribable because its output is a mixed,
  multi-file gallery rather than one video.
- Desktop and API create the same task kind and use the same executor routing.
- VidBee's existing packaged gallery-dl binary owns VSCO page parsing, cursor
  pagination, native image URL selection, and HLS video delegation.

The implementation does not automate scrolling, **Load more**, the lightbox,
or chevron clicks. Those UI actions expose the same cursor-paginated media feed
that gallery-dl already supports.

## Endpoints

No new endpoint is required. Existing Desktop download IPC and the shared
`downloads.create` oRPC operation accept the VSCO gallery URL and create one
`vsco-gallery` queue task.

## Data

No database migration is required. The task-kind union and Zod schema add:

```ts
type TaskKind = /* existing kinds */ | 'vsco-gallery'
```

Successful task output uses the queue's existing multi-file fields:

- `outputDirectory`
- `fileCount`
- `downloadedCount`
- `skippedCount`
- `failedCount`
- `totalSize`

Files are placed at:

```text
<download root>/VSCO/<username>/Gallery/<media-id>.<extension>
```

The VSCO media ID is stable and collision-safe. Existing files are skipped on
a repeated or resumed run instead of being renamed or duplicated.

## Flow

1. The shared UI classifier recognizes an exact VSCO gallery URL and sends it
   directly to the existing download action.
2. Desktop or API snapshots the configured Netscape cookie path, proxy, and
   other runtime settings into a `vsco-gallery` task.
3. `HostRoutingExecutor` selects `GalleryDlExecutor` for the normalized URL.
4. The executor invokes the packaged gallery-dl with:
   - `extractor.vsco.tls12=true`, required by the packaged transport at VSCO's
     Cloudflare edge;
   - `extractor.vsco.videos=true`, so “full profile” includes videos;
   - one-second extraction-request pacing to reduce 429 risk;
   - a 60-second 429 wait and eight bounded request retries;
   - `{id}.{extension}`, because VSCO exposes `id`, not Instagram's
     `media_id`; and
   - VidBee's existing cookie/proxy/runtime arguments.
5. gallery-dl reads VSCO's page preload state and follows the profile media API
   cursor until `next_cursor` ends. Images use the native responsive URL; HLS
   videos use the yt-dlp module embedded in VidBee's gallery-dl executable.
6. Every prepare/download/skip/error event updates the one queue task. Exit zero
   is rejected as incomplete when any discovered asset failed, never reached a
   terminal file event, or collapsed onto a non-unique output path.
7. A complete run reports its aggregate directory, counts, and total size. The
   task is not passed to VidBee's automatic transcription coordinator.

## External

### VSCO

- Page: `https://vsco.co/<username>/gallery`
- Pagination: VSCO's private profile-media cursor API, consumed internally by
  gallery-dl
- Authentication: public access when available; otherwise VidBee's configured
  browser-cookie source or Netscape cookie file

Ephemeral page bearer tokens, cursors, response-cookie values, and raw API
responses are never placed in queue input, logs, or persisted settings.

### gallery-dl

VidBee's existing Linux resource reports `1.32.9-dev:2026.07.27` and includes
`VscoGalleryExtractor` plus an embedded yt-dlp module. No new binary, vendored
Python source, API token, extension permission, or remote service is added.

## Failure and privacy behavior

- 401/403 failures remain visible and use the existing cookie guidance.
- 429 responses use gallery-dl's bounded wait/retry behavior; extraction is
  paced before the rate limit is reached.
- Non-zero process exits fail the task through VidBee's existing classifier.
- A zero exit with failed, unfinished, or non-unique media also fails the task,
  preventing a partial profile from being reported as complete.
- Logs may contain ordinary media URLs and IDs, but never cookie values,
  Authorization headers, page bearer tokens, or raw API responses.

## Decisions and rejected alternatives

1. Reuse the bundled VSCO extractor rather than add a VidBee-maintained yt-dlp
   extractor. Live testing proved the functionality already ships in the
   gallery-dl resource; VidBee simply never routed VSCO to it.
2. Keep one grouped queue task. gallery-dl already owns cursor pagination,
   per-file resume/skip behavior, and mixed image/video downloading in one
   process, matching the requested single-shot workflow.
3. Use `{id}.{extension}` rather than VidBee's Instagram default. VSCO has no
   `media_id`; the old template would collapse assets onto `None.jpg` and
   `None.mp4`.
4. Explicitly enable TLS 1.2 and pace extraction requests. Without TLS 1.2 the
   packaged binary receives Cloudflare 403; repeated unpaced 130-page scans can
   receive 429.
5. Include videos because the user clarified that the result must be the full
   profile, and the packaged binary contains the required HLS dependency.

## Validation evidence

On 2026-08-28, a complete metadata-only pass over the example profile found:

- 130 cursor pages;
- 1,812 unique assets;
- 1,801 images and 11 videos;
- zero duplicate media IDs; and
- image dimensions up to 3024×4032.

A real, cookie-bearing `GalleryDlExecutor` run downloaded all 1,812 assets into
the planned directory: 1,801 JPEGs, 10 MOVs, and one MP4; 1,130,794,337 bytes;
zero failed, partial, zero-byte, or duplicate-ID files. All 1,801 images decoded,
including a 3024×4032 JPEG, and all 11 videos contained a valid video stream.

A separate collision smoke supplied both an unsupported generic filename
template and the Instagram-only `{media_id}` gallery template through an HTTP
`/images` URL containing credentials, a non-default port, and a query. VidBee
canonicalized the child request to the HTTPS `/gallery` URL and produced two
distinct `{id}.jpg` files with zero failures.
