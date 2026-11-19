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
