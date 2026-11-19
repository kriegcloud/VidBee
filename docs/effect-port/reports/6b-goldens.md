# Browser capture pre-port goldens

## Progress

- [x] Read the lane brief, common rules, plan, port guide, golden guide, loopback report and reviewed browser-capture design.
- [x] Verify a clean starting tree on `port/goldens-6b`, revision `9dab889b0b1d5328721802d65699a5f8593bf2e2`.
- [x] Baseline packaged isolated loopback comparison passes.
- [x] Characterize public capture reachability, profiles and routed tasks.
- [x] Record 29 reachable observations across two configurations; recording-success contract remains unavailable for the documented baseline defect.
- [x] Twenty consecutive video-only new-case runs, twenty unavailable-configuration runs and five full-suite runs pass.
- [x] Repository gates, DNS/identity/source audits and scratch handoff complete.

The baseline is the read-only unpacked build at
`~/YeeBois/workstation-apps/VidBee/apps/desktop/dist/linux-unpacked`.
Application/package source and existing goldens are outside this lane's edits.
All profiles and media are synthetic. Runs use the existing offline namespace
launcher with throwaway HOME, XDG directories, descriptors and profile. Evidence
is retained in the lane scratch directory; no live profile is read.

## Initial observation

`suite-wBSHqw` passed the existing loopback video comparison in 31.0 seconds,
including fixture creation and same-profile restart. This proves the baseline
harness is executable in this environment. It does not prove browser capture.

## Public packaged characterization

The first candidate (`exploration/suite-xDK1WD`) reached `/drm.html`,
`/drm.mpd` and then a browser ranged GET of `/landscape.mp4`. Public task logs
showed the real sidecar spawn, virtual display readiness, playback preparation,
origin scan, `ffmpeg x11grab started`, positive progress, and processing after
95 percent. The task finally scheduled retry with `ENOENT` from stat of the
expected browser-capture output. A second run using the short output alias
reproduced the failure, ruling out the long output path as its cause.

A separate raw recorder reproduction (`recorder-probe-qzsou0jq/receipt.json`)
started a real host Xvfb display and ran the packaged ffmpeg with the production
recorder argument sequence. ffmpeg exited 234 before creating a file:

```text
Option thread_queue_size (set the maximum number of queued packets per stream on the muxer) cannot be applied to input url :90.0+0,81 -- you are trying to apply an input option to an output file or vice versa.
Error opening input files: Invalid argument
```

The baseline bundled ffmpeg is `N-127989-gc6f044e604-20261023`. Its device list
includes x11grab. This is not missing X11 support or an assumed inability to reach
fallback. The actual recorder stderr is piped but unread by production code;
the diagnosis above is a separate command reproduction, not a claim that public
logs expose it. No application behavior was repaired.

The candidate therefore establishes primary DRM handling, actual fallback
selection, real browser playback and capture progress, **not recording success**.
There is no MP4 to probe, decode or measure. No structural recording bounds can
honestly be frozen from these runs. The phase-6b recording-success gate remains
incomplete under design section 10/12.5 even if the failure goldens pass.

Synthetic profile observations through renderer IPC:

- Lists/get return thirteen nonempty inventories; six chat/gallery and five
  purchased routes retain distinct identities. `mapping` recovers to `partial`.
- Unknown inventory/item fields disappear; `downloaded` defaults to false.
  Malformed JSON entries are omitted from lists.
- Invalid site URLs and locked/DRM selections retain their exact errors.
- Mapping the synthetic OnlyFans creator on a dedicated headed Chromium context
  without cookies returns `auth-required` and retains all three saved items.
  No navigation to OnlyFans is needed: the cookie check stops first.
- Automation admission of old OnlyFans/Fansly URLs without mapped options produces
  dedicated-session `auth-required` failures with no yt-dlp output and no media
  output. This is narrower than successful original-media downloading.
- Pause/cancel wait for a browser media-body request after the admission cursor
  and positive capture progress. They pin queue lifecycle/history and retained
  error/output fields; they do not establish recording-file finalization.
