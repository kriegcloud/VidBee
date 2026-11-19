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

## Implementation (2026-11-19)

This section describes the Effect implementation after the characterization
commit. The earlier sections remain the historical characterization report.
**Acceptance is incomplete.** The strict source and test configurations pass,
and `port:check` reports zero violations, but that does not establish a finished
phase. The built library entries and a frozen timer observation are blocked as
set out below. The JSON encoding failure contract is also unresolved. Native local composition
and the complete native failure/resource matrix need further work before cutover.

### Progress

- [x] Read the complete lane rules, reviewed design, port guide, goldens guide and characterization handoff.
- [x] Keep the permanent reference artifacts and characterization assertions unchanged.
- [x] Add parser, envelope, descriptor, automation, upgrade, probe and connection models and schema-backed errors.
- [x] Keep the original pure helper call shapes and add the required optional pipeable forms.
- [x] Pass the unchanged 2,207-observation pure oracle and priority/target cross product.
- [x] Define Context.Service contracts and native Effect implementations for program, output, host inputs, descriptor/liveness, HTTP sessions, connection/autostart, probes and version/upgrade.
- [x] Add the narrow private host for local legacy owners, raw probes and detached launchers.
- [x] Qualify the exact signal-zero liveness driver with the full source/test diagnostics and ratchet.
- [x] Add strict native service tests and isolated host tests; retain resource and coverage limits below.
- [x] Emit the library/declarations before the executable with one initial clean; preserve bin paths and shim bytes.
- [x] Add an export manifest for each public entry and an external emitted-declaration consumer fixture.
- [x] Repair packaged command capture to collect through child close and pipe closure, with bounded failure.
- [ ] Complete built-library import/distribution proof with source unavailable.
- [ ] Pass every frozen execution observation with the specified native mechanisms.
- [ ] Finish the complete native success/failure/interruption/finalizer matrix for every service and layer.
- [ ] Finish the complete requested whole-repository, packaged, alternate-path, loaded-core and repetition gates.
- [ ] Establish phase acceptance and native phase-9.1/10 cutover readiness.

### Implementation and ownership

The strict unit contains the calculations and Effect service implementations.
`CliHost` receives platform, home and executing-artifact inputs and performs fresh
configuration reads. Descriptor and cache policies retain their distinct empty
string and BOM behavior. HTTP uses FetchHttpClient with propagation disabled;
per-session token state preserves supplied-token and concurrent-renewal behavior.
Requests own transport/body scopes and Effect deadlines. Final Stdio sinks use
`endOnDone: true`. The handler-free host entry awaits `Effect.runPromiseExit`,
then performs explicit process exit; it installs no signal handlers.

`CliLocalLive` creates a new queue/store/events scope per open and borrows an
injected native TaskExecutor and optional SqlClient. Its memory lifecycle and
missing-task/absent-SqlClient branches have native tests. It does **not** yet
compose the native downloader host from all LocalClientOptions, initialize a
supplied native SQL database, or establish native SQLite lifecycle equivalence.
Those missing obligations are not covered by the passing retained-host SQLite
oracle. In particular, native download-path/binary options currently belong to
the caller-supplied executor composition rather than being applied by open.

The test-only execution adapter provisions strict services and retained local
host capabilities. It is outside the production export surface. It maps native
schema-backed failures to the frozen scenario's historical observation shape;
that does not reintroduce public Promise constructors or a production facade.

The Node reference/executable harness moved, with its assertions preserved, from
`apps/cli/test` to `scripts/cli/characterization`. It still has the same depth for
repository-relative reference paths. This keeps its independent Node HTTP server
and process/file guards outside the strict application unit. Only runner path
literals and the explicitly replaceable execution adapter changed. Native tests
remain under `apps/cli/test/native` and typecheck under the strict test config.
All library evaluations, native tests and executable tests use the namespace
boundary. The host tests use the same boundary.

### Findings that prevent acceptance

