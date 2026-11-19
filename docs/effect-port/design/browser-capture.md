# Design: `@vidbee/browser-capture` (phase 6b)

Status: reviewed, findings resolved (section 13).

Inputs: `PLAN.md` sections 3–7 and Amendments; `PORT-GUIDE.md`; `tsconfig.base.json`; `scripts/port-check.mjs`; the reviewed db, task-queue and downloader-core designs; the phase 4 packages; the source inventory; the independent review; package source, tests and consumers; installed Effect 4.1.4, `@effect/platform-node` 4.1.4 and Playwright 1.65.1; `GOLDENS.md` and `reports/4-loopback.md`.

This is a read-only design. No implementation, test execution, packaged verification or live-site proof is claimed. Source inspection and the independent review's probes do not establish those gates.

Paths below are repository-relative. **B** means `packages/browser-capture/src/`; **D** means `packages/downloader-core/src/`; **H** means `apps/desktop/src/main/lib/`. Line numbers identify existing source, not proposed companions.

## Amendments after the code reviews (2026-11-18)

This design was drafted and reviewed against `main` at `79f556b`. Before its implementation
started, the earlier ports were code-reviewed and fixed (`reports/review-fixes.md`) and the
downloader port merged (`reports/5.md`). Where the text below disagrees with this section, this
section wins; the characterization step re-checks every statement about current behavior against
the tree it runs on and corrects the design where the source has moved.

- `PORT-GUIDE.md`, "Defect classes found by code review" and "Parity boundary for inputs outside
  the declared types", are binding: exact parity inside declared types; outside them parity only
  where the old code returned a result for `null`, a JSON scalar of the wrong kind or `NaN`; no
  emulation of engine error text. Wherever this design asks for an old engine `TypeError` to be
  reproduced for a type-violating call, that requirement is dropped unless the value is external
  data the package itself reads and the item is listed in section 9 or 11.
- The port keeps three differential oracles as permanent tests, built before parity is claimed:
  pure functions, strict schemas against the zod schemas they replace (acceptance and decoded
  value), and the stateful entry points driven side by side with the old classes
  (`PLAN.md`, Amendments of 2026-11-18).
- The implementation is code-reviewed by independent sessions before its pull request.
- Decision 12.2 extends the downloader's process contract; the contract it extends is the one
  merged with phase 5 (`packages/downloader-core/src/DownloadProcess.service.ts` and
  `Process.model.ts`), including `ProcessRequests` beside `ProcessControl`; reconcile names with
  the merged code before implementing.

## 1. What the package is, and what makes its port risky

Two systems share this package:

- Browser playback capture: discover a browser, start Xvfb and an optional Pulse null sink, launch headed Chromium, select and prepare a video, locate its screen origin, and record it with ffmpeg. `BrowserCaptureExecutor` runs that work in a sidecar. `DrmFallbackExecutor` invokes it after a primary downloader reports DRM.
- Dedicated browser profiles: `OnlyFansProfiles` and its `FanslyProfiles` subclass maintain browser sessions, observe API responses, save media-reference inventories, enqueue selected originals, refresh signed URLs through normal browser navigation, and download originals without forwarding account cookies.

The source is 3,854 lines, including the page JavaScript; the three test files add 1,135 lines. There are four package export entries (`packages/browser-capture/package.json:6`).

Five properties decide the design:

1. **Synchronous behavior is public.** Availability resolution runs subprocess and filesystem probes synchronously. Profile `get/list` read disk synchronously and return clones. All executor `run` methods return controls synchronously. Replacing these with Promise methods would violate A6.
2. **The three executor starts have different timing.** DRM fallback calls the primary immediately; browser capture starts in `queueMicrotask`; the profile executor awaits `Promise.resolve()` before its synthetic spawn event (`B/drm-fallback.ts:55`, `B/executor.ts:139,178`, `B/onlyfans-profile.ts:1127`).
3. **Callbacks are execution boundaries.** Process output handling, progress delivery and fallback selection have synchronous prefixes. Browser-response handling deliberately begins in a serialized Promise continuation. Neither can be replaced indiscriminately with a stream or mailbox.
4. **Persistence is outside SQLite.** JSON profile files, Chromium session directories, copied LevelDB files, capture job files, media files and manifests each have different validation, ownership and failure rules.
5. **Native process handles do not reproduce Node observations.** The installed spawner waits for `spawn`, observes exit separately from pipe closure, exposes numeric exit or `PlatformError`, and does not expose Node's raw close, signal or `killed` state. It also inserts output buffering and observes child errors. The downloader-core design establishes the required Raw/Native distinction; section 5 extends its compatibility policies for capture.

The standing decisions apply: schemas precede services and implementations; A2 preserves behavior, including defects; A6 preserves signatures, results, error classes/messages and synchronous-versus-rejected failure; A7 retains Playwright behind one driver service. The strict package imports no unported workspace package.

Phase 5 is a dependency prerequisite. Current `main` still exposes zod values from downloader-core and browser capture imports `task-queue-legacy`. Phase 6b cannot become strict merely by changing its tsconfig. It needs phase 5's ported models and process/file contracts, and compatibility imports must move into the sibling package.

## 2. Shape of the port

- **`packages/browser-capture`**, ported: schemas, services, native layers, orchestration, pure helpers whose signatures remain valid, and the sidecar entrypoint.
- **`packages/browser-capture-legacy`**, unported and temporary: the old classes and synchronous host functions over the ported implementation, compatibility host layers, retained validation/error reconstruction and callback bridges. It shrinks as consumers migrate and is deleted in phase 10.

Existing filenames stay. New companions follow D21: `Capture.model.ts`, `Capture.errors.ts`, `CaptureHost.service.ts`, `CaptureHost.layer.ts`, `Playwright.service.ts`, `Playwright.driver.ts`, and equivalent files for profiles, files and timing.

An in-package `legacy/` directory does not exempt code from the strict rules. Dependency direction is compatibility → ported.

### Export entries

Counts are external source/test files whose imports change at that entry; overlapping rows are not additive. Package-local test rewiring and build configuration are counted separately.

| Existing entry | Ported package | Corresponding legacy entry | External files changing imports |
| --- | --- | --- | ---: |
| `.` | `parseNetscapeCookieFile`; `capturePageUrl`, `playbackPageUrl`, `isDrmProtectedMessage`, `DRM_FALLBACK_MESSAGE`; `evenSize`, `VIRTUAL_DISPLAY_SIZE`, `CAPTURE_X264_CRF`, `CAPTURE_FPS`; Effect services/layers and protocol models | `isBrowserCaptureAvailable`, `resolveBrowserExecutable`, `resolveXvfbPath`; callback `BrowserCaptureExecutor`, `DrmFallbackExecutor`; old protocol encode/parse signatures where compatibility requires them | 2 |
| `./sidecar` | Import starts the native sidecar through an allowed entrypoint companion | Compatibility sidecar entry using compatibility host/process/timing layers; no named exports | 0 |
| `./onlyfans-profile` | All seven pure functions, `ChatVideoAttachment`, `BrowserProfileAdapter`; profile and executor services/layers | `OnlyFansProfiles`, `OnlyFansBrowserExecutor`, unchanged constructors and methods | 1 |
| `./fansly-profile` | `fanslyMediaUrl`, `fanslyItems`, mutable `fanslyAdapter`; Fansly-configured profile layer | `FanslyProfiles`, retaining inheritance from legacy `OnlyFansProfiles` | 1 |

**Two distinct external consumer files change package imports:**

- `H/task-queue-host.ts:19–21`: executor and manager classes move to the legacy entries.
- `H/social-session-manager.ts:4,48`: synchronous browser resolution moves to legacy.

These are four production import declarations in two files. No CLI, renderer, UI or extension source directly imports browser capture. Indirect consumers remain relevant: `H/download-facade.ts:438–461`, `apps/desktop/src/main/ipc/services/download-service.ts:24–49`, renderer `DownloadDialog.tsx:84–95`, and `packages/ui/src/components/ui/onlyfans-profile-dialog.tsx:16–25,64–133`. They depend on the existing profile shapes, Promise methods, error text and polling behavior. Their browser-capture imports do not change.

The desktop build directly names `packages/browser-capture/src/sidecar.ts` (`apps/desktop/electron.vite.config.ts:86–88`). That build input must select the compatibility sidecar during this phase. The emitted filename remains `browser-capture-sidecar.js`, preserving `H/browser-capture-sidecar-path.ts:7–8`.

### Host-capability dispositions

| Symbol or source export | Hidden capability | Disposition |
| --- | --- | --- |
| `isBrowserCaptureAvailable`, `B/availability.ts:47` | Live environment, platform, synchronous process/file probes | `CaptureHost.available` Effect; old synchronous function in legacy |
| `resolveBrowserExecutable`, `resolveXvfbPath`, `resolvePactlPath`, `B/availability.ts:58–85` | PATH, fixed paths, filesystem access, subprocesses | Host service operations; legacy keeps exact synchronous lookup order |
| `pickDisplayNumber`, `B/availability.ts:89` | `/tmp` lock/socket probes and host joining | Host operation; legacy synchronous implementation |
| `userHomeDir`, `B/availability.ts:104` | Home directory | Host service; legacy `os.homedir()` at the original position |
| `waitForDisplay`, `B/availability.ts:107` | Wall clock, synchronous `xdpyinfo`, timer | Host probe plus timing service |
| `toPlaywrightCookies`, `B/cookies.ts:57` | `Date.now()` | Pure calculation with explicit current epoch seconds; orchestration obtains time; source-level legacy wrapper retains old signature |
| `encodeSidecarEvent`, `parseSidecarEvent`, `B/protocol.ts:23,27` | No host capability, but global JSON and an unchecked public assertion | Schema-based ported encoding/observation parsing; legacy preserves old callable contracts and native JSON error behavior, subject to section 9 |
| `chatVideoAttachments`, `fanslyItems` | Native Maps used as lookup tables | Effect mutable maps; unchanged synchronous signatures and output order |
| `fanslyAdapter`, `B/fansly-profile.ts:132` | None in the supplied adapter | Remains the same mutable structural value; do not freeze it |
| `buildRecorderArgs`, `playbackHasAdvanced`, `evenSize`, DRM/URL helpers | None | Pure synchronous functions remain in their existing files |
| `pinHighestQualityInPage`, `spoofLargePlayerBoxInPage` | Browser DOM, player objects and prototypes | Page programs executed only by `Playwright`; not host-pure helpers |
| Directory-derived task IDs, `B/onlyfans-profile.ts:881` | Host `path.resolve` before hashing | Resolve through host `Path`; pure synchronous SHA-256 over the resulting UTF-8 string |
| `startRecorder` | Synchronous spawn and synchronous result | Effect operation natively; source-level compatibility wrapper where the old synchronous form is exercised |

The pure public exports remain at their original specifiers. Mixed consumers split imports only when necessary.

## 3. Schemas

Models precede service contracts. Use structs for data already represented by object literals, spreads and clones. Do not introduce class instances into profile, task-output or callback payloads.

Mutable fields use `S.mutableKey`; mutable arrays use `S.mutable(S.Array(...))`, recursively. Record values use mutable keys where required. Optional fields retain explicit `undefined`, including `profile.error = undefined`. Keep original declarations as compatibility fixtures under their original optional-property settings and require mutual assignability, including nested mutation sites.

Numeric semantic schemas use `S.Finite`. Do not add integer, positivity, range, URL or path constraints unless an executing reader already enforces them. A schema-derived TypeScript `number` does not impose runtime decoding on a typed in-process call. Derived transfer totals and their progress delivery retain that distinction, as specified below.

