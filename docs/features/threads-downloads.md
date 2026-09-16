# Threads media downloads

Paste a Threads post or profile URL into the add-URL box in desktop or web. Both
surfaces use the shared gallery download flow, including when one-click downloads
are disabled. Batch input and direct download requests use the same backend URL
routing.

Supported URLs:

- `https://www.threads.com/@username/post/SHORTCODE`
- `https://www.threads.com/@username`
- `https://www.threads.com/@username/media`
- The equivalent `threads.net` URLs.

Select a browser signed in to Threads in cookie settings, or provide a cookie
file containing the Threads session. Cookies are scoped to Threads; the extractor
keeps page tokens in memory. It downloads the largest offered image and the
largest offered video rendition, preserving every item of mixed carousels.
Profile downloads cover the Media tab's root posts, excluding other users' posts,
replies, reposts, and text-only posts.

Files are stored under `Threads/<username>/<shortcode>/<post-id>_<number>.<extension>`.
Repeating a download reuses existing files. Gallery jobs do not automatically start
transcription.

## Runtime and packaging

The custom extractor is `apps/desktop/resources/gallery-dl-extractors/threads_web.py`.
Desktop already loads this directory. API builds now copy it into
`apps/api/dist/resources/gallery-dl-extractors`; the Docker image supplies an
explicit `VIDBEE_GALLERY_EXTRACTORS_DIR`. Source-mode API development resolves the
same desktop resource directory. An alternate API deployment can set that variable
to the directory containing the custom Python extractors.

The API image pins gallery-dl 1.32.11, matching the extractor message interface used
by the desktop's bundled 1.32.12 development build. The installed desktop AppImage
must be rebuilt and installed separately to receive source changes.

## Protocol and failure handling

Profile lookup uses `BarcelonaUsernameHovercardImplDirectQuery`, rather than
assuming the HTML contains the target user ID: authenticated direct profile pages
can still return a 404-style shell. Media uses `BarcelonaProfileMediaTabDirectQuery`
and single posts use `BarcelonaPostPageStrongIdTargetQuery`. IDs and provider
variables were verified on 2026-09-16.

A rejected query triggers one bounded search of the page's static JavaScript
bundles for its current operation ID and provider flags, then one retry. Both
inline operation IDs and separate Relay operation modules are recognized. This
is best-effort recovery; a larger site change can still require an extractor update.

Requests within a task are sequential and spaced by at least one second. Invalid
pagination, repeated cursors, missing media formats, unavailable posts, rejected
sessions, and empty media collections produce an error rather than a successful
partial gallery. The highest resolution offered by Threads may be smaller than
the uploaded original.

## Verification

- `pnpm run check`
- `pnpm run check:api`
- `pnpm run check:web`
- `pnpm --filter ./apps/web exec tsc --noEmit`
- `pnpm --filter ./packages/downloader-core test`
- `pnpm --filter ./apps/web exec vitest run src/lib/url-kind.test.ts`
- `pnpm run test:audit`
- Python with gallery-dl 1.32.11 installed:
  `python -B -m unittest discover -s apps/desktop/test -p 'test_*_web.py'`

The 2026-09-16 live check downloaded the account owner's single-image profile
through `HostRoutingExecutor`, verified the same post's existing-file skip, and
confirmed two distinct cursor pages on a larger profile. Fixtures additionally
cover mixed image/video carousels, malformed responses, missing cookies, stale
query recovery, and gallery completion guards. These checks do not constitute an
interactive UI test or installation of a new AppImage.
