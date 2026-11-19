# Phase 8: CLI characterization

## Progress

- [x] Read the shared lane rules, locked plan decisions, port guide and reviewed CLI design.
- [x] Preserve `apps/cli/src` and both committed executable artifacts.
- [x] Retain the immutable reviewed pre-port executable and old-source library oracle outside scanned units.
- [x] Add 2,207 generated pure cases with recorded results, including engine-failure markers.
- [x] Wire Bun-backed `@effect/vitest` and pinned-Node `node:test` through package/root tests.
- [x] Add isolated executable, HTTP, file, process, local-owner and signal characterization.
- [x] Finish repetition, alternate-checkout and loaded-core verification.
- [x] Complete the lane handoff with omitted vectors and proof limits.

## Audit of the characterization suite

This section supersedes the original lane's implementation and validation descriptions
below. The audit confirmed all twenty findings; none was rejected. The CLI remains
unported. Only tests, test fixtures/configuration and this report changed.

- [x] Isolate all reference/candidate evaluation, including pure and library imports.
- [x] Execute the package's actual build outputs and generated shim from scratch.
- [x] Separate public pure exports from test-only execution observation adapters.
- [x] Encode independent old/new descriptor, handshake, cache and syntax expectations.
- [x] Add POST retry/error, priority/target/group, error-tail, autostart mapping,
  registry and local process/file observations.
- [x] Final ten-repeat matrix: 40 passes; final test inputs unchanged.\n- [x] Root check/test/catalog/ratchet and alternate-path root test gate.\n- [ ] Forced two-core full root gate: three attempts failed on worker SIGTERM/SIGKILL; acceptance remains incomplete.

| Finding | Severity | Confirmed gap and closing cases/files |
| --- | --- | --- |
| assertion-strength/C1 | major | Deleted execution APIs were called directly: execution-adapter.ts and named execution-observations.mjs functions isolate the test-only backend; immutable library.mjs supplies old observations. Probe/automation/autostart/runtime/upgrade/connect assertions remain fixed, alongside executable tests. |
| assertion-strength/C2 | major | Candidate reused frozen shim: distribution.mjs executes the unchanged build script in scratch, asserts generated shim bytes/shebang, and both workers execute those outputs; edge import-error case runs both shims. |
| assertion-strength/C3 | major | New expectations were unread prose: approved.worker.mjs reads approved-changes.json and asserts independently encoded old/new observations; registry/distribution tests read that manifest; output tests select exact rendered-byte/new failure expectations with the same switch. |
| assertion-strength/C4 | major | Output assertions accepted truncation/any termination: output lifetime requires complete ported candidate bytes and exact old zero/empty-stderr closed-pipe observations today; ported closed pipes require nonzero code and stderr when open. |
| assertion-strength/C5 | major | Actual launcher options were dropped: signalObservation now returns spawn/unref traces and fake-child argv/environment, including detached autostart. |
| assertion-strength/C6 | major | Guard bypasses and arbitrary signals: private PID/proc mounts, empty owner configuration/installation mounts, worker-safety.mjs, all-signal PID ownership guard, refused untraced exec/fork/sync APIs, and safety.worker.mjs rejection tests. |
| coverage/C1 | major | Hand-built executable was not shipped entry: buildDistribution runs the exact package script in scratch; permanent executable oracle and edge cases execute its bundle/shim. |
| coverage/C3 | major | POST retry/errors absent: executable list/add vectors cover 401-success, repeated 401, 403 and 500, comparing streams/status and ordered request headers/body bytes. |
| coverage/C4 | major | Valid targets/priorities and numeric add fields absent: public pure priority/target matrix plus executable user/subscription/background, api/desktop and Unicode group-key vectors pin request bodies. |
| coverage/C5 | major | lastError tails absent: executable wait vectors for four non-success statuses and download logs supply Authorization-bearing lastError and competing wrong fields. |
| coverage/C6 | major | Local process/filesystem observations dropped: local signal vectors compare spawn options, unref, complete fake-child environment/argv and instrumented mkdir/writeFile/rm/mkdtemp observations. |
| coverage/C9 | major | Unknown nonzero/group signals and host PID visibility: structural PID isolation/remounted proc plus positive owned-PID guard and safety rejection matrix. |
| portability/C2 | major | Signal-zero-only guard: structural boundary and every-signal ownership guard; zero/negative/self/unknown targets are rejection-tested. |
| assertion-strength/C7 | minor | Registry writes/stderr unpinned: wire-error cases compare stderr/files/trace/full requests; BOM success asserts exact serialized cache bytes using observed fetchedAt. |
| assertion-strength/C8 | minor | Private parser imports: candidate.ts imports only three public entries; private-helper vectors remain immutable reference evidence, while public parseArgv vectors pin routing effects. |
| coverage/C7 | minor | Autostart mapping absent: connect-mapping case pins four messages/codes and dead descriptor; executable timeout pins status/streams/requests with declared elapsed-time projection. |
| coverage/C8 | minor | Registry failures/cache spellings absent: executable vectors add 404/500, loopback socket rejection, inline cache spelling and bare default-cache upgrade. |
| portability/C1 | minor | Pure/library imports escaped safety boundary: pure.test.ts invokes pinned-Node worker through the same isolated wrapper; workers import under mounts with scratch homes/PATH and worker guards. |
| portability/C3 | minor | Inadequate compound budgets: ordinary capture 30 seconds, slow/closed/signal/autostart capture 90 seconds; compound signal/pipe groups allow 1,800 seconds and outer namespace budget exceeds worker-group sum. |
| portability/C4 | minor | Failed tests orphaned detached fixtures: unshare PID/fork/kill-child/remounted proc makes namespace-init termination reap every descendant. |

