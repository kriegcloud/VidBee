# Phase 8 real Chromium extension proof

Progress:

- [x] Built the untouched archived extension and the rewritten extension.
- [x] Implemented and documented the independent offline browser worker.
- [x] Completed every scenario old/new five consecutive times, including rendered format rows.
- [x] Classified every paired difference; retained both complete recordings.
- [x] Admitted two stable new documents; retained both values for 18 exclusions.
- [x] Ran the repository gates and attempted the complete existing golden suite.
- [ ] Complete existing golden suite green: two out-of-scope CLI mismatches remain.
- [x] Browser parity resolved under section 9: final-extension rerun has only declared changes and recorded instability; raw selector exits remain 1 (see rerun below).
- [x] Recorded the handoff, reproducibility issue and proof limits.
- [x] Reran all browser scenarios five times on the final extension; both admitted documents remain equal, with the same 18 unstable exclusions.

The measurement work is complete. **This is not a green merge recommendation.**
The brief reserves extension fixes for the orchestrator and excludes `apps/cli`;
neither application was changed by this lane. The tree remains dirty and unstaged.

## Final browser evidence

The authoritative matrix is `final-five-formats/results.json` in lane scratch.
Each of its five consecutive runs completed 20 observations for each build:
**200 observations and 180 PNG screenshots**, with no capability skips or signals.
Every selector exits 1 because strict parity retains the reported header spelling
difference. A completed scenario observation is not a parity pass.

| Run | Old observations | New observations | Selector exit | Signal |
| --- | ---: | ---: | ---: | --- |
| 1 | 20 | 20 | 1 | null |
| 2 | 20 | 20 | 1 | null |
| 3 | 20 | 20 | 1 | null |
| 4 | 20 | 20 | 1 | null |
| 5 | 20 | 20 | 1 | null |

The six observation-harness files stayed byte-identical throughout that matrix:
SHA-256 `17f428a64608b0ed9f8a84c8fd7fdb5d4de4b4ce2b969fcd3f71ac8e4751b1d3`.
`browser-final-formats-audit.json` independently checks all ten capability
receipts, all 200 observations, 180 screenshots, real popup query inputs/results,
bodyless token POSTs, browser-supplied Origin and extension headers, light/dark
and reduced-motion results, 360-pixel/no-overflow success layouts and unchanged
tracked worker-resource counters after popup closure.

The scenarios cover trusted unpacked identity and worker availability; the real
action popup's own active/current-window query; token exchange; successful
metadata and rendered 180p format rows; packaged HTTP 500 and stored error;
cache reopening; connection failure; safe Retry recovery; worker-API storage
serialization of null, false, zero, empty string, number, true, string, empty
array and null-containing array roots; document closure; keyboard focus;
light/dark and reduced motion; and worker termination/recreation with listeners
and persistent cache. Worker termination uses CDP `Target.closeTarget`; a
worker-global marker must disappear after restart, the runtime identity must
match, `onMessage.hasListeners()` must be true, and the real action popup must
reopen and render the cached result.

The initial unlabeled generic HTML fixture reached Ready but rendered “No
compatible formats.” That earlier five-run matrix is retained as narrower proof
and is superseded. The authoritative selector adds source width/height/label to
its own disposable HTML only. The [vendored HTML5 parser](../../../vendor/yt-dlp/yt_dlp/extractor/common.py)
consumes these attributes. Both builds now render the actual 180p table row;
the worker asserts it. Existing shared fixtures and golden documents are unchanged.

## Parity classification

Every final run retains full old/new recordings, raw requests, responses,
queries, storage, DOM, accessibility and PNGs. Each `parity-review.json` binds
its complete, ordered classification to the SHA-256 of that run's difference
list. Classification was performed in this session; independent review remains
the orchestrator's responsibility. No separate agent or reviewer was started.