- A stationary no-video HTML page fails in the primary generic extractor before
  fallback. It does not exercise the capture player's startup timeout.

## Harness corrections and failed development runs

The earliest profile probes incorrectly addressed `window.api.download`; the
preload spreads a proxy with no enumerable service keys. Those provisional
answers were discarded. Final probes use the renderer's actual public invoke
channel, matching `electron-ipc-decorator/client`.

Opening a dedicated profile context also exposed a referenced TCP socket after
all worker cleanup completed under Node 22.23.4. `recording/suite-Lrwql3`
lingered; `debug/suite-iK8yQo` was bounded by a 240-second outer timeout (exit
124), despite recording 26 observations. The debug receipt showed a remaining
`TCPSocketWrap` after the case cleanup. As the existing CDP screenshot entrypoint
does, the worker now explicitly exits only after all case cleanup, comparison,
evidence writes and stdout flushing complete. It preserves comparison exit codes.

The first completed comparison (`compare/suite-O9cjU6`) passed 26 new worker
answers but failed the OnlyFans restart answer: it still expected `partial`,
while the added map correctly persisted `auth-required`, zero pages and category
`media`. This was an unfinished pre-port fixture recording, not a production
regression; the final baseline recording includes the persisted map result.

The first pre-acceptance repetition passed (`suite-ePrP11`, 96.817s). The next
(`suite-hJopJi`, exit 1) exposed Chromium's Unix socket path limit after moving
temporary files under the deeply nested scratch run. It failed before playback
and the pause condition correctly timed out. Final launches set TMPDIR to a short
`/tmp/vgb.*/root` symlink whose target is the run's physical `tmp` directory.
Only the alias lives outside the run; app temporary files remain in it. The
launcher removes the alias after owned-process cleanup. This exact alias root is
registered with the existing known-path normalization. No path pattern is widened.

A provisional log-marker condition was rejected after raw-task inspection:
public task logs become available only after attempt completion. It caused
controls to be applied to already-failed attempts. Final pause/cancel require
status `running`, positive capture progress and a new browser media-body GET
after the admission cursor. They do not wait on task log text. The final
control-case reachability projection records those two live conditions; final
error characterization separately retains playback/recorder markers from its
completed task log. Provisional late-control recordings are not acceptance runs.

## Build and host identity

The packaged `resources/app.asar` SHA-256 is
`c7e7945ebcea629965cfd67c5fef5894618fda008a11a63680eb0c83c69d8490`.
The bundled ffmpeg SHA-256 is
`b183a73f20346e2c208d8628a4409903a90b43a27e1a7b4b2592a830d6d2b567`.
The full identity receipt, including ffprobe and host binaries, is
`baseline-identity.json` in scratch. The worktree starts at `9dab889b`; that
revision alone does not prove a bundle's provenance, so the archive hash is the
comparison identity.

Host inventory: harness Node 22.23.4; Xvfb from `xorg-server-xvfb 21.1.26-1.1`;
`xdpyinfo 1.4.0`; Chromium 157.0.8103.79; Brave 157.1.99.57; Google Chrome
158.0.8127.36; pactl/libpulse 17.0-134-g77d25. The default capture resolver chooses
Brave on this host, whereas the dedicated-profile preference chooses Chrome.
Recording job receipts retain the actual browser executable and its version,
not just the inventory of available browsers. The isolated runtime has no Pulse
server; `pactl info`'s result is retained per run. This does not prove capture
with working Pulse audio.

The dedicated profile display is 1280×800×24. Capture uses the unchanged
3840×3840×24 virtual screen; the landscape page was observed as a 960×540 element
at origin (0,81). These are browser-placement observations, not an encoded-stream
measurement. Per-run configuration receipts retain generated fixture hashes,
sizes and complete ffprobe output.