### Models

| Companion | Models and complete contract |
| --- | --- |
| `Capture.model.ts` | `CaptureJob`: required `url`, `outputPath`, `ffmpegPath`, `width`, `height`; optional `cookiesPath`, `browserExecutable`, `durationHintSec`, `localStorage`, `userDataDir`, `videoOrdinal`. Strings and mutable string record; numeric fields finite |
| `Protocol.model.ts` | Producer event union: `spawn { pid }`, `log { message }`, `progress { percent,currentTime,duration }`, `done { filePath,size,durationMs: number \| null }`, `error { message }`; separate permissive raw observation codec |
| `Cookies.model.ts` | `NetscapeCookieRow`: `domain,path,name,value`, `secure,httpOnly`, `expires`; `PlaywrightCookie` adds `sameSite: Lax \| Strict \| None` |
| `Playback.model.ts` | `MediaClock { currentTime,duration,paused,ended }`; `DecodedQuality { fps,height,width,method }`; playing result adds `duration,originX,originY`; progress `{ currentTime,duration,percent }`; position/rectangle projections |
| `Recorder.model.ts` | Existing recorder/scan inputs; dimensions, origins and optional fps finite, without new bounds; scan result `{ x,y }` |
| `Profile.model.ts` | Reuse phase-5 OnlyFans item/profile/command/download models and route kits. `ChatVideoAttachment { id,postId,state,durationSec: number \| null,previewPath: string \| null }`; extracted reference `{ item,mediaUrl: string \| null }`; enqueue result `{ count }`; download result `{ filePath,size }`; typed transfer progress `{ bytes,total }`, without runtime semantic decoding of derived progress |
| `Manifest.model.ts` | Existing photo manifest: `files`, `posts`, `images`, `videos`, `downloaded`, `existing`, `failed`, `totalSize`, `reason`, `manifestPath`, `startedAt`, `finishedAt`; reuse queue collection-summary fields |
| `Host.model.ts` | Host platform/environment snapshot, paths, executable identity, process projections and file metadata; environment values permit `undefined` |
| `Capture.errors.ts` | Tagged errors described in section 4 |

Literal discriminants use `LiteralKit`. Reuse queue context, event, progress, output and classified-error models; do not create competing task types.

`BrowserProfileAdapter` is a behavioral contract, not JSON. Preserve all fields from `B/onlyfans-profile.ts:266`: `name`, `key`, `origin`, `normalize`, `isSite`, `items`, `ownerResponse`, `ownerId`, `feedResponse`, `complete`, `queueUrl`, `refreshUrl`, `refreshResponse`, `scrollMode`, `requiresCookies`. Its callbacks remain synchronous calculations over supplied values. Custom adapters enter through a host bridge that captures thrown values without inventing validation.

### Boundary decoding

| Boundary | Today's acceptance and malformed-input policy | Port policy |
| --- | --- | --- |
| Capture job JSON, `B/protocol.ts:61` | Arrays pass the initial object test. Required strings must be nonblank; only URL is trimmed. Positive numeric width/height survive, otherwise default 3840. Positive duration survives. Ordinal is positive integer. Optional path strings may be empty; userDataDir must be nonblank but is retained untrimmed. localStorage keeps string-valued entries. Unknown outer fields disappear | Decode JSON, then preserve this normalization order. No URL/path validation. Non-finite normalized numeric values are the section-9 exception |
| Sidecar stdout/stderr, `B/protocol.ts:27`, `B/executor.ts:289` | Bad prefix/JSON/nonobject/no `type` becomes plain text. Any object with a `type` property is accepted; unknown types are silently ignored. Known payload fields are unchecked | Decode syntax separately from the permissive envelope. Keep unknown types ignored and plain-text fallback. Decode the fields required by a consumed recognized event, with the narrow rejection in section 9; do not validate ignored payload fields |
| Netscape cookies, `B/cookies.ts:25` | Skip blank/comment/short rows and missing domain/name. Preserve tabs in value. Default path `/`; invalid expiry → 0; secure is case-insensitive TRUE | Row normalization followed by Schema decoding. Keep skip/default policy; no new cookie semantics |
| Saved profile JSON, `B/onlyfans-profile.ts:450,480` | Native JSON parsing, then zod validation/defaults/key stripping. `get` propagates errors; `list` skips per-file failures. Identity checked separately | Phase-5 closed profile codec, including item-level stripping and downloaded=false default; same identity checks and catches. Legacy reconstructs JSON/zod failures |
| Site API JSON | Playwright `.json()`; broad object/array traversal, field-specific omission and coercion. Mapping counts unreadable bodies and continues; refresh has different propagation/catch positions | Decode external JSON as unknown, then query-shaped permissive projections. Do not require an entire site response to match a rigid invented API model |
| Playwright evaluate results | Typed assertions only: clock, quality, rectangles, viewport, scroll result, carousel state | Schema decode each returned projection. Preserve null/default branches. Newly impossible numeric results are section 9 |
| Process text | `which`: first trimmed line; pactl: trimmed arbitrary string; xdpyinfo: status only | String/status projection schemas, not numeric module-ID or executable-format refinements |
| ffmpeg frame bytes | Any byte length accepted; missing pixels read as zero; no magenta → `(0,0)` | Byte schema and the same tolerant RGB scan; no exact frame-length requirement |
| Copied LevelDB bytes | Best-effort WAL/SSTable/Snappy parsing; malformed blocks skipped; scan failures mostly return null | Byte schemas and bounded field projections retaining existing catches, truncation and fallback behavior |
| File metadata | Node size used directly; sidecar alone rejects empty capture output | Decode finite size projection; preserve which site checks emptiness |
| CDN headers/body, `B/onlyfans-profile.ts:1012–1037` | Manual status/body and MIME-prefix checks; arbitrary bytes streamed. Length is a nullable header string coerced with `Number(...) \|\| 0`; progress precedes each chunk's writer delivery; completeness is checked after the pipeline | Decode response metadata with length retained as string/null and decode byte chunks. Preserve coercion, derived callback values, later completeness error and `.part` residue. Do not decode derived totals or progress through `S.Finite` before delivery |

Saved profiles are **closed**, because the old zod reader strips unknown keys. The task-queue design's open persisted codecs do not apply. API envelopes remain permissive where the current traversal ignores unrelated fields.

Read codecs and write serialization remain separate. Profile, job and manifest writes use Schema JSON serialization of the existing value without adding semantic entry validation. Preserve field order, omission of `undefined`, non-finite-to-null serialization and existing newline choices. This follows the task-queue port's invalid-add correction.

Transfer progress is a typed in-process call, following the task-queue design's decision not to decode executor events on entry. `Number(responseMedia.headers.get("content-length")) || 0` is evaluated at `B/onlyfans-profile.ts:1022`. The transform increments `bytes`, calls `progress(bytes,total)`, then forwards the chunk (`:1023–1028`). Only after the pipeline completes does the method reject zero bytes or a truthy unequal total (`:1030–1037`). An overflowing header therefore reaches progress as `Infinity`, the body is written, and the later incomplete-file error leaves `.part` in place. No finite-total guard, clamping, early error or cleanup is added.

`OnlyFansBrowserExecutor` preserves `percent: total ? bytes / total : null` and `bytesTotal: total || null` (`B/onlyfans-profile.ts:1155–1166`). An infinite positive total produces percent 0 and bytesTotal `Infinity` in the callback. Queue entry, callback bridges and write serialization must not insert semantic progress validation. Existing persistence serialization remains governed by the task-queue precedent.

There are no browser-capture-local zod declarations to move. Phase 5 owns the live OnlyFans schema closure and `FanslyCommandSchema`; legacy browser capture imports those from downloader-core-legacy. Unused Fansly profile/download aliases are not retained merely for type inference. The strict package imports only phase-5 Effect models and pure helpers.

Installed APIs confirmed: `S.decodeUnknownEffect`, `decodeUnknownResult`, `encodeUnknownResult`, `fromJsonString`, `optional`, `mutableKey`, `mutable`, `StructWithRest`, `Finite` and `Defect()` in `node_modules/effect/dist/Schema.d.ts`. There is no excess-property “preserve” option.

## 4. Errors

Browser capture defines no custom Error subclass today. Observable failures include ordinary `Error`, native `SyntaxError`, zod errors, `TypeError`, filesystem/process errors, Playwright errors, fetch/stream errors, abort reasons and arbitrary adapter/callback failures.

Native failures are schema-backed tagged errors: `CaptureUnavailable`, `CaptureJobInvalid`, `DisplayUnavailable`, `CaptureProcessFailure`, `PlaybackFailure`, `ProfileUnavailable`, `ProfileBusy`, `ProfileIdentityMismatch`, `MediaUnavailable`, `MediaTransferFailure`, `BoundaryDecodeError`, and `HostFailure`. Each relevant domain error carries `legacyMessage`; `HostFailure` carries the original value with `S.Defect()`.

Legacy maps domain errors to ordinary `Error(legacyMessage)`, unwraps host failures by identity, and never exposes `FiberFailure`. Failure mapping occurs in the shared synchronous/Promise settlement utilities, not an additional `.catch`.

### Explicit messages

| Origin | Messages retained verbatim |
| --- | --- |
| Job parser, `B/protocol.ts:63–72` | `Capture job must be an object`; `Capture job is missing url`; `Capture job is missing outputPath`; `Capture job is missing ffmpegPath` |
| Sidecar, `B/sidecar.ts:13,41` | `Usage: browser-capture-sidecar --job <job.json>`; `ffmpeg produced an empty capture file` |
| Display/recorder, `B/availability.ts:97`, `B/display.ts:53,63`, `B/recorder.ts:113,183` | `No free Xvfb display in :90-:129`; `Xvfb not found. Install xvfb to record DRM playback.`; `Failed to start Xvfb`; `Failed to start ffmpeg recorder`; `Failed to read the capture display: ${stderr.trim()}` |
| Capture executor, `B/executor.ts:137,235,266,362–369` | `In-browser capture needs Linux, Xvfb, and Chrome/Brave/Edge with Widevine.`; `No Chromium-family browser found to play DRM media`; `Failed to spawn browser-capture sidecar`; saved sidecar error message; `Capture cancelled`; stderr tail or `browser-capture sidecar exited ${exitCode ?? -1}` |
| Playback, `B/player.ts:75,84,228,406,550,562` | `Capture cancelled`; `Timed out waiting for in-browser playback to start`; `Timed out waiting for the chat message list`; `Playing duration ${duration}s does not match media ${video.id} (${video.durationSec}s)`; `The chat message list has no video at position ${ordinal}`; `Video ${ordinal} (${video.id}) is locked` |
| Profile lookup/browser, `B/onlyfans-profile.ts:443–567` | `Enter a ${name} profile URL.`; `Saved profile identity does not match.`; `Saved profile is unavailable.`; `Close the dedicated login window after signing in, then map the profile.`; `Install Chrome or Chromium on the VidBeep host to open its ${name} session.`; `Another ${name} operation is running. Stop it or wait for it to finish.`; `Install Chrome or Chromium to sign in.` |
| Selection/admission, `B/onlyfans-profile.ts:866,875,918,927` | `Finish or stop ${name} mapping before downloading.`; `Select available mapped media. Locked and DRM media cannot be downloaded.`; `Map this available media before downloading.` |
| Refresh, `B/onlyfans-profile.ts:982–1002` | `The post did not return media in the dedicated browser. Reopen it and retry.`; `${name} asked to slow down. Retry later.`; `The post request failed (HTTP ${status}). Check access in the dedicated browser.`; `This media is locked or has no downloadable original.`; `Unsupported original media format.` |
| Transfer, `B/onlyfans-profile.ts:1014–1037` | `${name} media download failed (HTTP ${status}). Remap and retry.`; `The server returned a page instead of a media file.`; `The downloaded file is incomplete.` |
| Profile executor, `B/onlyfans-profile.ts:1145,1203` | `Open this ${name} profile in VidBeep and map it using the dedicated browser session.`; non-Error fallback `${name} download failed.` |
| Internal LevelDB, `B/local-storage.ts:20` | `truncated varint`; retain its existing suppression by outer best-effort paths |