| Observation | Classification and evidence |
| --- | --- |
| Unknown producer fields disappear from newly written metadata, including format `abr`, `aspect_ratio`, `audio_ext`, `dynamic_range`, `format`, `http_headers`, `protocol`, `url`, `vbr`, `video_ext` | Section 9 row **Unknown metadata fields**; 60 repeated leaf observations per run. Valid modeled dimensions/ID remain compared and equal. |
| Optional modeled null fields become omitted | Section 9 row **Null modeled metadata field**; 18 repeated leaf observations per run. No blanket exemption for neighboring valid fields. |
| Nine seeded non-record roots stop at the initial read in the new build; old operations and cumulative request/icon history differ | Section 9 row **Present non-record storage root**. Exact old/new storage and traces are retained, including browser array serialization. |
| `X-VidBee-Extension` becomes `x-vidbee-extension` on actual requests; contents are equal | **Reported undeclared wire difference.** No section 9 row declares header spelling changes. HTTP field names are case-insensitive, so no interoperability failure is established, but exact recorded-header parity fails. All 918 repeated leaf instances per run are this same spelling difference, not 918 separate functional bugs. |
| Format response `http_headers["User-Agent"]` changes | Observed vendored producer randomness, already explained by the existing design/phase-8 API exclusion. Both exact values remain retained; this worker does not broaden the existing User-Agent normalizer. |
| Complete packaged metadata-failure Error stack changes at pipe/process closure | Existing producer instability, with both complete strings retained. Status/error semantics remain compared. |
| Metadata-failure width/screenshot sometimes differ | **Unstable in both frozen builds:** old widths 360, 360, 360, 375, 375; new widths 360, 360, 375, 360, 360. Corresponding hashes and PNGs are retained. This observation is disqualified, not normalized or attributed to the rewrite. All explicit light/dark/reduced-motion success-layout checks remain 360 pixels. |

The final per-run classified leaf counts are:

| Run | Unknown fields | Null fields | Non-record roots/history | Producer/render instability | Header spelling instances |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 60 | 18 | 238 | 48 | 918 |
| 2 | 60 | 18 | 187 | 48 | 918 |
| 3 | 60 | 18 | 247 | 39 | 918 |
| 4 | 60 | 18 | 248 | 28 | 918 |
| 5 | 60 | 18 | 247 | 21 | 918 |

No other undeclared difference remains in this matrix's classification. The
header difference is reported rather than fixed, as the brief requires.

## Stable documents and exclusions

Only these new documents are identical across all five authoritative runs:

- `extension-browser--keyboard.json`
- `extension-browser--document-worker-cleanup.json`

The other 18 observations remain receipts only. Their first differing field and
both exact values are listed in [the exclusions](8-extension-browser-exclusions.json).
The full differing documents remain in the final run's `browser-stability.json`.
Dynamic storage URL keys, encoded fixture ports, randomized metadata headers,
complete error stacks and rendered loading/error states are not silently erased.

The cleanup document characterizes **post-attachment instrumented API counters**,
not an absolute count of every initial worker listener or a garbage-collection
proof. The first worker can predate attachment. Counter equality proves no
additional tracked registration/timer remains across the observed popup closure;
target destruction and the restarted worker's native listener availability are
checked separately. Broader heap/GC leak proof is not claimed.

The admission helper requires five complete runs and either equal parity or a
complete digest-bound classification naming declared section 9 rows, reported
defects or observed instability. Characterization admission does not mark the
implementation parity gate green. The selector continues to compare admitted
documents and continues to fail on strict old/new differences.

## Provenance and safety

The integration start is `223e0d3f1554a8bd1716b8387704c022793095ae`.
The pre-port source was archived from `main` at
`9dab889b0b1d5328721802d65699a5f8593bf2e2`. All 25 tracked extension source files
were compared byte-for-byte with git after building and remain unchanged.