Section-9 item 1 has a remaining design precision gap: the design fixes output
paths and describes proposed Effect services, but does not fix a final public
export barrel/consumer call contract. Exact numeric, syntax, output and metadata
expectations are encoded; a complete independent new public Effect API snapshot
cannot be supplied without choosing that contract. This is the remaining
assertion-strength/C3 item-1 open point, recorded at the top of the scratch handoff.

The execution adapter is a test-only seam, not a production Promise facade.
The rewrite replaces that adapter with implementations over Effect services and
retained host capabilities, preserving scenario inputs, observations and assertions.
The public pure oracle uses no private source import. Concurrent token acquisition,
exact fake-clock boundaries, synthetic raw process events, injected teardown
exceptions and supplied SQLite handles cannot be selected with argv; they remain
explicit adapter scenarios. Their immutable old-source library is independent of
the candidate.

VIDBEE_CLI_PORTED=1 selects only the declared new side. Today the candidate must
exhibit the old behavior. Tagged nonfinite scalars prevent JSON recording from
turning Infinity into null. Metadata checks pin section-8 library/declaration
targets; source-unavailable consumer compilation remains rewrite-lane proof.
Reference artifacts, hashes and recorded pure results are untouched.

Before imports, private mount namespaces bind empty directories over the real home
configuration and installation directories. Scratch HOME/XDG/APPDATA and authored
descriptor/MCP files remain explicit. Only namespace loopback is enabled. Executables
receive controlled PATH and fake launcher/extractor paths. Worker process APIs
permit harness tools and authored fixtures; executable guards refuse untraced
process APIs and signals to unknown/nonpositive PIDs. Setup failure fails closed.

The new error-tail vectors also expose an existing disclosure boundary: a wait
failure's returned task retains its original lastError, while only the separate
ytDlp.stderrTail field is redacted. The logs command returns the raw lastError tail.
Those bytes are preserved for owner review; this lane does not fix that behavior.

Tracing remains JavaScript instrumentation, not a syscall audit. It records
canonical file operations under the fixture root, spawn options and child
environment/argv; module-loader/runtime setup outside that root is excluded.
Generated local IDs, elapsed autostart text, raw unhandled stacks, kernel-dependent
old output-prefix lengths and live registry fetchedAt retain the named design
exceptions. They are not exact deterministic byte snapshots.


