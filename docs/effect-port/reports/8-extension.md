# Phase 8: extension characterization and Effect implementation

Local implementation and all assigned gates are complete. Independent review, real-browser and packaged/hosted acceptance remain separate; see the Implementation section for exact receipts and proof limits.

## Progress

- [x] Read the common lane rules, locked plan decisions/amendments, port guide, golden guide and complete reviewed extension design.
- [x] Freeze the pre-port implementation at `073941008588bfea4afbec9003aa6bf143132895` (the design-only successor to `9dab889`).
- [x] Add recording browser/fetch/DOM/navigation seams and permanent pre-port source fixtures.
- [x] Pin every characterization-table area against the unchanged implementation.
- [x] Wire `vidbee-extension` into root Turbo tests, retaining the existing package and root checks.
- [x] Final repetitions, relocated-copy root suite and forced two-core root gate pass; receipts include the existing db timeout on the first stress attempt and its successful exact retry.
- [ ] Effect replacement, desktop API goldens and real Chromium integration: other lanes, not this characterization change.

## Characterization

`apps/extension/test` now contains 105 tests across six suites (74 tests in the original characterization commit). All synthetic URLs use reserved `.invalid` domains. Browser requests are fake calls, protocol assignment is a recording property setter, and the DOM does not launch a browser or load a user profile. Global real fetch throws. Entry VM imports accept only the actual React modules, CSS as a non-executable asset, and the actual popup App; unexpected dependencies fail closed. No extension module is mocked. The background is initialized through its original `defineBackground` entry; the popup runs its original `main.tsx`, real React DOM and StrictMode.

The original files were recorded from `git show 0739410:apps/extension/...`. Every run verifies their complete frozen `.txt` copies against the committed SHA-256 manifest, including shallow checkouts and source archives. A separate named test additionally compares git history when available and explicitly skips only that additional check when it is unavailable. The revision predates every implementation change in this lane. Expected observations live in the snapshot files and explicit JSON failure fixtures; no expected output is computed by the future implementation. Old and working entrypoint request traces, representative rendered output, every metadata matrix result, and pure helper results are compared today. The replacement lane must adapt the current-side loading to its new composition roots while retaining the frozen side and observations.

| Design section 10 row | Inventory and complete observations |
| --- | --- |
| Pure helpers | `characterization.test.mjs`: helper extraction from original source, strict execution, undefined/null/booleans/numbers/NaN/empty and numeric strings; duration rounding and hour rollover; bytes at 1024 and beyond GB; every codec/dimension/resolution classification field. Render fixtures pin height/resolution fallback, descending group/size order, duplicate IDs and source-order ties. |
| Discovery | First/middle/last of 27100–27120, 21 failures, false/null/scalar/array/object/malformed successful JSON, redirect-result acceptance, and token failure without restarting discovery. Complete original request URLs and methods retained. |
| Requests | GET status, bodyless POST token, GET metadata; exact query order and Unicode/space/fragment encoding; extension-origin header; absent body; no retry options. Pending write settlement precedes requests; ready write settlement precedes success icon. |
| HTTP errors | 100 independent error/details combinations including truthy arrays/objects and falsy values; non-object/malformed failure bodies; AbortError, signal-aborted and Failed-to-fetch transport Errors, other Error and non-Error failure. Acquisition and body phases at 800/60000 ms; exact string-abort fallback and body-JSON rejection behavior. |
| Metadata | `metadata.test.mjs`: 16 modeled fields × 16 substitutions, 11 response roots, 9 non-object/object format-element cases 80 isolated classification-signal substitutions and 3 interacting size/height pairs. Each successful response goes through background writes and popup StrictMode rendering. Complete stored values and DOM retained, including unknown fields and neighboring valid fields. Every result compares old and working implementations exactly. |
| Cache | Background TTL ages -1/0/1/300000/300001; popup -1/3600000/3600001; backward clocks; ready/error/pending; selected-field substitution matrix; raw unrelated objects; pruning of old numeric/string/boolean timestamps; duplicate URL first-tab ownership; concurrent whole-map lost updates. Reads include complete returned values in the main recording harness. |
| Root storage shape | Absent/null/false/zero/empty string/true/number/string/empty array/array with null; background isolated traces and popup read/message/DOM traces. The recording storage keeps named array properties via structured clone; it does not claim Chromium serialization proof. |
| Failures | Isolated pinned Node executes both the complete frozen and working background and popup modules and captures intentional old unhandled rejections. Initial read, pending write, ready write, error write, detached icon failure, tab query, popup initial read and final read, and active non-string cached error payloads all retain their original boundary trace and error/UI outcomes. Engine text is retained in `fixtures/failures.json` with `engine: true`; comparison checks failure without requiring engine class/message. |
| Messaging | Synchronous undefined listener return for admitted and ignored messages, wrong discriminator, falsy URL and non-URL truthy string. Exact popup command object, send failure/non-Error fallback and final cache read. |
| Popup | Listener-before-query, actual bootstrap, first active/current-window tab, no tab/invalid/lowercase prefix cases, ready/error cache use, pending loading, retry bypass and storage notifications by area. Whole DOM and website anchor attributes retained. |
| Cleanup | StrictMode add/query/remove/add/query with one surviving listener; exact listener identity removal; retry removes/re-registers immediately; query and send suspensions expose older initialization continuing after release; root-absent startup. |
| Rendering | Working/loading, ready, invalid-page, generic error and connection error DOM; title/duration/thumbnail; video, audio, hidden-other count and empty formats; all table cells/classes and website link attributes. The synchronous pre-effect Idle markup is pinned with the actual component and React server renderer; the mount-effect Loading frame is pinned with React DOM. |
| Handoff | Recording-only `vidbee://` and encoded download assignment; empty URL guard, assignment failure, no retry after failed launch, 1999/2000 ms boundary and retry continuing after another retry. The unreachable empty-URL guard and direct assignment failure are supplementary verbatim extracted control declarations rather than deep application imports. |