Initial archive installs failed because the inherited Bun cache was outside the
writable sandbox. Explicit scratch temp directories alone did not solve it.
Using the writable Bun cache completed an isolated, frozen-lockfile, offline
install of 1,095 packages. Archive-only developer lifecycle hooks were skipped
because the archive has no Git metadata; the ordinary archived
`bun run build:extension` succeeded. All **19 emitted files match every byte**
of the earlier baseline used in the browser recordings. See
`old-isolated-build-proof.json`. The initial linked-dependency build and failed
install receipts remain distinct. An intermediate install followed the shared
dependency link and reran the compiler patch; the worktree dependency links were
restored and final gates rerun. The disk-backed archive checkout was removed;
its identical built extension remains at `baseline-extension/` in scratch.

The new extension initially could not build because `Extension.logging.ts` was
absent. It later appeared externally in the shared tree; this lane did not
create or edit it. It is ignored by `.gitignore`'s `*.log*` rule and absent from
HEAD. The successful build depends on its SHA-256
`7cbf2cb409730afb77ee71f2f44b27caef6cd5e3a086fd42b1929b8b481fa275`.
**The orchestrator must include this source safely before a clean-checkout build
can reproduce the new artifact.**

Every browser uses a disposable user-data directory, scratch HOME and isolated
XDG directories inside the existing offline namespace. Both Chromium version
output and CDP identify `157.0.8103.79`; actual unpacked loading and worker-side
`chrome.action.openPopup({ windowId })` both pass. An owned Xvfb display provides
the real popup. Handler discovery must exit successfully with no `vidbee`
handler. No Open Client/Download control, protocol URL assignment, protocol
registration or owner browser/profile/application was used. Cleanup targets
owned processes started with the scratch profile. No request leaves the
loopback-only namespace.

The full raw AX tree remains in receipts. Its stable projection keeps complete
semantic names/properties and omits transport node IDs and duplicate InlineTextBox
line-wrap fragments; complete names receive exact known-root replacement.
Stored runtime `fetchedAt` and token query values are normalized. Encoded fixture
ports remain literal, as in the earlier phase-8 exclusion. No existing golden
normalizer, application rule, diagnostic or suppression was changed.

## Gates and unresolved proof

All heavy commands ran one at a time under Node `v22.23.4` and Bun `1.4.4`.
Repository check/test/dependency/ratchet gates passed; final-state receipts and
exit codes are indexed in the scratch handoff. The full existing golden command
compared **459 primary documents with two failures**, then stopped before the
four restart documents:

- `cli-additions/reserved-typo`: expected `unknown VidBeep flag: --vidbee-wiat`,
  got `unknown VidBee flag: --vidbee-wiat`. Current CLI source says VidBeep;
  its existing tracked distribution still says VidBee.
- `cli-additions/local-memory-wait`: expected `startedAt` timestamp is absent;
  expected array `cookieSources` is null.

Both full expected/actual documents are in `full-golden-mismatches.json`.
`apps/cli` and every existing golden remain unchanged. The brief excludes CLI
work, so these are handed back rather than repaired or re-recorded.

No safe owner-storage snapshot was supplied or opened, so persisted real-data
schema proof remains missing. Hosted CI, remote extraction/authentication,
remote thumbnails, store installation, Firefox trusted-origin behavior,
Windows/macOS protocol handling and a complete heap-leak proof are not established
by this offline Linux measurement. Independent review and publication belong to
the orchestrator.

Final-state gate receipts:

| Command/proof | Exit | Result |
| --- | ---: | --- |
| `bun run check` | 0 | 11 check tasks; 16 ported configs, zero violations |
| `bun run test` | 0 | 579 audit tests; 15 Turbo tasks; 167 extension tests; 294 browser-capture compatibility tests; 110 final harness/review tests |
| `bun run deps:check` | 0 | No syncpack issues |
| `bun run port:check` | 0 | 16 ported configs, zero violations |
| Focused browser harness Vitest | 0 | Nine tests |
| Archived independent install/build | 0 / 0 | Developer lifecycle hooks skipped in the Git-less archive; all 19 build files byte-identical |
| Current extension build | 0 | Uses the externally supplied ignored logging source described above |
| Full existing golden suite | 1 | 459 primary comparisons, two CLI mismatches; four restart comparisons not reached |
| Five browser selectors | 1 each | Both builds complete all scenarios; reported header spelling keeps strict parity non-green |
| Browser final audit/admission | 0 | 200 observations, 180 screenshots, two stable documents, 18 exclusions |
| All-suite DNS audit | 0 | 56 logs from 28 owned suites, no unexpected hostname |
| Scope/privacy/integrity audit | 0 | All 485 existing goldens byte-identical; CLI, extension source and lock unchanged; index empty; no authored absolute home paths |

