# Phase 5 details: characterization, process contracts and verification receipts

The record behind [5.md](5.md), with the export/consumer inventory checked against the tree. Design decisions and the two independent design reviews are in [design/downloader-core.md](../design/downloader-core.md).

## Implementation and compatibility boundary

The strict package owns schemas, tagged errors, pure calculations and Effect implementations. The temporary unported compatibility package owns old callable signatures, synchronous Node capabilities, EventEmitter wiring, original-error reconstruction and live zod roots. It depends on the strict package, never the reverse. The application continues to use compatibility process adapters.

Core metadata methods were ported last under the declared metadata change. `getVideoInfo`, `getPlaylistInfo` and `startPlaylistDownload` are now direct compatibility forwarders to `Downloader`; no original metadata/retry/selection implementation remains in those methods.

Models preserve mutable fields/arrays and optional explicit undefined. Inventory codecs strip unknown keys at every rewritten object level; task-queue's open persisted data contract is separate. `DownloadFiles` preserves BOM and UTF-8 replacement, false-on-failure existence probes, creation-only modes, explicit write/rename ordering and failed-rename residue. Known-items writes overwrite directly. Host capabilities retain synchronous environment assignment and discovery order; browser path calculations use the supplied target platform.

Stateful facades have their own warmed runtime; stateless helpers share module runtimes. Queue adapters borrow the existing host queue and do not create a second queue/database. Shared `runLegacyPromise` and `runLegacySync` live at `@vidbee/task-queue-legacy/runtime`: `runFork` exit observers settle promises without extra handlers, and `runSyncExit` handles synchronous calls. The queue keeps its original error mapper and runtime ownership. Downloader callbacks synchronously re-enter the queue runtime and the reverse launch synchronously enters downloader; owned immediate-start continuations handle work that suspends.

## Characterization suites

Before the port, unchanged source at `b5e2b7a` passed 238 added cases: 155 Vitest and 83 pinned-Node, ten consecutive runs each. The following files now live under `packages/downloader-core-legacy/test/`; their old assertions remain except for the declared wrong-scalars case listed below.

| Suite | What it pins |
| --- | --- |
| `characterization-arguments.test.ts` | Exact JSON argv for all four yt-dlp builders and gallery runtime arguments; defaults/empty/auth/config/proxy settings, subtitle/embed switches, filename styles and audio naming, container choices, format/audio/multistream selection, direct-media exceptions, sections, output override/sanitization, caller-ordered rate/retry overrides, source-specific behavior; injected platform flags; every browser's platform path branches; home/FFmpeg/quoting/cookie helpers; complete guidance errors |
| `characterization-executor.test.ts` | Public yt-dlp injected-emitter seam; immediate state after every progress/std/processing/close; no-child progress/error, nonzero/null close, callback exception identity, preflight catch boundaries, custom/raw/default argument precedence and FFmpeg insertion; settings Promise markers/cancel race/synchronous throws; repeated cancel/pause/timer replacement; subtitle replacement attempt; persistent path/format/subtitle signals and 8192-character tails; split UTF-8 replacement; stream aggregation, sidecars and false positives; every saved-path pattern |
| `characterization-discovery.test.ts` | Public initialization with controlled host discovery: exact which/where commands and stdio-only options, first nonempty stdout result, env/bundled/system precedence, target-platform bundled names, FFmpeg sibling/env-file/env-directory/macOS fallback, chmod-error swallowing, shell empty/error behavior and constructor-time JS runtime discovery |
| `characterization-network.test.ts` | Retry exhaustion and original Error/non-Error/sleep rejection identity; retry microtask sequence; short-link HEAD/manual redirect/User-Agent/signal options, status boundaries, timeout default/override and fail-open input preservation; wrapper constructor resolution/error |
| `characterization-persistence.test.ts` | Both stores' filenames, reads and validation, missing/expired/wrong-shape/malformed/BOM/invalid UTF-8 inputs, unknown-key stripping, identity differences, mutation on read, cache-before-save; exact directory/write/rename sequence and requested modes; unchanged existing modes and failed-rename residue; injected permission error policies; direct known-items write/order/duplicates/no-op/no-directory creation |
| `characterization-spawn.test.ts` | Public mapper/inspector/executor paths with controlled raw streams: explicit commands/options/env, 10-minute deadlines, generic 32-Mi-character versus Instagram 64-Mi-byte limits, 4096-character diagnostics and 1-Mi-character carries, final-line delivery, checkpoints and duplicate promises, cancellation signals; gallery std-before-progress, unknown protocol ticks, asynchronous verification and post-stat cancellation, pause/grace timing and stdout-only final-carry flush; all nine routed gallery task argv; insertion-order eviction/empty-read bypass; Windows generic PID-only branch |
| `characterization-enqueue.test.ts` | Instagram cap/get/add/public-settlement sequence and exact task IDs/options, category dedup/order, expired/not-ready/invalid input and opaque queue errors, failed/cancelled retry-then-add and active/completed exclusion; paginated group-cap restore; social enqueue/options/category errors, Promise markers and restored caps |
| `characterization-admission.test.ts` | Original admission rejection identity, map/preview release and cleanup on builder failure, aborted admission, unsupported-map error, and preview's early-admission scratch leak |
| `characterization-process.node.ts` | Real Node executable and installed-wrapper oracles: zero/nonzero/signal/missing executable/cancel/TERM-ignore traces for both executors; full callback payload JSON, error/close conversion and exact formatted error text, full wrapper stderr, progress/event/stdout order, chunk-local parsing and callback stop, AbortError/killed state for second-argument/pre-aborted signal; cancellation inside progress; descendant-held pipes after leader exit |
| `characterization-profiles.node.ts` | Every generic mapping platform's public manager argv and repeated replacement behavior; real admission/release; Redgifs async final Unicode item/null at stdout end before leader exit, finally TERM, syntax/primitive/array/wrong extractor/ID/title/long-line filtering and delayed CRLF; active exclusion/get clone/stop; X/TikTok aggregation/replacement/incremental known IDs and `mapAndWait` prefix; exact pinned-Node JSON/SyntaxError/ZodError message and issue snapshots |
| `characterization-core.node.ts` | Metadata command and permissive field defaults, wrong scalar and Infinity escape, syntax/null/formats-shape/empty-output errors, synchronous initialize environment assignment and discovery failure; download success/nonzero/active and pending cancel, terminal event order, FFmpeg insertion; playlist default/range/reversed/negative/ID-selection behavior |
| `characterization-raw-boundary.node.ts` | Controlled raw Node child through the actual installed wrapper or direct gallery path and public executor callbacks; immediate observations after stdout/stderr/error/close; every applicable callback's throw identity/location and cancel re-entry; Core raw metadata result/settlement/errors and EventEmitter throw; POSIX tree fallback versus group-only policy and exact forced Windows taskkill flags, including Instagram |