`${name}` is the adapter name, including custom adapters.

Mapping reports operational failures through profile state/error rather than rejecting the already-returned map command. Preserve these strings and their branches (`B/onlyfans-profile.ts:709–850`):

- `${name} asked to slow down. Stop and retry later.`
- `${name} could not load this page. Check the dedicated browser.`
- `Mapping stopped while processing a response (${errorKind}). The saved map has been retained.`
- `No matching media response was captured. Observed API paths: ${paths.join(', ')}`
- `No media API response was captured. Check that the page loaded in the dedicated browser.`
- `The site did not finish loading older media. ${count} response bodies could not be read; mapped items were retained.`
- The close-login guidance above, or `The browser could not finish mapping. Reopen it and retry; saved items are retained.`

`The browser left the mapped profile.` is an internal throw replaced by the existing mapping catch. Do not expose it as a new public rejection.

### Error delivery

| Surface | Legacy obligation |
| --- | --- |
| `get`, availability functions, synchronous `run` delegation | Throw synchronously at the same position |
| `command`, `enqueue`, `download`, `stop` | Reject, including errors occurring before the first old await |
| `list` | Skip failures inside each file's catch; retain possible directory-enumeration failure outside it |
| Native JSON/zod failure | Compatibility parses retained input with the original parser on the failure path, reproducing class/message/issues without rereading the file |
| Filesystem, observed spawn, Playwright, fetch, pipeline, custom adapter/queue failure | Rethrow original value where currently propagated; preserve code/path/syscall and identity |
| Unobserved child error | Preserve the absence of an `error` listener at the specified compatibility sites; do not convert it to `HostFailure` or a sink event |
| Callback failure | Preserve escape/catch position. A callback throw is not automatically logged and ignored |
| Sidecar failure | Emit error message, then set exitCode 1; no new immediate `process.exit` |
| Executor failure | Retain finish-event data rather than rejecting `run` |

Capture classification remains ordered: xvfb/ffmpeg/browser-found text → `binary-missing`; sign-in/login/cookie → `auth-required`; cancel → `cancelled-by-user`; otherwise `unknown` (`B/executor.ts:64`). Ordinary capture failures finish with exitCode 1; unavailable capture uses null. Profile executor failures remain `auth-required` with null exit code unless its controller is aborted.

The profile executor's `onSpawn` remains outside its try. A success `onFinish` throw currently enters the catch and attempts another finish; preserve this behavior rather than adding a universal finish-once guard.

A non-finite transfer total is not a boundary-decode failure. With a nonempty finite body and an infinite or negative nonzero total, the existing post-pipeline length check raises `Error("The downloaded file is incomplete.")`. It does so before rename, downloaded marking, profile save and final stat (`B/onlyfans-profile.ts:1036–1045`). The `finally` still clears `downloading` (`:1046–1047`).

## 5. Services

All services are `Context.Service` classes with deterministic package/file/service keys. In the table, `E<A>` means `Effect.Effect<A, CaptureError>`, with the relevant tagged subset used in implementation. Requirements are supplied by layers.

| Service | Contract with Effect signatures | Native layer | What compatibility provides instead |
| --- | --- | --- | --- |
| `CaptureHost` | `available: E<boolean>`; `browser(preference?): E<string \| null>`; `xvfb/pactl: E<string \| null>`; `displayNumber: E<number>`; `snapshot: E<HostSnapshot>`; `probeDisplay(display, timeout): E<boolean>` | Config, explicit platform/home/temp/executable capabilities, FileSystem/Path and process probes | Live Node environment/platform/home values, synchronous `spawnSync`/`existsSync`, exact candidate order |
| `CaptureFiles` | `readText/readBytes`, `exists`, `stat`, `list`, `mkdir`, `tempDirectory`, `copy`, `write`, `rename`, `remove`: effects with the options and policies in section 6 | FileSystem/Path, explicit text decoding | Sync operations on synchronous paths; old Promise fs calls at asynchronous sites |
| `DownloadProcess` | Phase-5 `start(spec,sink): Effect<ProcessStart, HostFailure>` and non-waiting signal requests; additions below | Phase-5 stock-spawner layer with explicit consumption policy and declared native limits | Direct Node spawn/listeners, independently selected output consumption and raw observers, nonclosing stdin write |
| `Playwright` | `launch(spec,sink): E<BrowserSession>`; session commands and event sink below | One `Playwright.driver.ts`, sole Playwright import/adapter | Same driver library, with callback entry and Promise bridges preserving old timing |
| `CaptureTimers` | `now: Effect<number>`; `sleep(ms): E<void>`; `after(ms,action,{keepAlive}): E<Cancel>`; `defer(action): Effect<void>` | Clock and owned fibers; explicit scheduling liveness | Date.now, original timers/microtasks and cancellation; `Cancel = Effect<void>` |
| `LegacyTiming` | Phase-4 `turn(point): Effect<void>` | No-op | One microtask turn |
| `BrowserProfiles` | `get(url): E<Profile>`; `list: E<Profile[]>`; `command(input): E<Profile>`; `enqueue(input): E<{count}>`; `download(input,sink): E<{filePath,size}>`; `stop: E<void>` | Per-owner state over services | Same implementation, synchronous files/clock and old validation/error adapters |
| `ProfileQueue` | `get(id): E<Task \| undefined>`; `setMaxPerGroup`, `retryManual`, `add`: effects | Ported queue service | Calls the supplied existing `TaskQueueAPI`; no second queue/runtime |
| `MediaTransport` | `open(request): E<MediaResponse>`; `copy(response,path,sink): E<{bytes,total}>` | Effect HttpClient, byte stream and FileSystem writer; derived total remains undecoded | Original fetch request, Web reader and Node pipeline semantics |
| `Playback` | `start(input,sink): E<PlaybackSession>`; session `waitUntilPlaying`, `waitUntilEnded(sink)`, `close`: effects | Existing player algorithm over Playwright, timers and scan process | Same algorithm with compatibility capabilities |
| `VirtualDisplay` | `start(size): E<DisplayHandle>`; handle `stop: E<void>` | Existing Xvfb/Pulse algorithm | Raw Node process observations/signals |
| `Recorder` | `start(input): E<RecorderHandle>`; `scan(input): E<Position>`; handle `stop: E<void>` | Existing ffmpeg algorithm over process service | Synchronous launch/PID check and original close/timer behavior |
| `Capture` | `run(job,sink): E<CaptureResult>` | Existing `run-capture.ts` orchestration | Same orchestration |
| `TaskExecutor` | Phase-4 `run(ctx,sink): Effect<ExecutorHandle, QueueHostFailure>` | Capture/profile/fallback layers | Old callback executor classes over warmed runtimes |

### Executor, browser-event and progress sinks

Reuse the phase-4 declarations:

```ts
interface ExecutorSink {
  readonly emit: (event: ExecutorEvent) => Effect.Effect<void>
}

interface ExecutorHandle {
  readonly cancel: (
    timeoutMs?: number
  ) => Effect.Effect<void, QueueHostFailure>
  readonly pause: Effect.Effect<void, QueueHostFailure>
}
```

Browser events and progress are commands into owned state, not Promise-returning callbacks:

```ts
interface BrowserSink {
  readonly emit: (
    event:
      | { readonly type: "response"; readonly response: ResponseRef }
      | { readonly type: "closed" }
  ) => Effect.Effect<void>
}

interface TransferSink {
  readonly emit: (
    progress: { readonly bytes: number; readonly total: number }
  ) => Effect.Effect<void>
}

interface CaptureSink {
  readonly emit: (
    event:
      | { readonly type: "log"; readonly message: string }
      | {
          readonly type: "progress"
          readonly currentTime: number
          readonly duration: number
          readonly percent: number
        }
  ) => Effect.Effect<void>
}
```

These declarations describe schema-derived data types; they do not introduce competing hand-maintained models. `TransferSink.emit` accepts the computed numeric value without decoding it. Its TypeScript `number` includes `Infinity`; neither this sink nor the subsequent typed executor sink adds a finite-value check.

The sink completes its synchronous part before returning. Compatibility listeners enter it through the owner's synchronous runner. Suspended continuations use `Effect.forkIn(..., scope, { startImmediately: true })` at the old launch position.

For mapping responses, the synchronous prefix appends the response to the serialized chain and pending set. Processing starts after the old `.then` turn, in response order. It does not eagerly call `.json()` from the event callback. For transfer progress, the callback executes after byte accumulation and before the same chunk is passed to the writer.

`BrowserSession` exposes only the existing operations: page creation/selection, closed/url projections, navigation with explicit waitUntil/timeout, fronting, cookies, response subscription/wait, response metadata/JSON, named page programs, locator queries/attributes/visibility/boxes/clicks, mouse clicks, style/init scripts and context/browser close. Handles are opaque driver references. Ported orchestration never receives a Playwright class.

Page programs are named operations with Schema-decoded results. Keep `quality-page.js` as executable page JavaScript and its declaration file; do not turn page callbacks into closures capturing Effect services. Preserve the `__name` initializer required by serialized function source (`B/player.ts:137`).

### Process additions

Reuse phase 5's `ProcessSpec`, `ProcessEvent`, `ProcessStart`, `ProcessRun`, Raw/Native completion and signal-target contracts. Do not introduce another general process service. The additions are made in downloader-core in this phase, with their own tests.

Pipe disposition, pipe consumption and raw-error observation are independent. `pipe` specifies the child's descriptor. It does not authorize reading that pipe. An omitted error observer means no child `error` listener, including no bookkeeping listener that merely discards the error.

The following declarations extend the shared schema-derived contract. Literal discriminants are defined with `LiteralKit` in its model companion.

```ts
type ProcessSignal = "SIGTERM" | "SIGKILL" | "SIGINT"
type ProcessDisposition = "ignore" | "pipe" | "inherit"
type ProcessOutputConsumption = "deliver" | "unread"
type RawErrorObservation = "observe" | "once" | "omit"
type RawSpawnObservationPolicy = "once" | "omit"
type RawExitObservation = "observe" | "omit"
type RawCloseObservation = "observe" | "once" | "on-demand" | "omit"

interface ProcessSpec {
  readonly command: string
  readonly argv: readonly string[]
  readonly env: Readonly<Record<string, string | undefined>> | undefined
  readonly extendEnv: boolean
  readonly cwd: string | undefined
  readonly detached: boolean
  readonly windowsHide: boolean
  readonly stdin: ProcessDisposition
  readonly stdout: ProcessDisposition
  readonly stderr: ProcessDisposition
  readonly abortSignal?: AbortSignal | undefined

  readonly stdoutConsumption?: ProcessOutputConsumption | undefined
  readonly stderrConsumption?: ProcessOutputConsumption | undefined
  readonly rawErrorObservation?: RawErrorObservation | undefined
  readonly rawSpawnObservation?: RawSpawnObservationPolicy | undefined
  readonly rawExitObservation?: RawExitObservation | undefined
  readonly rawCloseObservation?: RawCloseObservation | undefined
}

interface ProcessRun {
  readonly pid: number | undefined
  readonly signalChild: (
    signal: ProcessSignal
  ) => Effect.Effect<void, HostFailure>
  readonly signalPid: (
    signal: ProcessSignal
  ) => Effect.Effect<void>
  readonly signalGroup: (
    signal: ProcessSignal
  ) => Effect.Effect<void, HostFailure>
  readonly signalTree: (
    signal: ProcessSignal
  ) => Effect.Effect<void, HostFailure>

  readonly writeStdin: (
    bytes: Uint8Array
  ) => Effect.Effect<void, HostFailure>

  readonly observeClose: Effect.Effect<void, HostFailure>
}

type RawSpawnObservation = { readonly _tag: "rawSpawn" }
```