Pure engine failures outside declared types require only failure from the working helper; their historical engine text remains in the old fixture. The metadata boundary matrix requires failure for old type-violating rendering failures; historical engine text is retained in investigation fixtures marked `engine: true`, outside equality comparisons. Complete successful renderings and storage writes still compare exactly. No blanket malformed-data waiver is implemented: the present working result must equal the old result for each case.

The test harness is JavaScript (`.mjs`) because this lane characterizes an unported application and dynamically supplies out-of-type values. This keeps the original `tsc --noEmit` check green without weakening its config, introducing casts, or excluding TypeScript files. The package remains unported; this lane does not claim the replacement's strict Effect check.

## Surprises and disagreements with the design

- There is no content entrypoint, site-shape extractor, user-agent branching or locale-dependent popup text in this revision. The brief's content-script/site list is inapplicable. Popup strings are hardcoded English. Tests verify unchanged output under synthetic English/Japanese navigator settings and verify that no locale lookup occurs; the shipped English messages and HTML are frozen separately.
- `Invalid video info.` is proposed replacement behavior, never old behavior. Non-object successful responses are stored unchecked. The metadata fixtures preserve the actual old rendering/loading/failure outcome and section 9 labels identify where replacement expectations need individual review.
- A JSON-body rejection, including one triggered by deadline abortion, is caught as null inside `fetchJson`. Status acquisition can therefore qualify after its body deadline; token body failure then encounters null property access; metadata body failure writes ready with null info. Acquisition abortion instead reaches the non-Error fallback when the fake returns the native string reason. Tests retain both phases, not a blanket timeout message.
- An empty array root accepts a named URL property in the recording fake; a real browser may serialize that value differently. Actual Chromium storage serialization belongs to the browser lane.
- The pre-port implementation has no callable background exports or navigation service. The primary tests execute entrypoints; pure helpers and otherwise unreachable navigation guards use verbatim extraction from frozen source. They introduce no application test export.

## For OWNER-REVIEW candidates

- Add `happy-dom` **21.0.4**, matching the reference repository catalog, as a catalog-backed test-only dependency. The repository had neither a DOM environment nor an installed DOM package. `esbuild`, `vitest` and `@effect/vitest` reuse existing root catalog pins. No production dependency was added.
- Preserve the old unhandled rejection sites and permissive metadata/storage behavior in these fixtures; section 9 intentionally changes some of them during replacement. Never update a broad snapshot merely to hide an unlisted neighbor change.
- The second-path root-suite check can expose unrelated existing tests that assume git metadata. Such failures must be recorded separately from extension fixture stability.

## Original characterization validation receipts

The final extension suite passed 40 consecutive verification runs: ten each from the repository root and package directory under `TZ=UTC` and `TZ=Asia/Tokyo`. Every run reported 74 passing tests. The four independent series ran concurrently; measured suite durations were 11.20–16.14 seconds under that load. A second checkout-path copy without git metadata passed the entire forced root suite (579 audit tests, 14 Turbo tasks including all 74 extension tests, checker tests and final review/loopback tests). Existing db tests retain their expected skipped driver cases.

`bun run check`, `bun run deps:check`, `bun run port:check`, the original extension compile and WXT build pass. The ratchet reports 12 ported configurations and zero violations. The executable source/assets/configuration diff is empty, and all 19 WXT output files have identical SHA-256 hashes across rebuilds. No absolute home path occurs in the new worktree files.