The existing suites continue to cover playlist projections, social schema defaults and URL routing,
platform-specific assets, Instagram scan serialization/cooldown/stop/restart/incremental enqueue,
gallery completion and social manifest verification, VSCO cookie-refresh retries and cancellation,
dedicated-session isolation and active X-post exclusion. These assertions were not rewritten.

## Spawn-site traces and oracle selection

| Existing spawn site | Oracle/trace |
| --- | --- |
| Synchronous discovery | Public Core initialization pins exact `which`/`where` command/options, stdout selection, env/bundled/system precedence and errors, including constructor-time JS runtime lookup; no private helper export added |
| Core metadata wrapper | Node real executable metadata cases plus controlled raw stdout/error/close and Promise markers; argument builders have exact snapshots; full stdout is retained |
| Core download wrapper | Real Node success/nonzero/cancel/queue cases; terminal `history → task → queue`; callback failure and active-state leak; FFmpeg insertion |
| yt-dlp executor wrapper | Real process complete callback JSON and controlled raw child → real wrapper → public executor → callbacks immediate-state traces; injected `spawnFn` remains a separate direct observation seam |
| Subtitle replacement child | Injected close-only retry with stripped flags, opt-outs, one spawn event and unchanged attempt; real wrapper nonzero remains an error and does not enter this close-only recovery |
| Gallery executor | Exact argv for all nine routed kinds and inherited-env PATH replacement; raw callback/order/error/finalization/cancel/verification traces and real Node terminal scenarios |
| Instagram inspection | Exact inspection argv and raw options snapshot; checkpoint/carry/byte-limit/deadline/cancel cases; existing real serialization/cooldown/restart/stop fixtures |
| Generic mapping: Facebook/Pinterest/Threads/Snapchat/VSCO | Exact recorded public-manager argv per platform, raw timeout/limit/tail/final-carry and POSIX/Windows target tests; Facebook reels also retain their existing `-J` fixture and exact playlist-builder matrix |
| Redgifs | Exact argv, explicitly selected Node streaming/readline fixtures, stdout-end-before-exit and finally-TERM observations; manager errors retain Node's null-traversal message |
| Delegated Windows tree control | Injected platform and mocked host command pin `taskkill /PID <pid> /T /F` for both TERM/KILL requests; generic mapper remains PID-only |

All executable fixtures use the absolute real path selected by `fixtures/node-runtime.ts`. It reads
`.node-version`, resolves Node from PATH and fails unless the version is 22.23.4. Node-specific
suites themselves assert the runtime. Existing ambient Node/Bun shebangs were replaced, including
both nested launcher/grandchild calls. Bun hosts Vitest; it does not impersonate a Node oracle.

`process-*.json`, `raw-*.json`, `map-*.json` and Vitest snapshots retain complete payloads. Only
fixture paths, PIDs and injected timestamps are normalized. The real two-stream process fixture
waits for a parent-observation acknowledgement file before writing stderr; it does not assume that
independent stdout/stderr pipes naturally preserve write order. Controlled raw traces separately
pin synchronous event delivery and original chunk boundaries.

The native process fixture resolver scans PATH for an executable matching `.node-version` (22.23.4), including when an earlier shim fails or reports another version. The earlier machine-specific fallback was removed. Compatibility Node suites verify the PATH-selected executable before using it for fixtures and grandchildren; select the pinned Node first for those suites. Bun only hosts Vitest. Missing pinned Node is a prerequisite failure. This is local fixture portability evidence, not hosted CI.

## DownloadProcess native differences and phase 9.1

`ProcessSpec` makes command, argv, cwd, environment inheritance, detachment, window hiding, stdio and optional AbortSignal explicit. `ProcessSink.emit` and the abort Effect are capabilities. Compatibility listeners synchronously execute the sink; native streams drain once each while observing exit. `ProcessRun` distinguishes owned-child, PID-only, group and tree signals. `ProcessRequests` adds non-waiting requests beside `ProcessControl`, leaving queue recovery `kill` unchanged.

| Native difference | Implemented result and cutover obligation |
| --- | --- |
| Asynchronous acquisition/delivery | Stock spawning waits for acquisition; compatibility launches immediately and enters sinks before Node listeners return. Phase 9.1 must remove or declare timing differences. |
| No child on acquisition failure | `NativeSpawnFailure` contains the actual PlatformError and has no PID/spawn observation; compatibility can emit spawn -1, error and close. |
| Exit before pipe drain | `nativeExit` records exit; completion follows stream drain. Descendant-held pipes can delay completion. |
| No raw signal/killed/child-error fields | Native supplies numeric exit or actual PlatformError; no raw observations are fabricated. Site cancellation wins at its defined checkpoints. |
| Automatic nonzero cleanup | Stock spawner may close descendants after a nonzero leader; compatibility retains them until site cancellation. Real fake-executable tests pin both. |
| Scope cleanup | Each attempt owns its scope through completion; closing it invokes stock finalization. Compatibility adds no universal cleanup. |
| Detached/window defaults | Every site's command explicitly supplies both settings rather than inheriting stock defaults. |
| Rechunking | Stock streams can combine chunks; compatibility keeps original chunks and per-chunk decoding. Wrapper regex and split UTF-8 behavior remain distinct. |
| Non-waiting signals | Separate request fibers preserve acknowledgement before target/control-command termination. Windows PID omits `/T`; tree retains `/T /F`. |

| Site | Zero/nonzero | Native failure or acquisition failure | After site cancellation |
| --- | --- | --- | --- |
| Core metadata | Nonempty output decoded; nonzero wrapper-equivalent error; existing retry predicate | Metadata failure retains PlatformError/message; acquisition has no process | No cancellation API at this site |
| Core download | Existing completion/progress/path or numeric wrapper-error task failure | Task error; release active state and advance queue; acquisition has no spawn | Cancelled, including acquisition race |
| yt-dlp initial/replacement | Verification on zero; numeric wrapper-error on nonzero, no new close-only recovery | Error finish, null exit code, original PlatformError message; acquisition has no spawn/second spawn | Cancelled at existing checkpoints |
| Gallery executor | Existing protocol/manifest/file finalizer and actual nonzero code | Error finish with null exit code and PlatformError message; acquisition has no spawn | Cancelled, including post-stat verification check |
| Instagram | Existing checkpoint/document/category classification with actual numeric code | Internal HostFailure feeds unavailable/error-code summary and retains items/message internally | Cancelled summary/checkpoints |
| Generic JSON mapper | Existing complete condition or incomplete stderr/timeout/limit diagnostic | Incomplete error retaining output and PlatformError message | Incomplete/cancelled, no invented signal error |
| Redgifs | Complete after successful lines and zero; fixed incomplete diagnostic on nonzero | Incomplete error with PlatformError message; traversal/callback exceptions remain separate | Incomplete/cancelled |

