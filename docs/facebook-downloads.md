# Facebook photo and reel downloads

## Profile reels

Paste `https://www.facebook.com/USERNAME/reels` into **Add URL** to open VidBee's
playlist picker. Select the videos to download, or download all listed reels.
Named and numeric profiles on the `www`, `m`, `mbasic`, and `web` hosts are
supported. Each selected reel becomes an ordinary video task with its own
progress, retry controls, quality selection, and the configured cookie settings.
The default destination follows the existing playlist layout:
`Playlists/<username> - Reels`.

The vendored yt-dlp build includes a local `facebook:reels` extractor. It reads
the profile's `aggregated_fb_shorts` collection, follows Facebook's Relay cursor
pagination, and deduplicates overlapping reel IDs. A failed or repeated page
raises an error before the playlist is returned, so listing cannot silently
report a partial collection as complete. Authentication tokens and feature flags
are taken from the current page and kept only in memory. The pagination query ID
is pinned to the public Facebook operation verified on 2026-09-10; changes on
Facebook may require an extractor update.

Individual `/reel/ID` links now extract directly from their canonical reel page.
The previous redirect to Facebook's legacy watch route failed for the tested
videos. Each download retains the available video and audio streams through the
existing yt-dlp format-selection and ffmpeg pipeline.

Live verification of the requested profile found three reels. Both the initial
collection and a forced one-reel-per-page traversal returned the same three IDs;
all three videos downloaded successfully and contained video and audio streams.
The installed AppImage also listed all three through the shared playlist arguments
and completed three ordinary video queue tasks. `ffprobe` confirmed video and
audio in every saved MP4; verification-only tasks were removed from history.

## Photos

Paste a Facebook photos link into **Add URL**. VidBee sends recognized photo
resources directly to the bundled gallery-dl extractor and uses the browser or
Netscape cookie file configured in Settings. Authentication and Facebook's
visibility restrictions still apply.

Supported links include:

- `https://www.facebook.com/profile.php?id=123&sk=photos`
- Profile roots and `/USERNAME/photos` or `/USERNAME/photos_by`
- `/people/NAME/123/photos` and the corresponding profile root
- `/USERNAME/photos_albums` and `profile.php?id=123&sk=photos_albums`
- `/media/set/?set=a.123` album links
- `/photo.php?fbid=123`, `/photo/?fbid=123`, and legacy photo permalinks
- Photo-set continuation links ending in `&setextract`

The `www`, mobile (`m` and `mbasic`), and `web` Facebook hosts are recognized.
URLs are normalized to HTTPS on `www.facebook.com`, keeping only the parameters
needed for extraction. Video, watch, reel, and share links use yt-dlp; profile
reels use the playlist flow described above.

Profile photos are stored under `Facebook/<profile>/Photos` within the selected
download directory. Album collections use `Facebook/<profile>/Albums`, individual
albums use `Facebook/Albums/<set ID>`, and individual photos use `Facebook/Photos`.
Files use Facebook's media IDs (`{id}.{extension}`) to prevent collisions with
saved Instagram or video filename templates. Existing files can be skipped on
subsequent attempts.

New photo downloads have task kind `facebook-gallery`, aggregate file counts and
sizes, and no automatic transcription. Older tasks previously labeled as video
also route to gallery-dl on retry; their gallery output is excluded from desktop
transcription. Missing, empty, failed, unfinished, or duplicate output files
prevent a successful completion result.

Profile-photo links use gallery-dl's profile-photos extractor. They do not promise
all tagged photos, every album, private content unavailable to the current
session, or other media outside that extractor's results. Album discovery follows
the bundled extractor's capabilities. Requests are paced at one second, with a
60-second wait after HTTP 429 responses.

## Validation

- Downloader tests cover supported URL aliases, rejected routes, naming, and task kinds.
- Shared UI URL tests cover Facebook routing for both desktop and web.
- Gallery completion tests cover failed, unfinished, duplicate, missing, and empty output.
- A desktop regression test protects older photo tasks from transcription on retry.
- `pnpm run check`, downloader/task-queue typechecks, `pnpm run test:audit`,
  `pnpm run verify:ytdlp`, and `pnpm run build:linux` pass.
- Live validation uses a bounded two-photo sample and checks actual image files;
  this verifies integration without claiming a complete profile archive.
- Reels extractor tests cover collection parsing, pagination, duplicate IDs,
  cursor loops, unavailable pages, streamed GraphQL responses, and direct video routing.