`RawSpawnObservation` joins the existing `ProcessEvent` union. The existing raw error, exit, stream-end and completion payloads stay unchanged.

Defaults retain the settled downloader behavior: piped stdout/stderr are consumed and delivered; raw errors, exit and close are observed; no raw spawn observation is added unless requested. The new optional spec fields therefore do not change existing callers. `once` uses a one-shot observer and retains its removal behavior.

For compatibility:

- `deliver` attaches the original data/end listeners and synchronously enters the sink with original chunks.
- `unread` attaches no data/end consumer, does not call `resume`, does not pipe through another stream, and does not drain/discard. The descriptor remains a pipe.
- `rawErrorObservation: "omit"` installs no child-error listener. Synchronous `spawn` throws still follow the site's existing catch; an asynchronous child error remains unhandled where it is unhandled today.
- `rawExitObservation: "omit"` adds no exit listener. Code that needs raw child liveness can retain the existing `exitCode`/`signalCode` projections in the compatibility host capability; it does not need an exit listener to maintain a second state.
- `rawCloseObservation: "on-demand"` adds no close listener during start. Executing `observeClose` registers one one-shot close observer at that position and delivers the existing Raw completion. It does not replay a close that occurred earlier. Recorder stop calls it after arming its timer and before writing `q`, matching `B/recorder.ts:136–151`.
- `rawCloseObservation: "omit"` creates no close observer or synthetic completion. Xvfb stop remains PID signalling and a delay.

The complete capture policies are in section 6. In particular, recorder and Xvfb cannot inherit the ordinary downloader error listener, and recorder close cannot be eagerly cached for later stop.

`writeStdin` acknowledges the write without ending stdin or waiting for drain, matching `child.stdin?.write("q")`. Compatibility preserves the missing-stdin no-op and synchronous write-throw behavior; recorder stop keeps its existing catch.

The installed native handle exposes a stdin Sink. `ChildProcess.StdinConfig.endOnDone` exists and defaults to true; setting it to false prevents sink completion from ending stdin (`node_modules/effect/dist/process/ChildProcess.d.ts`, `node_modules/@effect/platform-node-shared/src/NodeChildProcessSpawner.ts:198–211,406–411`). That alone does not establish nonwaiting write acknowledgment. The native layer uses an attempt-owned open input feeder, with the validation obligation in sections 10 and 12; it must not run a fresh finite, EOF-producing sink for each write.

Native successful acquisition supplies its own acquisition observation and never fabricates raw spawn. Native cannot reproduce omitted raw-error observation: the stock spawner installs its error listener during acquisition. It also pipes child output through `PassThrough` before the exposed stream is consumed (`NodeChildProcessSpawner.ts:424–452,469–500`). For an `unread` request, the VidBee native layer does not run a drain, but stock buffering still differs from leaving Node's original pipe unread. These are declared phase-9.1 cutover obligations, not compatibility implementations or accepted application changes in phase 6b.

All browser-capture subprocesses are attached today. Set `detached: false` and `windowsHide: false` explicitly in the native specs; do not inherit platform-node's different defaults.

### State and lifetime declarations

- One runtime per `OnlyFansProfiles` owner, including the Fansly subclass; separate owners retain separate context/page, opening work, active map, downloading flag and caches.
- One runtime per stateful executor owner. Profile executors use the existing manager owner rather than constructing a second manager. Stateless host helpers share a warmed module runtime.
- Warm synchronous services before returning the constructor. `get/list` work before browser launch.
- `stop()` is an operation, not runtime disposal. It aborts/awaits active mapping and closes the context. It does not clear caches, abort a direct download or kill the raw Fansly login child (`B/onlyfans-profile.ts:1104`).
- Preserve shared opening work and cached page selection. Do not serialize all commands behind a new mutex: that would repair current admission races.
- Keep insertion order explicitly for item merging and API-path diagnostics. Effect HashMap iteration is not a replacement for Map/Set insertion order.
- `get` returns a deep clone. Unsaved new profiles remain absent from `list`; cached profiles ignore subsequent disk changes.
- Capture resource cleanup remains sequential: recorder → playback → display. Preserve early-failure and cleanup-failure behavior; do not silently replace it with stronger finalizers.
- Attempt scopes outlive `run/start` and all owned continuations. Compatibility adds no process-termination finalizer absent from the old site.
- Queue → browser-capture runtime → callback → queue runtime is synchronous re-entry between existing owners. Neither borrows the other's private runtime or creates a queue.

Each old await becomes one host-bridge call or one named `LegacyTiming.turn`, at the same position. Include dynamic import, cached browser return, optional page creation, response-chain continuations, final drains, queue loops and Promise adoption. `defer` preserves explicit `queueMicrotask`; the profile executor retains its distinct initial await.

Use the shared settlement utility specified by phase 5: `runFork` plus exit observer, mapping inside the observer, and `Scheduler.PreventSchedulerYield` in the final context. Current `packages/task-queue-legacy/src/api/index.ts:139–146` contains the inline implementation; `@vidbee/task-queue-legacy/runtime` must be extracted if phase 5 has not already done so.

## 6. Side-effect surfaces

### Database

There are **no SQL statements, transactions, pragmas or SQLite handles** in browser capture. No begin mode applies.

`ProfileQueue` calls the host queue; that queue retains its own persistence/runtime and db-design obligations. Browser capture does not call `runtimeForHandle` or open another connection. Full enqueue integration runs against queues using both SQL clients in separate processes.

Chromium LevelDB access is a copied-file parser, not SQL access. It never acquires the live browser's LevelDB lock.

### Spawn sites

All rows inherit cwd. Unless stated otherwise, they inherit the live environment, are attached, have no shell and no overall timeout.

The output column distinguishes descriptor disposition from consumption. The observer column specifies compatibility listeners; native observations remain subject to the limits below.

| Site | Command and argv | Stdio and consumption | Compatibility observers | Timeout and kill policy |
| --- | --- | --- | --- | --- |
| `B/availability.ts:27` | `which [binary]` | Sync UTF-8 stdout, first trimmed line, then exists probe; status/error field not otherwise checked | Synchronous host probe | No deadline; exceptions → null |
| `B/availability.ts:110` | `xdpyinfo ["-display", display]` | Sync status only | Synchronous host probe | 1-second probe; repeated until 5-second wall deadline; exhaustion succeeds |
| `B/display.ts:57` | Xvfb `[display,"-screen","0",WxHx24,"-ac","-nolisten","tcp"]` | All stdio ignored; immediate PID check | Error, spawn, exit and close omitted | Stop unloads Pulse, PID TERM, 200-ms delay, PID KILL; signal errors swallowed; no close wait |
| `B/display.ts:31,67` | pactl `["load-module","module-null-sink","sink_name=vidbee_cap_n","sink_properties=device.description=vidbee_cap_n"]`; later `["unload-module",moduleId]` | stdin ignored; stdout pipe/deliver and accumulated/trimmed; stderr pipe/unread | Error observed; close observed; spawn/exit omitted | Missing binary/error/nonzero → empty string; no timeout or kill |
| `B/executor.ts:254` | `opts.execPath ?? host.execPath`; `[...execArgv,sidecarScript,"--job",jobPath]` | stdin ignored; stdout/stderr pipe/deliver, independently chunk-decoded and split | Error once; close once; spawn/exit omitted; public onSpawn uses immediate PID | No deadline; abort/tree TERM, capped grace, tree KILL if unsettled |
| `B/recorder.ts:75` | ffmpeg `-hide_banner -loglevel error -f x11grab -video_size scanWxH -i display.0+0,0 -frames:v 1 -f rawvideo -pix_fmt rgb24 -` | stdin ignored; stdout/stderr pipe/deliver; all stdout bytes and stderr text accumulated | Error and close observed; spawn/exit omitted | Close 0 permits RGB scan; no timeout/abort/kill |
| `B/recorder.ts:176–184` | ffmpeg recorder argv below | stdin pipe, stdout ignored, stderr pipe/unread; immediate PID check | Error, spawn and exit omitted; close on-demand once when stop begins | Stop writes `q`, requests child SIGINT, waits close or 4-second timer; timer requests child KILL and resolves without reaping |
| `B/onlyfans-profile.ts:578–587` | browser `["--user-data-dir="+sessionDir,"--no-first-run",profileUrl]` | All stdio ignored | Spawn once and error once; exit/close omitted; retain raw child liveness projections | No timeout, detach, unref or stop-time kill |
| `B/player.ts:448,463`; `B/onlyfans-profile.ts:511` | Chromium launched by Playwright | Library-owned process/protocol | Library-owned | No explicit launch timeout; preserve library default and close behavior |
| Delegated tree control | Existing task-queue process helper, including Windows `taskkill /PID … /T /F` | Existing helper policy | Existing helper policy | Non-waiting request; preserve group/PID fallback and swallowed failures |

`runPactl` consumes only stdout (`B/display.ts:31–40`). `startRecorder` pipes stderr but never consumes it or observes a child error (`B/recorder.ts:178–188`). Xvfb likewise has no child-error observer (`B/display.ts:57–65`). Those omissions preserve backpressure and process-level unhandled-error behavior. Draining and discarding stderr, changing the descriptor to `ignore`, or installing an ignored error observer would change behavior.

Recorder argv (`B/recorder.ts:9`) remains:

```text
-hide_banner -loglevel error -y -thread_queue_size 4096
-f x11grab -draw_mouse 0 -video_size WxH -framerate FPS
-i display.0+X,Y
[ -thread_queue_size 4096 -f pulse -i sink.monitor ]
-c:v libx264 -preset veryfast -crf 12 -pix_fmt yuv420p
-profile:v high -movflags +faststart
[ -c:a aac -b:a 320k -ar 48000 -ac 2 | -an ]
outputPath
```

FPS remains `fps && fps >= 24 ? min(60, round(fps)) : 60`; origins default to zero.

The sidecar environment is `{ ...process.env, ...opts.env, ELECTRON_RUN_AS_NODE: "1" }`. Recorder receives the current environment plus DISPLAY and optional PULSE_SINK. These are replacement snapshots, not later environment inheritance.

Capture Chromium removes WAYLAND_DISPLAY and sets DISPLAY, XDG_SESSION_TYPE=x11, GDK_BACKEND=x11 and optional PULSE_SINK. Preserve all arguments from `B/player.ts:145`: window size/position, kiosk/fullscreen, first-run/error/infobar/crash suppression, disabled Translate/MediaRouter/AutomationControlled, autoplay, blink automation suppression, background-throttling suppression, scale/DPI 1 and X11 ozone. Both launch modes are headed and omit `--enable-automation`. Capture contexts use the supplied viewport, scale 1 and ignoreHTTPS errors.