The exact `TURBO_FORCE=true taskset -c 0-1 bun run test` retry passes the entire root gate with all 74 extension tests and 14 successful Turbo tasks. The first final stress attempt timed out the unchanged db 512-subscription-column-combination test at 5055 ms against its 5000 ms default; Turbo cancelled remaining packages. The successful exact retry completed the borrowed/Node versions in 1153/926 ms. No db test timeout was changed. This intermittent existing timeout remains an OWNER-REVIEW candidate.

Full command results, repetition receipts and proof boundaries are recorded in the lane `HANDOFF.md`. No application was launched, no real request was sent, and no protocol handler was invoked by these tests.

## Audit of the characterization suite

All 23 audit entries were confirmed against the cited old source. None was rejected. Several entries identify the same gap; their shared closure is intentional. These are tests of unchanged old application code. No application, manifest, dependency or build configuration was edited.

All whole-entry execution now goes through `test/entry-loader.mjs` (`loadEntry` and `evaluate`) with one source selector for both sides. The in-process harness and both subprocess runners use it. Each suite asserts current-side observations; each subprocess result must additionally report current loading and the exact pinned Node version. The failure suites compare both sides with the same committed old JSON; navigation runs both sides, with a separate rendered Open Client failure case. No future implementation can silently retain a frozen-only failure suite.

| Finding | Severity | Confirmed gap | Closure (paths relative to `apps/extension/test`) |
| --- | --- | --- | --- |
| assertion-strength/C1 | Major | Failure runners never executed current code. | `entry-loader.mjs`, `failures.test.mjs` and `popup-failures.test.mjs`: all scenarios run old/current with a positive current observation count. |
| assertion-strength/C2 | Major | Navigation guards were frozen-only. | `navigation.test.mjs`: `side old=%s pins empty-current-URL guard...`; `popup-failures.test.mjs`: `rendered Open Client assignment failure...`. |
| assertion-strength/C3 | Major | Localhost/connect classifiers never rendered. | `audit.test.mjs`: four `connection classifier renders complete cached error` cases compare complete DOM and trace. |
| assertion-strength/C4 | Major | URL refusal was checked before asynchronous work. | `characterization.test.mjs`: ingress now flushes and requires only listener registration; `audit.test.mjs`: eight `message URL admission settles...` cases include 7 and object URLs. |
| assertion-strength/C6 | Major | No sequential repeat proved admission release. | `audit.test.mjs`: three `releases URL admission after...` cases; `failures.test.mjs`: initial read and malformed-root repeats. |
| assertion-strength/C8 | Major | MB label and precision transition were absent. | `audit.test.mjs`: `byte unit labels and precision boundaries remain exact`, seven literal expected outputs. |
| coverage/C1 | Major | Failure and malformed-root expectations were frozen-only. | Both failure suites now compare working entry execution with old JSON under the explicit engine policy. |
| coverage/C2 | Major | Ordinary request failures did not pin default icon/order/target. | `audit.test.mjs`: full old/current traces for no ports, metadata failure and token failures, including tab IDs 7 and 9. |
| coverage/C3 | Major | Completion did not prove URL registry cleanup. | Success, metadata-error and exhausted-scan sequential repeats; complete second cache-hit or request traces. |
| coverage/C4 | Major | Discovery never saw closed-port transport rejection. | `audit.test.mjs`: Error/TypeError rejection scans to middle/none; token HTTP/transport failures stop discovery. |
| coverage/C5 | Major | Assignment failure and failed-launch retry were frozen-only. | Both-side extracted navigation guards plus rendered Open Client assignment failure with two fake seconds and no new query/send. |
| coverage/C6 | Major | Malformed selected notification guards were missing. | `audit.test.mjs`: six `malformed notification entries...` cases, complete DOM/trace or engine failure; active cached error matrix now also runs current code. |
| portability/X1 | Major | Three suites could pass without current entry execution. | Shared whole-entry loader, per-suite current observations and subprocess current-observation admission checks. |
| portability/X2 | Major | Shallow CI silently trusted mutable frozen files. | `fixtures/source-sha256.json`, recorded from git 0739410; `frozen source SHA-256 manifest...` always checks hashes, separate git test names its unavailable-history skip. |
| assertion-strength/C10 | Minor | Manifest identity/permissions were hidden by the fake origin. | `audit.test.mjs`: `complete WXT manifest pins trusted key, permissions and locale identity`, complete config snapshot. |
| assertion-strength/C5 | Minor | Request options were discarded. | `network.mjs`: `requestOptions` retains every defined enumerable init field, normalizing only AbortSignal identity; complete traces pin absent policies. |
| assertion-strength/C7 | Minor | Stale StrictMode state writes were unobserved. | `audit.test.mjs`: `released StrictMode initialization overwrites...`, distinctive older title and encoded older download URL. |
| assertion-strength/C9 | Minor | Engine text was a snapshot contract. | `metadata.test.mjs` and pure matrix now compare `{ engine: true }` for failures; complete old text retained in `metadata-engine-errors.json` and `pure-engine-errors.json`. |
| coverage/C7 | Minor | Non-core fetch options were invisible. | Shared `requestOptions` in both in-process and subprocess request traces records all defined init fields. |
| coverage/C8 | Minor | 100-unit rounding boundary was absent. | Seven exact byte-size boundary outputs including 102350, 102399, 102400, 1048575, 1048576, 104857600 and 157286400. |
| coverage/C9 | Minor | Final popup unmount removal was not asserted. | `audit.test.mjs`: `final popup unmount removes the exact surviving listener`, listener array empty and final removal index zero on both sides. |
| portability/X3 | Minor (confirmed live) | Bun's node alias selected the wrong child engine. | `node-runtime.mjs` searches executable candidates and verifies `.node-version`; children report their actual Node version. The naive first-node resolver actually returned Bun 1.4.4 during development. |
| portability/X4 | Minor | Runners retained live host/DOM networking. | `network.mjs` installs host/DOM fetch refusal and DOM XHR/WebSocket refusal before entry loading; tests require zero network refusals, including subprocess results. |