Compatibility yt-dlp cancellation uses Node abort then tree TERM/KILL; gallery uses POSIX group TERM/KILL without PID fallback; generic mapping uses group KILL on POSIX and PID KILL on Windows; Instagram uses POSIX group/Windows tree KILL. Core and Redgifs retain child-only TERM without escalation. Tree requests can fall back from group to PID; bare PID/group policies do not gain start-time protection. Windows descendants after leader exit remain an OS proof gap.

Wrapper emulation parses each raw chunk independently, emits progress then bracket event then stdout continuation, keeps full stderr and original raw error until completion, and uses nullable code/actual killed state only on the raw path. Injected `spawnFn` emitters already carry wrapper observations: they do not require a child and are not converted twice. The installed wrapper remains the oracle. Redgifs instead streams UTF-8, follows readline CR/LF and delayed-CRLF behavior, flushes at stdout end, and delivers items/errors asynchronously before child close; null traversal retains its TypeError and finally TERM condition.

Real native executable tests cover both executors' zero/nonzero/signal/acquisition/pre-abort, post-stat cancellation, descendant pipes, cancellation racing nonzero and TERM-ignore. Injected native stream failures retain PlatformError messages and finish once. Six pinned-Node wrapper/emulation comparisons cover missing executable, pre-abort, abort in progress/std callbacks, nonzero/full stderr and success. Complete-facade raw observations and separate queue/downloader runtimes pin immediate state and held finish persistence. These finite matrices do not exhaust every combination.

## Export-entry disposition

P means the pure/type surface remains in the strict package. Every original subpath is also exported by the compatibility package; pure entries forward to native implementations or positional adapters. “Forwarder” below means no separate implementation is needed. The table covers the original entries; additional native companion exports expose the new models/services/layers.

| Entry | Strict package | Compatibility package |
| --- | --- | --- |
| `.` | P re-exports and domain types; native services/layers | `DownloaderCore`, callback executors, inspector, enqueue/restore functions, retry, short-link expansion, runtime-argument builder and host-dependent helpers below |
| `./browser-cookies-setting` | P: both functions and type | Forwarder |
| `./cookie-setup` | P except clock-reading helpers | `matchCookieSites`, `inspectNetscapeCookies` |
| `./cookie-browser-paths` | P: all four helpers; target-platform joining implemented with pure string functions | re-exports where needed |
| `./download-file` | P: calculations with single options objects for filename/path candidates | positional adapters |
| `./dzen-profile` | P | Forwarder |
| `./facebook-gallery` | P | Forwarder |
| `./filename-style` | P | Forwarder |
| `./format-preferences` | P | Forwarder |
| `./format-presentation` | P, including generic signatures | Forwarder |
| `./gallery-dl-executor` | routing/template predicates, constants, native layer | callback `GalleryDlExecutor`, `HostRoutingExecutor`, constructor option types |
| `./instagram-profile` | category URLs/constants, normalizer, inspection ID, native service | inspector class, enqueue/restore, `buildGalleryDlRuntimeArgs` |
| `./instagram-url` | P | Forwarder |
| `./format-selector` | P | Forwarder |
| `./schemas` | Effect schemas | retained zod dependency closure below |
| `./pinterest` | P | Forwarder |
| `./output-path` | P | Forwarder |
| `./audio-format-preferences` | P | Forwarder |
| `./subtitle-languages` | P | Forwarder |
| `./snapchat` | P | Forwarder |
| `./threads` | P | Forwarder |
| `./tiktok-photo` | P | Forwarder |
| `./tiktok-short-link` | predicate, domain types, native service | Promise expansion and injected-fetch option types |
| `./yt-dlp-args` | pure selectors/parsers/formatters with explicit inputs; types/constants | builders needing host state, subtitle skip selector, cookie normalization, implicit-platform wrapper, home/path helpers, retry, throwing wrappers where required |
| `./yt-dlp-wrap` | constructor-resolution helper, unchanged signature | import-time wrapper initialization for legacy roots |
| `./social-media` | P resolver/asset helpers, defaults and types | `SocialMediaOptionsSchema` |
| `./social-media-service` | domain types and native operations | Promise map/inspect/preview/download/restore functions and `writeKnownItemsFile` |
| `./social-profile-manager` | native service | synchronous class and options |
| `./mapped-profile-source` | P; exported dedicated-session platforms are an array, not a Set | Forwarder |
| `./onlyfans-profile` | P URL/site helpers, route data and structural types | live OnlyFans zod schemas and their dependency closure |
| `./fansly-profile` | P profile/site helpers and structural types | `FanslyCommandSchema` |
| `./vsco` | P | Forwarder |


Native `./types`, progress, model, error, service, layer and driver entries are listed explicitly in the manifest. The original `./yt-dlp-wrap` constructor-resolution helper stays pure; compatibility retains wrapper initialization and its constructor side effect. The filename sanitizer's native API is split into `sanitizeFilenameTemplate(template)` and `sanitizeFilenameTemplateWithFallback(template, fallback)` with a genuine dual-two-argument form; compatibility keeps the optional-fallback signature.

Retained zod roots are the three subscription enums, OnlyFans command/download/profile closure, `FanslyCommandSchema`, `SocialMediaOptionsSchema` and social inventory readers. Unused API/Instagram/WebAppSettings, Fansly aliases and social envelopes were removed. Native code has no zod/compatibility imports; the compatibility manifest retains the installed wrapper dependency.

## Consumer inventory

`git diff --stat main` and the current diff identify 17 external consumer source/test files with import changes. Mixed imports retain native pure values/types. The desktop bundler configuration is additional; manifests add compatibility for desktop, CLI, browser-capture, subscriptions-core and UI. The earlier design's 19-file estimate is superseded.

- `apps/cli/src/transport/local-client.ts`
- `apps/desktop/src/main/download-engine/args-builder.ts`
- `apps/desktop/src/main/ipc/services/browser-cookies-service.ts`
- `apps/desktop/src/main/lib/agent-media.ts`
- `apps/desktop/src/main/lib/command-utils.ts`
- `apps/desktop/src/main/lib/download-facade.ts`
- `apps/desktop/src/main/lib/extension-cookies.ts`
- `apps/desktop/src/main/lib/gallery-dl-manager.ts`
- `apps/desktop/src/main/lib/profile-subscriptions.ts`
- `apps/desktop/src/main/lib/social-profile-manager.ts`
- `apps/desktop/src/main/lib/task-queue-host.ts`
- `apps/desktop/src/main/lib/yt-dlp-info.ts`
- `apps/desktop/src/renderer/src/components/download/DownloadDialog.tsx`
- `packages/browser-capture/src/onlyfans-profile.ts`
- `packages/browser-capture/test/fansly-profile.test.ts`
- `packages/subscriptions-core/src/schemas.ts`
- `packages/ui/src/components/ui/social-media-dialog.tsx`