### Audit repair validation

Node 22.23.4 and Bun 1.4.4 were verified. The final fixed-input CLI suite passed
ten consecutive times in each root/package and UTC/Asia-Tokyo combination:
40 combined runs, 91.174–130.185 seconds per run. Final test input hashes,
apps/cli/src, tracked apps/cli/dist and all immutable reference files are unchanged.
The ordinary root check/test/dependency/ratchet gates and the copied-checkout full
root test gate pass.

The exact forced two-core full root test gate is not green. Three attempts ended
with worker SIGTERM/SIGKILL failures. The final attempt reported 532 passes and six
failed entries (CLI oracle plus unchanged desktop/downloader files), with no CLI
assertion mismatch. An isolated two-core legacy-file diagnostic and five
instrumented oracle diagnostics passed. No signal sender was captured; its cause
remains unknown. The final 40-run CLI matrix ran without competing root gates and
passed, but that does not waive the failed full-root proof.

The audit repair is therefore not an unconditional done/merge-ready claim.
The public API precision point above and the full-root two-core failure remain
open in the scratch handoff and validation/summary.json. No assertion was weakened,
unrelated source repaired, or production behavior changed to obtain a green result.

## Original characterization lane record

The following records the preceding lane, before this audit repair.

## Characterization

The reference executable is 2,144,754 bytes and SHA-256
`96711ba9fa521c2aeb8d02dcccc1d45db2ebdd982ccd6118ab4e0991a9134e0f`, matching
the reviewed design. `fixtures/cli-pre-port/manifest.json` identifies revision
`9dab889b0b1d5328721802d65699a5f8593bf2e2`, the original lockfile hash, tools,
build options, and artifact lengths/hashes. Normal tests verify those hashes;
they never regenerate the reference. The tracked CLI/workspace build inputs
were verified unchanged against that revision before a read-only esbuild capture.
The restricted lane did not create a detached checkout or reinstall its lockfile.
The explicit maintenance script requires a clean detached recorded revision and
performs frozen installation before generation. Its detached-checkout execution
remains unverified in this lane. The old build script was also run in a source
archive to verify the generated shim bytes.

`pure.test.ts` compares the candidate source exports with the old library bundle
and recorded observations. Engine errors retain the old Node text in the fixture,
but their text/class is not asserted across Bun or a replacement implementation.
Successful values retain undefined and non-finite values through a tagged recording
codec. Synthetic absolute paths keep path-sensitive results independent of cwd.

`isolate.node.ts` selects the running pinned Node, removes inherited environment
and preload state, supplies scratch profile paths, and runs `oracle.worker.mjs` and `edge.worker.mjs`
inside `unshare -Urn` with only loopback enabled. There is no online fallback.
Reference and candidate execute sequentially at the same per-vector visible paths.
The candidate executable is built in memory, without touching the committed dist.
The harness compares raw streams through child `close`, code and signal separately,
ordered wire request targets/headers/body bytes, fixture file observations and
resulting file bytes, and controlled spawn specifications. Byte mismatches report
the first differing offset and retain raw evidence under scratch.