The packaged baseline `app.asar` remains
`c7e7945ebcea629965cfd67c5fef5894618fda008a11a63680eb0c83c69d8490`.

## Rerun on the final extension

This section supersedes the earlier header-spelling blocker for the browser
proof. Historical sections above describe the earlier integration and are
retained. The final-extension integration is
`46a6e4c968cee6cda492e5cdab0a8f7b97cbb117`, including the review fixes and the
section 9 **Request header name case** declaration. No extension or CLI source,
harness, admission rule, normalization or golden document was changed in this rerun.

Both extensions were rebuilt under Node `v22.23.4`, one heavy job at a time.
The old source was freshly archived at
`9dab889b0b1d5328721802d65699a5f8593bf2e2`, the original pre-port `main`
revision, installed independently with a frozen lockfile, offline resolution and
copy backend. Developer lifecycle hooks were skipped in the Git-less archive;
the ordinary build script ran. All 25 tracked archived extension files remained
unchanged, and all 19 output files match the previous baseline byte-for-byte.
The current build also emits 19 files and succeeds with the tracked
`Extension.diagnostics.ts`; the former ignored logging-source blocker is
resolved in this integration.

The build digests below are SHA-256 over the JSON-serialized, path-sorted
`{path, sha256}` file inventory. Complete inventories and both source revisions
are retained in lane `8-ext-browser2/build-manifests.json`.

| Build | Inventory SHA-256 |
| --- | --- |
| old | `8ae8858da8c732273d249e718abad84bb1e7793c6e79f1338eb6b2597661d7b6` |
| new | `3103a784339a51112dbf1f477bb042cf0dab30d126a59f271e68adb796fa541b` |

The authoritative receipts are `8-ext-browser2/final-five/results.json`.
Chromium `157.0.8103.79` completed every required scenario for both builds in
each of five consecutive runs: **200 observations and 180 screenshots**, with
no capability skips or signals. Every suite retains full raw recordings and
`run/extension-browser/parity-review.json`, bound to the SHA-256 of its complete
ordered difference list. `evidence-audit.json` verifies capabilities, actual
popup tab queries, rendered 180p rows, wire token headers, light/dark reduced-motion
layouts at 360 pixels, and equal post-attachment cleanup counters.

| Run | Suite under `final-five/` | Old/new observations | Selector exit | Signal |
| --- | --- | --- | ---: | --- |
| 1 | `run-1/suite-HuslUr` | 20 / 20 | 1 | null |
| 2 | `run-2/suite-Jq96TM` | 20 / 20 | 1 | null |
| 3 | `run-3/suite-ako5Dn` | 20 / 20 | 1 | null |
| 4 | `run-4/suite-BkOVsu` | 20 / 20 | 1 | null |
| 5 | `run-5/suite-UROoVp` | 20 / 20 | 1 | null |

Every paired difference has one of the existing classifications. The header
spelling now uses **declared-change**, section 9 **Request header name case**.
No new difference or reported defect was found. Repeated leaf counts are:

| Run | Unknown fields | Null fields | Non-record roots/history | Header name case | Producer/render instability | Reported defects |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 60 | 18 | 237 | 918 | 29 | 0 |
| 2 | 60 | 18 | 236 | 918 | 48 | 0 |
| 3 | 60 | 18 | 235 | 918 | 37 | 0 |
| 4 | 60 | 18 | 248 | 918 | 56 | 0 |
| 5 | 60 | 18 | 238 | 918 | 48 | 0 |