Desktop `electron.vite.config.ts` bundles both packages and adjusts renderer dependency optimization; `electron-builder.yml` excludes the bundled compatibility source package. Root Turbo filters, Biome scope and `test:audit` include the new split. No application caller adopts the stock native process backend here.

## Characterization assertions rewritten to declared changes

| Title | Before the port | After the port | Design item |
| --- | --- | --- | --- |
| `core metadata wrong-scalars: old scalar escape becomes decoded rejection` | Returns `{ id: 7, title: false, duration: Infinity, tags: ['x'], formats: [{ formatId: 'unknown', ext: 'unknown' }] }`, including explicit scalar equality assertions | Rejects with `Error("Invalid yt-dlp metadata.")` | 9.1 and decision 12.3 |

The old object and assertions remain directly above the new rejection as `// Before the port:` comments. Empty-object/default, argv, syntax, null and non-array-format assertions are unchanged. Additional native cases individually reject numeric ID, boolean title, infinite duration/view count, numeric format ID, boolean extension and infinite height. Primitive roots/format entries still box to valid defaults. Null root/non-array formats retain exact TypeErrors; legacy reconstructs original JSON syntax exceptions. Argument builders run on each retry: three attempts, two 1000-ms sleeps on transient failures. Range/ID precedence, empty playlists and media-kind admission order have direct native tests.

## Surprises measured before the port

1. **FFmpeg resolver throws escape `run`.** Unlike builder/binary/spawn failures, the resolver call
   is outside the executor's preflight catch. A synchronous `prepareSettings` throw also escapes
   by identity. A rejected settings Promise instead produces finish data.
2. **Cancellation before settings resolve emits neither spawn nor finish.** The pending handle
   acknowledges cancellation; resolving settings afterwards does not launch anything.
3. **Inventory identity differs.** Social loading checks body identity. Instagram loading accepts
   a body with a different `inspectionId` and profile username under a valid filename. Design
   the port retains this identity difference.
4. **Empty-category Instagram reads bypass cache capacity enforcement.** They can grow the cache
   beyond `maxCacheEntries`. A later completed scan prunes in insertion order; `get` does not
   promote an entry. Section 11's insertion-order statement alone is incomplete.
5. **Threads repeated identical asset records count twice.** Within-run aggregate replacement is
   retained; refreshing replaces the prior run rather than adding its counts again.
6. **Executor success is not queue success.** A yt-dlp zero close reports size-zero success when
   the file is missing. The queue applies its separate output-missing guard.
7. **Outputs can follow finish.** Controlled raw stdout after completion still produces std
   callbacks on both executors. Finish-once does not mean all later std events are suppressed.
   The port retains these traces.
8. **Callback throw locations differ.** yt-dlp finish throws synchronously from raw close. Gallery
   finish throws inside its async finalizer and its catch/finish-once guard swallows that exception.
   Gallery std/progress and yt-dlp progress/processing/std throws escape their synchronous emission.
9. **Core listener failure leaks active state.** Its first `task-updated` listener can reject
   `createDownload` after active state changes but before completion listeners bind. A later raw
   close does not clean up that entry. The port retains the
   catch location and this partial state.
10. **Preview admission rejection leaks a scratch directory.** Mapping's rejection cleans its
    directory; preview acquires outside its cleanup `try`. The tests remove their leaked fixture
    directories themselves after observing the behavior.
11. **Wrapper behavior is intentionally uneven.** Nonzero real close becomes formatted Error with
    null executor exit code; signal code is nullable; original raw error waits for close; a zero
    close can ignore a previously stored raw error. Event data retains its leading space. Split
    wrapper progress lines are not reassembled; executor chunk UTF-8 can become replacement text.
12. **Malformed Core metadata escaped types.** Numeric ID, boolean title and Infinity duration
    escaped before the port; `formats: {}` and `null` produce Node TypeErrors. The invalid scalar escapes are now the declared change; the TypeErrors stay.

The twelfth finding is implemented as the declared scalar rejection above; the preserved TypeErrors and all other findings remain separate from that change.

## Type fixtures and gate wiring

`test/fixtures/legacy-types.ts` freezes the old types with relocated imports; `legacy-declarations/` keeps the compiler-emitted declaration closure, including classes, options and inferred zod types. The fixture README records provenance. `src/public-type-compatibility.ts` checks 39 domain aliases both ways under the original compatibility optional-property semantics. This does not claim exhaustive signature equivalence for every old export.

The strict source configuration extends the root base; source and tests run patched tsrs and Biome. The unported sibling runs ordinary `tsc --noEmit` plus its scoped characterization configuration. Root `check` includes both, root `test` runs both Vitest sets and the compatibility Node audit glob. Bun hosts Vitest; pinned Node hosts Node-specific oracles. An exploratory all-old-tests compile exposed existing fixture typing issues in Instagram, Pinterest and Threads; those tests were not all added to the scoped characterization typecheck or suppressed.

`ProcessSink.abort` is an Effect value because a zero-argument wrapper fails strict `lazyEffect` TS377091. Native sanitizer separation resolves TS377101 without changing the old facade signature. Raw wrapper percent stays Unknown until the aggregator's existing type/finite checks; it does not weaken domain finite-number schemas. The HTTP ratchet now detects static/dynamic/CommonJS module loading while accepting ordinary protocol data; focused checker tests cover both. No diagnostic override or new allowlist entry was added.

Building resources made the old empty-PATH discovery-failure test find the new bundled executable. Its fixture now hides only the candidate basenames during that oracle; the rejection assertion and discovery algorithm remain. Installation used the allowed Bun cache with writable temporary directories after EROFS, and `--ignore-scripts` avoided rewriting shared hooks; no third-party version changed.

## Regressions caught and corrected during verification

The first packaged comparison caught `height<=null` for the best quality preset, failing remux and dependent queue snapshots. The selector again treats null as unlimited; exact tests cover every quality preset. The follow-up audit restored false cookie flags, falsy expiry handling, format-selector fallback, playlist rank fallback and Instagram metadata fallback. A separate old/native helper comparison passed 1,776 cases after correction. No golden changed.

Failure-identity probes corrected present-undefined host causes, distinguished native typed failures from callback defects/opaque objects, and preserved opaque retry rejections until the original predicate/settlement positions. Error identity tests retain undefined, null, strings, objects and injected tagged errors. Earlier discovery and runtime-fixture mistakes were corrected before the recorded green gate; failed receipts remain available without being treated as current failures.

