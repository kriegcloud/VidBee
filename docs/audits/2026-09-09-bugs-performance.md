# VidBee bug and performance audit — 2026-09-09

Baseline: `a8c1cea1a826636e6b03928ae348260234e61afe` on `vendor-yt-dlp`.
The four pre-existing untracked files in `apps/docs/.source/` are outside this audit.

## Scope inventory

Reviewed the desktop startup and vendored-runtime boundary; download/history projections;
renderer download and metadata stores; task queue FSM, dispatch, persistence, process
recovery, watchdog and retry scheduler; yt-dlp and gallery-dl executors; thumbnail cache;
RSS feed normalization and refresh scheduling; and media preview preparation.

Existing automated coverage is concentrated in 24 downloader/profile tests, 18 URL
routing tests, and three vendored-runtime tests. The queue, process recovery, shutdown
races, and resource bounds need focused regression coverage.

This is a targeted workstation audit, not an exhaustive audit of every extractor in
the third-party yt-dlp snapshot, hosted API deployment, or AI provider integration.

## Findings inventoried before implementation

| ID | Priority | Finding and evidence | Planned verification |
| --- | --- | --- | --- |
| A1 | P1 | `TaskQueueAPI.dispatchOne` attempts `processing -> processing` whenever another progress event has `enteredProcessing=true`; yt-dlp keeps this flag true after postprocessing begins. The illegal transition can fail an otherwise healthy download. | Repeated postprocessing events must leave the task processing and permit successful completion. |
| A2 | P1 | Executor callbacks may finish synchronously before `run()` returns. `dispatchOne` then installs a stale active handle; `handleFinish` also clears state without checking attempt identity. | Synchronous failure and late callbacks from a previous attempt must not leak handles, release another attempt's slot, or mutate its state. |
| A3 | P1 | Process recovery treats missing start times as a match, accepts a two-second difference, and does not recheck identity before SIGKILL after the grace period. This can signal a reused PID. | Injected process identities and signal recording; no real processes signalled by tests. |
| A4 | P1 | Descendant removal reads only the first 1,000 children. Persistence removes the whole tree, leaving omitted children in memory. Memory removal also precedes durable deletion, so a failed delete loses the visible row. | More than 1,000 descendants and a rejecting persistence adapter. |
| A5 | P1 | gallery-dl's exit-zero completeness check applies only to VSCO. Instagram can report success with failed, unfinished, duplicate, or missing outputs. Completion also performs two synchronous filesystem probes per asset. | Synthetic gallery subprocesses for complete/incomplete results and filesystem verification without blocking synchronous scans. |
| A6 | P2 | Every `TaskStore.list` page rebuilds and sorts its complete candidate set. History readers page through the entire set, repeating the same work. | Before/after full-history traversal benchmark plus ordering, filtering, cursor, and update tests. |
| A7 | P2 | Retry and RSS schedulers can rearm after `stop()` if an async tick is still running. Timer handles of zero are also mishandled by truthiness checks. | Deferred callbacks, injected timers, stop/restart behavior. |
| A8 | P2 | Watchdog progress/log handling clears and recreates a timer on every event. Large galleries can generate thousands of timer allocations; handle-zero checks also fail. | Count timer operations under a 10,000-event burst and verify precise idle/processing deadlines. |
| A9 | P2 | Thumbnail requests have no timeout or response-size limit and cache writes are not atomic. A stalled or oversized response can retain pending work or exhaust memory; an interrupted write can become a permanently reused broken image. | Bounded streamed responses, timeout, and atomic cache-write tests. |

The findings above were recorded before production edits. The follow-up cases below were also reproduced before their fixes.

Follow-up inventory for A2: watchdog cancellation currently races the executor's
`cancelled` finish event against a separate retry transition. A synchronous finish
can cause an illegal `cancelled -> retry-scheduled` transition; a late finish can
release a retry's slot. Verify both callback timings before closing A2.

Follow-up inventory for A4: deleting a still-finishing cancelled child can erase
its group identity before slot release. Verify that removal waits for executor
finalization, keeping per-group capacity usable after deleting active descendants.