| Design area | Pinned coverage | Remaining limits |
| --- | --- | --- |
| Scanner | Fourteen reserved flags, inline/separate/missing/flag-looking values, all ordered flag pairs, loose typos, empty tokens, colon cutoff, retained `--` | Exhaustive arbitrary token strings are bounded to the generator's published corpus |
| Numeric parsing | Canonical max-attempts versus permissive timeout/list-limit; zero, negatives, signs, leading zeros, whitespace, suffix/exponent text, large values | Not every IEEE-754 decimal representation |
| Probe routing | Every exact alias/getter/meta and print, inline values, first-match, values/`--`, all five stdout-output spellings | No live yt-dlp behavior claimed |
| Subcommands | Slash/space forms, ignored path segments/tails, missing/empty/flag-looking IDs, list aliases/statuses, first reason, sequential history removal, writer capability absence | Local full task-control lifecycle belongs to packaged lane |
| Redaction | All full-value flags, sensitive header/query names, duplicates/case, malformed URLs, Unicode, quoting and text tails | No arbitrary regex fuzz campaign |
| Envelope rendering | Six shapes, compact/pretty bytes, field substitutions, insertion order, omitted undefined, nonfinite JSON, arbitrary results | New Stdio drain behavior remains part 2 |
| Runtime | Parse/command/download/upgrade catches, API prevalidation, connection-before-command errors, uncaught connection/probe failures, teardown swallowing | Not every conceivable injected callback throw |
| Probe | Cap boundary/crossing chunks, error/close races, null close, byte stderr tail, split UTF-8/BOM, real missing executable, ignored TERM overflow | Descendant-held-pipe timeout and detailed killed-state/kill-throws production observations remain open; raw stream/listener failures are predicate-tested |
| Automation | Real wire request/output oracle, five loose add IDs and five differing poll IDs, auth renewal/401/403/retry failure, concurrent renewal, expiry boundary, malformed/empty/scalar/null bodies, body-read and fetch rejection, direct NaN handshake injection | Injected deadline lasts through body consumption; no actual 30-second wait, TLS or remote proof |
| Descriptor/autostart | Platform/path precedence, injected home, BOM/invalid UTF-8/syntax/read failure, independent nonfinite fields, liveness false/throw, launcher platform argv, synchronous throw, asynchronous launch failure, exact deadline; HOME-absent fallback under a synthetic passwd bind in a private user/mount namespace | Unusual real numeric PID cases and the complete empty/whitespace environment precedence cross product remain open |
| Local owner | Memory/SQLite start, injected executor, absent-task error, supplied DB preserved/reopened, queued input round trip, temp cleanup, shutdown twice, swallowed stop error, optional-addon/DDL failure leaks, detached projection and local signals | Full task/attempt/journal contents, transaction traces and executor-start failure behavior remain open |
| Upgrade/version | Candidate files/fallback, cache syntax, TTL equality, future timestamps, force, write failures, ISO range, semver quirks, real fake-registry errors/BOM success, all bundle-relative candidates, all platform default cache paths/empty strings | Complete duplicate/cache flag grammar and registry deadline schedule remain open |
| Output lifetime | Small/pretty output via byte oracle; large slow reader and closed stdout/both streams for bundle/shim record old prefix/exit behavior | Port must replace marked legacy-prefix assertions with complete-output and bounded nonzero closed-pipe requirements; early close before and during output is exercised under old-behavior predicates |
| Signals | Both signals at held HTTP body, probe startup, detached autostart polling and local extractor startup; owned child survival/no forwarded signals; shell 130/143 observations | Shell statuses are exercised at all four readiness points; descendant-held-pipe timeout is still open |
| Distribution | Both executable paths, immutable metadata/artifact hashes, publication allowlist unchanged | Library/declaration/source-unavailable build proof belongs to part 2, which changes build wiring |

The filesystem instrumentation records actual calls, rather than inferring reads
from the resulting file snapshot. It is not a syscall trace: module-loader/runtime
reads outside the run root are excluded, and low-level open/read/stat operations are not instrumented. Sync, callback and
promise forms of access/readFile/writeFile/mkdir/rm/mkdtemp share canonical operation
names, preserving paths, call order and write bytes. Part 2 must qualify this trace
against its actual native file implementation before claiming complete file-boundary parity.

## Surprises and disagreements with the design

- The tracked old `dist/index.mjs` is not the reviewed reference hash. It remains
  untouched. The captured reference is built from verified pre-port inputs and
  matches the design's hash exactly.
- esbuild source labels depend on the build working directory and dependency
  symlink layout. A scratch archive with a node_modules symlink did not reproduce
  the reviewed hash. The capture uses repository-root build options; the manifest
  does not pretend the archive result was accepted.
- Bun and Node produce different out-of-type engine error text. The fixture retains
  pinned-Node text while the test checks failure only, as the parity rule requires.
