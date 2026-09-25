# Dzen profile video downloads

Paste a Dzen channel root into Add URL on desktop or web, select videos in the
playlist preview, and start the batch. With one-click mode enabled, multiline
profile URLs use the existing playlist batch path for each channel.

Supported profile forms:

- `https://dzen.ru/id/5f272f80ba199a2a3379d0d2`
- `https://dzen.ru/channel_name`
- Equivalent `www.dzen.ru` and legacy `zen.yandex.ru` channel roots

Profiles are normalized before metadata extraction. Individual video URLs remain
on the single-video path. Selecting the Instagram profile tab does not send a
Dzen channel through the Instagram inspector.

The bundled yt-dlp channel extractor enumerates long videos and shorts from its
existing feed format, follows continuation links, and deduplicates publication
IDs across tabs and pages. Missing feed data, failed page requests, and repeated
pagination cursors fail discovery instead of returning a successful partial
inventory. Each selected video uses the existing independent download job,
format selection, cookies/proxy settings, progress, cancellation, and retry flow.

This feature is a video batch downloader. It does not archive article images,
image posts, private/unavailable publications, or maintain a persistent archive
of previously downloaded publication IDs across separate batches.

## Runtime

The desktop bundled engine must be rebuilt after changes to the vendored
extractor (`pnpm run build:ytdlp`). A separately hosted web API uses its configured
`YTDLP_PATH` or system yt-dlp, so point it at the same patched binary to get the
pagination and deduplication fixes. Do not assume an upstream binary includes
VidBee's local changes.

## Verification

Offline fixtures cover channel URL classification, shared playlist routing,
authentication argument forwarding, long/short enumeration, pinned duplicates,
terminal empty pages, malformed feed data, failed requests, and pagination
cycles. These tests do not establish compatibility with Dzen's current live API.

Live validation remains required: scan a known profile to the terminal page,
compare the discovered long-video and short counts with the profile, download
representative items, and check duration plus audio/video playback. Dzen browser
access was blocked by the session's site-safety policy during implementation;
no live profile scan or download was performed.
