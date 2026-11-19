# Phase 8 pre-port golden additions

## Progress

- [x] Read both reviewed designs and the existing harness.
- [x] Document the exact extension-format-user-agent rule before recording.
- [x] Add bounded close/pipe-aware process capture with direct tests.
- [x] Add independent phase-8 selectors and real loopback HTML/thumbnail fixtures.
- [x] Complete recording and inspect all observations.
- [x] Complete twenty comparisons of new cases and five full comparisons.
- [x] Verify all original golden bytes and repository gates.
- [x] Finish DNS receipts for every repeat.

## Cases

The extension family observes metadata success, consumed-token rejection, status/token/
encoded-metadata request sequence, deterministic metadata failure and rejection of an
untrusted second origin. The packaged guard admits only the published extension origin;
a second **admitted** origin is unavailable, so cross-admitted-origin token binding is
not proven. The fixture never changes the application's trusted origins.

CLI additions cover parser errors, command routing, probe execution, real loopback
metadata, desktop admissions/waits, public controls, local modes, descriptor discovery,
controlled autostart and cached/forced/error upgrade. The SQLite case uses the documented
local-client seam because the executable has no SQLite flag. It is seam proof, distinct
from the executable cases. There are 38 accepted documents: 35 CLI and three extension. Four unstable documents
were removed; their scenarios still execute and retain raw evidence.

## Normalization

`extension-format-user-agent` applies only to
`response.body.formats[*].http_headers["User-Agent"]` of `extension-api/` documents.
The direct test verifies sibling headers, format ordering, outer headers and detection
of another changed field. No fixture settings pin a User-Agent. CLI task snapshots use
the existing declared progress/log projection; raw stdout/stderr and task answers remain
in scratch. These are projected packaged goldens, not a byte oracle.

## Determinism

The first strict comparison removed three documents, and the next removed the metadata
failure document. [Both values and run identities](8-goldens-exclusions.json) are retained:

| Removed document | Observed difference |
| --- | --- |
| `extension-api/request-sequence` | Encoded media-origin port 37499 versus 41811; the existing port rule deliberately does not alter URL-encoded bytes. |
| `cli-additions/probe-loopback` | Chrome major 146 versus 150; epoch 1795086590 versus 1795086667; bare domain port 46517 versus 41811. The extension-only User-Agent rule does not apply here. |
| `cli-additions/descriptor-autostart` | `perGroup["127.0.0.1:46517"] = 7` versus `perGroup["127.0.0.1:41811"] = 7`; object keys remain literal. |
| `extension-api/metadata-failure` | Error details end through `Socket`/`Pipe` callbacks or `ChildProcess._handle.onexit`; the complete differing stacks are retained in the linked receipt. |

No favorable retry of an excluded document is accepted. The initially started twenty-run
loop stopped on the already identified stack variation. The accepted 38-document loop
and five complete runs have now passed; exact acceptance receipts are summarized below. Eight strict
38-document runs passed before concurrent commands received SIGTERM during run nine.
The sender is unproven. That interrupted sequence is retained but is not claimed as
twenty consecutive passes; both acceptance counters were restarted in `new20-uninterrupted`
and `full5-uninterrupted`. No document difference caused that restart.

## Surprises

The forwarded CLI download performs two media GETs (generic extraction and transfer),
whereas Desktop's hydrated download cases perform three. Its progress condition uses
the actual two-request boundary plus positive public progress. The new slow CLI route
uses 128-byte ticks; existing route rates are unchanged. No fixed delay selects pause
or cancellation.

## For OWNER-REVIEW candidates

- A second admitted extension origin is unavailable on the packaged baseline.
- Four documents are excluded, with both values linked above; no broadened normalization
  conceals them. Real metadata probes and failure details remain raw observations only.
- The first complete repeat compared 459 primary and four restart documents with zero
  differences, then the new DNS audit rejected three host-browser names. Its retained
  `browser-capture/configuration.json` shows `/usr/bin/brave`, version `157.1.99.57`.
  The query names omitted from the initial ASR-only audit list were `dict.brave.com`, `usage-ping.brave.com`, and
  `www.gstatic.com`. They appear during owned capture jobs. The audit now uses the complete fourteen-name full-suite union from the phase-6b report,
  which already includes these browser names and `fansly.com` / `onlyfans.com` from
  synthetic saved-inventory recovery. A second complete run also compared all 463
  documents successfully, then exposed those two omitted restart names. No new host
  destination was introduced by this lane. The logger returns loopback
  for A queries and no address for other types; only loopback is enabled in the namespace.
  The five-run acceptance counter was restarted after this audit correction.
- Parser failures stay compact even with `--vidbee-pretty`; `--help` enqueues a forwarded
  task, while `:help` errors. Detached admissions already report `running`. Paused waits
  stop with non-success. A removed history task subsequently reports `UNKNOWN_ERROR`/2.
- ASR models are not supplied in this lane. Existing 21 transcription files are byte-identical;
  this lane does not re-establish model-dependent ASR behavior or real Chromium extension
  popup proof. Hosted CI and external registry/extractor behavior remain outside this lane.

## Harness and gate details

The selectors are `--phase8-only`, `--extension-api-only` and
`--cli-additions-only`. They skip the original scenarios rather than merely
filtering comparisons. A normal complete run appends both new families after
the old primary observations, then retains the existing physical-profile restart.
`--subset` keeps its comparison-filter meaning.