Profile Chromium uses persistent `browser-session`, headed, viewport null, `--no-first-run`, and the same omitted automation argument (`B/onlyfans-profile.ts:511`). Playwright adds its own process arguments; the table specifies application-supplied options, not a fabricated full OS argv.

### Native process results

The application keeps compatibility process layers in phase 6b. Native behavior is implemented and tested now, with remaining differences handed to phase 9.1.

| Site | Native result policy |
| --- | --- |
| Discovery/readiness | Nonzero/failure follows existing null/failed-probe branch; native probe may suspend, while legacy stays synchronous |
| pactl | Zero supplies trimmed output; nonzero/acquisition/handle failure → empty string; no VidBee drain for stderr, with stock buffering recorded as a cutover difference |
| Xvfb/recorder start | Native acquisition failure becomes the site's tagged start failure; no invented PID or raw error event. Native acquisition necessarily observes errors; compatibility retains immediate PID checks and unhandled asynchronous-error behavior |
| Sidecar | Zero requires retained done path and stat; nonzero uses existing tail/fallback diagnostic with numeric code; acquisition/stream/handle failure uses actual PlatformError message; aborted rejection follows existing cancelled branch |
| RGB scan | Zero scans bytes; nonzero uses existing stderr diagnostic; acquisition/handle failure carries actual error. Player retains its log-and-origin-zero catch |
| Fansly login | Successful native acquisition satisfies launch wait; failure rejects; subsequent liveness uses native state, without invented exitCode/signalCode |
| Stop operations | Use non-waiting signal requests and explicit old waits; never substitute waiting `handle.kill`. Native exit knowledge does not establish late raw-close parity |

Compatibility preserves requested raw Node close, error, spawn and original chunks, and preserves the absence of observations where specified. Native observes numeric exit or PlatformError, output-stream completion and acquisition. It does not invent nullable raw codes, signal names, killed state or raw event timing.

Installed sources confirm these limits: `effect/src/process/ChildProcessSpawner.ts:86–180`, `@effect/platform-node-shared/src/NodeChildProcessSpawner.ts:424–500,677–760`. Native scopes can terminate children, streams can rechunk output, and output setup can consume into intermediate buffers even without a downstream reader.

The native layer drains each output selected for `deliver` once. It does not wait for an unread output stream to end as a new prerequisite for completion. Default downloader specs retain their existing delivery/draining behavior. Native buffering, error observation, acquisition, close timing and scope cleanup remain explicit cutover tests; passing compatibility tests does not prove native parity.

### Network requests

There is one direct host HTTP request. Site navigation and API requests remain browser-owned under A7; recreating them with HTTP would change authentication and signing.

| Request | Method, URL and headers | Timeout/retry | Body and validation |
| --- | --- | --- | --- |
| Original media, `B/onlyfans-profile.ts:1007` | GET signed URL accepted by site allowlist; only application header `Referer: ${origin}/`; redirect=`error`; no account cookies | Caller signal combined with 30-minute timeout; no transfer retry | Require 2xx and non-null body; MIME starts image/, video/ or application/octet-stream, case-insensitive; stream all bytes; preserve `Number(content-length) \|\| 0` without finite/positive validation; progress before each chunk's writer delivery; reject zero bytes or truthy unequal total only after the pipeline |
| Profile/open/map navigation, `B/onlyfans-profile.ts:594,761–768` | Browser goto normalized profile URL; creator map appends category, chat/purchased uses exact profile URL; browser chooses headers and subrequests | domcontentloaded, 45 seconds; no package navigation retry during mapping | Observe relevant responses; mapping unreadable JSON is counted/skipped |
| Refresh navigation, `B/onlyfans-profile.ts:936` | Browser goto adapter refresh URL, with response waiter registered first | Response wait 8 seconds; goto 45 seconds; at most two attempts; 1.5-second delay after first non-OK response except 429; null/success/429 stops retry | Chat predicate requires requested attachment; read selected response JSON; possibly open one visible covered item |
| Covered-media interaction, `B/onlyfans-profile.ts:1051` | Browser click; request method/headers determined by site | Response wait 15 seconds, click 5 seconds; no additional retry | Require matching successful response containing requested ID and original URL |
| Playback navigation, `B/player.ts:528,576` | Browser goto capture page or chat gallery URL | goto/video selector 45 seconds; chat message listener 30 seconds | Browser response JSON plus page projections; no host fetch |
| Chromium background/subresource traffic | Library/browser-owned | Existing browser behavior | Offline namespace blocks external access; retain DNS evidence |

Response matchers are contracts:

- OnlyFans owner `/api2/v2/users/<username>`; creator feed path starts `/api2/v2/users/<ownerId>/posts`; selected chat `/messages` or `/media`; purchased `/api2/v2/posts/paid` with selected user alias; refresh includes the exact post or selected chat attachment routes (`B/onlyfans-profile.ts:209–332`).
- Fansly origin `https://apiv3.fansly.com`, account username query, timeline/timelinenew owner path or mediaoffers/location accountId; refresh `/api/v1/post` with requested ID in `ids` (`B/fansly-profile.ts:132–170`).
- OnlyFans originals require HTTPS CDN host and `/files/`; Fansly originals require the existing first-party media-host pattern. Preserve signed queries and supported-extension selection.

Native `MediaTransport` uses `effect/http/HttpClient`. `FetchHttpClient.layer`, its `RequestInit` service with redirect=`error`, and disabled `HttpClient.TracerPropagationEnabled` provide an appropriate native transport. No retry/status middleware is added. The 30-minute deadline must cover body consumption; installed `HttpClient.timeout` alone does not cover later body reads.

Compatibility preserves the original global-fetch seam, including tests that replace fetch after manager creation. Resolve it at request time. Preserve the exact request options, composite signal, native rejection identity, null-body distinction, reader release and Node pipeline behavior. A supplied fetch adapter must not acquire extra tracing headers or be snapshotted at runtime construction.

Header decoding retains `content-length` as string/null. Coercion stays after status/MIME acceptance and before the pipeline, at its current position. Native and compatibility transfer orchestration preserve derived totals without semantic redecoding, including overflow, malformed and negative values. Tests using a supplied response separate this package's behavior from any rejection an actual HTTP stack may perform before delivering a response.

### Files

Text reads use UTF-8 replacement decoding **with BOM preserved**, matching Node. Native reads bytes and uses `TextDecoder("utf-8", { ignoreBOM: true })`; stock `FileSystem.readFileString` strips BOM (`effect/src/FileSystem.ts:583`). Existence probes catch all access failures as false where old `existsSync` did; stock `FileSystem.exists` only converts NotFound.

| Site | Exact operations and retained failure semantics |
| --- | --- |
| Browser/display discovery | Probe fixed candidate paths and X lock/socket names; no chmod, executable validation or display reservation |
| Capture output, `B/executor.ts:78` | Directory precedence: customDownloadPath, settings.downloadPath, options.downloadPath, default, each applicable string trimmed. Recursive mkdir with default mode. Sanitize title. Stat base filename; any failure uses base name; success adds Date.now suffix without another probe |
| Capture job, `B/executor.ts:250` | mkdtemp `vidbee-capture-`; write `job.json` with JSON plus LF and default creation mode. No cleanup today. Job may contain localStorage token and cookie/profile paths |
| Cookies, `B/run-capture.ts:22` | Read supplied file before browser-required check; raw read failure rejects |
| LevelDB copy, `B/local-storage.ts:146–194` | mkdtemp `vidbee-ls-` before try; copy `.log/.ldb`, skipping LOCK/LOG*; reverse lexical file order; read bytes; recursive force remove in finally. Copy/read/parse failures → null; temp creation and cleanup failure can reject |
| Profile save, `B/onlyfans-profile.ts:377` | mkdir storage recursive0700; mutate updatedAt; write fixed `<key>.json.tmp`0600; rename to final. No LF, fsync, chmod or failed-rename cleanup |
| Profile get/list, `B/onlyfans-profile.ts:440,472` | Preserve filename filters, disk enumeration order, identity checks, cache behavior and per-file catches |
| Browser session | `<storageDir>/browser-session`, recursive0700; Chromium owns its files and lock behavior. Capture persistent userDataDir is separately caller-supplied |
| Original media, `B/onlyfans-profile.ts:1004–1045` | mkdir `<destination>/<adapter.name>/<username>/<category>` with default mode; stream truncating `<postId>_<mediaId><extension>.part`; deliver progress and finish pipeline before completeness check; on mismatch leave `.part`; on success rename onto final, mark downloaded, save profile, stat final |
| Photo manifest, `B/onlyfans-profile.ts:1172` | Direct truncating `<file>.manifest.json` write0600; no rename; output gains dirname/fileCount/collectionSummary |
| Capture media | ffmpeg directly overwrites final MP4 with `-y`; partial output remains after failure/cancel; sidecar stat rejects empty output; executor later stats the event path |

Modes are creation requests subject to umask. Existing objects are not chmodded. Rename replaces the target; no transaction spans media rename, profile save and final stat.

Profile keys remain username; nonmessage chat `<username>-<route>`; purchased `purchased-<userId>-<route-or-all>`. Signed URLs remain memory-only. The localStorage scanner remains heuristic: latin1/UTF-16LE key search within 400 bytes, existing 32-bit varint behavior, current Snappy tolerance and no LevelDB sequence/origin/deletion resolution.

### Timers and clocks

There are no intervals in this package. The UI's 1.5-second polling interval remains in the unported UI package and does not stop mapping on unmount.

| Site | Purpose and exact timing | Process liveness / mapping |
| --- | --- | --- |
| `B/availability.ts:107` | 5-second wall deadline; 1-second xdpyinfo probe; 50-ms pauses | Ordinary referenced delay; host probe plus CaptureTimers |
| `B/display.ts:83` | 200 ms between PID TERM and KILL | Referenced sleep |
| `B/executor.ts:139,178` | Defer unavailable finish or execute start | Microtask, no timer handle; `defer` |
| `B/executor.ts:210` | `min(timeout ?? killGraceMs ?? 10000, 2000)` before conditional KILL | Referenced timer; preserve negative-value host coercion |
| `B/recorder.ts:136` | 4-second KILL/resolve fallback; cleared on close | Referenced timer; cancel handle retained |
| `B/player.ts:65` | 60-second playing deadline, 250-ms polling | Wall clock and referenced sleeps |
| `B/player.ts:111` | 12-second quality deadline, 300-ms polling, 2.5-second pixel stability | Wall clock and referenced sleeps |
| `B/player.ts:222` | 30-second presented-message fallback/rejection | Referenced timer; cleared on match |
| `B/player.ts:292` | Up to 16 carousel steps: 500 ms absent state, 1.5 seconds movement, then 400 ms | Referenced sleeps; no added abort checks |
| `B/player.ts:394` | 15-second duration probe, 200-ms polling | Wall clock; unknown duration still succeeds |
| `B/player.ts:705` | 200 ms before origin scan | Referenced sleep |
| `B/player.ts:732` | End polling 400 ms, absent media 250 ms; known-duration wall limit duration+15 seconds | Referenced sleeps; no overall deadline for absent/unknown-duration media |
| `B/run-capture.ts:61,103` | 350 ms before recording, 400 ms after playback end | Referenced sleeps |
| `B/onlyfans-profile.ts:771` | Mapping max two hours, inactivity eight minutes; moved pause1.5s/unmoved4s in ≤250-ms abortable slices | Wall clock; referenced abortable delays |
| `B/onlyfans-profile.ts:975` | 1.5-second refresh retry pause | Referenced abortable delay |
| `B/onlyfans-profile.ts:1010` | 30-minute fetch timeout combined with caller signal | Node timeout signal does not itself keep process alive; preserve via compatibility transport and Node oracle |
| Playwright operations | goto/selector45s; refresh8s; cover15s; click/header5s; library launch defaults | Driver-owned timers; retain options, do not add competing timers |

