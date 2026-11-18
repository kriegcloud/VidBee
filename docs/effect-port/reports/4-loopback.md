# Loopback download goldens

## Progress

- [x] Read the lane brief, shared rules, master plan, port guide, golden guide and CI workflow.
- [x] Confirm the existing offline baseline launches and compares (boot subset, 28.6 seconds).
- [x] Add a namespace-local Node media server and bundled-ffmpeg fixture generation.
- [x] Characterize public download surfaces on the packaged baseline.
- [x] Record 21 new cases, including reopening the same physical synthetic profile.
- [x] Thirty consecutive final-harness download comparisons and ten full comparisons pass.
- [x] Repository check, test, catalog and ratchet gates pass, including the final launcher revision.
- [x] Audit all 120 DNS logs, confirm physical-profile/alias cleanup, restore CLI output and write scratch handoff.

No application source changes are part of this lane. The packaged build at
`~/YeeBois/workstation-apps/VidBee/apps/desktop/dist/linux-unpacked` is the
read-only baseline at the lane's starting revision `21d6718`, before the queue and
downloader ports. No owner process or live profile is used. All raw wire answers,
profiles, media and request/DNS logs stay in the lane scratch directory.

## Server and isolation

`build-fixture.mjs` generates a two-second 160×90 H.264/AAC video and two-second
16 kHz mono PCM waveform using the baseline's bundled ffmpeg. The image is the
existing one-pixel synthetic PNG. `loopback.mjs` uses only Node built-ins and runs
in the worker's offline network namespace, shared with the app and yt-dlp. It
binds an ephemeral loopback port, supplies fixed file headers, supports HEAD and
byte ranges, and exposes normal, throttled, stalled, 404, 500 and recoverable
routes. Connection/timer cleanup and request-log flushing run in `finally`.

Every request logs method, path and Range in arrival order to
`run/loopback/requests.jsonl`. The request sequence is evidence, not a golden:
pause/cancel may change ranged offsets with timing. Golden status sequences come
from the public automation SSE stream subscribed before admission; polling waits
on conditions and has bounded failure timeouts. No case waits a fixed time for
completion, cancellation or pause.

The Linux build workflow already builds the CLI and invokes `test:golden` after
packaging. The server needs no CI service or dependency. Hosted CI remains
unverified by this local work.

## Baseline characterization

The first public MCP probe is retained as `suite-cb9XXH/run/loopback/probe.json`.
Later runs preserve all MCP requests/responses in `loopback/raw.json`, the full
public event stream in `loopback/events.json`, and raw batch/automation answers
beside them. These are public-surface probes; no application service is imported
by the harness.

- A direct video, waveform or PNG URL is accepted by yt-dlp's generic extractor.
  Successful direct routes receive three GETs: metadata hydration before task
  admission, executor extraction, and the media body. The image is admitted as a
  video task and completes as PNG; this observed behavior is pinned.
- `download_media`, `create_task`, `download_batch` and automation HTTP `add` all
  successfully admit loopback downloads. MCP admissions hydrate metadata before
  queueing. A repeated identical `download_media` during positive media progress
  returns `created: false` and the same running task ID.
- The fixture pins download destination, concurrency, browser cookies (`none`),
  cookie/config paths and proxy (empty), subtitle flags, embedding flags, output
  template, sequential naming and automatic ASR through public settings before
  the new cases. Explicit download options pin per-case filenames. The raw
  automation `add` surface passes its task input directly to the queue and uses
  executor defaults when no per-task settings are supplied; unlike MCP-prepared
  inputs it reports unavailable subtitles and an acquisition record. That
  difference is retained in its golden.
- Direct successful tasks take approximately 0.66–0.70 seconds from admission to
  completion in the first final-harness run. Metadata hydration adds its own
  pre-admission subprocess. End-to-end suite timings below include schema
  bootstrap, fixture generation, disposable launches and restart cleanup.
- The explicit extensionless `/remux` case requests MKV and logs
  `[VideoRemuxer] Remuxing video from mp4 to mkv`, proving that the bundled ffmpeg
  postprocessor runs. ffprobe confirms H.264/AAC in Matroska, 2.112 seconds and
  34,565 bytes. The direct MP4 is 35,476 bytes and two seconds; the waveform is
  64,078 bytes and two seconds; the PNG is 68 bytes.