Byte formatting also preserves rounding before unit promotion: 102399 bytes renders `100.0 KB`, 102400 renders `100 KB`, and 1048575 renders `1024 KB` rather than moving to MB. These are literal expectations and OWNER-REVIEW observations, not fixes.

The additional repeat scenarios preserve an old oddity: initial read failure still allows a later command for the same URL; a fresh success then reuses ready cache. Malformed truthy roots fail again on the second command without storage writes or HTTP requests. Rendering a notification with numeric error 7 fails synchronously; it does not invent an error card. Failed protocol assignment leaves the connection card and its original read/query trace in place after two fake seconds.

The engine-only change is an explicit implementation of the brief's engine-error policy, not an allowance for metadata result changes: writes, successful DOM, application errors, failure counts and other boundary observations remain pinned. Historical error text is retained as diagnostic fixture data. Section 9 changes still require individually named new expectations beside these old expectations when the actual port begins.

### Audit validation receipts

All final commands ran with repository-pinned Node v22.23.4 and Bun 1.4.4. No test or fixture code changed after the final 40-run matrix began.

| Command | Exit | Final result |
| --- | --- | --- |
| Root: `TZ=UTC bunx --bun vitest run --root apps/extension` × 10 | 0 × 10 | 105 tests, six suites, every run |
| Root: `TZ=Asia/Tokyo bunx --bun vitest run --root apps/extension` × 10 | 0 × 10 | 105 tests, six suites, every run |
| Package: `TZ=UTC bun run test` × 10 | 0 × 10 | 105 tests, six suites, every run |
| Package: `TZ=Asia/Tokyo bun run test` × 10 | 0 × 10 | 105 tests, six suites, every run |
| `bun run check` | 0 | Root legacy/ported checks and ratchet green |
| `bun run deps:check` | 0 | No syncpack issues |
| `bun run port:check` | 0 | 12 ported configurations; zero violations |
| `bun run --cwd apps/extension compile` | 0 | Existing TypeScript configuration unchanged |
| `bun run --cwd apps/extension build` | 0 | WXT succeeds; all 19 output hashes equal the pre-change output |
| `bun run test` | 0 | 579 legacy audit tests, 14 Turbo tasks, 105 extension tests, checker and final review/loopback suites green; 111.03 s |
| `TURBO_FORCE=true taskset -c 0-1 bun run test` | 0 | First final attempt passes; 579 audit tests, 14 Turbo tasks, 105 extension tests and remaining suites green; 193.67 s |
| Relocated copy: `TURBO_FORCE=true bun run test` | 0 | Full root suite passes without `.git`; extension has 104 passes and one explicit optional-git-history skip; SHA-256 checks pass; 149.19 s |
| `git diff --check` | 0 | No whitespace errors |

The four repetition series ran concurrently. All 40 runs passed, taking 20.11–33.89 seconds per run. The relocated copy was made with `rsync -a --exclude .git --filter '+ /node_modules/***' --exclude dist ./ /tmp/ext-audit-elsewhere/`. The include rule preserves dependency distributions while excluding generated application distributions. No root gate required retry in the final verification sequence. Existing db driver skips remain expected. Node's experimental MockTimers warning appears only for the new isolated rendered-navigation scenario; no warning was suppressed.

The executable extension source/assets/configuration diff is empty. Build output has the same 19 paths and SHA-256 values as before these changes. No changed/new worktree file contains an absolute home path. Nothing is staged or committed.

Earlier development repetitions overlapping loader changes are not final proof. The final matrix started after all code and fixture edits finished.

## Implementation