1. **The specified library emission does not produce importable Node entries.**
   The exact shipping build emits JavaScript/declarations using tsrs. The emitted
   entries retain `@vidbee/schema/LiteralKit` and other private workspace imports.
   Their current export metadata resolves to TypeScript source whose relative
   `.js` re-exports are absent. Under pinned Node, all three built CLI imports
   fail with `ERR_MODULE_NOT_FOUND` for
   `packages/schema/src/LiteralKit/LiteralKit.errors.js`. This happens even with
   the dependency source available, before a fully standalone/source-unavailable
   layout could be proved. A different library bundling/dependency-publication
   mechanism would change the specified build strategy, so this part is stopped
   for architectural resolution. `verify-dist` now performs the actual isolated
   import/start checks and reports this failure instead of checking file existence.

2. **The frozen injected deadline requires clearing an already-fired timer.**
   The old implementation unconditionally calls clearTimeout in finally. Native
   Effect Clock.sleep clears its handle on interruption, and a completed timer
   has already expired. A focused isolated diagnostic records native registration
   before body consumption, deadline firing, response abort and the retained
   body-read error. It does not record clearTimeout for that completed handle.
   The unedited `injected HTTP deadline lasts through body consumption without
   elapsed-time assertions` case requires `cleared === [1]`. The public Clock API
   exposes no completed timer handle to clear. A test-only clock that emulates
   unconditional clearing was explored and removed; it is not acceptance proof.
   No compatibility HTTP/timer driver or assertion change is retained. This
   observation is left blocked under the brief's stop-and-report instruction.

3. **Schema JSON encoding discards required in-type error diagnostics.**
   `Envelope.result` is `unknown`, so a BigInt or cyclic object in that field is
   inside the declared pure helper type. The old helper throws TypeError with
   `Do not know how to serialize a BigInt` or the engine's circular-structure
   diagnostic. The prescribed Unknown JSON codec throws SchemaError with
   `Expected a JSON-serializable value` for both. Installed
   `SchemaGetter.stringifyJson` catches without retaining the original exception
   (`SchemaGetter.ts:1505–1524`). Section 9 declares syntax-decoding diagnostic
   changes, not encoding-failure changes. The isolated encoding diagnostic
   records this gap, which the finite frozen pure corpus does not cover. This
   part of renderEnvelope is stopped for architectural resolution; no engine
   diagnostic emulation or global JSON call was added.

The first executable run that got through setup passed all 263 executable
vectors and the normal output/signal groups, but failed several library-adapter
cases. Those adapter issues were repaired. An intermediate run timed out while diagnosing timer registration order.
After registering the deadline fiber immediately, the full root test completed:
579/580 audit tests passed and 34/35 CLI groups passed. The only assertion
mismatch was the frozen completed-timer clear observation (`[]` versus `[1]`).
This includes a passing 263-vector executable group, but does not establish a
fully passing oracle or a consecutive-run receipt.

### Declared assertion changes

None. `approved-changes.json`, `execution-observations.mjs`, `pure-vectors.mjs`
and every permanent artifact remain unchanged. Existing worker assertions were
not edited; runner references to their relocated path were updated. Section 9's
existing old/new expectations remain the only selected behavior exceptions.
The temporary timer-clock emulation is absent from the final adapter.

### Build output changes

The standalone executable remains `dist/index.mjs`, with the unchanged
`dist/bin/vidbee.mjs` shim and shebang. The entry is the private host's `entry.ts`.
Library JavaScript and declarations are emitted under `dist/library` for `.`,
`./parser` and `./envelope`. The build cleans once before both phases and directs
incremental state into that output. Scratch distribution builds use the same
script and real source configuration with a scratch output override.

The tracked `apps/cli/dist/index.mjs` is restored after testing; generated output
is not part of this source handoff. No permanent reference is regenerated.
The new external declaration fixture compiles against emitted CLI declarations
in an external package copy with no CLI source directory. Its other workspace
dependencies remain available through the installed dependency tree, so that
receipt is not a standalone dependency-publication or runtime-import proof.

The desktop no longer bundles the CLI (NEX-148; design section 8). No CLI entry
was added to desktop bundledWorkspacePackages. There is consequently no desktop
packaged CLI artifact to identify. Standalone bundle/shim proof is separate from
desktop build/launch proof; the brief's older “desktop bundles the CLI” premise
cannot be used as an acceptance claim.

### Host package: exports and who uses them

