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
subdirectory expected by the app. A successful local-ASR golden is not implemented
yet; supplying models does not establish transcription success. The suite reports
a local-ASR skip when models are absent.

## Normalization rules

`normalize.mjs` names the allowed variable fields in code and retains object
fields, array order, stable fixture values and error text. It applies these rules:

| Rule | Transformation |
| --- | --- |
| MCP JSON text content | Parse only `result.content[].text` object/array JSON strings, retaining a `$jsonText` wrapper so a string becoming an object still fails. Other application strings retain their type. |
| Known path roots | Replace the specific run, scratch-work, build and repository roots with `<run>`, `<work>`, `<build>` and `<repo>`. Any remaining `/home/` path causes a failure. |
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