| Accepted family | Documents | Observations |
| --- | ---: | --- |
| Extension HTTP | 3 | Complete metadata success, single-use rejection, unadmitted-origin rejection |
| CLI arguments/routing | 9 | Compact/pretty parse errors, reserved typo, unknown colon/verb, `:help`, forwarded `--help`, CLI and controlled yt-dlp versions |
| CLI controlled probe | 3 | Success, nonzero exit, 32 MiB overflow |
| CLI desktop admissions/waits | 6 | Detached, completed, failed, retry-scheduled, paused CLI wait and public paused snapshot |
| CLI controls/lifecycle | 6 | Cancel, pause, resume, retry and cancel/resume lifecycle receipts |
| CLI history | 2 | Removal and subsequent unknown-task response |
| CLI discovery/launcher | 3 | Absent/stale no-autostart descriptors and fake-launcher arguments |
| CLI upgrade | 3 | Fixed cached, forced and registry-error fetch responses |
| CLI local | 3 | Memory wait, detached teardown and explicit-path SQLite reopen seam |
| **Total** | **38** | Four additional observed documents are excluded, with both values retained |

`capture.mjs` waits for child `close` and pipe closure, records exit code and
termination signal separately, rejects spawn/stream failures, and bounds both
running children and descendant-held pipes. A timed-out owned process group is
killed; timeout receipts retain the observed exit status/signal. The held-pipe
test verifies the parent already exited with code zero. Large pretty/probe-shaped
output is two million bytes per stream. Existing fourteen CLI documents retain
their old shape because their wrapper still projects the same fields.

Transfer controls subscribe to SSE before admission, require two logged GETs and
positive public progress, and use bounded public-task polls. Lifecycle receipts
wait for an SSE fence. The new `/slow-cli-*` media routes use 128-byte ticks;
existing media route rates stay unchanged. All fixture media is generated, and
the HTML page references only a namespace-local MP4 and thumbnail. Upgrade clock
and fetch overrides are child-only; no real registry request is made. The fake
launcher publishes only the current suite's descriptor, with scratch HOME/XDG,
MCP and automation configuration. No installed launcher or owner profile is used.

A missing phase-8 build/CLI/bundled-media prerequisite prints one clear skip line.
The exercised missing-build output is `SKIP phase 8 goldens: missing prerequisite
vidbee`. Namespace startup errors still fail; no online fallback exists.

All eight phase-8 harness tests are included in root `bun run test`. Verified
Node is `v22.23.4`, matching `.node-version`. The baseline `app.asar` SHA-256 is
`c7e7945ebcea629965cfd67c5fef5894618fda008a11a63680eb0c83c69d8490`.
The freshly built pre-port CLI used for these observations has SHA-256
`2e21d686c8311fc38a97b06496b27c167c2e5a775d2aa2885c62d13cdc6c9fda`.
Its tracked distribution file is temporary build output and is restored before
handoff. No application/package source is changed.

The repository check, test, dependency and port gates have passed. Root tests
report 579 audit tests, thirteen package tasks, four script tests and 101 final
harness/review tests; the focused final harness run has eight tests. The existing
transcript hook warning, module-type notice and Turbo output warnings remain
unchanged. Exact gate logs are copied to the lane scratch directory.

## Final acceptance

**38 new documents are accepted: 35 CLI and three extension.** All twenty
consecutive comparisons in `new20-uninterrupted/results.json` passed, each
comparing all 38 documents with zero differences. All five consecutive complete
runs in `full5-complete/results.json` passed, each comparing 459 primary and four
restart documents: **463 total = 425 existing default documents + 38 new**.
No accepted document was re-recorded to obtain a favorable retry.

New-case run durations were 42.547–63.028 seconds; total 979.655 seconds.

| Full run | Exit | Documents | Seconds |
| --- | ---: | ---: | ---: |
| 1 | 0 | 463 | 198.481 |
| 2 | 0 | 463 | 195.307 |
| 3 | 0 | 463 | 195.465 |
| 4 | 0 | 463 | 193.657 |
| 5 | 0 | 463 | 205.164 |

The cross-run `final-audit.json` checks each process exit, completion result,
comparison count and zero-failure line. It re-audits **all 95 DNS logs**, including
recording, failed development, interrupted and accepted runs. Logger readiness
and self-test are present in each. The union exactly matches the fourteen names
from phase 6b, with no unexpected name. Only loopback is enabled; no external
network access is established or permitted by these launches.

All **447 pre-existing JSON files are byte-identical** to starting revision
`9f7d798f8ec8ac8d8faec68fad80edc8ec31a7e5`: the 425 default documents, 21
model-dependent transcription documents and separate browser-unavailable document.
There are now 485 committed-candidate JSON documents. The 21 ASR documents were
preserved, not rerun with models. The baseline `app.asar` hash is unchanged.
The generated tracked CLI bundle was saved to scratch with its recording hash,
then restored byte-for-byte. All owned temporary download aliases are removed;
physical media, synthetic profiles and raw receipts stay in scratch.

| Final command | Exit | Result |
| --- | ---: | --- |
| `bun run check` | 0 | Eight package check tasks successful; 12 ported configs, zero violations |
| `bun run test` | 0 | 579 audit tests; 13 package tasks; four script tests; 101 harness/review tests |
| `bun run deps:check` | 0 | No issues found |
| `bun run port:check` | 0 | 12 ported configs; zero violations |
| Phase-8 focused Vitest | 0 | Eight tests passed |
| `git diff --check` | 0 | No whitespace errors |

The tree is intentionally dirty and unstaged. No application/package source,
owner-review master, plan, model, dependency version or live profile was changed.
Independent review and publication remain the orchestrator's work.