## Independent implementation review

Independent sessions reviewed one concern each, and a second reviewer verified every finding.
Three verification passes followed the fixes. The tables retain each confirmed finding, including
separately counted overlapping findings F2/F10 and F11/F14. All 27 were resolved; none was waived.
These are defects found before this phase was installed. The separate review of already merged
ports is in [review-fixes.md](review-fixes.md).

### First-round findings

Paths in the proof column are test filenames in the downloader packages unless stated otherwise.

| Finding | Severity | Defect | Resolution | Permanent proof |
| --- | --- | --- | --- | --- |
| F1 | minor | Published CLI declared the bundled private compatibility package as a runtime dependency | Move it to devDependencies and refresh the lock | Manifest/catalog check and CLI build; the bundled import needs no registry package |
| F2 | major | Generator finally skipped failure cleanup, leaking admission and the Threads directory | `finalizeProfile` captures the body Exit under an uninterruptible mask and runs cleanup before raising it | `review-cleanup.effect.test.ts`; `review-lifecycle.node.ts` spawn/map/write/abort cases |
| F3 | minor | Windows single-root paths and drive-root basenames changed | Pure helpers follow pinned Node Windows semantics | `review-pure.node.ts` generated Node path comparisons |
| F4 | minor | Facebook reels rejected non-object JSON and changed parser errors | Decode JSON Unknown; retain old root normalization and original parser/TypeError transport | `review-lifecycle.node.ts` seven reels outputs, also run against old code |
| F5 | minor | Strict schemas lost defaults, URL/pattern/length constraints and refine message/path | Restore public boundary validators/defaults; keep input aliases distinct from decoded output | `review-schemas.test.ts`, full-schema fixture and SocialSource fixture |
| F6 | minor | Four data-last overloads dispatched as data-first | Cookie inspection uses argument type; three ambiguous helpers use strict options objects and compatibility positional adapters | `review-duals.node.ts`; cleanup helper both forms in `review-cleanup.effect.test.ts` |
| F7 | major | Native Core abort re-aborted its controller without signalling the child | Request child-only TERM and recheck after acquisition | `review-core-cancel.effect.test.ts` real pinned-Node TERM and early-cancel cases |
| F8 | minor | Subtitle fallback spawn throw used initial preflight classification | Send fallback HostFailure through finishError, retaining cancellation precedence and stderr classification | `review-lifecycle.node.ts` second-spawn throw, with and without cancellation |
| F9 | minor | Immediate traversal completed before active registration, leaving a stale busy entry | Track completion before publishing active entry; retain immediate synchronous prefix | `review-cleanup.effect.test.ts` two synchronous mapAndWait calls |
| F10 | major | Same skipped generator cleanup as F2, including defects/interruption | Apply failure-safe finalization to all five mapper wrappers | `review-cleanup.effect.test.ts` failure/defect/interruption and cleanup precedence |
| F11 | minor | Playlist JSON entry cast hid unknown URL fields and failure transport | Decode unknown fields before normalization; preserve external-data errors | `review-pure.node.ts` raw fields; reels lifecycle cases |
| F12 | minor | Social item event and other literal unions bypassed LiteralKit | Shared DownloadLiterals model and LiteralKit declarations | Strict checks, ratchet and source sweep |
| F13 | minor | NaN/null endIndex and null entryIds changed selection | Restore old truthiness and null-safe selection | `review-core-metadata.node.ts` four all-entry selections, also run against old Core |
| F14 | minor | Falsy playlist URL fields and TypeError messages drifted | Preserve successful scalar fallback and exact package-read URL/ie_key errors | `review-pure.node.ts` 144 URL/ie_key combinations |
| F15 | minor | Retry predicate received Schema text rather than the parser text it inspected | Host parser-message capability after JSON decode failure | `review-core-metadata.node.ts` three attempts and two measured one-second gaps, also run against old Core |

The initial exact-error sweep added engine-message guards beyond the required contract. Those
were subsequently removed: the 26-line LegacyMethod helper and a 15-line Node-error construction
loop, including 39 direct LegacyMethod use sites across 13 callers. This removal preserves natural
failures rather than emulating engine text. Exact exceptions remain for package-read Core metadata
null/formats shapes, playlist URL/ie_key fields, Facebook reels JSON, retry's inspected parser text
and Redgifs null JSON. The deliberately constructed wrapper-constructor TypeError is also exact.
The final oracle counts below supersede the initial 82-function matrices.

### Second-round findings

| Finding | Severity | Defect | Resolution | Permanent proof |
| --- | --- | --- | --- | --- |
| V1 | minor | Synchronous traversal changed map's returned snapshot from mapping to settled | Clone before the immediate fork while preserving immediate traversal start and completed flag | `review-cleanup.effect.test.ts` synchronous success/failure snapshot cases |
| V2 | major | Falsy format/audioFormat changed selectors or threw instead of falling back | Boolean gates preserve old branches without widening public types | `review-pure.node.ts`, pure fixture selector/settings fields |
| V3 | major | Falsy containerFormat incorrectly emitted format/remux flags | Restore old truthiness gate after the original nullish default | Pure fixture buildDownloadArgs field/pair cases |
| V4 | minor | Oracle replaced whole options objects, missed fields/nonempty arrays and ignored mutations | Rebuild from populated seeds, substitute every field, compare post-call arguments and selected interacting pairs | `review-pure.node.ts`, permanent pure fixture |
| V5 | minor | URL validation accepted padded strings but returned different decoded values | Trim before validation; full schema output comparison | `review-schemas.test.ts`, full-schema fixture |
| V6 | minor | Windows join omitted Node's relative colon prefix | Follow pinned Node normalize/join, including UNC/device/reserved-name semantics | `review-pure.node.ts` 3,888 paths over three platforms |

The reconstructed second-round pure oracle grew to 105 functions / 13,102 calls and found 363
starting-tree differences: 80 valid-string results, 276 successful scalar fallbacks and seven old
engine failures that had become success. All were fixed. It also permitted 1,691 natural engine
error-text differences under the parity boundary. The 49-schema / 12,733-call matrix found 181
decoded-value or validation differences. These are historical counts; the third round extends
both permanent fixtures. Public validation schemas restore the old zod boundary; native
in-process models retain their construction semantics. Inventory reads validate strictly while
writes preserve JSON serialization rather than revalidating already constructed values.

### Third-round findings

