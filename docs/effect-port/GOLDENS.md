# Desktop behavior goldens

The Effect port uses the packaged desktop app as its public behavior boundary.
The harness talks to MCP, the automation and extension HTTP API, and the renderer.
It uses Node built-ins and does not import application services. The committed
answers describe the pre-port app, including observed errors and existing bugs.

## Run the gate

From the repository root, with dependencies installed and a Linux packaged build:

```sh
bun run --cwd apps/cli build
bun run test:golden
bun run test:golden --build apps/desktop/dist/linux-unpacked
bun run test:golden apps/desktop/dist/linux-unpacked --scratch "$HOME/.cache/vidbee-goldens"
```

The default build is `apps/desktop/dist/linux-unpacked`. An existing unpacked
baseline can be supplied read-only. Node must support `node:sqlite`; the host also
needs Linux user and network namespaces, `unshare`, `nsenter`, Python, and the
display facilities used by the offline launcher. Namespace setup failures are
failures of the gate, not permission to launch the app online.

Each invocation creates a fresh `suite-*` evidence directory. It first launches
the app to bootstrap its real database schema, stops that instance, populates a
synthetic fixture, and relaunches the fixture. Readiness requires descriptor files
and an initialized MCP request. All launches use an isolated HOME, XDG directories,
user-data directory, MCP configuration and automation descriptor. Networking is
loopback-only inside a new network namespace. Cleanup targets the instance owned
by that launcher; an already running desktop app must remain untouched.

The default scratch parent is `$RUNNER_TEMP/vidbee-goldens` in CI and
`~/.cache/vidbee-goldens` locally. Override it with `--scratch` or
`VIDBEE_GOLDEN_SCRATCH`. Run evidence includes logs, DNS requests, profile state,
renderer screenshots, normalized actual answers in `run/actual/`, and a
`result.json` after a successful comparison. Keep evidence in scratch rather than
committing raw profiles or logs, which can contain host-specific paths and tokens.

```sh
bun run test:golden --subset transcript
```

`--subset` selects recorded case names containing the supplied substring. Cases
still execute in their defined order so mutations and later reads see the same
state; this option filters comparisons rather than creating an independent
scenario. A subset with no matching cases fails.

Measured full-suite runtime and five-run stability evidence belong in
[the phase 1b report](reports/1b.md). Local full runs on the pre-port baseline took about 23–35 seconds, including
schema bootstrap and renderer visits. Use the report for the final five-run
measurement and allow more time on a slower CI runner.

## Fixture and coverage

`apps/desktop/scripts/port/golden/build-fixture.mjs` is the fixture source of truth.
It seeds fixed IDs and timestamps into the app-created SQLite schema and creates
lazy transcript, prompt-run and agent-chat tables from the app's literal DDL.
No real user profile is used. Files and persisted references are relocated to the
final run directory before launch.

The fixture includes completed video and audio tasks, all task states, subscription
items, a transcript with segments and speakers, a saved prompt result, an AI
conversation, settings, and small synthetic media, thumbnail and subtitle files.
App startup may recover active tasks and dispatch queued tasks; the observed
public answers after startup are the golden boundary.

`cases.mjs` lists the covered MCP reads, automation operations, extension routes
and explicit coverage gaps. Read variations include filters, pagination, unknown
IDs and invalid inputs. Selected offline mutations are followed by reads of their
effect. `tools/list` records the tool names, descriptions and input schemas: these
are part of the port's compatibility contract. Renderer smoke visits application
routes and rejects renderer console errors. The boot check requires the expected
database, ffmpeg, HTTP API, automation descriptor and MCP initialization lines.

Network-dependent success paths such as remote downloads, feed refresh, AI
generation and model downloads have error or validation coverage only. Extension
success flows requiring remote captions or AI services remain outside the offline
success proof. See the report and the `COVERAGE_GAPS` export for the exact limits.

`--models <directory>` copies the supplied model directory into the fixture's
`models/` directory. Its input should therefore contain the `transcription/`
subdirectory expected by the app. Real-ASR scenarios require the CPU-only build prerequisite below and compare
the recorded transcript, lifecycle and restart documents with supplied models. The suite reports
a local-ASR skip when models are absent.