Status: local implementation and all assigned gates complete. Changes remain unstaged and uncommitted. Independent implementation review and the real-browser/packaged acceptance belong to the orchestrator and separate harness lane.

### Implementation Progress

- [x] Reviewed design and port guide; schemas/errors before contracts and Layers.
- [x] Permanent pure scalar/boundary differential oracle; native browser/navigation/HTTP/cache/background/controller services and scoped composition roots.
- [x] Independent popup atoms, one document registry, lifecycle-only StrictMode adapter and BrowserRuntime ownership.
- [x] Strict tsconfig/WXT/catalog/Turbo/Biome/workflow wiring without checker changes, suppressions or lowered severities.
- [x] Correct the three incomplete old-source observations with a bounded quiescence instrument and strict-prefix proof.
- [x] Adopt each section 9 expectation independently, retaining the old assertion and all old fixtures.
- [x] Complete native interruption/failure/finalizer tests and synthetic composition-root coverage.
- [x] Finish full gate receipts, 40 consecutive complete-suite repetitions, relocated root gate and final build-output comparison.
- [ ] Separate acceptance: real Chromium, packaged desktop goldens, persisted real storage, hosted CI and independent review.

### What was implemented

`src/Extension.model.ts` models cache status with LiteralKit, closed snake-case metadata, cache entries, unknown-valued cache maps, pruning timestamps and groups. HTTP response projection treats each modeled field independently, drops unknown fields and non-object format elements, and rejects non-object roots. Selected historical entries are decoded separately; reads retain unrelated opaque values, and whole-map saves remain unsynchronized. The background and popup retain their five-minute and one-hour policies.

`ExtensionBrowser` and `ExtensionNavigation` adapt host APIs in driver files. `ExtensionHttp` uses the native Effect fetch client with the exact protocol header and bodyless token POST. Its scoped timeout encloses acquisition, body reading and status handling; a body-phase deadline uses the observed status with a null body. Transport mapping inspects the underlying cause. No request retry, extra application header or raw-fetch transport was added.

The background warms its runtime before installing the synchronous undefined-returning listener into a Layer-owned scope. URL admission is masked until the Deferred and cleanup are installed; duplicate native callers join the same completion. Requests, pending/ready/error writes and detached icon starts retain their boundaries. The runtime owns the message work and icons, and runtime disposal removes its exact listener. Logged typed failures retain Cause structure while omitting external message payloads.

The popup has independent info/error/loading/current-URL/retry atoms. A document registry shares the atom factory's memo map with its runtime. The controller installs a storage listener before starting initialization; session release is immediate and idempotent, while prior initialization continues in the document owner scope. BrowserRuntime owns the document root; document finalization unmounts React, disposes the registry and closes the runtime. Action adapters fork into the document scope; retry/session cleanup does not cancel earlier actions. `PopupCommands.ts` contains the same native download/launch/retry commands used by the controller and the closure-only navigation oracle's test entry adapter. No application compatibility package or legacy facade exists.

All API work used the installed Effect 4.1.4 declarations and real strict compilation. Errors encountered during development were corrected without diagnostic overrides, suppression comments, any casts or checker changes. The root Biome scope excludes the frozen MJS differential-oracle material and fixtures; the ratchet still scans those files. The untouched floating-button content stylesheet is excluded from formatting and restored byte for byte to main. Popup assets retain their original bytes. The original reduced-motion `!important` declarations are preserved and emit two existing warning-level Biome findings; no severity was changed.

### Characterization instrument correction

This is a correction to the pre-port characterization, not a behavior change. `flush()` still drains exactly 100 Promise turns. `settle()` captures real setImmediate/setTimeout before fake timers, performs flush/macrotask rounds, and requires trace lengths and in-flight fake HTTP/body/browser/storage counts to be unchanged across two consecutive rounds. It fails after 100 rounds. Deliberately suspended deferreds remain quiescent. Promise observation does not replace the application's returned Promise.

The entire original six-file suite was run against frozen old entrypoints, first with flush unchanged, then with flush aliased to settle. Exactly the three scan tests below differed. Only these three switch to settle (the port-27100 instance still uses flush). All 105 frozen tests passed after recording. All other snapshot bytes are unchanged. The recorder evaluates both old/new lists and asserts strict prefix equality, as well as rejecting any unexpected changed snapshot key.

| Test/observation | Old cut | Complete frozen-old observation | Prefix proof |
| --- | --- | --- | --- |
| Scan to 27110, writes | 1 pending write | 2 writes: pending, ready | old list equals new first element; strict 1 < 2 |
| Scan to 27120, requests | 13 requests, ends at 27112/status | 23 requests: 21 status probes, token, metadata | first 13 exactly equal; strict 13 < 23 |
| Scan to 27120, writes | 1 pending write | 2 writes: pending, ready | strict 1 < 2, exact prefix |
| Exhaustion, requests | 13 probes, ends at 27112/status | 21 probes, through 27120/status | strict 13 < 21, exact prefix |
| Exhaustion, writes | 1 pending write | 2 writes: pending, error | strict 1 < 2, exact prefix |