| Finding | Severity | Defect | Resolution | Permanent proof |
| --- | --- | --- | --- | --- |
| T1 | major | A value-dispatched filename dual returned a function when outer buildDownloadArgs had an out-of-literal type and a valid fallback | Dispatch by JavaScript argument type; internal calls use plain bodies; retain sanitizer default for empty custom template | Pure fixture adds 297 buildDownloadArgs calls; `review-duals.node.ts` all optional filename flag combinations |
| T2 | minor | URL decoding retained interior tab/LF/CR that zod removed | Trim edges and remove those ASCII controls before validation, preserving other spelling | Full-schema fixture interior controls in host/path and inventories |
| T3 | minor | Public settings kept host-only cookieSource and accepted more than five subtitle languages | Separate public settings schema; omit provenance and restore maximum in all six nested inputs | Full-schema fixture direct/nested five/six-language and unknown-key cases |
| T4 | blocker | Structural AbortController keys collapsed concurrent inspections; cancellation and mapping state broke in the application | Ordered controller/url/mapping records with explicit controller identity | `review-lifecycle.node.ts`, concurrency fixture cancel-first/cancel-middle/finish-first |
| T5 | minor | Unreadable prepared inventory waited behind previous scans before rejecting | Raise failed prepared Exit before tail wait; remove pending/controller entries before settlement; keep serial next tail | `review-lifecycle.node.ts`, concurrency prepare-failure with earlier process behind an unopened file gate |
| T6 | minor | Null itemIds threw where old enqueue selected every reference | Keep old Boolean filter gate and native includes behavior | `review-lifecycle.node.ts`, per-field stateful enqueue fixture and queue payloads |

T4 never reached an installed build. The same controlled comparisons exposed an additional
returned-snapshot ordering difference: the first completed scan must see the next category queued,
not already running. Named finally/allSettled continuation turns preserve that observation and
subsequent launch order. Stateful field substitution also restored short-circuit downloadPath
handling, null optional Core strings, falsy selectedFormat/tags cloning, and known-items JSON
serialization. The full stateful fixture pins each resulting task payload and state.

## Source audits and asynchronous equivalence

The generator-try sweep covered source and tests of schema, logger, i18n, db, task-queue and
downloader-core. The five mapper generator finally regions now use `finalizeProfile`. Remaining
JavaScript try sites are synchronous parser/URL/driver callbacks or ordinary test wrappers around
runtime calls; none has a dynamic generator body yielding an Effect. The finalizer masks
acquisition/cleanup, restores interruption in the body, captures Exit, releases admission before
Threads removal, and raises the body Exit only after cleanup. Cleanup failure replaces body
failure; a throwing release prevents removal. Early failures outside the old protected region
keep their characterized leaks.

The dual audit covers all 43 declarations: 42 pure functions in both forms in
`review-duals.node.ts`, plus both `finalizeProfile` forms in native cleanup tests. Mutating calls
compare arguments as well as returns. Three ambiguous helpers use single strict options objects
with unchanged positional compatibility adapters. Private plain bodies back public duals;
internal cross-module calls use `DataFirst` objects so data does not choose an overload by value.
The third round adds every optional filename flag combination to the both-form tests.

The truthiness inventory reviewed all 407 matches for nonempty helpers, explicit undefined checks
and nullish coalescing, against the old source. Classes were raw caller/JSON scalars; normalized
parser/URL/split strings; internal queue/fiber/capability optional state; and intentionally nullish
fallbacks. Raw scalar sites needing old successful fallbacks use Boolean gates: format/audio and
container, cookie argv/source, filename defaults, storage directory, playlist rank/selection,
progress tokens, initial status/source URL, and traversal authRequired/error. Derived strings keep
nonempty tests; typed internal state keeps presence checks; old nullish defaults stay nullish.
The stateful extension also checks short circuits in Core strings and enqueue download paths.

The object-key collection audit contains 211 rows: the original unsafe controller site, 208 final
equality/collection calls including aliases and compatibility, and two collection schemas. Only
the inspector controller registry used a foreign object as an Effect key. It now uses explicit
identity. Other Effect keys are strings; fibers/controllers/tasks are values. Compatibility queue
WeakMaps keep reference identity. No blanket conversion to structural equality is assumed safe.

The asynchronous audit examined all 87 old-source Promise/all/race/finally/then/Map/Set/await
matches in the stateful modules, including non-loop awaits. The important equivalences are:

| Old operation | Port | Failure, cancellation and ordering policy | Proof |
| --- | --- | --- | --- |
| Inspector Promise.all of prepared and race(previousTail, stopped) | Capture prepared Exit and raise failure before waiting; race the serial tail with stop | Prepared rejection is immediate even while earlier scan is blocked; queued cancellation does not free the earlier active scan | Concurrency prepare-failure and cancel-first/middle |
| Inspector request.finally cleanup | Explicit finalization removes controller and pending entries before settlement | Cleanup runs on success/failure/cancel; cancel after rejection returns false | Lifecycle/concurrency fixture |
| Inspector allSettled(previousTail, request).then and returned withMapping | Serial tail with named finally/allSettled turns | Failed/cancelled queued request still waits for earlier tail; returned snapshot sees next category queued before its launch | Concurrency finish-first and cancellation traces |
| Inspector stop allSettled(pending) | Deferred results for pending requests, joined during stop | Stop waits for pending settlements; per-request results retain original mapping state | Existing Instagram inspection and lifecycle suites |
| Social traversal then/catch/finally | Immediate fiber, captured snapshot, completion flag, Deferred done and finalizeProfile | Start prefix remains synchronous; snapshot remains mapping; no stale registration; release/cleanup failure precedence retained | Native review-cleanup and stateful manager cases |
| Gallery inspectFiles Promise.all batches of eight | Compatibility host retains the original Promise batches; strict executor delegates | Every stat recovers to zero individually; no changed early-rejection policy and no sequential replacement | Executor characterization/completion suites |
| Social map/preview completion Promise and finally | Executor callback completes Deferred; finalizeProfile protects the original region | Release before remove; early admission leaks outside the old region remain | Admission characterization and lifecycle tests |
| Redgifs for-await lines, awaited close and finally | Streaming UTF-8/readline sink, owned continuation and Deferred completion | Final line arrives before close; null traversal rejects; admission release/TERM policy retained | Pinned-Node profile/raw-process characterization |
| Prepared yt-dlp settings.then and launched cancel await | Immediate prepared-settings fiber, finish-once and original signal policy | Pending-settings cancel does not spawn; fallback failure preserves cancellation/classifier | Executor characterization and lifecycle fallback-spawn cases |
| Core playlist await loops and enqueue retry/add/caps | Serial Effect.forEach/yields and original timing turns | Preserve ordered admission, cap changes, retry-then-add and public settlement | Core metadata, enqueue characterization and stateful fixtures |

## Permanent oracles