- Requesting `type: audio, audioFormat: mp3` for the waveform still saves a WAV
  with PCM audio. The executor arguments have no audio-extraction/conversion
  flags in this baseline. This case proves an audio-only download, not successful
  MP3 conversion; the discrepancy is a review finding, left unchanged.
- Cancel waits for the third media-route request plus positive task progress.
  It terminates as `cancelled`, with null output/error, leaving a `.part` file.
  Partial byte counts vary and are raw evidence only; names are pinned.
- Pause uses the same request/progress condition. Its SSE lifecycle is
  `queued → running → paused → queued → running → completed`. Resume completes
  successfully, and the request log retains any range request. The baseline
  resumes within attempt 1. Successful direct/remux tasks report
  `queued → running → completed`; a separate `processing` state is not invented
  for the observed ffmpeg run.
- HTTP 404 ends `failed` on attempt 1, classified `not-found` with
  `task.error.notFound`. HTTP 500 reaches `retry-scheduled` on attempt 1,
  classified `network-transient` with `task.error.networkTransient`; the case
  records that state and then cancels before retry dispatch. A manual retry
  changes `/recover.mp4` from 404 to success and completes on attempt 2.
- After all downloads settle, the app is stopped through its owning launcher and
  restarted on the same physical `run/userdata` directory. The restart launch's
  `userdata` is a symlink to that directory, not a copy. The optional launcher
  argument accepts only this same suite's original `run/userdata`; HOME,
  descriptors and the network namespace remain disposable. The first accepted
  run verified identical realpaths and database inodes. Persisted tasks and
  history are pinned after restart.

## Cases and stable observations

There are 20 download-worker documents and one restart document, added to the
original 358 comparisons for a total of 379 per complete invocation.

| Cases | Pinned observations |
| --- | --- |
| `video`, `remux`, `audio`, `image` | Final task except timing-dependent progress/log values, progress field names, full output/error, SSE lifecycle, own history, physical file size/name, selected ffprobe fields and queue stats immediately afterwards |
| `http-404`, `http-500`, `http-500-cancelled` | Error classification, retry state, attempts, cancellation, terminal history |
| `retry-failed`, `retry-completed` | The same task before and after manual retry, including attempt 2 and real output |
| `duplicate` | Admission reuse and same running task identity |
| `paused`, `resumed`, `cancelled` | Pause/resume/cancel snapshots and ordered public transition sequences |
| `cancel-files`, `pause-files` | Ordered physical file/directory names remaining after the operation |
| `create-task`, `batch`, `automation` | Each public admission surface followed through actual completion/history/file proof |
| `queue-delta`, `list-tasks` | Queue changes from settled fixture state, final capacity/active counts, loopback group count and all new task snapshots |
| `restart` | Persisted new task list and history on the same physical profile |

`progress` values and the `log` string are explicitly excluded from these case
projections because logs contain raw speed, ETA and progress text. Their
structure remains visible through `progressFields`; full data remains in raw
scratch evidence. Every output/error field, filename, file size, container,
media duration, attempt and status sequence remains meaningful. No lifecycle
state is normalized away.

New named normalization rules cover the loopback `groupKey` port, runtime
`nextRetryAt`, subtitle acquisition `acquiredAt`, and the exact temporary output
alias root. The deliberately fixed future fixture retry time `4102444800000`
remains literal. See [GOLDENS.md](../GOLDENS.md) for the full rules and commands.

Seven focused `@effect/vitest` tests exercise media headers/HEAD, range variants
and 416s, failure/recovery routes, stalled bodies, throttled bodies, active
connection cleanup, ordered request logging and the narrow normalization rules.

## Determinism and failures

All **30 consecutive isolated comparisons** and **ten consecutive full-suite comparisons** passed on the final, unchanged harness, including the per-case queue observations. That is 4,420 accepted document comparisons, with zero failures and no cases removed for instability.

| Scenario | Runs | Comparisons per run | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Isolated download cases | 30 | 21 | 28.5s | 32.9s | 55.2s |
| Complete suite | 10 | 379 | 58.7s | 63.4s | 76.5s |

