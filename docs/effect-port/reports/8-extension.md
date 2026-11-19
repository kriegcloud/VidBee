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

`apps/extension/test` contains 74 tests across five suites. All synthetic URLs use reserved `.invalid` domains. Browser requests are fake calls, protocol assignment is a recording property setter, and the DOM does not launch a browser or load a user profile. Global real fetch throws. Entry VM imports accept only the actual React modules, CSS as a non-executable asset, and the actual popup App; unexpected dependencies fail closed. No extension module is mocked. The background is initialized through its original `defineBackground` entry; the popup runs its original `main.tsx`, real React DOM and StrictMode.

The original files come from `git show 0739410:apps/extension/...` and are checked against complete frozen `.txt` files. A source archive without git metadata uses those frozen files. The revision predates every implementation change in this lane. Expected observations live in the snapshot files and explicit JSON failure fixtures; no expected output is computed by the future implementation. Old and working entrypoint request traces, representative rendered output, every metadata matrix result, and pure helper results are compared today. The replacement lane must adapt the current-side loading to its new composition roots while retaining the frozen side and observations.

| Design section 10 row | Inventory and complete observations |
| --- | --- |
| Pure helpers | `characterization.test.mjs`: helper extraction from original source, strict execution, undefined/null/booleans/numbers/NaN/empty and numeric strings; duration rounding and hour rollover; bytes at 1024 and beyond GB; every codec/dimension/resolution classification field. Render fixtures pin height/resolution fallback, descending group/size order, duplicate IDs and source-order ties. |
| Discovery | First/middle/last of 27100–27120, 21 failures, false/null/scalar/array/object/malformed successful JSON, redirect-result acceptance, and token failure without restarting discovery. Complete original request URLs and methods retained. |
| Requests | GET status, bodyless POST token, GET metadata; exact query order and Unicode/space/fragment encoding; extension-origin header; absent body; no retry options. Pending write settlement precedes requests; ready write settlement precedes success icon. |
| HTTP errors | 100 independent error/details combinations including truthy arrays/objects and falsy values; non-object/malformed failure bodies; AbortError, signal-aborted and Failed-to-fetch transport Errors, other Error and non-Error failure. Acquisition and body phases at 800/60000 ms; exact string-abort fallback and body-JSON rejection behavior. |
| Metadata | `metadata.test.mjs`: 16 modeled fields × 16 substitutions, 11 response roots, 9 non-object/object format-element cases 80 isolated classification-signal substitutions and 3 interacting size/height pairs. Each successful response goes through background writes and popup StrictMode rendering. Complete stored values and DOM retained, including unknown fields and neighboring valid fields. Every result compares old and working implementations exactly. |
| Cache | Background TTL ages -1/0/1/300000/300001; popup -1/3600000/3600001; backward clocks; ready/error/pending; selected-field substitution matrix; raw unrelated objects; pruning of old numeric/string/boolean timestamps; duplicate URL first-tab ownership; concurrent whole-map lost updates. Reads include complete returned values in the main recording harness. |
| Root storage shape | Absent/null/false/zero/empty string/true/number/string/empty array/array with null; background isolated traces and popup read/message/DOM traces. The recording storage keeps named array properties via structured clone; it does not claim Chromium serialization proof. |
| Failures | Isolated Node executes the complete frozen background and popup modules and captures intentional old unhandled rejections. Initial read, pending write, ready write, error write, detached icon failure, tab query, popup initial read and final read, and active non-string cached error payloads all retain their original boundary trace and error/UI outcomes. Engine text is retained in `fixtures/failures.json` with `engine: true`; comparison checks failure without requiring engine class/message. |
| Messaging | Synchronous undefined listener return for admitted and ignored messages, wrong discriminator, falsy URL and non-URL truthy string. Exact popup command object, send failure/non-Error fallback and final cache read. |
| Popup | Listener-before-query, actual bootstrap, first active/current-window tab, no tab/invalid/lowercase prefix cases, ready/error cache use, pending loading, retry bypass and storage notifications by area. Whole DOM and website anchor attributes retained. |
| Cleanup | StrictMode add/query/remove/add/query with one surviving listener; exact listener identity removal; retry removes/re-registers immediately; query and send suspensions expose older initialization continuing after release; root-absent startup. |
| Rendering | Working/loading, ready, invalid-page, generic error and connection error DOM; title/duration/thumbnail; video, audio, hidden-other count and empty formats; all table cells/classes and website link attributes. The synchronous pre-effect Idle markup is pinned with the actual component and React server renderer; the mount-effect Loading frame is pinned with React DOM. |
| Handoff | Recording-only `vidbee://` and encoded download assignment; empty URL guard, assignment failure, no retry after failed launch, 1999/2000 ms boundary and retry continuing after another retry. The unreachable empty-URL guard and direct assignment failure are supplementary verbatim extracted control declarations rather than deep application imports. |

Pure engine failures outside declared types require only failure from the working helper; their historical engine text remains in the old fixture. The metadata boundary matrix retains exact old rendering failures because section 9 explicitly identifies these external-data differences. No blanket malformed-data waiver is implemented: the present working result must equal the old result for each case.

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

## Validation receipts

The final extension suite passed 40 consecutive verification runs: ten each from the repository root and package directory under `TZ=UTC` and `TZ=Asia/Tokyo`. Every run reported 74 passing tests. The four independent series ran concurrently; measured suite durations were 11.20–16.14 seconds under that load. A second checkout-path copy without git metadata passed the entire forced root suite (579 audit tests, 14 Turbo tasks including all 74 extension tests, checker tests and final review/loopback tests). Existing db tests retain their expected skipped driver cases.

`bun run check`, `bun run deps:check`, `bun run port:check`, the original extension compile and WXT build pass. The ratchet reports 12 ported configurations and zero violations. The executable source/assets/configuration diff is empty, and all 19 WXT output files have identical SHA-256 hashes across rebuilds. No absolute home path occurs in the new worktree files.

The exact `TURBO_FORCE=true taskset -c 0-1 bun run test` retry passes the entire root gate with all 74 extension tests and 14 successful Turbo tasks. The first final stress attempt timed out the unchanged db 512-subscription-column-combination test at 5055 ms against its 5000 ms default; Turbo cancelled remaining packages. The successful exact retry completed the borrowed/Node versions in 1153/926 ms. No db test timeout was changed. This intermittent existing timeout remains an OWNER-REVIEW candidate.

Full command results, repetition receipts and proof boundaries are recorded in the lane `HANDOFF.md`. No application was launched, no real request was sent, and no protocol handler was invoked by these tests.