Expectations are generated by executing pre-port main source archived from git under Node 22.23.4.
Old stateful Core uses its actual wrapper pointed at the same synthetic binary as the port. A
preliminary harness that injected only the port's fields into old Core was discarded. Corrected
old/starting-tree/new comparisons establish the fixtures; the permanent gate reruns the new side
against those old results. Earlier characterization assertions and goldens are unchanged except
for the one declared metadata case above.

Generation starts with valid populated seeds. Each field receives undefined, null, false, true,
zero, a nonzero number, NaN, empty string and another string. Optional fields include absent and
explicit undefined cases where declared. Nonempty arrays retain their shape and vary element
fields. Selected interacting format/audio, type/container, start/end and filename flag/template
pairs are crossed; quality presets are enumerated. Mutations compare cloned post-call arguments.
Schema cases additionally enumerate enums and neighbors, unknown keys, length/numeric boundaries,
URL interior controls and decoded omitted/undefined fields. Explicit markers preserve undefined,
NaN and infinities in JSON fixtures.

Inside declared types, results, deliberate errors, calling forms and suspension points stay exact.
Outside them, old successful null/wrong-kind JSON scalar/NaN results stay exact; an old natural
engine or Node failure only requires a new failure. Arrays/objects in scalar positions and
non-arrays in array positions are outside this contract, apart from reviewed external-data
exceptions. Capabilities are valid injected callbacks, queues, controllers and handles. No public
type widening or engine-error factory is needed.

| Permanent fixture under `packages/downloader-core-legacy/test/fixtures/` | Areas | Calls/scenarios | Gate test |
| --- | --- | ---: | --- |
| `review-pure-oracle.json` | 105 functions; builders, selectors, paths, cookies, formats, filenames, subtitles, playlists, progress | 13,399 | `review-pure.node.ts` |
| `review-full-schemas-oracle.json` | 49 schemas; all 36 replaced schemas.ts exports, OnlyFans/Fansly/social roots and three persisted social exports | 15,708 | `review-schemas.test.ts` |
| `review-stateful-oracle.json` | 12 entry points or request forms | 3,117 | `review-lifecycle.node.ts` |
| `review-stateful-browser-oracle.json` | Nested cookieSource.browser at ten stateful forms | 90 | `review-lifecycle.node.ts` |
| `review-concurrency-oracle.json` | cancel-first, cancel-middle, finish-first, prepare-failure | 4 | `review-lifecycle.node.ts` |

All final comparisons in the latest receipts have zero required differences. The 297 added pure
filename calls exposed 108 starting-tree differences; the final schema extension exposed 113;
the stateful matrix exposed 38. The 3,207 stateful calls include 154 non-array replacements marked
outside the comparison contract, leaving 3,053 compared calls. The whole test gate executes both
stateful fixtures and the controlled scenarios. The finite Windows matrix separately compares
3,888 paths (18 atoms × four separators × 18 atoms × three platforms) against pinned Node; the
same matrix also matched Electron's embedded Node 24.22.1. This does not prove all path strings.

### Per-area fixture counts

| Pure module | Functions | Calls |
| --- | ---: | ---: |
| `GalleryDlExecutor.helpers` | 2 | 551 |
| `YtDlpExecutor.helpers` | 8 | 170 |
| `audio-format-preferences` | 1 | 73 |
| `browser-cookies-setting` | 2 | 29 |
| `cookie-browser-paths` | 4 | 892 |
| `cookie-setup` | 16 | 322 |
| `download-file` | 3 | 75 |
| `dzen-profile` | 1 | 10 |
| `facebook-gallery` | 1 | 10 |
| `fansly-profile` | 2 | 20 |
| `filename-style` | 2 | 22 |
| `format-preferences` | 3 | 128 |
| `format-presentation` | 2 | 957 |
| `format-selector` | 3 | 309 |
| `gallery-dl-executor` | 2 | 29 |
| `instagram-profile` | 2 | 209 |
| `instagram-url` | 1 | 10 |
| `mapped-profile-source` | 3 | 39 |
| `onlyfans-profile` | 4 | 58 |
| `output-path` | 3 | 59 |
| `pinterest` | 1 | 10 |
| `playlist-plan` | 5 | 383 |
| `snapchat` | 1 | 10 |
| `social-media` | 5 | 194 |
| `subtitle-languages` | 2 | 38 |
| `threads` | 1 | 10 |
| `tiktok-photo` | 1 | 10 |
| `tiktok-short-link` | 1 | 10 |
| `vsco` | 1 | 10 |
| `yt-dlp-args` | 17 | 8,657 |
| `yt-dlp-progress` | 4 | 85 |
| `yt-dlp-wrap` | 1 | 10 |

| Schema area | Schemas | Calls |
| --- | ---: | ---: |
| `ProfilePersistence.model` | 3 | 891 |
| `fansly-profile` | 1 | 109 |
| `onlyfans-profile` | 6 | 1,057 |
| `schemas` | 36 | 12,973 |
| `social-media` | 3 | 678 |

| Stateful entry point or request form | Primary calls | Browser-field calls | Excluded non-array calls |
| --- | ---: | ---: | ---: |
| `enqueueInstagramProfileDownload` | 262 | 9 | 17 |
| `downloadSocialMedia` | 334 | 9 | 16 |
| `enqueue.outer` | 316 | 9 | 17 |
| `mapSocialMediaProfile` | 244 | 9 | 16 |
| `inspector.inspect` | 226 | 9 | 16 |
| `inspector.cancel` | 10 | 0 | 0 |
| `inspector.list` | 10 | 0 | 0 |
| `manager.map` | 244 | 9 | 8 |
| `manager.mapAndWait` | 253 | 9 | 8 |
| `previewSocialMedia` | 217 | 9 | 8 |
| `createDownload` | 676 | 9 | 24 |
| `startPlaylistDownload` | 325 | 9 | 24 |

### Outside the oracles

The pure matrices do not execute process-backed services or arbitrary Layer construction. The
stateful matrices use real compatibility entry points but synthetic files, fake queues and
controlled fake gallery-dl/yt-dlp processes. Valid host capabilities are injected; they do not
exhaust callback defects, all capability implementations or every concurrent interleaving.
Existing process/executor/persistence/admission/metadata characterizations and native tests cover
additional behavior, but are finite too. A real retained app-output-pipe case, remote authenticated
sites, real permission failures, OS execution on Windows/macOS, live ASR, hosted CI and the owner's
installed application remain outside these oracles. Native process cutover remains phase 9.1 work.

## Recorded gate receipts

These are the completed metadata implementation receipts, kept in the run's scratch area, not committed. They are historical local proof, superseded for review-fix acceptance by the later receipts below. The matching machine receipt is `results.json`; named complete logs accompany it. Pinned Node is 22.23.4.