The audit suite's existing longer helper was already complete; its assertions and snapshots remain unchanged apart from the explicitly declared URL/notification changes below. Frozen fixtures still match SHA-256 and git revision 0739410. The loader's explicit `VIDBEE_EXTENSION_FROZEN=1` mode runs both execution sides on frozen code, retaining current-side load accounting and the original expectations. `VIDBEE_EXTENSION_SETTLE=1` aliases flush for the instrument comparison. Neither variable is set in current-source gates or repetition runs.

### Declared assertion changes

The previous lane reported fifteen failing parameterized cases. Three were the instrument cuts above. The remaining twelve are the declared changes below; there was no unclassified parity failure. Every edited expectation keeps a `// Before the port:` comment directly above the new expectation. Old metadata, historical-entry, root, failure and audit fixtures/snapshots remain intact.

`test/design-expectations.mjs` is an independent oracle: explicit field-kind/finite-number rules transcribed from design sections 3/9, plus frozen pre-port rendering of each projected fixture. It imports no new application decoder or controller. Historical-entry expectations validate each field independently and use frozen rendering with an absent selected entry for a miss; raw storage observations are restored literally. Background failure expectations keep the frozen ordinary protocol trace and independently model finite timestamp pruning and whole-map writes. The root policy shortens initialization at the first invalid-root read. This establishes each case's complete writes/DOM/trace without deriving expected values from port output.

| Failing case | Section 9 boundary | New expectation and retained old observation |
| --- | --- | --- |
| Body deadline: video-info | Non-object successful metadata response root | At the 60000ms deadline, null becomes an error entry `Invalid video info.`; old ready/null expectation and complete request snapshot retained. |
| Per-field response-to-storage-to-render matrix | Null/wrong-kind modeled fields; non-array formats; non-object elements; unknown fields; non-object roots | Each field substituted independently, including isolated classification signals and size/height fallback pairs. Project modeled fields only, drop non-object elements, reject non-object roots; exact neighboring valid fields, count, groups, order and DOM checked through frozen rendering. |
| Selected historical entry matrix | Undecodable selected cache entry | Invalid required/optional fields are misses; valid entries still use the original guards/TTL. Raw values in get observations remain unchanged. |
| Popup storage/notification roots | Present non-record storage root; malformed notification root | End initialization at its initial read; no send/final read, rewrite or invented UI. Absent key remains a miss. Falsy notifications keep their old guard. |
| Isolated detached failures and malformed roots | Detached icon failure; initial read; pending/error write; invalid roots; selected entries; pruning timestamps | Failed fibers log exact expected counts instead of unhandled rejections. Initial invalid roots stop at get. Non-finite/wrong-kind timestamps and null entries are retained; invalid selected entries fetch normally. |
| Repeat admission after read/root failure | Initial cache-read failure; present non-record root | Repeated failures log and release admission; two invalid-root commands perform exactly two gets. Ordinary success/cache hit unchanged. |
| Popup query/first-read/final-read failures | Detached popup initialization/navigation failure; initial cache-read failure | Same trace/loading UI, two logged initialization failures, zero unhandled rejections. Query follows the same design section 4/12 logging policy. |
| Active malformed cached errors | Undecodable selected cache entry | Every non-string error is a miss and preserves loading/request/final-read behavior; string/absent cases retain their exact original observations. |
| Rendered Open Client assignment failure | Detached popup initialization/navigation failure | URI, UI, queries and no retry remain exact; one logged failure replaces one unhandled rejection. |
| Message URL admission: 7 | Truthy non-string tab URL (architect ruling 2, browser/tab and runtime-command ingress) | Driver string decode produces absence: registration only, no request/cache write/icon; raw-number old expectation retained in the snapshot and comment. |
| Message URL admission: {} | Truthy non-string tab URL | Same absent-URL trace; raw-object old expectation retained. |
| Malformed notification entries | Undecodable selected cache entry | Each incomplete/invalid selected entry is ignored; pending state remains and no engine failure or invented transition appears. |

The design's section 9 includes the architect's new truthy non-string tab-URL row. It also explicitly tabulates the already specified sections 4/12 popup-initialization/navigation logging policy, so those assertion conversions have a named section 9 row; this is documentation of the existing reviewed rule, not a newly chosen behavior. Both query and message drivers decode strings without String coercion. New native cases cover 7, {}, true, null, undefined, empty string and a valid string. A missing cache key now carries an explicit presence bit separately from its unknown value; a synthetic present-undefined root fails decoding while an absent key remains a miss. This closes the previous handoff's presence ambiguity without changing the storage wire shape.

