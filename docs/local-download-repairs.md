# Local download and lifecycle repairs (2026-09-10)

This build extends the earlier Facebook photos and profile-reels work. The repairs are maintained in the local source branch; installation receipts record the source revision and AppImage hash.

## Instagram

The bundled gallery-dl REST profile endpoints redirected to Instagram's home page even with authenticated cookies that could access the profile. Its JSONL inspection mode also omitted exception records while returning exit code zero, so VidBee incorrectly displayed “Nothing found”.

The desktop now ships a small gallery-dl extractor module using Instagram's current web GraphQL posts and reels queries, with separate pagination operations. It retains gallery-dl's cookie loading, media parsing, and download handling. Reels thumbnails are resolved to actual video details. Missing media, missing pagination, or repeated cursors fail explicitly. The module supports the earlier `/photos/` task alias as well as `/posts/`.

Inspection reads gallery-dl's complete JSON document so extractor exceptions are visible. Output is bounded to 64 MiB and each category to ten minutes; inspection process groups are terminated on overflow or timeout. Cached inspections retain summaries, not session tokens or raw responses.

Live inspection of the reported profile returned:

| Category | Items | Files |
| --- | ---: | ---: |
| Posts | 213 | 526 |
| Reels | 6 | 6 |
| Stories | 0 | 0 |
| Highlights | 1 | 40 |
| Tagged posts | 130 | 395 |

The scan took 399 seconds with request pacing. Counts represent extraction results, not a promise that overlapping categories contain unique media.

The standalone gallery-dl release is pinned to `2026.09.10`, with all platform SHA-256 values recorded in `apps/desktop/scripts/gallerydl-assets.js`. The web operation IDs were verified against Instagram's loaded Relay definitions on 2026-09-10. Instagram can change them again.

Manual desktop retries refresh the selected cookie file, browser-cookie source, and proxy while preserving the task's format and destination. The reported single-reel failure had saved a VSCO cookie file in its task settings.

## Facebook and VSCO

Named Facebook `/videos/ID` links fall back to `/reel/ID` only when legacy extraction reports “Cannot parse data”. Existing authentication and network errors keep their normal behavior.

VSCO profile roots route to the gallery downloader and normalize to `/USERNAME/gallery`. Gallery tasks skip unnecessary yt-dlp metadata probes.

Gallery completion uses structured `after` and `skip` events to identify files. Human-readable progress fragments are not file paths. Unknown gallery totals show an indeterminate download state instead of a misleading 99 percent.

VSCO's announced rate-limit waits extend the queue watchdog deadline by a bounded allowance. Previously a 60-second server wait collided with the 60-second watchdog, repeatedly restarting galleries. POSIX gallery processes now have their own process groups, so cancellation terminates the standalone launcher and its child; Windows uses the existing process-tree termination helper. User pause/cancel takes precedence over an earlier watchdog cancellation.

## Memory and queue cleanup

A completed transcription worker retained approximately 496 MiB PSS. Workers now exit after flushing their terminal response, and the parent reaps them before releasing the task. Probe workers and cancelled workers use the same cleanup, including escalation if SIGTERM is ignored.

A separate race allowed a late caption check to enqueue transcription after its download was deleted. Failed durable insertion left a memory-only task that the reconciliation timer retried. The coordinator rechecks parent existence after awaiting captions, deletion blocks new children, and failed inserts/transition writes restore the in-memory state.

The original renderer CPU sample was about 96 percent idle and showed no long JavaScript tasks; repeated dialog opening did not show unbounded DOM/listener growth. The diagnosed memory leak was in the worker process, not a demonstrated renderer heap leak.

## Verification

- `pnpm run check` (desktop lint, locale keys, main and renderer type checks).
- `pnpm run test:audit` (queue, real subprocess lifecycle, gallery completion and inspection failures).
- `pnpm --filter @vidbee/downloader-core test`.
- URL routing tests in `apps/web/src/lib/url-kind.test.ts`.
- Vendored yt-dlp Facebook and extractor registry tests; `pnpm run verify:ytdlp`.
- `test_instagram_web.py` with gallery-dl installed in an isolated test environment.
- Real post-image, Instagram profile reel, Instagram single reel, VSCO profile-root and Facebook named-video downloads. All three video samples contain both video and audio streams.

The installed AppImage receipt records the final artifact hash and runtime checks. Previous AppImages are retained for rollback.

## Installed runtime verification

The installed build downloaded the reported Facebook video and completed automatic transcription. The worker reached 609.8 MiB PSS while active and then exited. A 30-second idle sample measured 410.2, 408.1, and 408.0 MiB total application PSS and 0.1, 0.0, and 0.0 percent of one CPU. The earlier settled sample was 1050.7 MiB PSS. These are process measurements from this workstation, not a general benchmark.

The affected VSCO `paige-rylee` task reached `completed` with 615 verified files: 369 downloaded and 246 skipped existing files. No failed files remained for that task. The temporary verification task and its transcription child were removed after completion; SQLite foreign-key checks remained clean, with no repeated queue errors in the new runtime.