Date reads also supply cookie expiry comparison (`B/cookies.ts:58`), output collision suffix, spawn/finish times, profile updatedAt/new-profile time, mapping lastResponse, profile progress ticks and separate photo-manifest timestamps. All use `CaptureTimers.now` at their original positions; do not coalesce separate calls or replace wall time with monotonic elapsed time.

The installed default Effect scheduling path uses referenced timers (`effect/src/internal/effect.ts:6424`); using `Effect.sleep` is not evidence of a liveness regression. The native timer layer nevertheless owes the explicit keepAlive contract and process-exit tests. Compatibility uses the original Node timers and timeout signals.

## 7. Pure modules

`drm.ts`, Netscape parsing, `evenSize`, recorder argument construction, playback predicates, media URL checks, extraction, response matching and supplied adapter calculations remain synchronous.

Changes forced by the rule set:

- Replace Map/Set with Effect collections while retaining explicit insertion order and replacement position.
- Replace JSON operations with Schema codecs; separate syntax decoding from field projection and write serialization.
- Replace Buffer-only binary calculations with byte/DataView calculations where possible. Preserve latin1, UTF-16LE, invalid UTF-8, bitwise overflow and zero-fill behavior against Node fixtures.
- Supply time explicitly to cookie conversion; keep host clock acquisition outside the pure calculation.
- Keep directory hashing synchronous with the phase-4 pure SHA-256 implementation and exact lowercase first-16-hex format. Do not introduce an asynchronous digest.
- Add data-last overloads through confirmed `Function.dual` where `missingPipeableSignature` requires them, retaining all existing call forms.
- Keep mutable return arrays and objects. Do not freeze `fanslyAdapter` or convert public arrays into Effect collections.

These implementation changes are not observable for preserved inputs. The numeric/known-protocol exceptions are listed separately in section 9. Transfer-length coercion and typed progress delivery are preserved calculations, not exceptions.

The page programs are not pure. They inspect DOM/player state, change ABR settings, unmute/play, alter styles/prototypes and move elements. They remain under the Playwright capability and are tested in a real browser, including serialized production bundle execution.

## 8. The compatibility package

Legacy exports retain the four entry paths. The root exports old host functions and executor classes plus unchanged pure re-exports. Profile subpaths retain classes, constructor signatures, public adapter property and pure helpers.

`OnlyFansProfiles` retains:

```ts
constructor(
  storageDir: string,
  defaultDownloadDir: () => string,
  adapter?: BrowserProfileAdapter
)
get(url: string): OnlyFansProfile
list(): OnlyFansProfile[]
command(raw: OnlyFansCommand): Promise<OnlyFansProfile>
enqueue(queue: TaskQueueAPI, raw: OnlyFansDownload): Promise<{ count: number }>
download(
  profileUrl: string,
  mediaId: string,
  destination: string,
  signal: AbortSignal,
  progress: (bytes: number, total: number) => void
): Promise<{ filePath: string; size: number }>
stop(): Promise<void>
```

`FanslyProfiles` retains its subclass relationship and two-argument constructor. Inherited command validation still accepts the OnlyFans categories; desktop's separate Fansly validator continues to narrow its own entry.

Compatibility supplies host capabilities, not a second independent orchestration implementation. Pure calculations and state transitions call the ported code. Retained parser/error reconstruction and raw Node transport code are limited to behavior the strict surface cannot represent.

Promise methods use shared exit-observer settlement. Synchronous methods use shared `runLegacySync` and original-error unwrapping. `stop` does not dispose runtimes. Owner disposal is separate composition-root work.

`sidecar.ts` keeps its filename and delegates to a new `Sidecar.entry.ts`, because `sidecar.ts` is not an allowed runtime-execution filename in `scripts/port-check.mjs`. The strict sidecar uses native layers; the packaged transitional sidecar uses compatibility layers. Both retain import-time startup, signal registration, spawn-before-job-read, stdout framing and exitCode behavior. Ordinary service/driver files execute no runtime.

The packaged transitional sidecar uses the section-6 process policies through the shared downloader-core service. It does not substitute the native spawner for recorder, Xvfb or pactl during this phase. Compatibility retains unread descriptors and omitted listeners directly; no extra catch-all process wrapper absorbs their errors.

Wiring:

- Add `@vidbee/browser-capture-legacy` to desktop dependencies; retain core where its direct build entry or pure imports require it.
- Core depends on Effect, schema, ported task queue and ported downloader-core. Remove task-queue-legacy and all unported imports.
- Legacy depends on core, queue-legacy, downloader-core-legacy and the required host libraries. Playwright remains behind the single driver service. Third-party versions use root `catalog:`; internal dependencies use `workspace:^`.
- Add both packages to desktop `bundledWorkspacePackages`; preserve Playwright externalization and package-resource availability. Select the compatibility sidecar input without changing the emitted filename.
- Add strict source/test configs and port-guide `check/build/test` scripts. Core joins root Turbo filters and Biome scope. Legacy gets unported typechecking and explicit root check/test coverage; do not broaden legacy formatting.
- Existing browser-capture Vitest suites are absent from root test filters (`package.json:40`). Add both packages' suites. Do not add Vitest files to the `tsx --test` audit glob. Node oracle launchers run explicitly selected Node from the Bun-hosted suite.
- Move compatibility assertions with their facade tests; native service tests use `@effect/vitest` and `bunx --bun vitest run`. Fix relative mocks/import wiring without weakening assertions.
- Keep `.js` relative specifiers so unported consumers need no compiler-option changes.
- Check packaged main/sidecar bundles for unresolved workspace imports, missing page JavaScript and accidental native SQLite driver loading.

## 9. Deliberate changes

Only requirements-forced boundary changes belong here and in `OWNER-REVIEW.md`. Their exact fixtures must be characterized before implementation.

1. **Non-finite values at typed external boundaries.** `parseCaptureJob` currently accepts positive Infinity for dimensions/duration, and JSON `1e999` can produce Infinity. Page/protocol assertions can also admit non-finite numbers. `S.Finite` forbids these. Native decoding reports `BoundaryDecodeError` with operation and schema path. Legacy preserves already-existing validation failures; newly rejected non-finite cases use `Error("Invalid browser-capture data.")`. Do not extend this rejection to ignored fields, write serialization, derived transfer totals or typed in-process progress delivery.

2. **Malformed consumed fields of recognized sidecar events.** Today a valid JSON object can pass `parseSidecarEvent` and deliver wrong-typed values against callback declarations (`B/protocol.ts:27–41`, `B/executor.ts:289–345`). The typed path rejects only fields required by the consumed operation: log message; progress percent/currentTime/duration; done filePath and supplied durationMs; error message. Use `BoundaryDecodeError`, mapped by legacy to `Error("Invalid browser-capture data.")`. Unknown discriminants remain ignored; bad syntax/nonobjects/missing type remain plain text. The executor ignores spawn payloads and done size today, so it does not newly validate those fields. Characterization records each changed shape and its old/new delivery behavior before implementation.

No cancellation, cleanup, admission, retry, output naming, classification, key-stripping, request or timing fix is included. Infinite and negative transfer totals retain their callbacks, post-pipeline error and failed-file residue. Native process differences are cutover obligations, not accepted application changes in phase 6b.

Existing goldens remain unchanged. Additional capture baselines and the measured comparison contract in section 10 are established before the port; they do not broaden existing direct-download comparisons.

## 10. Verification the implementation owes

Characterization comes first against the old source. Keep assertions unchanged through the port except explicit section-9 old/new cases. Source inspection is not verification.

**The first step is packaged pre-port capture characterization.** Before implementation, run the existing public admission path on an isolated pre-port packaged build against the loopback fixture below. Record whether primary DRM classification, fallback selection, browser playback and recording are each reached. Record the build identity, fixture identity, host/binary configuration, raw requests/events, result and any failure point. Absence of reachability is a recorded result, not an assumed reason to skip the attempt.

Repeated pre-port recording runs establish the structural comparison bounds before any implementation result is used to judge them. The report records the runs and the numeric bounds they justify.

### Characterization fixtures

| Area | Required fixtures and observations |
| --- | --- |
| Public surface | Export/import fixtures; old/new declaration assignability; synchronous result/throw versus rejection; mutable nested values and adapter mutation |
| Availability | Recording sync probe/filesystem adapters; exact browser candidate order, preferred non-Chromium name, disable env, non-Linux, access failures, display exhaustion/race and readiness timeout-success |
| Executors and sinks | Complete facade traces through raw process → ported executor → legacy callback → queue runtime; immediate state observations, re-entry, callback throws and cancellation inside callbacks |
| Timing | Synchronous markers, every old await/continuation, explicit microtasks, Promise settlement, repeated cancel and post-stop reads; enough work to expose accidental scheduler yielding |
| Protocol | Split JSON/UTF-8 across chunks, CR/LF/empty segments, events on stderr, unknown type, missing/wrong fields, ignored spawn/done-size fields, error-before-close, done/nonzero/error precedence, tails and ignored sidecar size |
| DRM fallback | Both patterns and all concatenated text sources; unavailable forwarding; synchronous primary finish; active-handle overwrite; cancel/pause delegation |
| Profiles | Synthetic creator/chat/all gallery/purchased routes; identity mismatch; key stripping/defaults; BOM/malformed JSON; corrupt entry omission; cache/clone behavior; unsaved get absent from list |
| Mapping | Owner-before-feed ordering, unreadable bodies then valid response, response-chain errors/drain, cookies, two-hour/eight-minute boundaries, upward/nested scrolling, final-save failures and abort-before-page assignment |
| Extraction | Every existing envelope, numeric/string ID asymmetry, URL precedence, original-versus-DRM, inaccessible originals, bundle/correlation identity, variants, previews, ordinal order and duration coercion |
| Enqueue | Unique selection, group cap, exact path hash/ID/title/options, skip/retry/add, partial failure, default-directory callback timing and lack of downloading guard |
| Transfers | Refresh status matrix, two attempts, missing response, covered-item uniqueness/visibility/matching, MIME/length cases including the matrix below, redirects, preabort/midbody timeout, progress throw, reader/pipeline failures, residue/rename/save/stat ordering |
| Process policies | Child descriptor disposition, deliver versus unread pipes, omitted/once/persistent raw-error observers, no eager recorder close observer, late-close registration, raw spawn wait and unchanged default downloader policies |
| Files | Creation-only modes, pre-existing modes, fixed temp collision, failed rename residue, exact JSON/newlines, invalid UTF-8/BOM and no extra fsync/chmod/cleanup |
| LevelDB | Synthetic WAL and SSTable files, compressed/uncompressed blocks, truncation, invalid offsets, varint overflow, latin1/UTF-16LE, reverse order, 400-byte window, cleanup rejection |
| Playback/page programs | Real DOM fixtures with multiple videos, HLS/Shaka/DASH-shaped objects, throwing getters, carousel/cover layouts, duration matching, quality stability, origin marker, unknown duration and serialized bundle functions |

