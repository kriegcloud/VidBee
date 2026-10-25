# Quality review fix loop — 2026-10-24

Scope: every fork commit since the upstream v2.2.4 merge (`90657b2..b62bc92`):
OnlyFans/Fansly grouping and chat maps, Facebook/VSCO/Threads/Pinterest profile
mappers, history row menus and activation, marquee drag-select, local posters,
and the image-detail plan amendment.

## Result

| | |
| --- | --- |
| Baseline commit | `7ea72ba` |
| Fix commits | `edb2428` (round 1), `1285f21` (round 2), `b62bc92` (follow-up) |
| Rounds | 3 of a 4-round budget; round 3 returned zero required findings from all five reviewers |
| Required findings fixed | 12 in round 1, 3 in round 2, 0 in round 3 |
| Waivers | none |

Reviewer panel: ten roles run as five read-only pairs — quality gate + evolution,
architecture + reuse, domain + correctness, errors + security, testing + docs.
VidBee is not an Effect codebase, so the Effect-law role became a correctness and
concurrency role, and doctrine came from `AGENTS.md`, the Ultracite rules and the
plan docs.

Quality lanes, all green at `b62bc92`: `pnpm run check`, `check:web`, `apps/api`
check, Biome on every changed file outside `apps/desktop`, `test:audit` (177,
now including `packages/ui/test`), downloader-core vitest (192), browser-capture
vitest (47), apps/web vitest (114), and the downloader-core, task-queue and
browser-capture typechecks.

## What the loop changed

- Marquee auto-scroll arms on intent, so a still long-press near an edge no
  longer runs the list, while dragging off the last row still scrolls.
- ffmpeg poster renders are capped at two concurrent; cached posters skip the
  queue; single mapped posts never scan a shared profile folder.
- Saved VSCO/Threads/Pinterest profiles are labelled from the exhaustive table.
- Threads no longer offers a dedicated-browser login the desktop refuses; the
  dedicated-session platforms are defined once in downloader-core.
- One http(s)-only predicate gates opening source URLs in web, the desktop
  renderer and the main-process `openExternal`.
- Web reached parity for edge auto-scroll, open in browser, on-disk size, the
  file-count chip and group retry-failed.
- `packages/ui/test` now runs in `test:audit`; poster selection, cache keys,
  seek plan and the render limiter are unit-tested.
- The OnlyFans doc and the image-detail plan were corrected.

## Backlog

Non-blocking findings that remain, highest value first. Items fixed by later
rounds are omitted.

### P2

- **VSCO `video: true` on image media (DOM-3, question).** The VSCO mapper emits
  `/video/<id>` whenever gallery-dl reports `video: true`; if VSCO marks some
  image-type media that way, the mapped page may not exist. Needs a live gallery
  to settle.
- **Mapper outcome strings are hard-coded English (ERR-2).** Messages such as
  "No posts were found in this VSCO gallery" and the Threads `AuthRequired` text
  are rendered verbatim in the UI rather than through i18n.
- **Streaming mapper runs keep all stdout (DOM-4).** `runGalleryDlJson` streams
  lines to `onLine` but still accumulates output against the 32 MiB cap, so a
  very large profile can hit the cap even though nothing needs the buffer.
- **No feature doc for the new mappers (DOM-6, DOC-4).** VSCO, Threads and
  Pinterest profile mapping, and the history row "Map" / "Open in browser" /
  "View detail" items, are undocumented in `docs/`.

### P3

- Poster pipeline: queued renders for unmounted rows still run (no cancel);
  failures are not negative-cached; the poster cache is never pruned;
  per-attempt ffmpeg failure detail is not logged; the poster briefly blanks
  when a row re-checks its file.
- `thumbnail.getLocalPoster` trusts renderer paths; confinement to download
  directories is renderer policy, not enforced in main.
- The window-open handler (`apps/desktop/src/main/index.ts:634`) calls
  `shell.openExternal` without the new scheme check (pre-existing).
- Four pre-existing `openExternal` callers ignore a `false` return.
- Group "retry failed" is not disabled while its loop runs, and reports
  "already queued" when every retry threw (web and desktop).
- `createLimiter` duplicates the counting semaphore in `AgentCloudSlots`;
  `LocalPosterCache` copies `ThumbnailCache`'s cache-dir and protocol plumbing.
- `normalizeVscoGalleryUrl` is a retained wrapper with no callers.
- The mapped-profile platform list exists as both a zod enum and a TS union.
- Count strings have no plural forms ("Retrying 1 failed downloads").
- `check:i18n` cannot catch keys used in code but missing from `en.json`.
- The marquee hook leaves its hold timer armed on unmount.
- Profile maps save the whole profile synchronously on every emitted item.
- Thin coverage: the marquee hook beyond its pure helpers, `download-facade`
  `singleVideo` gating, row activation, and web parity features.

Pre-existing and out of scope: the `useExhaustiveDependencies` warning at
`TranscriptCaptionsPane.tsx:1149`.