## Normalization rules

`normalize.mjs` names the allowed variable fields in code and retains object
fields, array order, stable fixture values and error text. It applies these rules:

| Rule | Transformation |
| --- | --- |
| MCP JSON text content | Parse only `result.content[].text` object/array JSON strings, retaining a `$jsonText` wrapper so a string becoming an object still fails. Other application strings retain their type. |
| Known path roots | Replace the specific run, scratch-work, build and repository roots with `<run>`, `<work>`, `<build>` and `<repo>`. Any remaining `/home/` path causes a failure. |
| Bundled ffmpeg build | In `ffmpegVersion`, replace the build id after `ffmpeg version` with `<ffmpeg-build>`: the binary is downloaded at setup time. |
| Host hardware | In an object that has both `machine` (with `cpuCount`) and `recommended`, replace the `machine` fields with `<machine>` and `recommended` with `<machine-dependent>`: ASR tier recommendations depend on the host's CPU and memory. |
| Generated IDs | Replace ULIDs, UUIDs and 64-character generated `id` fields with `<id:1>`, `<id:2>`, and so on, assigned by first appearance within each recorded document. Fixed fixture IDs remain literal. |
| Tokens | Replace 64-character hexadecimal values only in `token`, `session` and `tokenHash` fields, and bearer-credential strings, with `<token>`. Media hashes remain literal. |
| Loopback ports | Replace numeric ports in `http://127.0.0.1:` URLs with `<port>`; numeric `port` fields become `<port>`. |
| Process identity | Replace numeric `pid` and `pidStartedAt` fields with typed placeholders. |
| Runtime timestamps | Replace the explicitly listed numeric lifecycle timestamp fields newer than the fixture era with `<timestamp>`, and explicitly listed ISO timestamp fields newer than the fixture era with `<timestamp>`. Fixed fixture timestamps remain literal. |
| Runtime latency | Replace numeric `elapsedMs` and `latencyMs` with `<duration>`. Media `durationMs` remains literal. |

Do not remove a field or broaden a rule simply to make a mismatch pass. A stable
value changing is a regression or an intended contract change requiring review.
In particular, filenames, task states, ordering, descriptions, schema details,
error messages and media durations are meaningful contract data.

The boot and final log checks recognize two exact expected offline signatures:
`Using fallback thinking options: TypeError: fetch failed` and
`Failed to cache thumbnail: TypeError: fetch failed`. The first is the AI catalog
fallback. The second comes from platform and About-page favicon URLs; source
inspection and the DNS log connect these requests to `example.invalid` and
`favicon.im`, independently of the valid local fixture covers. Only lines
containing these exact signatures are excluded from the unexpected-error list. Changes
to this exception need evidence explaining why the error is an expected offline
condition; unrelated boot errors must fail the gate.

## Add or intentionally update a golden

Before changing an uncovered tool or endpoint during a later port phase, add its
case in `cases.mjs` and record it against the build from before that phase's
behavior change. Extend the synthetic fixture when the read would otherwise
return only an empty list. Include representative successful answers, changed
argument shapes, and meaningful invalid or unknown-ID answers. Preserve existing
mutation ordering or make the required setup explicit.

```sh
bun run test:golden --build /path/to/pre-change/linux-unpacked --update
bun run test:golden --build /path/to/pre-change/linux-unpacked
```

`--update` writes normalized answers into `apps/desktop/test/golden/`. Run
`bun run --cwd apps/desktop fix` afterward to apply the repository
JSON layout (comparison parses JSON, so formatting does not affect answers). It is an
explicit recording operation, not a fix for an unexplained comparison failure.
For an intentional behavior change, record against the intended build, inspect
every golden diff, and include the changed contract and justification in the PR.
Keep the fixture and cases in that PR so another checkout can reproduce the
answers. When updating a subset, review only the matching rewritten documents
and run the complete comparison afterward.

A mismatch prints the case name and field paths such as
`$.result.content.0.status`, with expected and actual values. Inspect the retained
normalized actual document alongside the committed golden. Before declaring a
phase complete, run the complete suite repeatedly on the same packaged build;
record the five consecutive passing runs and deliberate regression evidence in
the report. Fix timing or ordering causes instead of normalizing them away.