The full-suite maximum was 76.5 seconds, within the roughly 90-second target. Against the original-suite observation of 28.6 seconds, the measured median full runtime increased by approximately 34.8 seconds. These are not paired benchmarks: launch time varies, the original harness reported elapsed time before its final cleanup while these receipts measure the complete command, and isolated measurements also include schema bootstrap, fixture generation and restart.

The acceptance sequence began at 2026-11-18T11:02:50.367713+00:00 UTC. Each row below has exit code 0. Evidence names are relative to the lane scratch `runs/` directory; `determinism.json`, individual stdout logs and `acceptance-audit.json` preserve exact timestamps, elapsed values, counts and audit details.

| Scenario | Run | Evidence | Seconds |
| --- | ---: | --- | ---: |
| loopback | 1 | `suite-C6HDal` | 29.084 |
| loopback | 2 | `suite-qm7mSu` | 29.674 |
| loopback | 3 | `suite-VVVpuK` | 28.530 |
| loopback | 4 | `suite-hbYWtE` | 38.463 |
| loopback | 5 | `suite-kaDQoj` | 37.618 |
| loopback | 6 | `suite-oXCv3k` | 36.704 |
| loopback | 7 | `suite-tBqrjo` | 31.114 |
| loopback | 8 | `suite-Swezcw` | 41.919 |
| loopback | 9 | `suite-F5fBot` | 55.204 |
| loopback | 10 | `suite-GjMllE` | 38.365 |
| loopback | 11 | `suite-ozrXwn` | 32.450 |
| loopback | 12 | `suite-FvrF0M` | 30.309 |
| loopback | 13 | `suite-4o4PdG` | 29.113 |
| loopback | 14 | `suite-WqtKlZ` | 42.167 |
| loopback | 15 | `suite-bdxnUG` | 32.704 |
| loopback | 16 | `suite-8vXR2c` | 30.362 |
| loopback | 17 | `suite-lw9qJJ` | 37.476 |
| loopback | 18 | `suite-Qz8jdl` | 45.221 |
| loopback | 19 | `suite-HVwHwM` | 33.217 |
| loopback | 20 | `suite-B3CiWg` | 33.027 |
| loopback | 21 | `suite-vR4duK` | 41.035 |
| loopback | 22 | `suite-NORgIS` | 33.414 |
| loopback | 23 | `suite-7sJKMR` | 29.643 |
| loopback | 24 | `suite-D57MNQ` | 31.656 |
| loopback | 25 | `suite-EIuag3` | 29.634 |
| loopback | 26 | `suite-mMZ4KH` | 40.864 |
| loopback | 27 | `suite-pDCZTn` | 30.035 |
| loopback | 28 | `suite-0QpGFl` | 33.533 |
| loopback | 29 | `suite-WBaS6X` | 29.711 |
| loopback | 30 | `suite-VaGSbL` | 32.248 |
| full | 1 | `suite-Y6z7a3` | 65.675 |
| full | 2 | `suite-AbDtrh` | 58.653 |
| full | 3 | `suite-Sob6Zi` | 59.900 |
| full | 4 | `suite-kJOTA2` | 65.627 |
| full | 5 | `suite-8Zy8q9` | 63.701 |
| full | 6 | `suite-ZiSdy7` | 71.874 |
| full | 7 | `suite-9FqXzt` | 61.070 |
| full | 8 | `suite-mTq6U7` | 76.461 |
| full | 9 | `suite-yLrB51` | 59.556 |
| full | 10 | `suite-36hXX6` | 63.006 |

The commands were run serially against the read-only baseline. The isolated command adds `--loopback-only --subset loopback`; the complete command has neither selector. Neither acceptance phase used `--update`. A separate earlier preflight and earlier narrower repeat sequences are excluded from these counts.

Before acceptance counting:

1. The first baseline boot subset passed in 28.6 seconds. GPU-process fatal lines
   seen in the stopped bootstrap log were from launcher cleanup, not a failed
   readiness probe; no launch workaround was made.