The reviewed browser-parity obligation is resolved: all remaining differences
are declared changes or recorded instability. The unmodified strict selector
still exits 1 and writes `review-required` whenever any raw difference exists;
it does not consume the later review classifications. These exits are retained
honestly and are not scenario failures or a claim of byte-identical recordings.

Both admitted documents, `extension-browser--keyboard.json` and
`extension-browser--document-worker-cleanup.json`, compare equal to their
checked-in goldens for **old and new in every run** (20 direct comparisons).
The admission helper, run without `--update`, finds exactly these two stable
documents and the same 18 unstable observations. No new admission candidate
exists and no golden was written. Full differing documents remain in run 5's
`browser-stability.json`; `verification.json` indexes each exclusion's first
difference. The existing exclusion document remains historical evidence.

The instability reasons remain the recorded literal storage URL keys and encoded
fixture ports, randomized producer User-Agent headers, complete process/pipe
error stacks, and loading/error render timing and screenshots. In this matrix
metadata-failure widths are old `360, 360, 360, 375, 360` and new
`360, 360, 360, 360, 360`; the retained hashes are the same two historical
360/375-pixel PNG hashes. Explicit success layouts remain 360 pixels.
No broader normalization or instability exemption was introduced.

All five suite DNS audits pass (bootstrap and run logs: ten logs, no unexpected
hostnames). Browsers and the packaged fixture use disposable scratch HOME/XDG
and profiles inside the loopback-only namespace; isolated handler discovery
returns no `vidbee` handler. No unsafe control or protocol URL was activated.
The owner application and profile were not touched.

Rerun gates and receipts (all paths relative to lane `8-ext-browser2/`):

| Command/proof | Exit | Receipt/result |
| --- | ---: | --- |
| Archived independent install/build | 0 / 0 | `install-old.log`, `build-old.log`; 19 exact baseline outputs |
| Current extension build | 0 | `build-new.log`; 19 files |
| Five browser selectors | 1 each | `browser-1.log` through `browser-5.log`; raw differences require review; all scenarios complete |
| Classification / evidence audit / admission / verification | 0 each | `classify.log`, `audit.log`, `admission.log`, `verify.log`; zero new findings; no `--update` |
| `bun run --cwd apps/extension test` | 0 | `extension-test.log`; 11 files, 230 tests |
| Browser harness Vitest | 0 | `harness-test.log`; one file, nine tests |
| `bun run check` | 0 | `gate-check.log`; 11 check tasks; 16 configs, zero violations |
| `bun run test` | 0 | `gate-test.log`; 15 Turbo tasks, 230 extension tests, 294 compatibility tests, 110 final harness/review tests |
| `bun run deps:check` | 0 | `gate-deps.log`; no issues |
| `bun run port:check` | 0 | `gate-port.log`; 16 configs, zero violations |

`commands.json` records exact argv, cwd, available memory, exit code and signal
for every launched command. The disk-backed archive checkout was removed after
verification; its exact output remains at `baseline-extension/`. A host restart
interrupted documentation closeout after all commands above had returned and
persisted their completion records. No build, browser run or test was still
running; a post-resume evidence audit passed again.

This rerun does not re-establish the complete golden suite, its CLI/restart
coverage, owner real-storage compatibility, hosted CI, remote-site or other-platform
behavior. The earlier full-suite failures remain historical open proof,
requiring the orchestrator's current full gate. No source or golden fix was
attempted. The lane handoff indexes all receipts and remaining proof limits.

The shared supplied desktop package changed externally after the five browser
runs: its current `app.asar` hash is
`7392be95a29a633586de6f22f82e96aadd16ad68d029187c7f7419c7c180b7b4`,
with modification time after run 5. This lane did not record an at-run desktop
package hash. The earlier report's packaged hash is historical, not a verified
identity for this rerun. The extension artifact hashes and complete browser
receipts remain verified; exact reproduction of the former desktop input is
not established. See lane `packaged-provenance-limit.json`.