## CI

The Linux packaged-build job runs the suite after native-package verification.
Ubuntu 24.04 restricts unprivileged user namespaces through AppArmor, so a separate
step sets `kernel.apparmor_restrict_unprivileged_userns=0` on the ephemeral runner
before starting the loopback-only namespace. The following comparison step uses
the just-built default `linux-unpacked` directory and scratch under `RUNNER_TEMP`.
This workflow integration requires confirmation on GitHub Actions; local runs do
not prove the hosted runner's namespace and display behavior.

## Offline loopback download cases

The worker starts `loopback.mjs` inside the same offline network namespace as the
app and bundled yt-dlp. It listens on an ephemeral `127.0.0.1` port and stops in a
`finally` block. No external service, dependency, DNS entry or CI configuration is
needed. `build-fixture.mjs` generates a two-second H.264/AAC video and a two-second
PCM waveform with the baseline's bundled ffmpeg; the image is the existing
synthetic fixture PNG. No real media is used.

The server sets fixed Last-Modified, Content-Type, Content-Length and Accept-Ranges
headers on file responses. It handles HEAD, bounded/open/suffix byte ranges and
416 responses. Routes beginning `/slow` trickle bytes; `/stall` flushes headers
and sends no body; `/404` and `/500` fail; `/recover` changes from 404 to successful
media only when the case explicitly switches it. Other routes serve video,
except `.wav` and `.png`, which serve the corresponding fixtures. Every request's
method, path and Range header is retained, in arrival order, in
`run/loopback/requests.jsonl`.

```sh
bun run test:golden --build /path/to/baseline/linux-unpacked --loopback-only --subset loopback
bunx --bun vitest run apps/desktop/scripts/port/golden/loopback.test.mjs
```

`--loopback-only` is an independent scenario selector: it skips the original
renderer, CLI and API cases, pins its own settings through `update_settings`, and
waits for seeded active fixture tasks to settle before measuring queue changes.
`--subset` still filters recorded comparisons within the selected scenario. A
normal full invocation executes all original cases first, then loopback cases,
then restarts the app with the same physical synthetic profile and checks persisted
loopback tasks/history. The restart uses another fresh isolated launch directory; its `userdata` symlink
points to the original run's physical profile. The optional reuse argument is
restricted to that same suite's original `run/userdata`. HOME, descriptors and
networking remain isolated; completed media remain in the original run directory.

Each run uses a short temporary `.golden-loopback-suite-*` symlink under the
checkout, pointing at that run's physical `downloads/` directory. It avoids the
baseline's absolute output-path truncation on long scratch paths. The exact alias
root normalizes to `<run>/downloads`, preserving every filename and subdirectory;
the alias is removed in `finally`, including comparison failures. The restart
recreates that same alias only for its observation. Generated downloads remain
physically inside the run directory. See [the loopback report](reports/4-loopback.md)
for the baseline bug and the first probe's evidence.

To add a download case, extend `loopback-cases.mjs`, admit it through a public
MCP/HTTP tool, and poll `get_task` for the required state. Subscribe to the
public automation SSE route before admission: transition events retain fast
states that polling could miss. Cancellation and pause require both a logged
media-body request and positive task progress, never a fixed sleep. Keep a
bounded timeout that fails when the condition is not reached. New failure routes
must have a matching narrow expected metadata-error signature; unrelated
application errors still fail. Record with `--update --loopback-only --subset
loopback` against the pre-change packaged build, inspect the new documents and
repeat both isolated and full comparisons.

Loopback snapshots explicitly project away the task's `progress` values and
`log` string because both contain timing-dependent progress, speed and ETA text.
They retain `progressFields` (the ordered keys), every other task field, complete
output/error objects, SSE status order, history, and pinned ffprobe stream and
container fields. Full wire answers and all events remain in `loopback/raw.json`
and `loopback/events.json`. Partial-file cases pin names, since partial byte
counts depend on the instant cancellation lands. Queue comparisons pin changes
from the settled pre-scenario state immediately after video, remux, audio and
image completion and again at scenario end, plus capacity/active counts and the
loopback group's count, so earlier independent cases cannot contaminate them.