Retain the three existing suites: `browser-capture.test.ts`, `onlyfans-profile.test.ts`, `fansly-profile.test.ts`. Their mocked Playwright/fetch tests and real temporary files establish useful unit behavior, not live-browser or packaged success.

### Transfer-length characterization

Drive the existing `OnlyFansProfiles.download` path with a supplied fetch response, a valid media MIME, a nonempty three-byte body and normal progress callbacks. Use controlled chunks and real temporary output files. Do not rely on a real HTTP server accepting malformed framing headers.

For every row, compare old/new progress calls, executor progress, pipeline completion, thrown error, final/partial files and downloaded state.

| `content-length` header | Derived total | Progress and executor projection | Result after three body bytes |
| --- | ---: | --- | --- |
| `"3"` | 3 | Callback receives 3; percent 1, bytesTotal 3 at completion | Rename, downloaded marking, profile save and final stat |
| `"1e999"` | `Infinity` | Callback receives `Infinity`; percent 0, bytesTotal `Infinity` | Pipeline finishes; `The downloaded file is incomplete.`; three-byte `.part` remains; no rename or downloaded marking |
| Decimal digits long enough to overflow `Number` | `Infinity` | Same as exponent overflow; retain the exact header fixture | Same late error and residue |
| `"0"` | 0 | Callback receives 0; percent null, bytesTotal null | Nonempty body succeeds; zero does not enforce a length mismatch |
| Missing | 0 | `headers.get` returns null; callback receives 0; percent null, bytesTotal null | Nonempty body succeeds |
| Malformed text such as `"invalid"` | 0 | `Number` produces NaN, then `\|\| 0`; callback receives 0; percent null, bytesTotal null | Nonempty body succeeds |
| `"-3"` | -3 | Callback receives -3; percent -1 at three bytes, bytesTotal -3 | Pipeline finishes; incomplete-file error; three-byte `.part` remains |
| `"-1e999"` | `-Infinity` | Callback receives `-Infinity`; percent is negative zero for positive bytes, bytesTotal `-Infinity` | Pipeline finishes; incomplete-file error; `.part` remains |

Also pin empty-body rejection for zero/missing/malformed totals, ordinary finite mismatches, and preservation of progress-before-write order across multiple chunks. Assert signed zero directly where relevant; JSON trace serialization alone cannot distinguish it.

The mismatch rows assert that no length validation occurs before transfer or progress delivery, that all supplied body bytes reach `.part` before rejection, and that the existing final target is untouched. The `downloading` guard is released after rejection. Callback-throw and writer-failure cases keep their separate current behavior; they are not replaced by the length check.

### Node oracle and process integration

Vitest runs under Bun. Node-specific comparisons run in explicitly selected pinned Node 22.23.4 subprocesses, with version checked; child and grandchild interpreters are explicit. Bun is not substituted because it hosts the test runner.

Compare structured old/new traces for spawn return versus spawn event, missing executable, synchronous invalid spawn options, raw error/close ordering, signals, unread stderr backpressure, stdin `q` without EOF, recorder close/timer races, negative timer inputs, fetch/abort error classes and JSON syntax messages. Assert identity within each process and serialize the assertion result.

Fake executables must emit controlled chunks, fork descendants, retain pipes, ignore TERM, fail asynchronously and produce/truncate output files. Test both process layers. Compatibility proves parity; native proves the result matrix and documented limitations. Unhandled-child-error cases run only in owned oracle subprocesses.

Required process-policy cases:

- **Unread stderr:** a child writes enough controlled stderr to reach backpressure before emitting a marker on a separate control channel. Compare the original site and compatibility policy without consuming stderr. An independently drained control run demonstrates that reading the pipe changes progress. Do not assume a universal OS pipe capacity or use a single arbitrary sleep as proof. The outer harness bounds and cleans up only its own children.
- **pactl:** stdout is consumed, stderr is piped and unread, and error/nonzero produces the existing empty-string result. A full stderr pipe may prevent completion; the implementation must not repair that by draining it.
- **Recorder/Xvfb errors:** missing executable and controlled asynchronous child-error cases compare synchronous PID-check failure, later unhandled error, stderr diagnostics and oracle-process exit code/signal. A top-level catch may record the immediate start error, but no child-error listener may be added to keep the oracle alive.
- **Observer lifetime:** Fansly login and sidecar retain their one-shot error listeners; pactl and scan retain their existing observers. No hidden shared-service observer remains at an omitted site.
- **Recorder close:** close after stop registration clears the timer; close before stop is not replayed and stop retains the existing timer path. Stop arms the timer, registers close, writes `q` without EOF, then requests SIGINT in the original order.
- **Shared defaults:** existing downloader specs without the new fields retain their output drains, raw observations, completion and signal behavior.
- **Native limits:** measure stock intermediate buffering, observed acquisition errors, exit/pipe completion and cleanup separately. Do not label these traces compatibility parity.

Validate the native stdin feeder with a real child that reports receiving `q` while stdin remains open, distinguishes receipt from EOF, and exercises backpressure. Measure when `writeStdin` acknowledges relative to receipt and drain. The review's attempted stdin probes produced no reliable parity result; the implementation still owes this proof.

Run full enqueue/persistence integration with the borrowed better-sqlite3 queue and target node queue in separate processes. Browser capture itself has no SQL codec to test.

### Pre-port packaged characterization and goldens

The existing loopback additions bring the suite to 379 comparisons (`reports/4-loopback.md:102–104`); they prove direct downloader behavior, not browser capture.

The current desktop composition places OnlyFans/Fansly routing before `HostRoutingExecutor`, with `DrmFallbackExecutor(ytDlp,capture)` inside that route (`H/task-queue-host.ts:132–145`). `DrmFallbackExecutor` starts capture only after an error finish whose raw message/stdout/stderr matches the DRM patterns and whose availability check succeeds (`B/drm-fallback.ts:13–55`). `BrowserCaptureExecutor` then writes the job and starts the sidecar (`B/executor.ts:225–278`). This is the public route to characterize. It does not establish that an offline extractor fixture can actually reach fallback.

Record the following cases on the packaged build **before phase 6b**, through existing surfaces where reachable:

| New case group | Fixture and observations |
| --- | --- |
| Saved profiles | Seed synthetic OnlyFans creator, chat/gallery/purchased and Fansly JSON files, including mapping→partial recovery and an unreadable file. Through renderer IPC, record nonempty lists/get, route identity, invalid URL, selection rejection and same-physical-profile restart |
| Dedicated-session failure | In an isolated browser profile with no login, record the OnlyFans mapping auth-required outcome and retained inventory; distinguish it from browser-unavailable failure |
| Routed legacy tasks | Admit an old OnlyFans/Fansly URL without mapped options through automation add; record synthetic spawn, auth-required finish, absence of yt-dlp routing and exact error/output |
| Real playback capture | Loopback HTML page, real Chromium/Xvfb/ffmpeg, final capture task/history/file and ffprobe observations if public routing reaches capture |
| Capture lifecycle | Pause/cancel during observed positive playback progress; failed page/no-video/start timeout; capture unavailable in a separately pinned host configuration |
| Fallback selection | Real primary DRM classification followed by real clear-media browser playback if reachable; no fake executor in the packaged golden |

The loopback server serves HTML plus sufficiently long deterministic H.264/AAC media, with HEAD, fixed MIME/length/Last-Modified, ranges and request logs. Include landscape/portrait, silent/video-only and stationary/no-video pages. The media must outlast quality settling and recording startup; the existing two-second download fixture is insufficient.

A candidate fallback fixture serves a page whose static media declaration leads the generic extractor to a DRM-marked DASH manifest while browser JavaScript selects a clear loopback video. Admit through automation add to avoid metadata hydration blocking admission. The pre-port characterization must show whether the actual extractor emits a recognized DRM message and enters capture. The candidate is not an established successful route.

There is no direct public “run browser capture” endpoint today. Do not add a production endpoint or test-only production composition hook to make this gate reachable.

Fixed OnlyFans/Fansly origins and signed-CDN allowlists prevent an arbitrary numeric-loopback profile URL from exercising those managers. Real-browser driver tests can fulfill synthetic site responses through Playwright routing; that is separate integration evidence, not a packaged authenticated-site golden.

Subscribe to public SSE before task admission. Cancel/pause after the relevant browser media-body request and positive capture progress, with bounded condition waits. Retain full raw events/requests. Pin status order, attempts, output/error, history, paths, profile state and meaningful ffprobe fields.

### Recording comparison contract

Recording comparisons are structural, with measured bounds selected from repeated pre-port runs of each fixture and relevant audio/host configuration. Retain the original media artifacts and full ffprobe output. The comparison contract records:

- The packaged build, fixture/media hashes, Chromium/ffmpeg/Node versions, display size, audio configuration and capture options.
- Every baseline run's file size, container/stream durations, stream codecs, dimensions, frame-rate observations, audio presence and decode result.
- Exact invariant fields: output naming/path structure, container, video codec, dimensions, expected audio presence and codec, and successful full decoding.
- Concrete lower/upper bounds in bytes and seconds or milliseconds for each size/duration field allowed to vary, with the run identifiers and measurements that justify those bounds.
- The comparison projection for task/history/output data, including how recording size/duration is checked against the same recorded bounds while retaining raw values.
- The observed lifecycle sequence and any existing harness projection applied to timing-dependent progress/log values.

Freeze this contract before implementation. Do not invent numeric tolerances in the design without runs, select bounds from post-port output, replace meaningful fields with unchecked placeholders, or widen bounds to accept a mismatch. Capture `durationMs` derived from the supplied job hint remains exact; measured container/stream duration is checked separately.

The structural comparator applies only to the new recording cases and packaged executor integration. Existing direct-download comparisons retain their filenames, file sizes, durations, output/error fields and normalization rules (`GOLDENS.md:103–108,226–231`, `reports/4-loopback.md:107–123`). Existing extension handshake goldens do not establish dedicated-session or capture behavior.

If repeated baseline runs do not support useful structural bounds, characterization remains incomplete and the recording gate does not pass. Stabilize the fixture/environment and repeat before porting; reporting nondeterminism does not waive the comparison.

### Packaged executor integration and phase closure

A separate packaged integration harness drives the real `BrowserCaptureExecutor` against the loopback page outside public task admission. It uses the packaged compatibility sidecar and real Chromium/Xvfb/ffmpeg, records callback traces, and verifies produced media with the pre-port structural contract. It also exercises the reachable capture lifecycle/failure cases. Launching the sidecar alone is supplemental; it does not replace driving the executor that creates the job, consumes protocol events and returns output.

The harness is test-owned code. It adds no production endpoint, admission bypass or fake capture executor to the application. Establish its pre-port observations before implementation and compare the port against them.

The packaged reachability characterization selects the acceptance branch:

| Recorded pre-port result | Required phase-6b capture gate | Claim retained in report and `OWNER-REVIEW.md` |
| --- | --- | --- |
| Existing public admission reaches DRM fallback and recording offline | Record reachable capture/fallback/lifecycle goldens before the port; require those cases, packaged executor integration, characterization/native tests and the unchanged existing golden suite to pass | Public offline end-to-end proof covers exactly the recorded routes and configurations |
| Existing public admission cannot reach DRM fallback or recording offline | Require the recorded failed/unreachable characterization, characterization/native tests, packaged executor integration against the loopback page, all reachable profile/routing cases, and the unchanged golden suite | Phase 6b may close with this bounded proof; list exactly which public capture/fallback/lifecycle paths lack end-to-end proof and where the public route stopped |
| Public reachability or baseline recording bounds have not been characterized, or packaged executor integration fails | Gate incomplete | No phase-completion claim |