| Command/proof | Recorded result | Receipt filename |
| --- | --- | --- |
| `bun run --cwd packages/downloader-core check` | exit 0; strict source/test tsrs and Biome; 108 files checked | `core-check.log` |
| `bun run --cwd packages/downloader-core-legacy check` | exit 0; source and characterization typechecks | `legacy-check.log` |
| `bun run --cwd packages/downloader-core test` | exit 0; 85 tests in 13 files | `core-test.log` |
| `bun run --cwd packages/downloader-core-legacy test` | exit 0; 363 tests in 19 files | `legacy-test.log` |
| `bun run check` | exit 0; desktop, locales, strict packages; 8 Turbo tasks | `check.log` |
| `bun run test` | exit 0; 473/473 audit, downloader 85/363, queue 46, schema 42, logger 7, i18n 13; db 63 plus isolated 20 per client; checker/type/harness tests | `test.log` |
| `bun run deps:check` | exit 0; no catalog issues | `deps-check.log` |
| `bun run port:check` | exit 0; 12 ported configurations, zero violations | `port-check.log` |
| `bun run build:linux` | exit 0; unpacked, AppImage and deb | `build-linux.log` |
| `bun run --cwd apps/cli build` | exit 0 | `build-cli.log` |
| Archive inspection | 82 main JS entries; no unresolved downloader imports | `bundle-inspection.json` |

The db default suite reports its existing native-client skips and then runs the two isolated client selections; overlapping focused counts are not added into a fictitious total. The archive receipt records SHA-256 `975419164b2a948b1557209512eccbac8d1df441047b02b5f74c5bbd86f0d520`. The recorded inspection does not independently supply a final CLI unresolved-import scan; repeat that with the final build.

| Completed full golden run | Exit | Comparisons | Harness time | Receipt filename |
| --- | --- | --- | --- | --- |
| 1 | 0 | 378 primary + 1 persisted restart; zero failures | 54.6 s | `golden-1.log` |
| 2 | 0 | 378 primary + 1 persisted restart; zero failures | 53.8 s | `golden-2.log` |
| 3 | 0 | 378 primary + 1 persisted restart; zero failures | 55.4 s | `golden-3.log` |

`golden-results.json` records those three completed exits. Each log reports the existing local-ASR skip without models. A fourth log had only startup output at inspection and has no completed entry in that receipt; no fourth result is inferred. Earlier five-run results (57.65, 56.91, 57.78, 58.48 and 59.31 seconds) belong to the build before Core metadata completion and are not repetitions of the final artifact. The loopback cases remain the pre-port baseline described in [4-loopback.md](4-loopback.md), including observed-body cancellation and unchanged stable comparisons.


### Latest review-fix receipts

The latest completed review-fix gate used Node 22.23.4. These results are transcribed from the
third-round gate documents and logs kept in the run's scratch area, not committed. They are not
new executions by the report preparation. Current Vitest file counts are independently counted
from the tree: 15 strict and 20 compatibility files. The older metadata receipts above preserve
their historical scope and must not be read as the current test totals.

| Gate | Recorded exit | Recorded result |
| --- | ---: | --- |
| Node version | 0 | v22.23.4 |
| Strict check / test / build | 0 / 0 / 0 | 113 source/test files checked; 15 files / 101 tests; declarations built |
| Compatibility check / test | 0 / 0 | Source and characterization declarations pass; 20 files / 374 tests |
| `bun run check` | 0 | Desktop, locales, Turbo and ratchet; repeated after final test edits |
| `bun run test` three times | 0 / 0 / 0 | Each: 578 pinned-Node audit tests, package tests, checker/type fixtures and loopback contract tests pass |
| `bun run deps:check` | 0 | No catalog issues |
| `bun run port:check` | 0 | 12 ported configurations, zero violations |
| `bun run build:linux` | 0 | Rebuilt final source: unpacked, AppImage and deb; uv symlink first on PATH |
| CLI build | 0 | Built; original tracked dist/index.mjs restored |
| Golden run 1 | 0 | 379/379, zero failures, 56.7 seconds |
| Golden run 2 | 0 | 379/379, zero failures, 54.4 seconds |
| `git diff --check` | 0 | No whitespace errors |
| Golden / CLI-output / staged differences | empty | No golden changes, CLI output restored, no staging |

Two additional successful golden comparisons preceded the final known-items serialization fix;
only the rebuilt final-source pair above is claimed for this receipt. Three whole-test logs
include the permanent 90-case browser-field extension. Optional local ASR remains skipped without
models. The final acceptance gate is reserved in [5.md](5.md#the-gate).

## Hand-exercise receipts

All launches used `offline-launch.sh` or the golden harness with a disposable synthetic profile, isolated HOME/XDG and descriptors, and loopback-only network namespace. No owner application/profile was used. Raw requests, task answers, process argv/fd captures, loopback requests and failed attempts are kept in the run's scratch area, not committed.

| Exercise | Observed result | Scope of receipt |
| --- | --- | --- |
| Baseline versus port execution | Non-default `best[ext=mp4]/best` + MKV, conversion to MP3, body-transfer cancel and retry; three normalized execution vectors equal | Baseline/final MCP requests and process argv comparison recorded before Core metadata completion |
| Output inspection | Matroska H.264/AAC; separate conversion MP3 audio only, no video | FFprobe, before metadata completion; direct audio-download source-container bug separately retained |
| Local-file import, batch, pause/resume, restart | Covered by committed golden harness | Automated packaged proof; not a claim of additional manual actions |
| Renderer playlist range 2–3 | Public renderer IPC returned two entries, IDs `playlist-2`/`playlist-3`, original indexes 2/3, totalCount 2; both downloads completed | Metadata-complete build; `manual-receipt.json` and `manual-result.json` |
| Cancellation during real FFmpeg remux | Bundled yt-dlp had an alive bundled FFmpeg descendant; MCP cancel changed running to cancelled in 5 ms | Metadata-complete build; task requests/answers and process/fd snapshot |
| Retained app-facing output pipe | `sharedOutputPipes: []`; FFmpeg stdout/stderr did not match yt-dlp's app-facing pipe inodes | Real retained-pipe condition not produced; source/fake-process descendant tests remain separate |

The successful renderer call is `window.electron.ipcRenderer.invoke` for `download.startPlaylistDownload`; preload `window.api.download` was unavailable in the first attempt. A subsequent MP3-format request failed before FFmpeg with the preserved unavailable-format response. The successful final cancellation used video remux. Failed attempts were retained separately and are not counted as successful proof.

Packaged profile get/list/reopen was not additionally exercised by hand. Native/compatibility tests cover profile operations and retained-pipe fixtures; they do not establish that missing packaged manual case. Real-site authentication/downloads, Windows/macOS OS behavior, every interleaving, live permission failures and all discovery permutations remain unverified. Phase-9.1 process cutover, hosted CI and owner installation are future work.