Final recording: `frozen-record/suite-KQOCb5`, 58.3 seconds, 26 observation
and two restart documents. Its raw receipts show pause/cancel applied while
`running` at capture progress 0.02509775 and 0.0247602083 respectively. The
harness is frozen for acceptance after this recording and JSON formatting.
The isolated selector pins settings independently, avoiding unrelated loopback
download work during its twenty repetitions; complete runs retain all original
cases and the added observations.

## Scenario coverage and explicit gaps

| Design table group | Golden coverage | Remaining absence and reason |
| --- | --- | --- |
| Saved profiles | Nonempty list/get, all thirteen identities, recovery, stripping/defaults, malformed-entry omission, invalid URL, selection rejection, physical-profile restart | No authenticated browser-session or live-site success proof; fixtures are synthetic |
| Dedicated-session failure | Actual headed Chrome cookie preflight returns OnlyFans `auth-required`, saved inventory retained and reopened | Missing-browser configuration is not independently recorded; this host has browsers |
| Routed legacy tasks | OnlyFans and Fansly automation admissions without mapped options, lifecycle, exact auth-required error, null output and history | No successful signed-original transfer or authenticated mapping |
| Real playback capture | Actual DRM candidate reaches Brave playback, positive capture progress, processing and final missing-file failure | No successful recording task/history/media golden; bundled ffmpeg rejects production arguments before output creation. No size/duration bounds, decode proof, encoded portrait/landscape or audio result |
| Capture lifecycle | Public pause/cancel during running positive playback, exact queue/history/output/error; stationary no-video primary rejection | No capture-player no-video/start-timeout golden because ordinary no-video admission stops in the primary; no separate missing-Xvfb/browser/Pulse configuration golden; no recorded file finalization |
| Fallback selection | Actual primary DRM manifest, fallback sidecar, clear-loopback browser playback and final recorder failure | No fallback-to-success or licensed encrypted playback proof |

The separate packaged-executor integration required by the package-port design
is not implemented by these public-surface goldens. It must still be supplied by
the package port lane. The reproducible baseline recorder failure means that
integration cannot establish successful media with this exact bundled ffmpeg and
argument sequence. This lane does not substitute a sidecar-only launch or a fake
executor for that gate. The baseline acceptance branch is **reachable public
fallback with failed recording**, not the design's “public route unreachable”
branch. Phase closure remains blocked on the explicitly missing recording proof.

## Audio-fixture determinism failure and stabilization attempt

The first frozen audio/video fixture passed eighteen consecutive isolated runs,
then failed run 19 (`suite-TDX9tG`, 123.417s). The pause task's first attempt
reached public SSE log `Waiting for in-browser playback` but emitted no further
output for 60 seconds. The queue watchdog classified it `stalled`, scheduled
retry, and attempt 2 reached positive progress and paused. The comparator
correctly rejected the changed attempt, retained watchdog error and lifecycle.
No timestamp, error or lifecycle value was normalized to accept it. Full raw
requests, events and job/configuration files remain under that run; the stopped
sequence's receipts are archived in `audio-attempt/` in scratch.

The exact browser playback stall cause is unproven. The isolated environment has
no Pulse server, so the next fixture revision uses the design's existing
video-only media for clear browser playback. The static extractor-facing DRM
manifest is unchanged. This is a fixture/environment stabilization attempt, not
a production fix or a claim to have diagnosed the browser. Audio/video failure
observations remain evidence; video-only passes cannot establish audio capture.
The twenty-run acceptance sequence is restarted for this revision.

## Separately pinned unavailable configuration

`browser-capture-unavailable.mjs` is a companion characterization entrypoint. It
launches the same baseline offline on a fresh copy of the primary harness's
synthetic seed and sources `browser-capture-unavailable.sh`, setting the existing
`VIDBEE_BROWSER_CAPTURE=0` switch. It admits the same real DRM manifest through
automation, subscribes to SSE first, and pins the unchanged primary error,
lifecycle/history and absence of a clear-media browser request or recorder.
It adds one configuration-specific document, separate from the normal 28 and
407-document full invocation. It is repeated twenty times independently.
This proves the explicit availability-disable guard; it does not pretend host
binaries were uninstalled or prove each missing-binary branch.