`@vidbee/cli-legacy` is private and unported. Its entries are `./entry` (shipping
build input), `./layers` (entry composition and isolated host tests), and
`./local-client` (the retained local-owner test capability). Production dependence
is one-way from host to strict CLI; the CLI build locates the sibling host entry
without adding a reverse package dependency. better-sqlite3 remains optional and
lazily required. The same handle crosses the existing borrowed runtime boundary;
the compatibility adapter releases it before its owned close. Raw probes retain
original chunks, error/close events and direct-child TERM; launcher spawn/unref
retains its old asynchronous-error behavior.

### Old and new exports

Every old root export is accounted for below. The native manifest additionally
pins new schemas, services and layers. It currently records 108 root names/types,
10 parser names/types and 12 envelope names/types.

| Old export(s) | Disposition | New export(s) |
| --- | --- | --- |
| parseArgv, parseListArgs | Same synchronous pure calls | Same names |
| VidbeeFlags, Flags, ParsedArgv, ListInput | Schema-derived data types; writable properties retained | Same names; schema values where applicable |
| ParseError | Old positional constructor removed; schema-backed failure | ParseError.make |
| ExitCode, ErrorCode, ProbeSuccessEnvelope, DownloadDetachedEnvelope, DownloadWaitSuccessEnvelope, DownloadWaitFailureEnvelope, ErrorEnvelope, Envelope, RenderOptions | Constants/schema-derived envelope data | Same names |
| renderEnvelope, errorEnvelope | Pure data-first calls retained, additive optional pipeable calls | Same names |
| exitCodeForError | Same pure calculation | Same name |
| selectTransport, validateApiUrl, isLoopbackOrPrivateHost, transportNotReady, TransportSelection | Pure calculations and structural selection type | Same names |
| redactArgs, redactText, REDACTED_PLACEHOLDER, buildForwardedInput, compareSemver | Same pure calculations/constant; semver adds pipeable form | Same names |
| run, dispatchSubcommand, connect, enqueueDownload, runProbe, checkUpgrade | Promise execution API replaced by Effects | Same operation names over native services |
| AutomationClient | Positional native constructor removed; per-session Effect owner | AutomationClient (Effect acquisition) |
| AutomationHttpError | Old positional native constructor removed | AutomationHttpError.make |
| AutomationClientOptions, HandshakeResponse | Callback options replaced by services; loose validated wire data | AutomationClientOptions, HandshakeWire, AutomationSession |
| ContractClient, SubcommandContext, SubcommandResult | Effect execution contracts replace Promise methods | EffectContractClient, SubcommandContext, SubcommandResult |
| ConnectOptions, ConnectResult | Flags passed to service; shutdown is an Effect | Flags, ConnectResult, CliConnection |
| readDescriptor, resolveDescriptorPath, isPidAlive, DescriptorPayload, ReadDescriptorResult | Host-state operations become Effects; schema-derived data | Same names, CliDescriptor, CliPidLiveness |
| ensureDesktopReady, AutostartOptions, AutostartResult | Native operation and schema data; callbacks replaced by services | Same names, CliAutostart, CliLauncher |
| createLocalClient, LocalClientOptions, LocalClientHandle | Effect acquisition and explicit shutdown; raw API remains private host capability | createLocalClient, LocalClientOptions, LocalSession, CliLocal |
| EnqueueOptions, EnqueueResult | Effect client/clock contracts; unknown wire tasks retained | Same names |
| ProbeOptions, ProbeResult, ProbeSpawner, ProbeSpawnHandle | Schema data and process capability replace Node callbacks | ProbeOptions, ProbeResult, CliProbeProcess |
| RunIO, RunResult | Callback IO removed; program/output services and schema data | CliProgram, CliOutput, RunResult |
| readCliVersion, CliVersionInfo, defaultCachePath, UpgradeCheckInput, UpgradeCheckResult | Host reads/checks become Effects; data derived from schemas | Same names, CliVersion, CliUpgrade, CliRegistry |

### For OWNER-REVIEW

- Resolve the built-library dependency strategy, fired-timer assertion/native
  Clock mismatch and JSON encoding failure contract before accepting the phase. No exemption was added.
- The root API includes `handshakeReply`, a shared schema-backed reply operation
  used to qualify the frozen injected NaN/Infinity cases. It is an additional
  explicit public operation for review alongside the export manifests.