2. Exploratory recordings passed. The first full integration comparison failed
   with 12 mismatches: nine existing documents exposed an overly broad
   `nextRetryAt` rule masking the fixed future fixture timestamp; the raw
   automation output/list had two unnormalized `acquiredAt` timestamps; queue
   capacity differed because the original suite had set concurrency to 2.
   The rule now preserves the named fixture constant, acquisition time has its
   own named rule, and the independent scenario pins concurrency to 5. Existing
   golden files were not updated.
3. Nine diagnostic repeat comparisons passed while restart still used a copied
   profile. They are excluded from final acceptance. The next invocation was
   deliberately halted before launching to replace the copy with physical
   profile reuse. Its exit 1 is a maintenance stop, not a case flake. Those
   receipts are preserved in `diagnostic-repeats/`.
4. The first physical-profile repeat sequence passed all thirty isolated comparisons and one full comparison. Review then identified that queue stats were only pinned at scenario end. The brief requires queue observations after individual successful media cases. Those four snapshots were added, and the next invocation was intentionally stopped before launch. Receipts are preserved in `diagnostic-final-queue-only/`; final acceptance restarts on the complete case version.
5. The first root check found formatting and harness lint errors in edited files.
   Only edited harness files and new golden JSON were formatted; the assignment
   in the SSE parser loop and unused restart parameter were corrected. The next
   root check passed. No suppression or diagnostic setting changed.

No case was removed for instability. The stalled-download watchdog
case is omitted because its public running-idle threshold is 60 seconds (600
seconds in processing), with no preference to reduce it. The server's stalled
response and cleanup are tested separately. Remote extractors, authentication,
live transcription, packaged builds of the future ports and hosted CI remain
outside this baseline proof.

## DNS evidence

Every launch remains inside a loopback-only network namespace and runs the
existing DNS logger. The original baseline's observed hostname set is:
`selftest.dns-logger.invalid`, `redirector.gvt1.com`, `github.com`, `ghfast.top`,
`gh-proxy.com`, `www.modelscope.cn`, `example.invalid`, `favicon.im`, and
`api.vidbee.org`. The loopback media URLs use numeric addresses and require no
DNS. The final audit read all 120 DNS logs (bootstrap, run and restart for each of 40 accepted invocations), including logger readiness and self-test queries. The union was exactly the nine hostnames above; **no new hostname** appeared. Isolated runs omitted the account API hostname; complete runs included it through the existing cases. All 40 restarts used the same physical profile, and all 40 output aliases were removed. No real network access was enabled.

## Review findings

- The baseline's filename-safety limit can truncate a long absolute output path,
  placing output above the selected directory. The app passes `--trim-filenames 120` on Linux ([argument source](../../../packages/downloader-core/src/yt-dlp-args.ts));
  the vendored kernel slices the full extensionless path to that limit
  ([kernel source](../../../vendor/yt-dlp/yt_dlp/YoutubeDL.py)). The initial probe wrote three
  synthetic outputs above its run directory. They were identified by exact path,
  moved into that probe's `loopback/truncated-path-outputs/` evidence directory,
  and verified absent at the original locations. Subsequent runs use a short
  symlink under the checkout pointing into the run's physical downloads; it is
  removed after each worker and recreated only for the restart observation.
  The application bug is left unchanged.
- Audio-format MP3 selection on a direct waveform URL does not convert it to MP3
  in the baseline. The golden pins the actual waveform output.
- Raw automation `add` does not prepare the same settings/metadata as the MCP
  admission tools. Its default subtitle acquisition behavior is pinned.
- Generic direct media reports null task `durationMs` although ffprobe reports
  two seconds. The golden retains both values rather than filling the task field.

## Gates and handoff

`bun run check`, `bun run test`, `bun run deps:check` and `bun run port:check`
have passed locally. The focused server tests pass seven of seven. The final
launcher passes `bash -n`; a negative synthetic-profile test rejects an unrelated
directory before starting a namespace. The final repeat audit passed. CLI build
output was restored byte-for-byte to the starting tracked blob after the last
run. No application/package source, manifest, dependency, commit or index change
was made. The scratch `HANDOFF.md` records exact command receipts, the evidence
map, review findings and proof limits.
