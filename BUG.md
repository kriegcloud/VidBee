# Task: OnlyFans downloads fail in VidBee — pattern-match HAR, add extractor or fix the blocker

You are an autonomous coding agent working in the VidBee monorepo at
`/home/elpresidank/YeeBois/workstation-apps/VidBee`. Your job: make
`https://onlyfans.com/...` URLs downloadable through VidBee, or prove — with
runtime evidence — that the captured media is CDM-DRM and therefore cannot be
decoded, in which case make the failure accurate instead of misleading.

Ground truth is a real browser traffic capture:
`/home/elpresidank/Downloads/onlyfans.com.har` (13 MB, 247 entries, logged-in
session, captured 2026-09-16). A ready-to-use Netscape cookie jar for the same
session is at `/home/elpresidank/Downloads/onlyfans.com_cookies.txt`
(contains `sess`, `auth_id`, `csrf`, `fp`, `st`, Cloudflare cookies) — pass it
to yt-dlp with `--cookies`. Treat both files as read-only. They contain live
session credentials — **never commit, copy, or log their secret values into
the repo, test fixtures, commit messages, or build artifacts.**

## Current failure

Pasting an OnlyFans post URL (e.g. `https://onlyfans.com/2669829379/kenzeygrey`)
into VidBee fails. The vendored yt-dlp has **no OnlyFans extractor** (verified:
no `onlyfans` match anywhere under `vendor/yt-dlp/`), so URLs fall through to
the Generic extractor, find no media in the JS-app HTML shell, and die with
`Unsupported URL`. VidBee already removed the upstream domain blocklists
(`vendor/yt-dlp/yt_dlp/extractor/unsupported.py` is intentionally empty) and
forces `allow_unplayable_formats` on (`vendor/yt-dlp/yt_dlp/YoutubeDL.py:642-644`),
so nothing stands in the way of a real extractor.

## Phase 1 — Pattern-match the HAR (do this first, report findings)

Write a throwaway script (Python, outside the repo or in `/tmp`) that parses the
HAR and extracts every media-relevant pattern. Confirm and extend the facts
below, which were pre-extracted for you:

### URL and API shapes

- Post page: `https://onlyfans.com/{post_id}/{username}` (also profile URLs
  `https://onlyfans.com/{username}`).
- Post API: `GET https://onlyfans.com/api2/v2/posts/{post_id}?skip_users=all`
  → JSON with a `media[]` array.
- User API: `GET https://onlyfans.com/api2/v2/users/{username}`.
- CDN host: `cdn2.onlyfans.com`.

### Auth headers observed on `api2/v2` requests

`app-token` (static per site JS revision), `user-id`, `time` (epoch ms),
`sign` (shape `{time}:{sha1_hex}:{part}:{rev}`), `x-bc`, `x-of-rev`
(site revision, e.g. `202609160938-76a8806bb4`). Session cookies are provided
in `/home/elpresidank/Downloads/onlyfans.com_cookies.txt` (Netscape format).
VidBee already passes `--cookies-from-browser` / `--cookies <path>` to yt-dlp
(`packages/downloader-core/src/yt-dlp-args.ts:638-639`), so design the
extractor to authenticate with yt-dlp's standard cookie jar plus a `sign`
header it computes itself. The signing algorithm is the well-known OnlyFans
scheme: SHA-1 over a string built from a per-revision static secret, the
request path, `time`, and `user-id`, with dynamic rules shipped in the site's
JS. Fetch the rules at runtime from the site (do not hardcode values from the
HAR); keep the implementation minimal (KISS).

### Video media object schema (verbatim from post `2669829379`)

```json
{
  "id": 3743089366,
  "type": "video",
  "duration": 769,
  "files": {
    "full": { "url": null, "width": 1080, "height": 1920, "sources": [] },
    "thumb": { "url": "https://cdn2.onlyfans.com/files/c/ce/.../300x300_..._frame_0.jpg?Tag=2&u=...&Policy=...&Signature=...&Key-Pair-Id=..." },
    "preview": { "url": "...jpg?..." },
    "squarePreview": { "url": "...jpg?..." },
    "drm": {
      "manifest": {
        "hls": "https://cdn2.onlyfans.com/hls/files/c/c3/c3855a3b6093cf72b30d2a475b5ff252/0hzkutras3coskvskixmr.m3u8?Tag=2",
        "dash": "https://cdn2.onlyfans.com/dash/files/c/c3/c3855a3b6093cf72b30d2a475b5ff252/0hzkutras3coskvskixmr.mpd?Tag=2"
      },
      "signature": {
        "hls": { "CloudFront-Policy": "...", "CloudFront-Signature": "...", "CloudFront-Key-Pair-Id": "..." },
        "dash": { "CloudFront-Policy": "...", "CloudFront-Signature": "...", "CloudFront-Key-Pair-Id": "..." }
      }
    }
  },
  "videoSources": { "720": null, "240": null }
}
```