### Native tests and integration coverage

The closure-only navigation oracle's frozen declarations now bypass the current adapter even when its temporary Harness uses the default side. Its source text identifies the frozen closure; current extracted exports alone use the native test composition. This corrects a loader-side false comparison without editing either navigation assertion.

| Owner/service | Success and failure/resource proof |
| --- | --- |
| Metadata/pure models | Closed independent projection; every non-object root; null/wrong-kind fields; finite-only pruning and retained opaque entries; permanent successful scalar/NaN oracle and natural engine failures. |
| Browser driver/Layer | Origin/query/message/storage/icon operations; every typed host failure; interruption of each asynchronous host call; exact listener identity/removal and synchronous undefined return; tab/message URL decoding and cache-key presence. |
| Navigation driver/commands | Exact URI and truthiness guard; synchronous/typed assignment failure; no retry after failure; two-second delay survives session release but is canceled with its document. |
| HTTP Layer | Bodyless POST/header/tracer contract; JSON/HTTP/transport/coercion failures; acquisition and body deadlines; caller interruption in both acquisition and body phases; signal abortion; no later deadline double cancellation. |
| Cache Layer | Miss/ready/status/TTL/backward-time cases; selected decoding and unrelated raw preservation; typed read/write and decode failures; interrupted read/write; missing versus present-undefined root; special-key preservation. |
| Background Layer | Pending-before-network; sequential discovery, token truthiness and encoding; typed failures at read/pending/request/ready/error; deduplication/admission finalization; interruption at pending, status, token, metadata, ready and error; detached icons released with scope. |
| Popup controller/atoms | Independent pending/info/error fields; session idempotence and exact removal; stale initialization continuation; query/first-read/send/final-read interruption on document closure; launch delay ownership; notification admitted just before close cannot publish afterward. |
| Real composition roots with fake browser/network | StrictMode session replay; persisted pagehide retains root; non-persisted pagehide releases registry/runtime/React/listeners; worker disposal aborts owned request/removes listener; registration-time synchronous reentry; full Cause logging at failure boundaries with host-text redaction. |

Port-guide defect classes were checked individually: no JavaScript generator catch/finally around yielded work; cleanup installed under masks before interruption; Deferred registration before fork and synchronous completion; retained truthiness; successful wrong-kind scalar results versus natural engine failures; no introduced dual overload; live whole-map behavior without added locks; no legacy error translation needed; underlying HTTP cause mapping; string deduplication keys and direct foreign callback identity; callbacks re-enter the captured owner logging context. No suppressions, casts to bypass diagnostics, diagnostic overrides or checker exemptions were added.

### Build output changes

For both Chrome MV3 and Firefox MV2, before and after contain exactly 19 files. Complete manifest bytes match (therefore identity key, permissions, host permissions, action and background all match). The twelve icons, locale JSON, Inter font and popup CSS are byte-identical. Exactly three logical outputs change:

| Output | Reason |
| --- | --- |
| `chrome-mv3/background.js` | Native Effect services/scopes replace the Promise worker. |
| `chrome-mv3/chunks/popup-CzhklpUe.js` → `chunks/popup--ntqXFau.js` | Native atom/controller/browser-runtime popup replaces the old popup implementation. |
| `chrome-mv3/popup.html` | References that new hashed JS chunk. |
| `firefox-mv2/background.js` | Native Effect services/scopes replace the Promise worker. |
| `firefox-mv2/chunks/popup-CzhklpUe.js` → `chunks/popup--ntqXFau.js` | Native atom/controller/browser-runtime popup replaces the old popup implementation. |
| `firefox-mv2/popup.html` | References that new hashed JS chunk. |

Each installable archive has 19 entries and passes ZIP integrity validation. WXT additionally produces its Firefox source archive (120 entries); that is separate from the 19-file installable-output contract. No unresolved workspace or Node-only runtime imports and no absolute home paths were found in emitted worker/popup modules. Both manifests were compared against builds of the exact hash-verified frozen entrypoints in the disk-backed second-path copy, which was removed after proof. The Chrome comparison also matches the original pre-port hash receipt.

### Implementation validation receipts

All final commands use pinned Node v22.23.4 and Bun 1.4.4, one heavy operation at a time. Memory availability is checked before each. Root tests use repository-owned ephemeral loopback servers, never the owner's desktop ports 27100–27120 or remote hosts.