- Complete the native local executor/options and supplied-SqlClient/DDL lifecycle
  work, and the remaining native failure/interruption matrix. Passing host
  compatibility tests are not proof of that native composition.
- The host passes the original better-sqlite3 handle using one direct structural
  assertion because the legacy transaction generic is narrower than the SDK's
  Transaction<F>. The copied double assertions were removed; identity is preserved.
- Owner-data codecs were not exercised on a copy of owner files. No owner profile,
  descriptor, installation or running process was accessed or changed.
- No remote HTTPS, live registry, real extractor/authentication, Windows launch or
  macOS launch proof is claimed. No stage, commit, push, merge, installation or
  independent review was performed in this implementation session.

### Verification receipts and remaining acceptance work

These receipts belong to this implementation. The earlier characterization
checklists above remain historical. All CLI evaluation, including native tests,
source import diagnostics, built-library checks and executable/golden runs,
used the private namespace/owner-mask harness. Heavy jobs ran sequentially.

| Gate | Result | Practical limit |
| --- | --- | --- |
| Strict CLI check and isolated test | Pass | Three wrapper tests cover the unchanged pure corpus, 17 focused native tests and export manifests; this is not exhaustive native coverage |
| Private host check and isolated test | Pass | Four retained host tests; no native local cutover proof |
| Root check | Pass | 16 ported configurations, zero violations |
| Root test | Fail | 579/580 audit tests; only completed-timer clear observation differs; later chained stages are not reached |
| Forced two-core root test | Fail | Exact `TURBO_FORCE=true taskset -c 0-1 bun run test`; 579/580, same timer assertion, 233.3 seconds; no memory-guard failure |
| Catalog and port ratchet | Pass | No dependency issues; 16 strict configurations, zero violations |
| Linux desktop build | Pass | AppImage/deb; desktop does not contain a CLI |
| Standalone CLI build | Pass | New host/program bundle; tracked artifact restored |
| Distribution verifier | Fail | New bundle and shim start, all three emitted library imports fail |
| External declaration consumer | Pass | CLI source absent; installed workspace dependencies still present |
| Existing full packaged suite, twice | Pass | 425 comparisons in each completed run, no document changes; local ASR explicitly skipped without supplied models |

The completed packaged runs took 177.8 and 165.6 seconds. An intervening attempt
was cancelled after detecting insufficient memory; its empty log is excluded.
The rerun enforced the 15 GB preflight internally. These are two completed
regression runs, not five consecutive extended-suite passes.

The design section 9 additional packaged CLI scenarios were not implemented:
wait and public controls, probe bounds, local memory/SQLite lifecycle and the
other listed projections still need their specified fixture evidence. The
bounded capture repair and six focused helper tests are present. Existing
packaged comparisons do not qualify those missing scenarios.

The full root/package by UTC/Asia-Tokyo ten-repeat matrix remains blocked by
the frozen deadline observation. It is not represented by repeated partial
suites, nor by the historical pre-port repetition receipt. Native local default
executor/options/SQL initialization and the full service/layer failure and
interruption matrix are also unfinished. These are explicit remaining work,
separate from the three stopped architecture mechanisms above.

The second-path root gate used an actual source copy under lane scratch with
relative workspace aliases verified inside the copy, and hardlinked installed
dependency files. It completed with 579/580 audit tests and the same frozen timer
assertion in 106.2 seconds. The owned copy was removed immediately afterward.
Final root check passed after the final source/manifest edits. Separate execution
of the downstream Turbo test stage passed 18/18 uncached tasks; this does not
change the failing full-root command's status.

Every later root-test stage also passed when run separately after the failed
audit: browser-capture legacy audit 28/28, Turbo 18/18 uncached tasks,
browser-capture legacy units 294/294, checker tests 4/4, and final Vitest 99/99
in nine files, including the six capture tests. Final catalog check passed.
The handoff retains exact commands, exits and logs for each stage. No full-root
pass is claimed by combining these with the failing audit.

Final integrity checks confirm unchanged HEAD and empty staging, no diff in the
permanent CLI reference/golden documents/tracked bundle or shim, unchanged frozen
observation/vector/approved bytes, no whitespace errors, and no absolute owner
home paths in changed/new repository files. The relocated checkout was deleted.
The implementation remains uncommitted for independent review.