The additional named normalization rules are: loopback `groupKey` ports become
`127.0.0.1:<port>`; runtime numeric `nextRetryAt` and subtitle acquisition
`acquiredAt` become `<timestamp>`. The deliberate fixture retry time
`4102444800000` remains literal. These rules retain the existence/nullability of
retry scheduling and all attempt, error and status data; they do not normalize
retry delays, lifecycle sequences, filenames, file sizes or media durations.
The short alias is an exact known-path-root replacement, not a path pattern.

The download suite deliberately omits the stalled-download watchdog case: its
running threshold is 60 seconds and no public preference lowers it. A server
contract test still proves the stall route and connection cleanup. Remote-media
extractors, authenticated sites, live ASR and hosted CI remain outside this proof.

## Offline subscription cases (phase 6a)

`subscriptions-core-fixture.mjs` generates fixed RSS 2.0, Atom and HTML discovery
inputs; `subscriptions-core-loopback.mjs` handles their explicit routes before
`loopback.mjs`'s media fallback. It replaces only the fixture origin with the
namespace-local numeric address. Publication dates, GUIDs, titles, cover and item
links are fixed. Revision B keeps the retained identity, drops the older identity
and adds a newer one. Discovery includes relative, duplicate, invalid,
credential-bearing and more-than-three candidates. Candidate failures and
malformed XML remain real parser failures. No external service is involved.

```sh
bun run test:golden --build /path/to/baseline/linux-unpacked --subscriptions-only --subset loopback-subscriptions
bunx --bun vitest run apps/desktop/scripts/port/golden/subscriptions-core.test.mjs
```

`--subscriptions-only` skips the original and download scenarios, while retaining
bootstrap and same-physical-profile restart. A normal full invocation appends the
subscription scenario after the download scenario. Package-specific helpers and
18 new documents live under `subscriptions-core-*` and
`loopback-subscriptions--*`; existing documents remain unchanged.

To add one of these cases, use public MCP tools or automation HTTP routes. Create
disabled subscriptions so creation probing and periodic scheduling cannot consume
the intended first refresh. Every explicit refresh takes a request-log cursor
immediately before its public call, awaits a completed XML response after that
cursor, awaits the public result, then checks successful persisted processing.
Later refreshes must advance last-success time. The same subscription is used
for revision and no-duplicate scenarios. A monotonic 30.5-second deadline starts
at completion of each initial public refresh, so the real 30-second scheduler
dedupe interval has elapsed; the waits overlap across subscriptions. Do not replace
this with an empty subscription or restart. Task polling has bounded deadlines;
SSE subscriptions start before admission.

Goldens retain full item arrays/order, configuration, statuses, parser errors,
queue links, automation task input/options/priority/group, task lifecycle,
history, physical output filenames and file sizes. As with download cases,
progress values and log strings are retained only in raw evidence; their ordered
field names remain pinned. `normalizeSubscriptionClocks` replaces only numeric
`lastCheckedAt` and `lastSuccessAt` fields with `<timestamp>`. It preserves null
and missing fields, feed publication dates and latest-publication metadata. All
other normalization uses the existing named rules. Request sequence cursors are
asserted but omitted from the document projection; matching method/path/revision,
HTTP status and completed-response evidence remain pinned.

The renderer smoke sets an explicit 1280×900 CDP viewport and waits for a
successful item title, selecting a visible subscription button if needed;
it rejects renderer exceptions and console errors and keeps a screenshot in
scratch. Output uses an exact short alias into the run's physical
`subscription-downloads/`; it is removed in `finally`. After the app stops,
`subscriptions-core-restart-fixture.mjs` changes exactly one synthetic item's link
to a fixed nonexistent task ID and recreates the output alias as a symlink for
startup. The runner removes it after the restarted app stops. Startup must clear
that orphan while retaining
the other valid link. Reopen also checks the database device/inode matches the
original physical profile. No explicit refresh or server restart substitutes for
startup reconciliation.

Raw requests/responses, events, XML request log, renderer evidence and restart
setup remain under the run's `subscriptions-core/` directory. The report
[records baseline findings and acceptance evidence](reports/6a-goldens.md).

