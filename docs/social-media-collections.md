# Social media collections

Paste a supported X, Reddit, or TikTok URL into Add URL. Desktop and web use the
same collection dialog and schema. Choose images, videos, or both; the default
has no post limit. Profiles offer explicit categories. Single-post video format
options remain available through the existing yt-dlp flow.

| Platform | Supported collection surfaces |
| --- | --- |
| X / Twitter | Individual posts and conversations; profiles, tweets, timeline, media, replies, highlights, likes, following/followers; home feeds, notifications, search/hashtags, bookmarks/history, lists/list members, communities, and events |
| Reddit | Posts, galleries, complete comment trees, subreddit feeds/search, combined subreddits, home/search feeds, user submissions/comments/saved/upvoted/downvoted, direct original images, share links |
| TikTok | Photo and video posts, short links, profile posts/reposts/stories/likes/saved, followed accounts' stories |

X bookmark folders and TikTok's For You video feed are not supported by the
pinned extractor. Unsupported platform surfaces are rejected instead of being
silently treated as an individual video. X bookmarked folders are especially
important: the upstream URL matcher would otherwise download all bookmarks.

“Entire collection” means all media the site's available pagination exposes to
the current session. It does not promise historical items that the site hides,
expired stories, deleted posts, or private items outside the session's access.
Existing browser-cookie, cookie-file, and proxy settings are forwarded. This
feature does not require a cookie file for public media that works without one.

## Scope and quality

- Thread scope includes all participants. Author-only is optional. Feed/profile
  downloads can expand each post's conversation, including text-only X parents.
- Quoted/crossposted media and supported linked posts/albums on Imgur and RedGIFs
  can be included. Linked profiles and unrelated feeds are not recursively crawled.
  Explicit following/follower/list-member collection URLs can enumerate profiles.
- Images use original source URLs: X `name=orig`, Reddit original CDN/gallery
  sources, and TikTok full image sources. Thumbnail/preview fallbacks are disabled.
- Images keep their native bytes and format. No resize, recompression, or slideshow
  conversion occurs. Downloaded dimensions must meet the source's declared
  dimensions when available; otherwise the original endpoint and readable image
  header provide the available evidence. This cannot prove a higher rendition
  that a site does not disclose.
- CDN filename extensions may differ from the actual bytes. The downloader's
  corrected native extension is recorded and reused on refresh.
- Reddit native DASH downloads retain video and audio. TikTok uses the upstream
  highest-resolution video selection. Slideshow audio is optional.
- Post limits count distinct media-bearing source posts before the media filter.
  Dates are inclusive. A requested limit/date range is reported as limited;
  normal pagination exhaustion is reported as the available collection downloaded.
- Preview inspects at most three media-bearing posts, has a 30-second deadline,
  downloads no assets, and deletes its temporary manifest. Its sample describes
  the URL's default category, not every selected profile category.

## Persistence and execution

Files are organized under `Platform/owner-or-subreddit/post-id/asset.ext` in the
chosen destination. The private `.vidbee/social-media.sqlite` manifest records
asset IDs, final file paths, dimensions, sizes, SHA-256 hashes, and run summaries.
It does not store cookies, authorization headers, or signed download URLs.

Refresh starts a new run with the previous scope and current authentication
settings. It verifies size, dimensions, and SHA-256 before skipping an existing
file. Missing, corrupt, or unverified files are downloaded again. Cancelled or
failed runs retain completed assets; retry resumes through the manifest. This is
one-time/manual refresh functionality, without scheduled subscriptions.

Collection tasks share the existing queue and process-tree cancellation. They
serialize per platform, publish bounded structured progress, and use disk-backed
asset/post/cursor deduplication. Repeated pagination cursors, missing final
traversal events, logged extraction failures, and failed quality checks cannot
be marked successful. Site-side truncation without an explicit signal remains
indistinguishable from the site's available end of pagination. Gallery tasks do
not enter the single-file transcription pipeline.

## Runtime and verification

The adapter targets gallery-dl `1.32.12-dev:2026.09.10`, source commit
`f93159c24ed0e26a141ff823a0ee3bd4587489a0`. The API Docker build uses the same
pinned source revision as the existing bundled Linux binary. Custom extractors
are copied into both desktop resources and API build/container resources.

Run:

```sh
pnpm run check
pnpm run check:api
pnpm run check:web
pnpm --filter ./apps/web exec tsc --noEmit
pnpm --filter @vidbee/downloader-core typecheck
pnpm --filter @vidbee/downloader-core test
pnpm run test:audit
pnpm --filter ./apps/web exec vitest run src/lib/url-kind.test.ts
python -B -m unittest discover -s apps/desktop/test -p 'test_*.py'
pnpm run build
pnpm run build:web
pnpm --filter ./apps/api run build
```

Python tests require the pinned gallery-dl package, yt-dlp, ffmpeg, and ffprobe.
They use local HTTP fixtures and the actual upstream TikTok/Reddit extractors,
including generated video/audio and DASH media. No site credentials are needed.

Live validation on September 16, 2026 used an isolated API/web instance and the
bundled Linux downloader. A public TikTok photo post saved 16 images (6,043,617
bytes); preview reported 16 images without asset downloads; refresh verified all
16 existing files and downloaded zero. The browser UI showed the completed
counts and refresh action. Reddit rejected the public feed request with its
network-security block. X guest extraction failed upstream (`KeyError: result`).
A public TikTok video fixture was unavailable. Those runs correctly remained
incomplete; authenticated feeds/profiles and complete live threads were not
verified. Desktop compilation is verified separately from native desktop UI QA.

Final local verification passed: root check (including desktop TypeScript and
locale coverage), API check, web check and TypeScript, downloader-core TypeScript,
149 downloader tests, 89 audit tests, 55 web URL tests, and 40 Python tests.
Desktop, web, and API builds passed. All 16 live images also passed an independent
Pillow decode/header check with dimensions matching the manifest. Root check
retains its pre-existing React dependency warning in `TranscriptCaptionsPane.tsx` and the
locale script's module-type warning. Container image creation, native desktop
interaction, and authenticated live collections remain separate unverified gates.
