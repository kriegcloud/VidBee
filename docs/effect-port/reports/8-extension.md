# Phase 8: extension characterization before replacement

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