## Browser capture pre-port cases (phase 6b)

The package-specific files `browser-capture-fixture.mjs`,
`browser-capture-loopback.mjs`, `browser-capture-cdp.mjs` and
`browser-capture-cases.mjs` own these additions. Shared harness files contain
registration only. The optional sixth offline-launcher argument sources the
owned `browser-capture-display.sh` inside the offline namespace before app
startup, providing a throwaway Xvfb display for dedicated profile Chromium.
The original five-argument launch contract is unchanged.

The fixture builder writes thirteen synthetic saved inventories: one creator,
six chat/gallery routes, five purchased routes and one Fansly creator. It also
writes malformed JSON that list must omit. Saved `mapping` state must recover as
`partial`; unknown outer/item keys must disappear and omitted `downloaded`
defaults to false. Renderer observations invoke the existing
`window.electron.ipcRenderer.invoke('download.<method>', ...)` bridge, exactly
as `electron-ipc-decorator`'s renderer proxy does. No main-process service is
imported by a golden case.

Bundled ffmpeg generates 24-second landscape, portrait and video-only media.
The separate loopback server serves deterministic HTML, a DRM-marked DASH
manifest, and clear media with fixed MIME/length/Last-Modified, HEAD, ranges and
request logs. The candidate HTML declares the DRM manifest statically but
selects clear loopback playback through JavaScript. Automation add bypasses
metadata hydration so the actual primary extractor can reach DRM failure and
select the actual capture executor. All traffic remains inside the existing
offline namespace.

```sh
bun run test:golden --build /path/to/pre-port/linux-unpacked --loopback-only --subset browser-capture
bunx --bun vitest run apps/desktop/scripts/port/golden/browser-capture.test.mjs
```

The new cases execute after loopback downloads, with profile-list restart cases
after the existing same-physical-profile restart. `--subset` retains its original
comparison-filter meaning. Recording with `--update --subset browser-capture`
must never rewrite existing golden files. Cases require executable host
`/usr/bin/Xvfb`, `/usr/bin/chromium`, `/usr/bin/pactl` and `/usr/bin/xdpyinfo`;
when absent, both new observation phases print a clear SKIP. Local acceptance
requires these prerequisites and no skips. Binary/version receipts are retained
in `run/browser-capture/configuration.json`.

Pause and cancel subscribe to SSE before admission and require a new clear-media
GET after the request-log cursor plus positive public capture progress. Task
snapshots use the existing narrow loopback projection: only progress values and
log text are excluded; raw MCP/IPC/HTTP answers and all SSE events stay in
`browser-capture/raw.json` and `events.json`. A short per-run symlink to the
physical run downloads directory is an exact known-root normalization, removed
in cleanup. There are no new general normalization rules.

The baseline reaches fallback and playback but its bundled ffmpeg rejects the
recorder's input `-thread_queue_size` argument. It therefore produces no recording
file. The report distinguishes this observed failure from success; no fabricated
recording bounds or unchecked size/duration placeholders are accepted. A future
recording-success golden requires a separately reviewed baseline repair and
repeated pre-port measurements establishing the design's structural contract.
See [the phase report](reports/6b-goldens.md) for the precise proof gaps.

`--browser-capture-only --subset browser-capture` is an independent scenario:
it skips the original and download cases, pins the same relevant settings and
retains the normal same-physical-profile restart. Full runs still execute every
original case. Launches also give app processes a run-owned temporary directory
through a short `/tmp/vgb.*/root` alias, avoiding Chromium's Unix socket path
limit on deep scratch paths. The exact alias root normalizes to `<run>/tmp` and
is removed during launcher cleanup. The worker exits after awaited case cleanup,
evidence writes and stdout flushing, matching the existing CDP entrypoint's
process boundary; this avoids a referenced CDP/Undici TCP socket delaying exit.

The separately pinned unavailable-host configuration uses the existing
`VIDBEE_BROWSER_CAPTURE=0` switch. After a primary run has generated its synthetic
`seed/`, compare it with:

```sh
node apps/desktop/scripts/port/golden/browser-capture-unavailable.mjs --build /path/to/baseline/linux-unpacked --scratch /path/to/scratch --seed /path/to/owned-suite/seed
```