Key observations to verify against every video object in the HAR:

- For this DRM-enabled creator, `files.full.url` is `null` and `videoSources`
  values are `null` — **no plain MP4 is served**. Only CloudFront-signed HLS
  (`.m3u8`) and DASH (`.mpd`) manifests exist.
- The CloudFront signature must accompany **every** manifest and segment
  request, either as query params or as a `Cookie` header
  (`CloudFront-Policy=...; CloudFront-Signature=...; CloudFront-Key-Pair-Id=...`).
- Non-DRM videos (not present in this capture) reportedly populate
  `files.full.url` / `videoSources` with direct signed MP4 URLs. Detect that
  shape too so the extractor handles both.
- The capture contains **no fetched `.m3u8`/`.mpd` response bodies** — the
  player never loaded them. You must fetch the manifest yourself at runtime
  (with the CloudFront signature attached; use the cookie jar for the API
  calls that mint it) to classify the encryption.

### Classification reference (decide with evidence, not assumption)

1. **Codec encoding** (H.264/AAC): irrelevant to this task; ffmpeg handles it.
2. **AES-128 HLS**: manifest has `#EXT-X-KEY:METHOD=AES-128,URI="https://..."`.
   yt-dlp fetches the key and decrypts natively
   (`vendor/yt-dlp/yt_dlp/downloader/hls.py:63,195,265-268`). **Fully
   supportable** — this is the "fix the bug that inhibits .mp4 decoding" case:
   the only thing missing is an extractor that hands yt-dlp the manifest URL +
   CloudFront signature.
3. **CDM DRM**: `#EXT-X-KEY` with `URI="skd://..."`,
   `KEYFORMAT="com.apple.streamingkeydelivery"` / `"com.microsoft.playready"`,
   `METHOD=SAMPLE-AES*`, or DASH `ContentProtection` for Widevine/PlayReady.
   yt-dlp has no CDM; detection lives at
   `vendor/yt-dlp/yt_dlp/downloader/hls.py:32-38` and
   `vendor/yt-dlp/yt_dlp/extractor/common.py:2886-2887`. **Not decodable** —
   no amount of extractor work fixes this. The site JS references
   `/users/media/drm/certificate` and `media/{id}/drm/...` license endpoints,
   so be skeptical, but prove it from the fetched manifest.

## Phase 2 — Implement, based on what the evidence shows

### Outcome A (preferred): new site extractor

If any captured video offers a non-CDM path (direct MP4 in
`files.full.url`/`videoSources`, or AES-128 HLS), create
`vendor/yt-dlp/yt_dlp/extractor/onlyfans.py`:

- Register it in `vendor/yt-dlp/yt_dlp/extractor/_extractors.py`.
- Match post URLs (`onlyfans.com/{id}/{user}`) at minimum; profile/feed
  support only if trivial (YAGNI).
- Call the `api2/v2` endpoints with cookie auth + computed `sign` header.
- For each `media[]` video: prefer direct MP4 URLs when present; otherwise
  take `files.drm.manifest.hls` (and/or `dash`) and attach the corresponding
  `files.drm.signature` CloudFront triplet so manifest **and segment**
  requests are authorized (query params or `Cookie` header — verify which the
  CDN accepts; the web player uses cookies).
- Set accurate metadata: `id`, `title` (from post text), `duration`,
  `thumbnail` (`files.preview.url`), `uploader`.
- Add a standard yt-dlp extractor test using a **sanitized** fixture derived
  from the HAR (no real tokens, signatures, user IDs, or CDN hashes).
- Follow existing extractor conventions in the vendored tree; English
  comments; keep it small.

### Outcome B (only with proof): accurate failure

If — and only if — you have fetched a manifest and shown it is FairPlay/
Widevine/PlayReady (case 3 above) **and** no direct-MP4 variant exists:

- Do not write a fake extractor. Instead ensure the failure is truthful:
  the URL should not die as `Unsupported URL` from Generic. A minimal
  extractor that recognizes the site, extracts what's available (thumbnails,
  metadata), and raises a clean, expected `This video is DRM protected`
  (via the existing `raise_no_formats` path) is acceptable — VidBee's UI
  already maps that string to a user-friendly message
  (`apps/desktop/src/renderer/src/lib/download-error-guidance.ts:116-119`).
- Document the evidence (manifest `#EXT-X-KEY` lines, with secrets redacted)
  in your final report.

Do **not** revert VidBee's existing patches (`unsupported.py` empty,
`allow_unplayable_formats` default) — they are intentional.

## Phase 3 — Build, verify, deploy on this workstation

Execute in order from the repo root (use `pnpm`, never `npm`):

1. `pnpm build:ytdlp` — rebuilds the vendored binary via PyInstaller
   (`apps/desktop/scripts/build-vendored-ytdlp.js`) and copies it to
   `apps/desktop/resources/yt-dlp_linux`.
2. `pnpm verify:ytdlp` — sanity-checks the built binary.
3. Smoke-test the binary directly against a real OnlyFans post URL with the
   provided cookie jar, e.g.
   `apps/desktop/resources/yt-dlp_linux --cookies /home/elpresidank/Downloads/onlyfans.com_cookies.txt -F <url>`
   and confirm formats are listed (Outcome A) or the DRM error is clean
   (Outcome B). Then confirm an actual download of one video produces a
   playable `.mp4` (Outcome A only).
4. `pnpm run check` — must pass (Biome/Ultracite + typecheck). If you touched
   UI strings, translate `en.json` only and run `pnpm run check:i18n`.
5. `pnpm build:linux` — produces `apps/desktop/dist/vidbee-<version>.AppImage`.
6. Update the installed app: the launcher `~/.local/bin/vidbee` symlinks to
   `~/.local/opt/VidBee/current.AppImage`. Inspect that directory, place the
   new AppImage there, and repoint `current.AppImage` at it (preserve any
   existing versioning convention you find). Do not kill a running VidBee
   without noting it; relaunch afterwards.
7. End-to-end: in the updated VidBee app, download the same OnlyFans post URL
   and confirm success (or the accurate DRM message for Outcome B).

## Acceptance criteria

- [ ] HAR pattern-match report produced (Phase 1 facts confirmed/refuted with
      evidence; manifest encryption classification stated explicitly).
- [ ] `onlyfans.com` post URLs resolve through a real extractor — no
      `[generic] Unsupported URL` for this site.
- [ ] Outcome A: a downloaded video plays (valid MP4/HLS→MP4 remux). Outcome
      B: failure message is the accurate DRM one, with proof attached.
- [ ] No HAR secrets anywhere in the repo, fixtures, or git history.
- [ ] `pnpm run check` passes; new yt-dlp binary built and verified; new
      AppImage installed at `~/.local/opt/VidBee/current.AppImage`.
- [ ] Changes committed with Conventional Commits messages (e.g.
      `feat(vendor): add onlyfans extractor`, `chore(desktop): rebuild vendored yt-dlp`).

## Reference: file map

| Concern | File |
|---|---|
| Spawn yt-dlp | `packages/downloader-core/src/yt-dlp-executor.ts:394-397` |
| CLI arg building (cookies passthrough) | `packages/downloader-core/src/yt-dlp-args.ts` |
| Vendored yt-dlp tree | `vendor/yt-dlp/` |
| Extractor registry | `vendor/yt-dlp/yt_dlp/extractor/_extractors.py` |
| HLS DRM regexes / AES-128 exemption | `vendor/yt-dlp/yt_dlp/downloader/hls.py:32-38, 63` |
| HLS/DASH `has_drm` stamping | `vendor/yt-dlp/yt_dlp/extractor/common.py:2227, 2886-2887` |
| "This video is DRM protected" | `vendor/yt-dlp/yt_dlp/extractor/common.py:1228` |
| VidBee: keep unplayable formats | `vendor/yt-dlp/yt_dlp/YoutubeDL.py:642-644` |
| VidBee: blocklists removed | `vendor/yt-dlp/yt_dlp/extractor/unsupported.py` |
| yt-dlp build script | `apps/desktop/scripts/build-vendored-ytdlp.js` |
| User-facing DRM message | `apps/desktop/src/renderer/src/lib/download-error-guidance.ts:116-119` |
| Installed app symlink | `~/.local/bin/vidbee` → `~/.local/opt/VidBee/current.AppImage` |