For the second branch, missing public end-to-end proof is an accepted phase-6b proof limit, recorded explicitly in both the phase report and `OWNER-REVIEW.md`. It is not evidence that the missing route works. Name the uncovered paths individually rather than saying only “capture untested.” Preserve any narrower public proof that did succeed.

This acceptance rule does not waive ordinary static/test/catalog/ratchet gates, packaged launch, existing goldens, persisted-data proof or required offline manual work.

### Persisted real-data proof

Use a copy of the owner's `onlyfans-profiles` and `fansly-profiles` directories. Decode every inventory with old and new readers, compare structural results and key stripping, and exercise load/save/reload on another disposable copy. Report only file/item counts and failing schema paths, never identifiers, URLs, signed data, cookies, tokens or file contents.

Copy browser-session/LevelDB data only for the specifically required read test; do not launch against or modify the live session. A copied token parser result is checked privately for equality, with only success/count reported. Profile JSON proof does not establish that a copied authenticated browser session remains usable.

### Offline manual and network limits

Offline manual work on an isolated profile must exercise real headed playback capture with and without Pulse, portrait/landscape origin placement, pause/cancel, sidecar termination, profile get/list/reopen, and missing-browser/Xvfb behavior. Confirm output can be opened and contains the intended synthetic picture/audio, not merely a nonempty MP4. Where public capture admission is unreachable, exercise capture through the packaged executor harness and label that route.

Offline tests can prove orchestration, raw process behavior, local playback/recording, DOM selection, mocked/routed API traversal, file persistence, queue integration and malformed/error handling.

They cannot prove current site login, anti-bot acceptance, signed API compatibility, current response envelopes, CDN authorization/expiry, real locked/covered access, Widevine licensing/decryption, remote ABR behavior or actual authenticated OnlyFans/Fansly mapping/download completion. Those require separately authorized network/manual evidence. A clear local video proves the recording pipeline, not DRM playback.

Run strict package checks, `bun run port:check`, whole-repo `bun run check`, `bun run test`, `bun run deps:check`, Linux packaging, CLI build and full goldens in port-guide order. Record local, packaged, manual, hosted-CI and live-network proof separately.

## 11. Behavior kept as it is

Candidates for the owner's review, not fixes in this phase:

- Availability does not verify ffmpeg, xdpyinfo, Pulse, executable permissions or Widevine; a preferred browser name can resolve outside the advertised Chromium family (`B/availability.ts:47–85`).
- Display selection has no reservation, and readiness deadline exhaustion succeeds.
- Capture preflight can spawn after early cancellation; the abort listener is registered after onSpawn and does not replay an already-aborted signal (`B/executor.ts:206,278`).
- Capture cancellation's default ten-second grace is capped at two seconds, may request TERM twice, and does not await close.
- DRM fallback can overwrite the capture handle with the primary handle after a synchronous primary finish (`B/drm-fallback.ts:39–55`).
- Chunk-local protocol parsing loses split messages and split UTF-8; tails count string code units; parsed log events always report stdout, even when received on stderr.
- Recorder stderr and pactl stderr are piped and unread. Recorder and Xvfb have no child-error observer. Recorder runtime failure does not trigger audio fallback. The compatibility layer preserves the resulting backpressure and unhandled-error behavior (`B/display.ts:31–40,57–65`, `B/recorder.ts:178–188`).
- Recorder stop registers its close listener only when stop begins; an earlier close is not replayed. It may therefore wait for the four-second fallback after the child has already closed (`B/recorder.ts:130–160`).
- Resource setup and sequential cleanup have leak paths; stronger finalization would change behavior.
- Capture jobs remain in temporary directories and can contain extracted localStorage data.
- Timestamp output names are unreserved, ffmpeg overwrites, original downloads overwrite deterministic targets, and failed parts/temp files remain.
- Profile writes have fixed temporary names, no fsync/lock, and no transaction with media rename. `collect` saves before incrementing pages.
- Already queued browser responses can mutate a profile after the mapping loop chooses a terminal state.
- Mapping/open admission has races; enqueue checks mapping but not downloading; enqueue failures leave earlier changes.
- `stop` does not terminate the Fansly login child or abort a direct download.
- OnlyFans accepts numeric IDs where Fansly requires strings. Attachment extras support fewer envelopes than item extraction.
- An original URL wins over DRM metadata; old cached URLs survive a locked recollection unless explicitly deleted for refresh.
- Chat media matching ignores filter query; purchased matching scopes user, not purchased-route filter.
- Page quality pinning starts with the first video, while other selection uses expected duration; reported dimensions can be upscaled.
- Unknown/absent-duration end polling can run indefinitely; known-duration wall timeout returns success without proving ended. Returned capture durationMs uses only the supplied hint.
- Persistent capture contexts skip supplied cookie/localStorage seeding; nonpersistent localStorage seeding is not origin-scoped.
- The LevelDB parser is a nearby-byte heuristic, not logical LevelDB state reconstruction.
- Profile executor errors all become auth-required. Capture text containing ffmpeg becomes binary-missing before other classification.
- Callback exceptions retain their inconsistent catches, including a second finish attempt after a profile success callback throws.
- Transfer length uses `Number(header) || 0`, including infinite and negative totals. Progress receives that value before each chunk reaches the writer; only the completed pipeline's length check raises the incomplete-file error and leaves `.part`. Zero, missing and malformed headers disable nonzero-length matching for a nonempty body (`B/onlyfans-profile.ts:1022–1045`).

## 12. Decisions on the draft's open questions

The decisions below were recorded on 2026-11-18. The independent review's recommendations are adopted, with the explicit packaged-acceptance and transfer-preservation decisions recorded here.

1. **Malformed recognized sidecar events.** Adopt section 9's narrow typed-boundary rejection for consumed fields that cannot inhabit the declared models. Old/new fixtures enumerate the exact changed shapes before implementation. Unknown discriminants, ignored fields and syntax/plain-text behavior stay unchanged. This is a requirements-forced boundary change, recorded in `OWNER-REVIEW.md`.

2. **Shared process extension.** Add raw spawn, SIGINT and nonclosing stdin writes to phase 5's process contract in downloader-core, with its own tests and no changed behavior for existing callers. The same extension includes independent output-consumption and raw-observation policies from section 5. It does not introduce another general process service. Validate the native open input feeder against installed stdin Sink behavior; `endOnDone: false` exists but does not prove nonwaiting write acknowledgment.

3. **Native timer liveness.** Keep the explicit keepAlive contract and Node process-exit tests. The installed default clock uses referenced timers; no regression is inferred from `Effect.sleep` alone. Compatibility retains the original timer and timeout-signal behavior.

4. **Packaged capture reachability.** Make packaged pre-port characterization the first implementation step and record its result. If existing public admission reaches fallback and recording offline, record capture goldens before the port and make them gate the phase. If it cannot, phase 6b may close on the recorded characterization, characterization/native tests, packaged executor integration against a loopback page outside public admission, the unchanged golden suite and the other ordinary phase gates. The report and `OWNER-REVIEW.md` must state exactly which capture paths lack public end-to-end proof. No test-only production endpoint is added.

5. **Capture golden stability.** Use structural recording comparisons with concrete size/duration bounds selected from repeated pre-port runs. Record the bounds with the measurements and run identities that justify them; freeze them before implementation. Retain raw artifacts and enforce codec, dimensions, expected audio presence and full decodability. Existing direct-download comparison rules remain unchanged. Uncharacterized or unusably unstable baseline bounds do not pass the gate.

6. **Native process cutover ownership.** Keep compatibility in the application through desktop phase 9.1, following the downloader-core precedent. Implement and test native policies now. Carry acquisition, output buffering/rechunking, unread-pipe behavior, omitted-error-observer behavior, late close, scope cleanup, liveness and error differences into that phase's explicit acceptance record.

7. **Live-site acceptance.** Complete the offline port gate with the proof limits in section 10. Treat live login/mapping/download/DRM evidence as a separate acceptance activity. Nothing in a loopback fixture establishes a current license or authenticated remote session.

8. **Unread pipes and raw-error observation.** Adopt the review's independent policies. Compatibility keeps pactl/recorder stderr piped and unread, omits Xvfb/recorder child-error listeners, and retains each site's actual observer lifetime and stop-time close registration. Default downloader policies remain unchanged. Isolated oracle subprocesses characterize backpressure, asynchronous errors and process-level termination. Native differences remain cutover obligations.

9. **Transfer-total decoding.** Preserve today's coercion, callback value, later error and partial-file residue exactly. Decode the external header as string/null; do not semantically decode the derived total or typed progress calls before transfer or delivery. This follows the task-queue precedent for typed in-process inputs and separate write serialization. Characterize exponent/decimal overflow, zero, missing, malformed and negative values through the real transfer method and executor projection.

These decisions add no application behavior change beyond section 9. The packaged acceptance branch defines the extent of phase proof; it does not change production routing.

## 13. Review

Reviewer: an independent session on the review-panel tier, read-only, 2026-11-18. It read the plan, port guide, rule set, draft, precedents, package, consumers and tests, and installed Effect 4.1.4, platform-node 4.1.4 and Playwright 1.65.1 sources, and ran in-memory probes. One major, two questions; no blocker or minor findings:

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | major | The shared process contract could not preserve piped-but-unread stderr or the absence of child-error observers at recorder and Xvfb sites. | Sections 5–6 define independent descriptor, consumption and raw-observation policies, unchanged downloader defaults and exact capture-site policies; sections 10–12 require isolated backpressure/error/termination characterization and retain native differences for phase 9.1. |
| 2 | question | The design did not define phase closure when public offline fallback was unreachable or recording output required a measured comparison. | Sections 10 and 12.4–5 make packaged pre-port characterization the first step, require measured structural bounds and reachable pre-port goldens, and define closure through packaged executor integration plus explicit end-to-end proof gaps when public routing cannot reach capture. |
| 3 | question | Finite numeric schemas left it unclear whether an overflowing transfer total would be rejected before the current progress and completeness-check path. | Sections 3–6, 9–12 retain string/null header decoding, `Number(header) \|\| 0`, undecoded typed progress, the post-pipeline incomplete-file error and `.part` residue, with the explicit overflow/zero/missing/malformed/negative characterization matrix. |

The reviewer found sound: the consumer inventory and migration scope; the sibling compatibility architecture and ownership/timing rules; persistence, file modes and failure ordering; the retained Playwright call forms and serialized page functions; and the installed Effect API direction.

The review was source/declaration inspection and in-memory probes, not compiled implementation, full test execution, packaged goldens or browser/site acceptance. Its attempted stdin subprocess probes produced no reliable observation and establish neither a failure nor successful parity.

## 14. Still open

No additional deliberate application behavior change is selected by this revision.

The native stdin feeder still needs implementation proof of nonclosing, nonwaiting acknowledgment. If the installed Sink cannot support that contract, the implementation must record the failed attempt and present the alternatives: a lower-level native input capability behind the shared process service, or a changed native acknowledgment contract considered at phase 9.1 cutover. It must not change the compatibility write or silently make recorder stop wait for drain.

Packaged public capture reachability and numeric recording bounds remain measurements to obtain before implementation, under the settled acceptance rule in section 10. They are not choices left to the implementer. Any proposed production endpoint, broader comparison tolerance, stronger cleanup, early transfer validation or other deliberate behavior change requires a separate decision and an explicit section-9 entry before implementation.