## Applied fixes and verification

All nine findings are fixed in this audit's source changes.

- **A1–A2:** Repeated postprocessing updates are idempotent. Executor callbacks
  settle once, synchronous completion does not install an active handle, and old
  callbacks cannot affect a retry. Watchdog cancellation is classified as `stalled`
  through normal attempt finalization, retaining its slot until the process closes.
  Per-attempt progress bookkeeping is released at completion.
- **A3:** Capture process start time once for the task and process journal, require
  an exact known identity, and check it again before escalation. Unknown or reused
  PIDs receive no signal. Tests use injected identities and a signal recorder.
- **A4:** Page through all descendants and wait for active attempts to finish before
  removing their group identities. Delete durably before removing rows from memory.
  Tests cover 1,005 children, a failed durable delete, and active child cleanup.
- **A5:** Enforce completeness for both Instagram and VSCO. Require unique,
  nonempty regular files, reject reported failures and unfinished assets, and report
  actual unique file counts. File verification uses asynchronous stat calls in
  batches of eight. Twelve synthetic subprocess cases exercise the actual executor.
- **A6:** Index parent membership and cache sorted IDs and cursor positions for up
  to 32 query combinations. Invalidate on membership/order changes and read current
  task fields on every page so live progress is not stale.
- **A7:** Gate retry and feed timers by lifecycle state and generation, prevent
  concurrent retry drains, and accept timer handle zero. Deferred-callback tests
  verify stop during work and subsequent feed restart.
- **A8:** Progress/log events update the watchdog timestamp. The existing timer
  computes the remaining idle period, avoiding a timer allocation per event.
- **A9:** Limit thumbnails to four concurrent requests, a 15-second fetch/body
  deadline, and 10 MiB of actual streamed bytes. Reject empty or non-image HTTP
  responses and publish files by atomic rename; ignore zero-byte existing cache
  entries. Local HTTP tests cover bad responses, stalled bodies, size limits, and
  concurrency; filesystem tests cover successful and failed publication.

## Measured performance

Synthetic benchmark on this workstation: 20,000 tasks with shuffled creation times,
200 items per page, five complete history traversals in one process.

| Metric | Baseline | Fixed |
| --- | ---: | ---: |
| First full traversal | 227.79 ms | 8.48 ms |
| Median full traversal, five passes | 221.05 ms | 0.416 ms |
| Watchdog timers allocated for initial arm plus 10,000 activity events | 10,001 | 1 |

The history measurement covers `TaskStore.list` only, excluding database loading,
IPC, rendering, and network work. The first fixed pass creates the cache; later
passes reuse it. Results do not imply an equivalent whole-application speedup.

Reproduce with `pnpm run bench:audit`. Raw baseline/final measurements and failure
reproductions are in the local audit evidence directory:
`/home/elpresidank/.cache/claude-tmp/vidbee-audit-20260909-hjk1pyyk/`.

## Source validation

- `pnpm run check` — passes desktop lint/format, locale completeness, and both
  main-process and renderer TypeScript checks.
- `pnpm --filter @vidbee/task-queue --filter @vidbee/downloader-core --filter @vidbee/subscriptions-core run typecheck` — passes all three affected packages.
- `pnpm exec biome check <changed TypeScript and JSON files>` — passes all 20 files.
- `pnpm run test:audit` — 38 passing tests (35 added here and three existing
  vendored-runtime tests).
- `pnpm --filter @vidbee/downloader-core run test` — 24 existing tests pass.
- `pnpm --filter @vidbee/downloader-core exec vitest run --root ../.. apps/web/src/lib/url-kind.test.ts` — 18 existing URL-routing tests pass.
- `git diff --check` — passes.

The audit adds root `test:audit` and `bench:audit` commands with a pinned `tsx`
development dependency. No new application runtime dependency is needed. Existing
vendored yt-dlp modifications and source-managed update behavior are preserved.
The AppImage installation has a separate build receipt alongside its artifact.

Live authenticated Instagram/VSCO downloads, every third-party extractor, the
hosted API deployment, and AI provider behavior are outside this validation scope.