- A nested Node test runner inherits `NODE_TEST_CONTEXT` and silently skips tests.
  The wrapper supplies a fresh environment, preventing that false green.
- Malformed JSON in a bundle-relative package.json can be rejected by Node
  module loading before CLI version fallback runs. The executable pins this raw
  failure; injected version-file tests separately pin the fallback calculation.
- A direct probe confirmed the generated shim escape writes an actual newline;
  tracked and freshly generated shim bytes agree. No literal backslash-n output
  is asserted.
- The old binary may exit zero even when its stdout pipe is already closed. Output
  completion is already a declared change, but this old status must not be mistaken
  for the new acceptance requirement.
- `bun install` needed a writable `BUN_INSTALL_CACHE_DIR` in addition to TMPDIR and
  BUN_TMPDIR in this sandbox. No version/catalog change was needed.
- The static CI job previously lacked the Ubuntu AppArmor user-namespace setup
  already present in the packaged job. It now uses the same setup before running
  the offline CLI tests. No workstation sysctl was changed; hosted CI is unverified.
- The regeneration script exists, but its full clean detached-checkout/frozen-install
  route could not be executed here. This remains a provenance-procedure gap despite
  the exact independently reviewed executable hash match.

## For OWNER-REVIEW candidates

Keep all section 11 behaviors unchanged. In particular, empty/falsy/absent wire IDs
are accepted, first operation performs handshake, HTTP auth failures usually map
to `UNKNOWN_ERROR`/2, local teardown is immediate after detached admission, timeout
and list limit retain parseInt quirks, and the shim's import-error terminator is the
actual newline emitted by its generated JavaScript string escape. Do not correct these while porting.

`test/approved-changes.json` identifies section 9's finite-number, JSON diagnostic,
output-completion and library metadata/API changes. It documents new expectations;
this lane's assertions still characterize the old implementation. Updating those
marked assertions is part 2 work and cannot authorize broader changes.

No owner's database/profile/cache was read. The design's audit of newly decoded
persisted data is not applicable to this tests-only lane; synthetic SQLite startup
was exercised instead. No packaged/native layer acceptance is claimed.

## Validation

All requested local validation completed under Node 22.23.4 and Bun 1.4.4:

| Command / proof | Exit | Result |
| --- | ---: | --- |
| `bun run --cwd apps/cli test` | 0 | 2,207 pure vectors |
| `bun run --cwd apps/cli test:node` | 0 | 31 Node groups, including the 239-vector executable oracle |
| Root and package cwd, each under `TZ=UTC` and `TZ=Asia/Tokyo` | 0 | Ten consecutive pure + Node suite passes in each of four combinations (40 combined runs) |
| `bun run check` | 0 | Legacy and ported checks pass |
| `bun run test` | 0 | Root audit/package/checker suites pass |
| `bun run deps:check` | 0 | No issues |
| `bun run port:check` | 0 | 12 ported configurations, zero violations |
| `TURBO_FORCE=true taskset -c 0-1 bun run test` | 0 | Forced full test gate passes on two cores |
| Copied checkout at `/tmp/cli-char-elsewhere`, `bun run test` | 0 | Full gate passes from a second path with node_modules preserved |
| `git diff --exit-code -- apps/cli/src apps/cli/dist` | 0 | Original source and tracked executable artifacts unchanged |
| CI workflow YAML parse; recorder syntax/precondition checks | 0 | Workflow parses; absent-checkout recorder call rejects as expected before mutation |

The final forced and alternate-path gates each report 580 passing audit tests,
15 successful Turbo tasks, four passing checker tests and 78 final review/loopback
tests. The DB package's driver-specific suites retain their existing split execution.
No hosted CI, packaged build/goldens or native-layer acceptance is claimed.

The lane's scratch `HANDOFF.md` and adjacent `validation/` directory contain exact
commands, exit codes, per-run logs, intended commit boundaries and remaining work.
The full detached-checkout regeneration procedure and the unpinned vectors listed
above remain explicit proof limits; passing local gates is not a claim of complete
design coverage.