## Accepted isolated sequences

The video-only fixture completed twenty consecutive isolated runs with 28
comparisons each (560 comparisons, zero failures and no browser prerequisite
skips). The unavailable configuration independently completed twenty consecutive
runs with one comparison each (20 comparisons, zero failures). The audio/video
playback variant is excluded from the stable gate because of its recorded
watchdog failure; its raw characterization remains available. No application
value was normalized to hide that failure. The 28 normal golden documents
required no expected-task-result change when clear playback switched to the
video-only input.

| Scenario | Runs | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Video-only public cases | 20 | 57.656s | 59.376s | 69.242s |
| Unavailable configuration | 20 | 2.978s | 3.237s | 6.683s |

Exact timestamps, exit codes, stdout logs and suite identities are in scratch
`acceptance.json`, `unavailable-acceptance.json`, `acceptance-audit.json` and
`unavailable-audit.json`. All accepted launches use the short run-owned TMPDIR
alias. Fixture hashes remain identical and actual capture jobs identify Brave
157.1.99.57 throughout the audited sequence.

## Final acceptance receipts

All five complete invocations passed 407 comparisons apiece: the unchanged 379
existing cases plus 28 normal browser-capture additions. The separate unavailable
configuration adds one more document, making 29 new files and 408 files in the
golden directory. The accepted sequences total **2,615 comparisons** (560 isolated
normal, 20 unavailable and 2,035 full-suite), with zero failures and no browser
prerequisite skips. Only the existing local-ASR skip remains. No case name or
expected application field was widened to accept the earlier audio-fixture flake.

| Scenario | Run | Evidence | Seconds | Exit |
| --- | ---: | --- | ---: | ---: |
| new | 1 | `suite-N2WITw` | 61.258 | 0 |
| new | 2 | `suite-clIqVb` | 60.198 | 0 |
| new | 3 | `suite-VNvXTu` | 59.684 | 0 |
| new | 4 | `suite-JrrXOn` | 59.813 | 0 |
| new | 5 | `suite-SX4Ruc` | 58.403 | 0 |
| new | 6 | `suite-GD7dXX` | 58.405 | 0 |
| new | 7 | `suite-d7W3Yr` | 58.972 | 0 |
| new | 8 | `suite-hpeYhZ` | 58.423 | 0 |
| new | 9 | `suite-ZNfXnU` | 61.998 | 0 |
| new | 10 | `suite-PoPViy` | 61.021 | 0 |
| new | 11 | `suite-NI89PG` | 60.352 | 0 |
| new | 12 | `suite-8Sjm1J` | 69.242 | 0 |
| new | 13 | `suite-7Bk9gh` | 59.303 | 0 |
| new | 14 | `suite-OMsyk8` | 57.920 | 0 |
| new | 15 | `suite-v7pWNM` | 58.343 | 0 |
| new | 16 | `suite-9ifHiz` | 57.656 | 0 |
| new | 17 | `suite-6W0GJL` | 58.156 | 0 |
| new | 18 | `suite-srGuJX` | 60.180 | 0 |
| new | 19 | `suite-TGo5F5` | 59.153 | 0 |
| new | 20 | `suite-zKzvSH` | 59.448 | 0 |
| full | 1 | `suite-vbjYuR` | 116.105 | 0 |
| full | 2 | `suite-0Q2EQr` | 113.171 | 0 |
| full | 3 | `suite-65fCJd` | 110.330 | 0 |
| full | 4 | `suite-O1sdxZ` | 123.829 | 0 |
| full | 5 | `suite-nMlOhD` | 118.640 | 0 |

| Scenario | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: |
| new | 57.656s | 59.376s | 69.242s |
| full | 110.330s | 116.105s | 123.829s |

These are complete-command elapsed measurements, including bootstrap, fixture
generation, launch, comparisons, same-profile restart and cleanup. They are not
a benchmark isolated from concurrent work on the host. Earlier failed or
provisional sequences are documented above and are not counted as acceptance.

## DNS audit