This companion runs inside a fresh offline namespace, writes its own request,
SSE and raw-answer evidence, and compares `browser-capture--unavailable.json`.
It does not import application services or mutate the baseline. It is a separate
host-configuration gate; the ordinary full invocation still has 407 documents.
The final clear playback fixture uses the generated video-only input; the report
retains the audio/video run's watchdog failure and its proof limits.

## Transcription baseline scenarios (phase 6c)

The transcription harness is isolated in `transcription-*.mjs` files. The pinned
external set is described by `transcription-models.json`, which records every
model-relative file and SHA-256. Before each supplied-model invocation,
`verifyTranscriptionModels` rejects added, missing, changed and non-regular files.
The verified manifest is retained in that invocation's evidence directory. Supply
the directory containing `transcription/`; weights are never downloaded by this
harness or committed. Speech is read from the external set's Whisper tiny
`test_wavs/0.wav`; the separately supplied sample has identical bytes. Its
redistribution rights were not established, so speech bytes stay external.

```sh
bun run test:golden --build /path/to/baseline/linux-unpacked --models /path/to/models
bun run test:golden --build /path/to/baseline/linux-unpacked --models /path/to/models --loopback-only --subset transcription
```

A complete invocation with `--models` first compares all original documents on
a profile without supplied models, then launches a separate supplied-model
scenario. This matters because the original model-status golden explicitly pins
models absent. Each child uses the same read-only build and disposable offline
launch mechanism. The combined evidence directory records both children and a
combined result. `--update` in this complete mode applies only to new transcription
documents; the original documents still compare. A direct isolated supplied-model
invocation uses `--loopback-only --subset transcription`.

Real-ASR acceptance requires a **build-level CPU-only runtime check**, once in
each supplied-model scenario before its first app launch or transcription case.
`transcription-cpu.mjs` reads
`resources/app.asar.unpacked/node_modules/sherpa-onnx-linux-x64` in the build under
test and requires exactly these six regular files: `index.js`, `libonnxruntime.so`,
`libsherpa-onnx-c-api.so`, `libsherpa-onnx-cxx-api.so`, `package.json`, and
`sherpa-onnx.node`. Any additional entry (including `libonnxruntime_providers_*`
or another library name), directory, symlink or missing entry fails with a clear
CPU-build prerequisite error. The receipt is `transcription-cpu-build.json`.
This pinned inventory contains no loadable accelerator execution-provider library.
The check is deliberately specific to this Linux x64 runtime; an upstream package
layout change needs an explicit inventory review.

Every `Available providers:` line in observed task logs must list only
`CPUExecutionProvider`; a non-CPU or malformed list fails. A task without that
line passes. The observed fallback diagnostic is
`Available providers: CPUExecutionProvider, . Fallback to cpu!`.
The nominal `compute.provider` label is not an execution assertion: the baseline's
fallback detector misses “Fallback”, and its benchmark can choose either `cpu`
or `cuda` while both run on CPU. That bug is preserved under A2. No probe override
or application change is made.

The orchestrator's first native-evidence rule required a diagnostic per task.
Part 3 replaces it because CPU-selected workers and paths that never initialize
a recognizer do not print the diagnostic. CPU execution is established by the
runtime build, with provider-list validation when a task prints one. Per-task
`cpuEvidence` is neither required nor included in compared documents. Missing
models still print the clear local-ASR skip; hosted omission is not local ASR proof.
See [the phase report](reports/6c-goldens.md) for recording/repeat results.

The named **transcription provider benchmark race** normalization applies only to
`transcription/` documents, before the existing normalization rules:

| Field | Exact transformation |
| --- | --- |
| `provider` string equal to `cpu`, `cuda`, `directml` or `coreml` | `<provider>` (the snapshot's app-reported execution-provider label) |
| `log` line beginning `compute.provider=` | Replace only its provider token with `<provider>` |
| `log` line beginning `compute.probe=` | Replace its provider token with `<provider>` and the named `durationMs=` token with `<probe-duration>` |
| `log` line beginning `compute.provider=`, with `reason=accelerator-faster` or `reason=cpu-faster-or-within-margin` | Replace that reason token with `<benchmark-choice>`; preserve candidate list and all other text |

No other reason, probe error, native diagnostic, transcript text, words, timing,
speaker, media duration, status, attempt, filename or error text is altered by
this additional rule. Existing generated-ID/path/runtime-timestamp rules still
apply. The task snapshot already projects away raw `progress` and `log` as in
part 1; raw wire answers retain both. Consequently current snapshots exercise
the top-level `provider` branch; log branches cover compared log documents if
added later. The existing two model-management documents have no matching fields
and remain byte-for-byte unchanged. No native diagnostic is normalized.

For independent model-management comparisons,
add `--transcription-contract-only`. This explicitly restricted selector pins
model readiness and the final already-installed minimal-tier ensure task. It
performs no ASR and does not establish CPU, transcript, cancellation or restart
parity. It can be combined with a complete invocation to retain the original
suite proof, or isolated with `--loopback-only --subset transcription`.

To add a real-ASR case, first characterize the pre-port packaged app through
public MCP/automation APIs and retain raw answers, events and request logs.
Subscribe to public events before admission, follow the exact admitted task ID,
and poll bounded conditions. Do not use an earlier completed child to satisfy a
new transcription wait. Require the build-level CPU check and validate any native
provider lists before writing or comparing worker answers. Keep text, words, speaker output, media
durations and lifecycle states meaningful. Only the named provider benchmark race
is normalized. An unstable transcript or lifecycle value is a finding and
disqualifies the case. Record only cases that can pass the required repeat gate;
retain unaccepted explorations in scratch.

`VIDBEE_TRANSCRIPTION_EXPLORE=1` is a diagnostic mode for public-surface
characterization: it does not write transcription goldens and still enforces the
CPU-build and native provider-list prerequisites. Normalized diagnostic snapshots
are written only to scratch `actual/`; no expected documents are written or compared. Results from that mode are never
ASR acceptance. Run the ordinary strict mode for any acceptance claim.

The accepted phase-6c baseline adds 19 real-ASR documents covering all seven
requested scenarios, for 21 transcription documents and 400 total with models.
Twenty isolated and five complete supplied-model comparisons passed; both
nominal labels occurred. No scenario was removed. See the report's part 3 for
exact counts, per-run receipts and the remaining narrower coverage gaps.

## Phase 8 extension and CLI pre-port cases

Before recording, the additional named normalization is
`extension-format-user-agent`: only
`response.body.formats[*].http_headers["User-Agent"]` in the new extension
metadata documents becomes `<user-agent>`. Vendored `random_user_agent` chooses
a random Chrome major version; downloader defaults and yt-dlp format processing
copy that header into format objects forwarded by Desktop. The fixture does not
pin a User-Agent. Sibling headers, format order and all other metadata remain
literal under the existing approved normalizations. A direct test verifies that
a non-User-Agent difference still fails comparison.

Phase 8 uses `--phase8-only` (both families), `--extension-api-only`, and
`--cli-additions-only`. Each is an independent scenario on an isolated packaged
app; full runs append both families after existing observations. Raw request,
response, process and SSE receipts remain under `run/phase8/`.

The accepted phase-8 set adds **38 documents** (35 CLI, three extension), bringing
the ordinary complete comparison to **463 documents**. Twenty independent
phase-8 comparisons and five complete comparisons passed. Four initially
recorded documents were disqualified for unstable values; their scenarios still
execute with full raw receipts but never record or compare an expected answer.
The excluded names are `extension-api/request-sequence`,
`extension-api/metadata-failure`, `cli-additions/probe-loopback` and
`cli-additions/descriptor-autostart`. See [the phase-8 report](reports/8-goldens.md)
and [both differing values](reports/8-goldens-exclusions.json). The second
admitted-origin token-binding scenario is unavailable on this packaged build;
the unadmitted-origin rejection is recorded. Existing ASR model prerequisites
and the separate Chromium extension-browser lane retain their own proof limits.

Process capture is bounded through child `close` and stdout/stderr closure,
records exit status and termination signal separately, and rejects spawn/stream
failures or held-pipe timeouts. CLI invocations receive scratch HOME/XDG,
automation and MCP configuration, explicit bundled media tools, and an owned fake
launcher for autostart. SQLite reopen uses the public local-client seam with an
explicit run-owned path, not an invented executable flag. Missing build, CLI,
bundled media-tool or optional seam-module prerequisites produce one clear skip.
Every suite's DNS audit checks readiness/self-test and the exact full-suite
hostname union documented in phase 6b; DNS A answers and all interfaces remain
loopback-only. Raw evidence is never committed.

## Real Chromium extension worker

The independent `--extension-browser-only` selector launches one disposable
Chromium at a time inside the fixture application's offline namespace. Supply a
pre-port output built from an untouched `git archive main` and a current Chrome
MV3 build:

```sh
bun run build:extension
VIDBEE_EXTENSION_BEFORE=/path/to/archive/apps/extension/.output/chrome-mv3 \
  bun run test:golden --extension-browser-only --build /path/to/linux-unpacked \
  --scratch /path/to/disk-backed/lane-scratch
```

`VIDBEE_EXTENSION_CHROMIUM` explicitly selects the executable; otherwise the
worker tries host Chromium candidates. It records the version actually launched,
manifest-derived identity, API invocation and separate unpacked-load/action-popup
results. It uses an owned Xvfb display when available, and headless Chromium
otherwise. Missing capabilities print exactly one of:

```text
SKIP extension browser proof: no available Chromium loads the unpacked extension
SKIP extension browser proof: available Chromium cannot open the extension action popup
```

A capability skip is missing integration proof. Missing extension build inputs
and failures after popup capability passes fail the selector. Both labels are
attempted and independently reported. There is no substitution of old bytes for
a missing new build. A failed selector still stops its fixture and audits DNS.

Receipts are under `run/extension-browser/{old,new}/`: capability, raw network
requests/responses, browser exceptions, per-step storage/DOM/accessibility,
screenshots and listener/timer diagnostics. The worker observes the popup's own
`tabs.query` result and requires the namespace-local fixture URL. It never clicks
Open Client or a Download control and checks isolated handler discovery before
launch. Scratch HOME/XDG and the short disposable temporary alias prevent real
profile use and Chromium Unix socket path overflow.

The final matrix completes 20 observations old/new in each of five consecutive
runs, with actual rendered 180p rows. Only keyboard focus and the instrumented
cleanup counters are stable; their two `extension-browser--*.json` documents
are admitted. Eighteen observations stay in receipts with both differing values
listed in [the exclusions](reports/8-extension-browser-exclusions.json). Cleanup
counters cover post-attachment registrations, not an absolute initial-listener
count or a heap/GC proof.

Strict old/new comparison still fails on `X-VidBee-Extension` versus
`x-vidbee-extension`. The admission helper accepts a complete digest-bound
classification of declared section 9 changes, reported defects and observed
instability; characterization admission does not waive that parity failure.
The initial new build also exposed an ignored `Extension.logging.ts` source
missing from HEAD; a reproducible clean checkout still needs that source.
See [the browser report](reports/8-extension-browser.md) for the complete proof
and the separate full-suite CLI failures.

The browser selector alone annotates its disposable HTML5 source with dimensions
and an `180p` label consumed by the vendored extractor. This enables an actual
format table without changing shared fixtures, existing API goldens or the
fixture's User-Agent configuration.

After collecting five complete consecutive suite directories, inspect strict
old/new parity and the stability receipt before admitting any new document:

```sh
node apps/desktop/scripts/port/golden/extension-browser-admit.mjs /scratch/suite-1 /scratch/suite-2 /scratch/suite-3 /scratch/suite-4 /scratch/suite-5
```

Adding `--update` writes only stable `extension-browser--*.json` documents. It
refuses partial runs and unresolved parity differences. A design-section-9
change still requires an explicit row and both recordings; the helper has no
blanket malformed-data waiver. Raw CDP transport IDs/timings stay in receipts.
The browser projection keeps wire headers, request order/body, response body,
storage, rendered body DOM, AX names/properties and screenshot hashes. It
normalizes stored `fetchedAt` and token query values. Encoded fixture ports remain
literal, matching the phase-8 request-sequence exclusion. These browser-specific
rules do not change any existing golden normalizer.