| Gate | Exit | Result |
| --- | --- | --- |
| Frozen original characterization suite | 0 | 105 tests, six suites; frozen SHA-256/git source exact. |
| Extension check and compile | 0 | Strict source/native-test configs; two original reduced-motion warnings, no errors. |
| Full extension test | 0 | 167 tests, ten suites. |
| Root `bun run check` | 0 | 9 Turbo checks; 14 ported configs, zero ratchet violations. |
| Root `bun run test` | 0 | Complete audit/ported/checker/negative-fixture/review/ephemeral-loopback suites pass on final source. |
| `bun run deps:check` | 0 | No syncpack issues. |
| `bun run port:check` | 0 | 14 ported configurations, zero violations. |
| Chrome build/zip | 0 | 19 installable files, byte-identical manifest/assets. |
| Firefox build/zip | 0 | 19 installable files, byte-identical manifest/assets. |
| `TURBO_FORCE=true taskset -c 0-1 bun run test` | 0 | Complete root suite forced on two cores. |
| Disk-backed second-path `TURBO_FORCE=true bun run test` | 0 | Complete root suite without .git; extension 166 passed/one explicit optional-git-history skip; SHA-256 checks still pass. |
| Root × UTC complete extension suite | 0 × 10 | 167 tests in each consecutive run. |
| Root × Asia/Tokyo complete extension suite | 0 × 10 | 167 tests in each consecutive run. |
| Package × UTC complete extension suite | 0 × 10 | 167 tests in each consecutive run. |
| Package × Asia/Tokyo complete extension suite | 0 × 10 | 167 tests in each consecutive run. |
| Configuration comparison | 0 | 30 inherited ordinary options; all 150 diagnostic severities/empty overrides; generated aliases/declarations and ES2025 preserved. |
| Frozen bytes, snapshot strict-prefix proof, index/path/whitespace checks | 0 | Frozen/hash/git exact, five strict-prefix expansions only, content CSS equals main, no staged changes/absolute home paths/whitespace errors. |

One intermediate normal root-test retry lost a legacy downloader test process to SIGTERM without an assertion failure while memory was low (578 other audit tests passed). Per COMMON's machine-limit instruction, its failed log was retained, the runner waited one minute, and unchanged tests were rerun successfully: **memory guard, rerun passed**. The successful final normal, forced two-core and relocated gates are separate receipts. No timeout or test/harness workaround was added for that signal.

The full repetition matrix started after all source/test edits, uses neither frozen-source mode nor the flush-alias mode, and has no skips/failures in its 40 runs. Logs and machine-readable gate, relocation, prefix, build and repetition receipts are retained beside the scratch handoff. The relocated copy was removed.

### Proof boundaries and For OWNER-REVIEW

- Installed-API departure from the reviewed script example: WXT 0.21.5's `prepare` command has only a config option (`node_modules/wxt/dist/cli/commands.mjs:56–61`); `wxt prepare -b firefox` fails with `CACError: Unknown option -b` before any build. Both Firefox scripts now call the existing browser-neutral `prepare:wxt` before `build/zip -b firefox`, and the design's example records this supported correction. No runtime or output policy changed. The failed receipt is retained.

- Independent implementation review, hosted CI and acceptance/merge remain with the orchestrator. No commit, stage, push, installation, app operation or real browser launch occurred in this lane.
- Installed `S.Record(S.String, S.Unknown)` accepts some exotic prototypes (for example Date). Keep it: browser JSON-like serialization cannot deliver Date/class instances as such. This is the architect's explicit boundary, not an outstanding schema defect.
- Compiler `--showConfig` serializes inherited ordinary options but omits plugins/noErrorTruncation, including for a base-only config. The input comparison independently verifies ordered inheritance, all 150 diagnostic severities and empty overrides; this is not a direct compiler serialization of the plugin matrix. Strict source/test compilation exercises the rules.
- Preserve known behavior: unsynchronized whole-map lost updates, unequal background/popup TTLs, first-caller icon ownership, zero tab ID global targeting, detached icons, synchronous worker listener without keepalive, stale StrictMode initialization, deleted-entry notifications not clearing state, special URL __proto__ assignment, and hardcoded English popup. These are later review candidates.
- Real Chromium lane must prove unpacked identity and worker/action-popup capabilities; actual popup active/current-window query chooses the fixture; real Origin/header/bodyless token exchange; metadata success/failure, cache reopen/retry/error, browser storage serialization and worker restart; screenshots and 360px layout, themes/reduced-motion/keyboard focus; actual document/worker resource cleanup. A post-capability mismatch is a scenario failure, not a capability skip.
- Never click protocol-launch controls in browser proof. Use isolated handler-discovery directories; URI/delay behavior is synthetic proof here. Persisted real storage requires a safe snapshot/copy and anonymized counts/schema paths; none was read here.
- Packaged desktop API goldens, Linux/CLI packaged proof, remote extraction/authentication/thumbnails, store installation, Firefox trusted-origin behavior and Windows/macOS protocol handling are outside this lane's proof.