Every accepted namespace DNS log was inspected, including bootstrap, run and
restart, and all twenty unavailable-configuration logs. The per-run hostname
lists and physical-profile checks are retained in `acceptance-audit.json` and
`unavailable-audit.json`; development logs are indexed in `dns-all-runs.json`.
The launch namespace has only loopback networking; these names are attempted
resolutions, not evidence of successful external access.

| Observation set | Every hostname in its union |
| --- | --- |
| Initial existing loopback suite | `example.invalid`, `favicon.im`, `gh-proxy.com`, `ghfast.top`, `github.com`, `redirector.gvt1.com`, `selftest.dns-logger.invalid`, `www.modelscope.cn` |
| Final isolated browser cases | `dict.brave.com`, `example.invalid`, `fansly.com`, `favicon.im`, `gh-proxy.com`, `ghfast.top`, `github.com`, `onlyfans.com`, `redirector.gvt1.com`, `selftest.dns-logger.invalid`, `usage-ping.brave.com`, `www.gstatic.com`, `www.modelscope.cn` |
| Final full suite | `api.vidbee.org`, `dict.brave.com`, `example.invalid`, `fansly.com`, `favicon.im`, `gh-proxy.com`, `ghfast.top`, `github.com`, `onlyfans.com`, `redirector.gvt1.com`, `selftest.dns-logger.invalid`, `usage-ping.brave.com`, `www.gstatic.com`, `www.modelscope.cn` |

Compared with the initial existing loopback run, the final isolated browser
sequence adds `dict.brave.com`, `fansly.com`, `onlyfans.com`,
`usage-ping.brave.com` and `www.gstatic.com`. The full suite additionally attempts
`api.vidbee.org`; that distinction is retained in the audit rather than silently
calling every full-suite hostname a new browser request. Development observations
also include `update.googleapis.com`. No names are removed from the raw DNS logs.

## Final repository gates and integrity

| Command | Exit | Seconds |
| --- | ---: | ---: |
| `bun run check` | 0 | 3.949 |
| `bun run test` | 0 | 80.602 |
| `bun run deps:check` | 0 | 0.075 |
| `bun run port:check` | 0 | 0.051 |

The focused `bunx --bun vitest run apps/desktop/scripts/port/golden/browser-capture.test.mjs`
also passes all three tests. `bash -n` passes both launcher helpers; the comparison
negative control rejects a changed final status and a missing error. Root
`port:check` reports twelve ported configurations and zero violations.
Development check failures were formatting/import-layout findings in the newly
written harness and JSON; they were corrected without suppressions, and only
edited/new files were formatted.

The final audit rehashes the packaged archive, ffmpeg/ffprobe and the recorded host
binaries against `baseline-identity.json`. All identities match. The required
source-boundary diff and the diff of every existing tracked golden are empty.
No CLI rebuild was needed, and its bundle was not modified. No commit, staging,
push, PR, owner application operation or live-profile access was performed.
Hosted CI and a ported build have not been tested by this lane.

## For OWNER-REVIEW

- The baseline reaches public DRM fallback and playback, but bundled ffmpeg rejects
  the recorder arguments before output creation. This must not be called an
  unreachable public route or a passing recording-success gate.
- No recording MP4, valid decode or measured structural size/duration contract
  exists. Successful capture, audio, encoded portrait/landscape placement and
  finalization remain unproved; no tolerance was invented.
- The audio/video fixture hit a real playback/watchdog failure after eighteen
  passes. Its cause is unproven. The stable gate uses video-only media and does
  not establish audio playback/capture with or without working Pulse.
- Separate packaged-executor integration remains with the package-port lane. No
  sidecar-only or fake-executor substitute was used here.
- Availability-disable is covered, but actual absent-browser/Xvfb and capture-player
  no-video/start-timeout branches lack goldens. The ordinary no-video route stops
  at the primary extractor. Authenticated/live-site and licensed DRM behavior
  remain outside the synthetic offline proof.

`HANDOFF.md` in the lane scratch directory repeats these gaps and the exact gates.
