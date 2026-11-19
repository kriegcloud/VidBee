# Design: `@vidbee/downloader-core` (phase 5)

Status: reviewed, findings resolved (section 13).

Design gate per plan decision D14 as amended on 2026-11-17: a first draft was prepared from a
source inventory, the draft's open decisions were taken in section 12, and two independent
sessions reviewed it. Section 13 records the findings and their resolutions.

Inputs: `PLAN.md` sections 3–7 and Amendments, `PORT-GUIDE.md`, `tsconfig.base.json`, the db
design, the task-queue design and its implementation (phase 4), a source inventory of this package,
installed Effect 4.1.4 and `@effect/platform-node` 4.1.4, `yt-dlp-wrap-plus` 2.5.0, and the two
independent reviews.

This is a read-only design; no implementation, full test execution or packaged proof is claimed.
Source inspection and the reviews' in-memory probes do not establish those gates.

Paths below are repository-relative. **C** means `packages/downloader-core/src/`; **M** means
`apps/desktop/src/main/lib/`; **Q** means the phase-4 packages `packages/task-queue` and `packages/task-queue-legacy`. Line numbers identify
existing source, not proposed companions.

## 1. What the package is, and what makes its port risky

Shared URL classification, argument construction, metadata discovery, profile inventories and
yt-dlp/gallery-dl execution. About 11,600 source lines. Vendored Python remains untouched.

There are two execution systems: `DownloaderCore`, an EventEmitter-based in-memory downloader
(`C/downloader-core.ts:442`), and the task-queue executors (`C/yt-dlp-executor.ts:214`,
`C/gallery-dl-executor.ts:312`). The desktop uses the latter. This phase does not consolidate them.

Five properties decide the design:

1. **Synchronous behavior is public.** Argument builders, executor `run`, inspector `get/list/cancel`
   and social-manager `get/list/map` return immediately. Some of those methods read or write files.
   Executor failures can call `onFinish` before `run` returns.
2. **The wrapper changes process semantics.** `yt-dlp-wrap-plus` parses progress before downloader
   stdout listeners run, stores a child-process error until `close`, and normally converts a
   nonzero close code into an `error`, not a `close`. Injected `spawnFn` emitters already represent
   wrapper observations and can deliver a nonzero `close` directly.
3. **Cancellation acknowledges a request.** Executor `cancel` sends signals and arms escalation;
   it does not await reaping. `pause` calls that same operation. Effect's installed `handle.kill`
   waits for termination and therefore cannot be substituted directly.
4. **Files are independent persistence surfaces.** Instagram inspections and social profile maps
   are rewritten JSON, outside the queue database. Reads can mutate and save inventories.
   Today's zod readers strip unknown keys, and the port keeps that (A2). File decoding, existence
   probes, direct writes and write-then-rename sequences have separate observable policies.
5. **Promise timing and ordering matter.** Settings preparation, admission, scan serialization,
   file verification and enqueue calls contain separate interleaving points. Most executor output
   handling is chunk-synchronous; Redgifs consumes lines asynchronously and can finish stdout
   before the child exits. The task-queue design's synchronous sink and `LegacyTiming` rules
   apply here too.

## 2. Shape of the port

- **`packages/downloader-core`**, ported: models, tagged errors, services, native implementations,
  and pure synchronous exports whose signatures can remain unchanged under the full rule set.
- **`packages/downloader-core-legacy`**, unported and temporary: old classes, Promise signatures,
  callback executors, synchronous host adapters and live zod schemas, over the new implementation.
  It shrinks with its consumers and is deleted in phase 10.

The dependency points one way: legacy imports ported. Ported code never imports the sibling.
Existing filenames stay. New companions follow D21: `Download.model.ts`, `Downloader.errors.ts`,
`DownloadArguments.service.ts`, `DownloadArguments.layer.ts`, `Process.driver.ts`, and equivalents.
A `legacy/` directory inside a ported package would still be checked; it is not an exemption.

The table covers all 32 existing export entries (`packages/downloader-core/package.json:6`).
**P** means the existing pure functions, constants and structural types retain their original entry.
**L** means the old callable API or zod value lives at the corresponding legacy entry.
Native effects are exposed through services, not by silently changing a pure function's signature.
Counts are external source/test files with an import change at that entry; overlapping rows are not additive.

| Entry | Ported package | Legacy package | Files changing imports |
| --- | --- | --- | ---: |
| `.` | P re-exports and domain types; native services/layers | `DownloaderCore`, callback executors, inspector, enqueue/restore functions, retry, short-link expansion, runtime-argument builder and host-dependent helpers below | 5 |
| `./browser-cookies-setting` | P: both functions and type | none needed | 0 |
| `./cookie-setup` | P except clock-reading helpers | `matchCookieSites`, `inspectNetscapeCookies` | 2 |
| `./cookie-browser-paths` | P: all four helpers; target-platform joining implemented with pure string functions | re-exports where needed | 3 |
| `./download-file` | P: all three functions | none | 0 |
| `./dzen-profile` | P | none | 0 |
| `./facebook-gallery` | P | none | 0 |
| `./filename-style` | P | none | 0 |
| `./format-preferences` | P | none | 0 |
| `./format-presentation` | P, including generic signatures | none | 0 |
| `./gallery-dl-executor` | routing/template predicates, constants, native layer | callback `GalleryDlExecutor`, `HostRoutingExecutor`, constructor option types | 0 |
| `./instagram-profile` | category URLs/constants, normalizer, inspection ID, native service | inspector class, enqueue/restore, `buildGalleryDlRuntimeArgs` | 1 |
| `./instagram-url` | P | none | 0 |
| `./format-selector` | P | none | 0 |
| `./schemas` | Effect schemas | retained zod dependency closure below | 1 |
| `./pinterest` | P | none | 0 |
| `./output-path` | P | none | 0 |
| `./audio-format-preferences` | P | none | 0 |
| `./subtitle-languages` | P | none | 0 |
| `./snapchat` | P | none | 0 |
| `./threads` | P | none | 0 |
| `./tiktok-photo` | P | none | 0 |
| `./tiktok-short-link` | predicate, domain types, native service | Promise expansion and injected-fetch option types | 0 |
| `./yt-dlp-args` | pure selectors/parsers/formatters with explicit inputs; types/constants | builders needing host state, subtitle skip selector, cookie normalization, implicit-platform wrapper, home/path helpers, retry, throwing wrappers where required | 3 |
| `./yt-dlp-wrap` | constructor-resolution helper, unchanged signature | import-time wrapper initialization for legacy roots | 0 |
| `./social-media` | P resolver/asset helpers, defaults and types | `SocialMediaOptionsSchema` | 2 |
| `./social-media-service` | domain types and native operations | Promise map/inspect/preview/download/restore functions and `writeKnownItemsFile` | 3 |
| `./social-profile-manager` | native service | synchronous class and options | 2 |
| `./mapped-profile-source` | P; exported dedicated-session platforms are an array, not a Set | none | 0 |
| `./onlyfans-profile` | P URL/site helpers, route data and structural types | live OnlyFans zod schemas and their dependency closure | 1 |
| `./fansly-profile` | P profile/site helpers and structural types | `FanslyCommandSchema` | 3 |
| `./vsco` | P | none | 0 |

**Nineteen distinct consumer source/test files change imports.** Desktop files are
`task-queue-host`, `download-facade`, `yt-dlp-info`, `gallery-dl-manager`, `profile-subscriptions`,
`social-profile-manager`, `browser-cookie-access`, `extension-cookies`, `command-utils`,
`agent-media`, `main/download-engine/args-builder.ts`,
`main/ipc/services/browser-cookies-service.ts`, and renderer `DownloadDialog.tsx`.
CLI adds `src/transport/local-client.ts`. Packages add browser-capture `src/executor.ts`,
`src/onlyfans-profile.ts`, `test/fansly-profile.test.ts`; subscriptions-core `src/schemas.ts`;
UI `social-media-dialog.tsx`.

Mixed imports split: pure values and types stay at their old specifier; only L values move.
The count excludes package-local tests, manifests, bundler configuration and comment-only matches.
It must be regenerated after phase 4 merges; main currently still contains the old task-queue sources.
A browser-path import may share a file with a required L import; retaining its pure specifier does
not add another consumer file.

The symbol-level split makes the host dependencies explicit:

| Current symbol | Ported form | Compatibility wrapper |
| --- | --- | --- |
| `resolveSubtitleDownloadSkipReason`, `yt-dlp-args.ts:354` | pure calculation takes the already normalized cookie setting; `DownloadArguments` performs normalization at the same position as today | old two-argument signature performs the synchronous cookie probe, then calls the calculation |
| `normalizeBrowserCookiesSettingForYtDlp`, `yt-dlp-args.ts:274` | `DownloadArguments` operation over `DownloadFiles` and path capabilities; pure branch calculation takes the probe result | old signature retains the Firefox `cookies.sqlite` `existsSync` probe and its false-on-failure behavior |
| `appendPlatformFilenameSafetyArgs`, `yt-dlp-args.ts:413` | explicit required platform parameter, represented without a Node type dependency | old optional platform parameter defaults to `process.platform` at call time |
| `getBrowserProfileBaseDirs`, `cookie-browser-paths.ts:18`; `getBrowserProfileCandidates`, `:128` | unchanged signatures; pure target-platform string joining, including Windows paths on a POSIX host | re-export the same pure functions |
| `resolvePathWithHome`, `yt-dlp-args.ts:375` | explicit home/path inputs in the calculation; host-facing operation belongs to `DownloadArguments` | old signature reads the home directory synchronously |
| `resolveFfmpegLocationFromPath`, `yt-dlp-args.ts:490` | operation using the host `Path` capability, or calculation with an explicit host path implementation | old synchronous signature retains host `dirname` semantics |
| `buildDownloadArgs`, `buildVideoInfoArgs`, `buildCaptionExtractArgs`, `buildPlaylistInfoArgs`, `yt-dlp-args.ts:602,758,815,870`; `buildGalleryDlRuntimeArgs`, `instagram-profile.ts:452` | `DownloadArguments` effects; host probes and defaults remain in their existing evaluation order | old synchronous signatures over synchronous capabilities and the warmed runtime |
| `matchCookieSites`, `cookie-setup.ts:403`; `inspectNetscapeCookies`, `:348` | calculations with explicit current time; service operation obtains it from Clock | old signatures obtain current time synchronously |
| `DownloaderCore.initialize`, `downloader-core.ts:464` | `Downloader.initialize` uses `DownloadHost` for the environment write and discovery | old Promise method writes `process.env.FFMPEG_PATH` synchronously before returning its Promise, after directory creation and binary resolution, before wrapper construction |
| `instagramInspectionId`, `instagram-profile.ts:107` | pure synchronous SHA-256 with identical input bytes and output | re-export |
| `retryTransientYtDlpNetworkError`, `yt-dlp-args.ts:172`; `expandTikTokShortLink`, `tiktok-short-link.ts:103` | effects using timing and HTTP services | old Promise signatures and injected sleep/fetch seams |
| `writeKnownItemsFile`, `social-media-service.ts:86`; `restoreBrowserCaptureGroupCap`, `playlist-plan.ts:135`; Instagram/social enqueue and restore exports | file and queue service operations | old Promise signatures, shared host queue and existing timing |

The remaining P rows operate on supplied values. `download-file` joins normalized strings itself;
`output-path` sanitizes and constructs strings; URL, format, filename and subtitle helpers operate
on their arguments. A throwing validation helper needs a Result-based ported form and a legacy
throwing wrapper where the rule set requires it; throwing does not make it a host capability.

Browser paths are distinct from host paths. The caller already supplies the target platform.
Using the host's `Path` service would produce the wrong separators and normalization for another
platform. Characterize the pure implementation against today's `path.win32.join` and
`path.posix.join`, including separators, roots, dot segments and candidate order. It imports
neither `node:path` nor the host `Path` service.

## 3. Schemas

Models precede contracts. `types.ts` retains its name and re-exports schema-derived aliases.
Use `Download.model.ts`, `MediaInfo.model.ts`, `Profile.model.ts`, `Process.model.ts`,
`GalleryProtocol.model.ts` and `ProfilePersistence.model.ts`.

**Structs, not classes.** `DownloadTask`, `DownloadProgress`, `DownloadRuntimeSettings`,
`CreateDownloadInput`, `VideoFormat`, `VideoInfo`, playlist and Instagram shapes,
`SocialMappedItem`, `SocialProfileCategory`, `SocialMappedProfile`, cookie shapes and social options
are structs. Existing object literals, spread copies and structural mutation remain valid.
Use `S.mutableKey` on mutable fields and `S.mutable(S.Array(...))` on mutable arrays, recursively.
Compile-only mutual-assignability fixtures retain today's declarations, including optional `undefined`.

**Literal kits** own download type/status, playlist media kind, Instagram categories/states/error
codes, mapped/social platforms, profile states, cookie enums and protocol discriminants.
Reuse task-queue's models for executor context, progress, output, classified errors and events.
Do not create a competing `TaskOutput` or narrow task-queue's open options record.

**Numbers are `S.Finite`.** Do not import unused zod refinements into ordinary domain models.
Keep checks that actually run: social option defaults/date ordering/maxPosts; saved-profile
validation; social-summary nonnegative integer counters; existing enqueue and URL guards.
`DownloadRuntimeSettings` includes host-only `cookieSource` (`C/types.ts:119`).
It is distinct from the API settings schema that intentionally excludes that field.

Boundary codecs follow the reader's existing acceptance and recovery policy:

| Boundary | Today's malformed/unexpected-input behavior | Port policy |
| --- | --- | --- |
| Core yt-dlp JSON, `downloader-core.ts:526–618` | syntax error rejects; absent fields default; some wrong shapes throw later or escape casts | JSON and field decoders; preserve defaults and fieldwise omission; newly rejected shapes are section 9 |
| Facebook reels playlist, `facebook-profile-map.ts:28–48` | invalid JSON rejects; mapper applies playlist defaults/filtering | same syntax failure path and permissive playlist normalization |
| Generic JSONL, `gallery-dl-json-run.ts:126–138` | invalid JSON/non-URL message ignored; metadata accepted broadly | decode JSON, then message branch and open metadata; retain field-specific checks |
| Instagram document/checkpoints, `instagram-profile.ts:148–377` | bad envelope/JSON sets `parseError`; unknown message kinds ignored; bad source references omitted | the same outcomes; numeric/string source-ID conversion stays |
| Redgifs JSONL, `redgifs-profile-service.ts:43–65` | JSON syntax failures skipped; `null` reaches property access outside the catch and rejects with TypeError; wrong extractor/id ignored when access succeeds; long lines skipped | preserve syntax skipping, traversal failures and filters in the asynchronous line consumer; optional wrong-typed title remains omitted |
| Gallery tab protocol, `gallery-dl-executor.ts:607–627` | event name/path parsed; even unknown event names advance ticks | decode textual envelope without introducing an enum rejection |
| Social JSON protocol, `gallery-dl-executor.ts:558–606` | item ignored; invalid asset omitted; bad progress/complete sets `protocolError` | separate branches with those exact recovery policies |
| Instagram inventory, `instagram-profile.ts:904–932` | ENOENT means absent; other read/JSON/zod failures become fixed backup-guidance Error | same public outcomes; closed inventory codec retains today's key stripping |
| Social inventory, `social-profile-manager.ts:85–134` | get propagates read/JSON/zod errors; list omits unreadable entries | same recovery and legacy error reconstruction; retain today's key stripping |
| Netscape text, `cookie-setup.ts:348–420` | invalid/empty rows produce health results, not throws | parse row variants with existing skip/default rules |
| Known-items/checkpoint files written for Python | JSON arrays/inspection snapshots, no TS read-back at these sites | Schema encoding; exact argv JSON quoting and array order |

JSON uses `S.fromJsonString`; effectful readers use `S.decodeUnknownEffect`.
Pure parsing uses `S.decodeUnknownResult` or `S.decodeUnknownOption`, not synchronous throwing decoders.
Broad metadata fields remain `S.Unknown` until the existing branch checks them; a tuple schema must
not reject an irrelevant message the current parser ignores.

Redgifs has separate syntax and traversal branches. An object decoder that silently skips every
non-object would change the current rejection. Characterize JSON `null`, primitives, arrays,
invalid JSON, wrong extractor/id and wrong-typed title before replacing casts. Section 6 specifies
when those lines and their failures are delivered.

**Unknown keys are stripped from rewritten inventory files, as today.** The zod readers drop keys
they do not know, so the Effect codecs are closed structs, using the default
`onExcessProperty: "ignore"` decoding behavior. This differs from task-queue's persisted JSON,
which the old code read with a cast and therefore kept whole.

**Zod liveness is rooted in actual parsing, not barrel exports or inferred types.**
Keep unchanged in legacy: subscriptions' `DownloadTypeSchema`, `OneClickContainerOptionSchema`,
`OneClickQualityPresetSchema`; `FanslyCommandSchema`; OnlyFans command/download/profile schemas
and their dependencies; `SocialMediaOptionsSchema`; profile-reader schemas needed to reproduce
legacy validation errors. Keep schema aliases by identity where a retained consumer uses them.
Delete `WebAppSettingsSchema`, unused API envelopes, unused Fansly aliases and other unreachable
schemas. Native-only summary/profile parsing becomes Effect Schema; type-only use does not retain zod.

## 4. Errors

There are no package-defined error classes today. There are ordinary `Error`, `TypeError`,
`SyntaxError`, zod errors, native filesystem/process errors, and arbitrary injected failures.
Executors usually report failure as finish-event data rather than throwing.

Native errors are schema-backed tagged errors in `Downloader.errors.ts`: `InvalidDownload`,
`BinaryUnavailable`, `MetadataFailure`, `ProfileUnavailable`, `ProfileBusy`, `ProfileIdentityMismatch`,
`BoundaryDecodeError`, and `HostFailure`. Carry exact `legacyMessage`, operation and original cause
where applicable; use `S.Defect()` for opaque causes. Do not expose a `FiberFailure` to legacy callers.
Native process observations retain the actual `PlatformError` value separately from these errors.

| Observable origin | Legacy reproduction |
| --- | --- |
| `yt-dlp-wrap.ts:24` | same `TypeError("yt-dlp-wrap-plus did not export a constructor")`, including legacy import-time failure |
| `downloader-core.ts:215,479,555,604` | same Error messages for missing yt-dlp, uninitialized core and `"URL is required."` |
| `downloader-core.ts:545` | same trimmed stderr or `yt-dlp exited with code ${code ?? -1}` where the wrapper emits close |
| `yt-dlp-args.ts:263`, `onlyfans-profile.ts:198`, `yt-dlp-args.ts:924` | retain complete segment/OnlyFans/Fansly guidance strings verbatim |
| `instagram-profile.ts:593,612,660,703,925,961,975` | same invalid URL/category, unreadable backup, expired inspection and category-not-ready Errors |
| `social-media-service.ts:110,241,290,404` | same map-source, unsupported-source, interpolated category and preview-unavailable Errors |
| `social-profile-manager.ts:53,107,237,241` | same eight-platform guidance, identity mismatch, unsupported category and already-mapping Errors |
| `redgifs-profile-service.ts:53` | JSON `null` rejects traversal with TypeError; on pinned Node, `Cannot read properties of null (reading 'id')`; retain class and Node message |
| Native fs/process failures on the compatibility path | unwrap the original host error where currently propagated, retaining identity, code, path and syscall |
| Injected resolver, builder, queue, fetch, sleep or callback failures | retain original value and existing throw/rejection/swallow location |
| JSON/zod failures still public | legacy adapter parses retained input on failure to reproduce the native SyntaxError or original zod validation shape |
| Executor finish failures | preserve `ClassifiedError`, nullable exit code, message, tails and result discriminant; do not reject `run` instead |
| Mapper diagnostics | remain `{ complete, error?, authRequired? }`; preserve `AuthRequired:`/`RateLimited:` text used by subscriptions |

The wrapper's error text is `"\nError code: " + code`, optionally followed by
`"\n\nProcess error:\n" + processError` and `"\n\nStderr:\n" + stderrData`
(`node_modules/yt-dlp-wrap-plus/dist/index.js:411–417`). Retain raw nullable code, original process
error and full wrapper stderr separately from persisted 8-KiB tails. Stringification of the
original error occurs at that formatting point.

Native acquisition/handle failures carry the `PlatformError` and its `.message`; they do not
invent a raw code, signal or process-error observation. Section 6 defines each site's native result.
Today's distinction between a signal exit and other handle failures is unavailable on that path.

Bridge rejections use `Effect.tryPromise` in drivers or `Effect.try` for synchronous host calls.
At synchronous callback boundaries, use `runSyncExit` and map its failure cause before throwing,
following task-queue-legacy's rule. Unwrap the original host failure or callback defect by identity;
reconstruct only the errors whose contract requires reconstruction. Preserve whether a callback
exception escapes immediately, is caught by an existing parser/finalizer catch, or becomes a
Promise rejection. A blanket catch must not allow later outputs after today's emission would throw.

## 5. Services

All contracts are `Context.Service` classes with deterministic package/file/service keys.
In this table `E<A>` means `Effect.Effect<A, DownloaderError>`; requirements are supplied by layers.
`DownloaderError` is the relevant tagged union from section 4, not `unknown`.

| Service | Contract with Effect signatures | Native layer | What legacy provides instead |
| --- | --- | --- | --- |
| `DownloadHost` | `environment: E<HostEnvironment>`; `resolveBinary(kind): E<string>`; `lowerPriority(pid): E<void>`; `setFfmpegPath(path): E<void>`; cancellation-signal ownership | Config, platform paths and process capabilities; explicit environment-write capability | fresh environment, synchronous discovery/chmod, priority hook, synchronous environment write and Node AbortController |
| `DownloadFiles` | `read(path): Effect<string, HostFailure>`; `exists(path): Effect<boolean>`; `makeDirectory(path, options): E<void>`; `makeTempDirectory(prefix): E<string>`; `write(path, text, options): E<void>`; `rename(from, to): E<void>`; `inspect(paths): E<FileInspection>` | `FileSystem.FileSystem`, host `Path.Path`, explicit byte decoding and probe recovery | synchronous fs implementations on paths reachable from sync facades; Promise adapters at existing asynchronous sites |
| `DownloadArguments` | `download(input): E<string[]>`; `video/playlist/caption(input): E<string[]>`; `gallery(settings): E<readonly string[]>`; host-dependent helpers from section 2 | original builders over host/path/probe services | old synchronous signatures via warmed runtime |
| `DownloadProcess` | `start(spec, sink): Effect<ProcessStart, HostFailure>`; declarations below | `effect/process` with the stock Node spawner | synchronous Node spawn and direct event-to-sink delivery |
| `TaskExecutor` | phase-4 `run(ctx, sink): Effect<ExecutorHandle, HostFailure>` | yt-dlp, gallery and routing layers over process/wrapper observations | callback `Executor` classes over ported implementations |
| `InstagramProfiles` | `inspect(input): E<Inspection>`; `get(id): E<CacheEntry \| null>`; `list/cancel/stop` as effects | cache, pending scans, file and admission services | synchronous reads/cancel, old Promise inspection behavior |
| `SocialProfiles` | `get/list/map/mapAndWait/stop` as effects with existing result shapes | profile state and platform mappers | synchronous `get/list/map`, Promise wait/stop |
| `SocialDownloads` | `inspect/preview/map/download/restore` as effects | executor, queue and admission services | old positional Promise functions over host queue bridges |
| `ShortLinkResolver` | `expand(value, timeoutMs?): Effect<string>` | `effect/http/HttpClient` | injected `fetch` bridge with original request options |
| `Downloader` | all `DownloaderCore` operations as effects | separate in-memory downloader implementation | EventEmitter class with old methods and synchronous event delivery |
| `DownloaderTiming` | `turn(point): Effect<void>`; `after(ms, action, keepAlive): E<Cancel>` | Clock/fibers; phase-4 timing convention | microtask turns and native timer/unref semantics |

### Process command and observations

Executor and mapper code uses `DownloadProcess`, not `ChildProcessHandle` streams.
The following declarations describe the schema-derived models and service shape; section 3's
schemas and literal kits define their data discriminants.

```ts
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type * as PlatformError from "effect/PlatformError"
import type { HostFailure } from "./Downloader.errors.js"

export type ProcessSignal = "SIGTERM" | "SIGKILL"
export type ProcessDisposition = "ignore" | "pipe" | "inherit"

export interface ProcessSpec {
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
}

export type NativeOutcome =
  | { readonly _tag: "ExitCode"; readonly code: number }
  | {
      readonly _tag: "Failure"
      readonly error: PlatformError.PlatformError
    }

export type ProcessOutcome =
  | {
      readonly _tag: "Raw"
      readonly code: number | null
      readonly signal: string | null
      readonly killed: boolean
    }
  | {
      readonly _tag: "Native"
      readonly result: NativeOutcome
    }

export type ProcessEvent =
  | { readonly _tag: "stdout"; readonly chunk: Uint8Array }
  | { readonly _tag: "stderr"; readonly chunk: Uint8Array }
  | { readonly _tag: "stdoutEnd" }
  | { readonly _tag: "stderrEnd" }
  | { readonly _tag: "rawError"; readonly error: unknown }
  | {
      readonly _tag: "rawExit"
      readonly code: number | null
      readonly signal: string | null
    }
  | { readonly _tag: "nativeExit"; readonly result: NativeOutcome }
  | { readonly _tag: "complete"; readonly outcome: ProcessOutcome }

export interface ProcessSink {
  readonly emit: (event: ProcessEvent) => Effect.Effect<void>
  readonly abort: () => Effect.Effect<void>
}

export interface ProcessRun {
  readonly pid: number | undefined
  readonly signalChild: (signal: ProcessSignal) => Effect.Effect<void, HostFailure>
  readonly signalPid: (signal: ProcessSignal) => Effect.Effect<void>
  readonly signalGroup: (signal: ProcessSignal) => Effect.Effect<void, HostFailure>
  readonly signalTree: (signal: ProcessSignal) => Effect.Effect<void, HostFailure>
}

export type ProcessStart =
  | { readonly _tag: "Acquired"; readonly run: ProcessRun }
  | {
      readonly _tag: "NativeSpawnFailure"
      readonly error: PlatformError.PlatformError
    }

export class DownloadProcess extends Context.Service<
  DownloadProcess,
  {
    readonly start: (
      spec: ProcessSpec,
      sink: ProcessSink
    ) => Effect.Effect<ProcessStart, HostFailure>
  }
>()("@vidbee/downloader-core/DownloadProcess.service/DownloadProcess") {}
```

Only compatibility produces `rawError`, `rawExit` and `Raw` completion. Its completion is Node
`close`, including nullable code/signal and the child's actual `killed` flag. Only native produces
`nativeExit`, `Native` completion and `NativeSpawnFailure`. `nativeExit` records the handle's
exit-code effect before output draining finishes; it is not a raw Node exit event.
No layer fabricates `killed` or extracts a signal name from error text.

Compatibility returns an acquired child even for Node's asynchronous missing-executable failure.
Its `pid` is undefined, and the executor reports its existing spawn PID `-1`, followed by the
existing error/close path. Native acquisition failure returns `NativeSpawnFailure` with no run,
PID or spawn event. Synchronous host throws remain `HostFailure`; their existing site catches stay.

`ProcessSpec` makes current defaults explicit. `env: undefined` means live inheritance; gallery's
complete environment snapshot is a replacement, not a later inheritance read. No download spawn
site supplies `cwd` today. Compatibility neither combines nor decodes original data chunks.
Native chunks are the stock handle's chunks and make no claim about original Node boundaries.

`signalChild` calls the owned Node child's `kill(signal)` in compatibility; its boolean is not
used by these sites and is discarded. The actual child flag is read only at raw completion.
`signalPid` preserves the distinct `process.kill(pid, signal)` operation: if there is no truthy
PID it does nothing; it catches and discards signalling errors, as
`gallery-dl-json-run.ts:47–54` does. It does not call `child.kill`, set `killed`, check whether the
owned leader already exited, or terminate a tree. `signalGroup` targets only `-pid`.
`signalTree` preserves the tree helper's group/PID fallback and Windows taskkill behavior.
All acknowledge requests without awaiting termination or pipe closure.

Compatibility passes `spec.abortSignal` unchanged in Node spawn options. Native registers an
owned abort listener and checks pre-aborted state; it calls `sink.abort`, which enters the site's
cancellation path, marks its cancellation state and requests its configured signals. If acquisition
is pending, the request is remembered and applied as soon as a handle is acquired; acquisition is
still observed and reported. Listener removal belongs to attempt cleanup. Native never ignores the
signal and never calls the waiting `handle.kill`. The abort entry does not recursively abort its
own controller.

### File text, existence and writes

`DownloadFiles.read` returns the same text as `readFileSync(path, "utf8")`: UTF-8, invalid sequences
replaced, and a leading BOM preserved. A BOM-prefixed JSON document still fails parsing.
Native uses `FileSystem.readFile` and
`new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)`.
The installed `FileSystem.readFileString` strips the BOM (`effect/src/FileSystem.ts:583`).

`DownloadFiles.exists` is false on access failure, as at today's `existsSync` sites.
The installed `FileSystem.exists` converts only `NotFound` to false (`FileSystem.ts:574`).
Read and stat operations keep their separate error policies:

| Call site | Policy retained |
| --- | --- |
| Binary discovery, `downloader-core.ts:154–206`, and FFmpeg/runtime discovery | failed existence probe is false; continue the existing search |
| Firefox cookie normalization, `yt-dlp-args.ts:303` | failed probe is false; use the existing profile-name fallback |
| yt-dlp output checks, `yt-dlp-executor.ts:436,891` | false or caught stat failure means missing/zero output at the existing branch |
| Social `get/list`, `social-profile-manager.ts:88,119` | false makes `get` create/save and makes `list` return empty; subsequent failures retain their own handling |
| Instagram inventory, `instagram-profile.ts:904–932` | read directly; ENOENT means absent; other failures become backup guidance |

There is no undifferentiated `writeAtomic` operation. `write` uses the existing truncating write
behavior, with an optional creation mode; `makeDirectory` accepts recursive creation and an optional
creation mode. `rename` is a separate operation. Services compose them in this order:

| Site | Operations, names and order | Creation modes and failure residue |
| --- | --- | --- |
| `SocialProfileManager.save`, `social-profile-manager.ts:77–82` | recursively create storage directory; update `updatedAt`; write fixed `${target}.tmp`; rename that file to `target` | directory request `0700`, file request `0600`; a pre-existing temporary file is truncated without chmod; rename failure leaves it behind |
| Instagram `save`, `instagram-profile.ts:892–901` | update cache first; if storage is configured, recursively create it; generate `${target}.${uuid}.tmp`; write; rename to `target` | directory request `0700`, file request `0600`; generated name and rename order stay; rename failure leaves the temporary file and the earlier cache update |
| `writeKnownItemsFile`, `social-media-service.ts:86–94` | return undefined for no IDs; otherwise directly write `known-items.json` in the supplied directory; return its path after the write | file request `0600`; no temporary file, directory creation or rename in this helper; existing file is truncated without chmod |
| Social map/preview and Threads scratch directories, `social-media-service.ts:112,361`, `threads-profile-map.ts:115` | `makeTempDirectory` preserves the existing `mkdtemp` prefix and generated-directory semantics; callers retain admission and recursive cleanup order | no new explicit mode argument or chmod; keep current early-failure cleanup gaps |
| `DownloaderCore.initialize`, `downloader-core.ts:468` | recursively create the download directory before binary discovery | default directory creation mode; no inventory-mode override |

Modes are creation requests subject to host semantics and umask. Existing directories and files
are not chmodded by these writes. Renaming replaces the target with the written temporary file;
it does not preserve the replaced target's inode or mode. No writer adds fsync, rollback, a
post-write chmod or failed-rename cleanup. Binary discovery's existing best-effort executable
chmod (`downloader-core.ts:141–146`) is a separate host operation.

Both file layers are tested for BOM, invalid UTF-8, permissions, existing-object modes, names,
operation order and failed-rename residue. A false existence probe must not swallow a subsequent
save failure or turn the Instagram reader into an existence check.

### Runtime and sink obligations

- The executor sink is phase 4's sink, not an asynchronous mailbox. Its synchronous work completes
  before returning. A process sink follows the same rule. Compatibility listeners enter it
  directly through the facade's synchronous runner; stream wake-up cannot replace that delivery.
- Work that suspends, including gallery verification and finalization, is forked into a scope
  owned by that executor attempt with `Effect.forkIn(..., scope, { startImmediately: true })`.
  The fork starts at the old continuation point. It must not make a synchronous sink suspend.
  Existing synchronous yt-dlp verification remains synchronous with compatibility file services.
- A downloader compatibility executor handed to `TaskQueueAPI` uses the downloader compatibility
  package's own warmed runtime. Queue callbacks synchronously re-enter the queue's private runtime:
  **downloader runtime → legacy callback → queue runtime**. Conversely, the queue's executor bridge
  synchronously calls the downloader facade, entering the downloader runtime. Neither borrows
  the other's private runtime. The second review probed synchronous re-entry in both directions.
- Each stateful downloader owner has one warmed runtime; stateless facades share a module runtime.
  Re-entry within an owner reuses that runtime. No runtime is created per operation.
  Synchronous methods work before asynchronous initialization.
- Queue/admission adapters retain the host objects' shared state. They create no second queue,
  runtime for that queue, database handle or SQLite connection.
- Pending scan sharing, serialization, queued cancellation and caches stay per inspector.
  `SocialProfileManager.map` saves `"mapping"` and returns its clone before traversal settles.
- Mark every old `await` and Promise continuation with phase-4 timing rules, including optional
  admission, settings preparation, verification, retry sleeps and enqueue loops. Preserve immediate
  starts, `Scheduler.PreventSchedulerYield`, and exit-observer Promise settlement.
- `DownloadHost.setFfmpegPath` performs the synchronous assignment before `initialize()` returns
  its Promise, in section 2's order.
- Short-link resolution retains HEAD, manual redirects, `User-Agent: facebookexternalhit/1.1`,
  the default 10-second timeout, explicit 300–399/Location checks and fail-open original input.
  `HttpClient.head` alone does not establish manual redirect behavior.

## 6. Process execution

Confirmed imports are `effect/process/ChildProcess`, `effect/process/ChildProcessSpawner`,
`effect/PlatformError`, `effect/FileSystem` and `effect/Path`; Node layers come from
`@effect/platform-node`. `ChildProcess.make(binary, args, options)` is the array constructor.
Yielding a command dispatches through the contextual spawner (`ChildProcess.ts:619,731`).

`CommandOptions` supports `detached`, `windowsHide`, separate `stdin/stdout/stderr`, `env`,
`extendEnv`, `killSignal` and `forceKillAfter`; it has no Node-style `stdio` array or AbortSignal
option (`ChildProcess.ts:443–545`). Handles expose byte streams, `pid`, `exitCode`, `isRunning`,
`kill` and `unref`, without raw close or Node killed state
(`ChildProcessSpawner.ts:86–180`). Public `make` and `makeHandle` exist, but cannot supply those
missing observations or restore synchronous stream delivery.

Two layers implement `DownloadProcess`:

- **Compatibility:** synchronous Node launch, original chunks/errors, stdout/stderr end, raw exit
  and close, with ordinary listeners synchronously entering the process sink. The application
  keeps this layer throughout this phase.
- **Native:** `Process.driver.ts` uses `ChildProcess.make` and
  `@effect/platform-node/NodeChildProcessSpawner.layer`, supplied with FileSystem and Path.
  It observes the handle's exit-code effect and drains each configured output once. It emits
  native outcomes and has the result policies below. Event-level differences go to phase 9.1.

### Spawn sites

Each row preserves the current argument expression and ordering. Every native command explicitly
sets `cwd`, `env`, `extendEnv`, `detached`, `windowsHide`, `stdin`, `stdout` and `stderr`.
**D** means detached on POSIX and attached on Windows.

| Spawn site | Command and argv | Explicit options and consumption | Timeout/cancellation |
| --- | --- | --- | --- |
| `downloader-core.ts:188–200` | shell `which <command>` or `where <command>` for binary discovery | synchronous host probe; inherited cwd/env; ignore/pipe/ignore; first nonempty trimmed stdout line | no explicit deadline; legacy host adapter |
| `downloader-core.ts:527` | yt-dlp; `buildVideoInfoArgs` or `buildPlaylistInfoArgs` | attached; `windowsHide: false`; inherited cwd/env; pipe/pipe/pipe; full stdout/stderr, wrapper completion, JSON | no process deadline; metadata retry is 3 attempts with 1-second sleeps |
| `downloader-core.ts:811` | yt-dlp download argv with FFmpeg inserted before final URL | D; `windowsHide: false`; inherited cwd/env; pipe/pipe/pipe; spawn AbortSignal; wrapper progress, combined 80,000-character log and output-path extraction | AbortSignal termination only |
| `yt-dlp-executor.ts:412–419,636` | custom builder, else rawArgs, else builder + extraArgs; FFmpeg inserted | D; `windowsHide: false`; inherited cwd/env; pipe/pipe/pipe; spawn AbortSignal; wrapper progress, chunk std, probes and tails | abort + tree TERM; default 10-second KILL |
| `yt-dlp-executor.ts:610` | replacement yt-dlp with subtitle flags removed and explicit opt-outs | same options, attempt and tails; reset progress/processing state | same cancellation handle; no second spawn event |
| `gallery-dl-executor.ts:508` | gallery-dl; `buildArgs` or complete social-extractor argv replacement | D; `windowsHide: true`; inherited cwd; replacement `{ ...process.env, PATH: childPath }`; ignore/pipe/pipe; per-chunk decoding, line protocol and tails | TERM then KILL |
| `instagram-profile.ts:253` | gallery-dl `-J`, non-JSONL inspection, extractor/category/known-profile/runtime args and URL | D; `windowsHide: true`; inherited cwd/env; ignore/pipe/pipe; stdout byte buffers, stderr checkpoints and tail | 10 minutes; 64-MiB stdout; 1-MiB stderr carry; group KILL on POSIX, tree KILL on Windows |
| `gallery-dl-json-run.ts:37` | caller binary/argv; Facebook reels use yt-dlp playlist args; others use `GALLERY_DL_MAP_ARGS` + platform/runtime args | D; `windowsHide: true`; inherited cwd/env; ignore/pipe/pipe; retained stdout, newline callback/final carry, 4,096-character stderr tail | 10 minutes; 32-Mi-character stdout limit; group KILL on POSIX, PID KILL on Windows |
| `redgifs-profile-service.ts:27` | yt-dlp `--ignore-config --flat-playlist --dump-json --no-progress <url>` | attached; `windowsHide: false`; inherited cwd/env; ignore/pipe/ignore; streaming UTF-8/readline consumer, 100,000-character line filter | child TERM only; pre-abort check; no deadline |
| delegated Windows tree control | `taskkill /PID <pid> /T /F` | existing compatibility `execFile` behavior; native control request owned separately from download output | best effort; no wait in download cancellation acknowledgement |

Inherited environments use explicit inheritance; gallery's snapshot uses `extendEnv: false`.
No row accidentally adopts stock detachment/window defaults. The synchronous discovery probe stays
a host operation, outside the asynchronous `DownloadProcess` observation protocol.

Generic mapper calls are Facebook `:28,74`, Pinterest `:63`, Threads `:74`, Snapchat `:70` and
VSCO `:132`. Keep Pinterest extractors, VSCO TLS/video options, Threads known-items JSON and the
VSCO 10-/25-second cookie-refresh waits while holding admission. Social map and preview invoke
the gallery executor (`social-media-service.ts:123,368`); preview arms an unref'd 30-second `cancel(0)`.

### Wrapper observations and real-child emulation

The yt-dlp executor consumes **wrapper observations**, one level above raw process events.
`WrapperObservation` has `progress(payload)`, `ytDlpEvent(eventType, eventData)`, `error(error)` and
`close(code)` variants, plus stdout/stderr continuation variants carrying their bytes.
Progress uses the existing `YtDlpProgressPayload` model; the wrapper event retains its two strings.
The error payload preserves the original supplied value.

Real compatibility children reach that boundary through a pure wrapper-emulation machine.
It retains full accumulated stderr and the last original child error:

| Raw input | State transition and ordered wrapper observations |
| --- | --- |
| `stdout(chunk)` | independently decode as `Buffer.toString()`; split on `/\r|\n/g`, discard empty strings and parse bracket-prefixed lines; emit each progress and then that line's `ytDlpEvent`; after all wrapper parsing, emit the stdout continuation with original bytes |
| `stderr(chunk)` | append independently decoded text to full wrapper stderr before its stderr continuation |
| `rawError(error)` | store by identity; no wrapper error or finish yet |
| `stdoutEnd`, `stderrEnd`, `rawExit` | no wrapper completion and no extra carry flush |
| `complete(Raw)` with `code === 0 || killed` | emit wrapper `close(code)` |
| other `complete(Raw)` | emit a newly formatted Error using raw code, stored process error and full stderr; do not also emit close |

The installed regex (`dist/index.js:49`) is:

```text
/\[download\][ ]+ *(.*)[ ]+of[~ ]+([^ ]*)(:? *at *([^ ]*))?(:? *ETA *([^ ]*))?/
```

It produces `percent` through `parseFloat`, `totalSize` with `~` removed, `currentSpeed` and `eta`.
It invents neither `downloaded` nor `total`. Preserve event-name/data calculation too
(`dist/index.js:419–442`). If a progress callback throws, later wrapper outputs and stdout
continuation for that chunk do not run. Do not eagerly commit transitions past that callback.

`spawnFn` remains in `downloader-core-legacy`'s `YtDlpExecutorOptions`, with its existing
`(binaryPath, args, signal) => YtDlpExecProcess` signature (`yt-dlp-executor.ts:44,149,412`).
Its returned emitter feeds `WrapperObservation` directly. Forward supplied progress payloads,
error identity and nonzero `close` unchanged, even without `ytDlpProcess`; attach optional raw
stdout/stderr only as executor continuations. Do not synthesize stdout to reproduce progress,
run wrapper conversion again, or require a child object. Its current tests retain their assertions,
including direct nonzero-close recovery branches.

Both real call sites pass AbortSignal in the wrapper's second argument, Node spawn options
(`yt-dlp-executor.ts:412–419`, `downloader-core.ts:811–814`), not its third argument.
Compatibility preserves Node AbortError delivery, stored until close. It never invokes the
wrapper's separate `pgrep`/taskkill handler (`dist/index.js:389–407`).

The installed wrapper is the real-child oracle. Its `maxBuffer` default does not impose an output
limit on these `spawn`-based `exec` paths. Production retention follows actual users; when ported
production execution no longer imports it, core keeps it only as a devDependency for oracle tests.

### Direct-spawn and Redgifs consumption

Direct-spawn sites bypass wrapper emulation:

| Site | Raw error rule | Raw close/completion rule |
| --- | --- | --- |
| Gallery executor, `gallery-dl-executor.ts:858–909` | finish immediately; cancelled if requested, otherwise classify with null exit code | enter `finalizeProcess`; flush stdout carry, preserve cancellation checks and asynchronous verification; caught finalizer rejection becomes finish data; finish remains guarded once |
| Instagram inspection, `instagram-profile.ts:348–377` | clear timer/listener and reject original error | append stderr carry; cancelled result skips document parsing; otherwise parse concatenated stdout, retain `parseError`, resolve raw code |
| Generic JSON mapping, `gallery-dl-json-run.ts:88–111` | clear timer/listener and reject original failure | clean up, deliver final pending line, derive timeout/limit/exit diagnostic and resolve; retain callback exception location |
| Redgifs, `redgifs-profile-service.ts:32–85` | reject the separate `closed` Promise; traversal encounters it at the existing await after line consumption | resolve `closed` with raw code; after line consumption return incomplete on abort, complete for zero, otherwise fixed incomplete-traversal diagnostic |

Error and close listeners may both run after settlement. Preserve their cleanup and guards instead
of replacing them with one generic compatibility completion rule.

Redgifs is a separate asynchronous line consumer. Its sink synchronously feeds bytes, stream-end
and exit observations into owned consumer state; it does not parse items or invoke `onItem` there.
A streaming UTF-8 decoder retains incomplete multibyte sequences across chunks. The line splitter
matches `createInterface({ input: child.stdout })` defaults: LF, CR, CRLF and its default 100-ms
`crlfDelay`, including a CRLF split across chunks and a delayed LF. Preserve empty-line delivery
and the existing per-line length filter.

On `stdoutEnd`, flush the decoder and deliver a final nonempty unterminated line, then complete
line consumption. Do not wait for child close to flush it. Item parsing, `onItem` and their
exceptions run from the asynchronous iteration continuation, as today; parser syntax failures are
skipped, traversal TypeErrors and callback throws reject that traversal and enter its `finally`.
Only after successful line consumption does it await the separate close observation.

Track raw exit code independently from close, starting at null and updating from `rawExit`.
The compatibility finally condition is exactly today's `child.exitCode === null`: a numeric exit
prevents the repeat child TERM; a signal exit can leave the code null even after an exit event.
It is not replaced by “close not seen” or a cancellation flag. Native uses its observed handle
termination state for its corresponding best-effort finally request, without claiming a raw code.

A required test child writes an unterminated `null`, closes stdout, and stays alive. Traversal must
reject from the async continuation and request finally TERM before child close. A valid item variant
must publish its item at stdout end while completion still waits for the child.

### Native result policy

Native drains stdout/stderr concurrently with observing `handle.exitCode`; stream-end events are
emitted when each stream ends. `nativeExit` records the exit outcome when available, and
`complete(Native)` follows output draining and that outcome. A handle/stream `PlatformError` is
retained as failure data and terminates the attempt through the site's failure policy; it must not
leave the site waiting for an impossible raw close. Competing failures use a finish-once guard.

For yt-dlp sites, native numeric zero supplies wrapper `close(0)`. Native nonzero supplies a
wrapper-equivalent formatted error with that numeric code and accumulated stderr, without a
fabricated original child error. Native handle failure supplies an error carrying the actual
PlatformError message. These are explicit native policies, not raw wrapper observations.

Cancellation state means the site's own cancellation path has run, including native AbortSignal
handling. It wins at the existing cancellation checkpoints. Timeout/output-limit flags retain
their diagnostics and are not silently recategorized as a user's cancellation.

| Site | Native code zero | Native nonzero exit | Native failure after site cancellation | Native failure without cancellation | Native acquisition failure |
| --- | --- | --- | --- | --- | --- |
| Core metadata, `downloader-core.ts:527` | require nonempty stdout, decode/map as today; retain retries | metadata error through numeric wrapper-error formatting; no successful JSON result | no process-cancellation API at this site | `MetadataFailure` carrying PlatformError and its message; existing retry predicate still applies | same error path, no acquired process or spawn observation |
| Core download, `downloader-core.ts:811` | cancelled if requested; otherwise completed with existing progress/log/path updates | cancelled if requested; otherwise error through numeric wrapper-error path | cancelled | task error with PlatformError message | cancelled if cancellation raced acquisition; otherwise task error with PlatformError message; release active state and advance queue |
| Yt-dlp executor initial child, `yt-dlp-executor.ts:412` | existing output verification and success, subject to cancellation | numeric wrapper-error path and existing error classifier; do not newly enable close-only recovery | cancelled finish | error finish, null exit code; classifier input includes PlatformError message | same cancelled/error split; no spawn event; error message retained |
| Yt-dlp subtitle replacement, `yt-dlp-executor.ts:610` | same success/verification path and retained attempt | same numeric wrapper-error policy as initial child | cancelled finish | error finish carrying PlatformError message | same cancelled/error split; retain original attempt and no second spawn event |
| Gallery executor, `gallery-dl-executor.ts:508` | existing finalizer, protocol/manifest/file verification and post-verification cancellation checks | existing finalizer's nonzero classification with actual numeric code | cancelled finish | error finish with null exit code and PlatformError message as classifier input | same cancelled/error split; no spawn event |
| Instagram inspection, `instagram-profile.ts:253` | existing document/checkpoint parsing and category classification; zero alone does not imply ready | retain numeric exit code and existing `toCategorySummary` failure classification | cancelled inspection/category result with retained checkpoints | internal `HostFailure` carrying PlatformError/message; scan's existing catch produces unavailable/error-code summary and retains prior items | same error path, or cancelled if the site's abort path ran while acquiring; no invented child |
| Generic JSON mapper, `gallery-dl-json-run.ts:37`, including every listed platform caller | existing complete condition: no abort or output limit; retain caller-specific empty-result checks | incomplete with existing stderr/label diagnostic, timeout/limit precedence and numeric code | incomplete/cancelled result; no spurious signal diagnostic | incomplete error result carrying PlatformError message and retained output | incomplete error carrying PlatformError message, or cancelled if the cancellation path ran during acquisition |
| Redgifs, `redgifs-profile-service.ts:27` | complete only after successful line consumption and no abort | existing fixed incomplete-traversal diagnostic after line consumption | incomplete/cancelled result | incomplete error result carrying PlatformError message; line-parser/callback exceptions still fail traversal separately | incomplete error with PlatformError message, or incomplete/cancelled if aborted |

The Instagram public summary has an error code rather than a free-form message field; the internal
failure retains the PlatformError message and feeds the existing classification catch. No new
public summary field is introduced. Discovery remains a synchronous host probe whose failures
return null; taskkill control failure remains best effort. Neither uses a download completion result.

Today's distinction between a signal exit and other process failures is unavailable for native
handle failure at every row above. Tests pin that limitation, cancellation precedence and each
site's final result now. Event-level differences remain phase-9.1 cutover work.

### Callback mapping and signals

| Today's callback/operation | Obligation |
| --- | --- |
| `onSpawn` | sink spawn once at the existing attempt boundary, same PID/kind/time; yt-dlp priority lowering precedes notification; gallery has no priority lowering |
| wrapper progress | wrapper-observation input, aggregator, then sink progress; real compatibility wrapper parsing precedes raw stdout continuation |
| `onProcessing` | once after complete CR/LF processing-line detection; retain suppression after cancel/settle |
| yt-dlp `onStd` | chunk-based; remove one trailing `/\r?\n$/`; processing detection precedes std |
| gallery `onStd` | nonempty `trimEnd` lines split on `/\r?\n/`; stdout std precedes protocol progress; stderr retains `expectedSilenceMs` |
| `onFinish` | guarded once; same tails/result/time; retain final stdout carry and unflushed gallery stderr carry |
| `cancel(timeout?)` | mark cancellation, request immediate signals, replace escalation timer and acknowledge without exit wait |
| `pause()` | exactly `cancel(configuredGrace)` |
| cancelled completion | follows the site's completion/failure or post-verification check, not cancellation acknowledgement |
| `describeCommandFor` | synchronous builder/quoting; no settings preparation or spawn |

Only native consumes handle streams with `Stream.runForEach`, each once, never also `all`.
Chunk-decoded sites must not use `Stream.decodeText`; Redgifs deliberately uses streaming decoding.
Native rechunking can still change chunk-local parsing. String tails remain 8,192 characters,
probes 4,096 characters; Instagram's stdout cap counts bytes.

The settled `ProcessControl` exposes `kill(pid, signal)`, `isAlive(pid)` and `startTime(pid)`
(`Q/packages/task-queue/src/ProcessControl.service.ts:4`). Identity checking belongs to
`ProcessRegistry`. Its native `kill` currently awaits control-command completion
(`ProcessControl.driver.ts:89`); calling it directly would not meet downloader acknowledgement.

Add narrow non-waiting request operations to that capability for PID, group-only and tree targets,
without changing existing `kill` callers. Native `ProcessRun` delegates them with `handle.pid`;
native child-only requests use the PID target, without claiming Node `child.kill` state.
Control-command acquisition/completion runs in an owned scope with immediate-start forks; request
return does not await the target or control command. PID-only Windows control omits `/T`;
tree control retains `/T /F`; POSIX group-only has no PID fallback. This addition is tested
separately from the existing queue recovery `kill` operation. No operation calls `handle.kill`.

| Site | POSIX policy | Windows policy | Acknowledgement and leader-exit behavior |
| --- | --- | --- | --- |
| Yt-dlp executor, `yt-dlp-executor.ts:668–700` | compatibility Node abort, then `signalTree(TERM)`; group then PID fallback; later tree KILL, immediate for nonpositive grace | compatibility Node abort; forced tree taskkill for both signals | requests/timer only; group can reach descendants after leader exit; PID fallback has no descendant guarantee; Windows tree discovery may fail |
| Gallery executor, `gallery-dl-executor.ts:914–955` | `signalGroup(TERM)` then group KILL; no PID fallback | `signalTree`, forced taskkill | requests/timer only; POSIX group can survive leader; Windows tree discovery may fail; finalization still waits for its observations |
| Generic JSON mapping, `gallery-dl-json-run.ts:46–60` | immediate group KILL, no fallback | `signalPid(KILL)`, missing-PID guard and swallowed errors; no tree fallback | handler returns after request; PID operation is still attempted after leader exit; Windows descendants may retain pipes |
| Redgifs, `redgifs-profile-service.ts:36,80–83` | owned `signalChild(TERM)` in compatibility; no group/tree fallback | same child-only policy | abort does not wait; finally repeats only under section 6's exit condition; descendants can retain stdout |
| Instagram inspection, `instagram-profile.ts:271–295,340–346` | immediate group KILL, no fallback | tree KILL | handler returns after request; inspector `stop()` separately awaits scans; no manufactured close |
| Core cancellation, `downloader-core.ts:924` | compatibility Node abort, child-only default TERM; no escalation | same child-only abort policy | active cancel returns true without close wait; pending cancellation is synchronous; descendants can retain pipes |

Native AbortSignal processing runs the same site's cancellation state transition and corresponding
non-waiting request policy. Core download therefore receives child-only TERM; yt-dlp executor
retains child TERM followed by its tree/escalation sequence. Direct-spawn sites retain their own
abort listeners and pre-abort behavior; adding native `ProcessSpec.abortSignal` support does not
repair the generic mapper's existing missed-pre-abort behavior.

The unchanged compatibility tree helper is
`packages/task-queue/src/process/kill-process-tree.ts:18–53`, moved to task-queue-legacy after phase 4.
`backgroundChildSpawnOptions` supplies only `detached`
(`packages/task-queue/src/process/child-priority.ts:13`).
Only Node abort/owned `child.kill` can update the observed Node killed flag; PID/group/taskkill
requests are not that observation.

### Native-layer differences handed to phase 9.1

None of these differences is introduced into the application in this phase. Native result behavior
is nevertheless defined above and tested now.

| Difference | Installed source and consequence | Phase-5 proof and phase-9.1 handoff |
| --- | --- | --- |
| Asynchronous acquisition/delivery | `NodeChildProcessSpawner.ts:478–500` waits for Node spawn; streams resume after producer callback return | compatibility keeps immediate launch/delivery; native scheduling is explicit |
| Acquisition failure has no child | same acquisition code fails with PlatformError instead of returning a missing-PID child | assert no native spawn event and the per-site failure policy; compatibility keeps spawn `-1`, error and close |
| Exit precedes pipe closure | `NodeChildProcessSpawner.ts:489,743–760` observes exit | native tracks exit separately, drains output before ordinary completion and labels completion Native |
| Signal/raw-observation loss | `ChildProcessSpawner.ts:86–180`; signal exit becomes PlatformError | no invented signal/killed/raw error; assert the native result matrix and message |
| Nonzero leader cleanup | `NodeChildProcessSpawner.ts:711–719` signals a detached group on nonzero numeric exit | compare descendant lifetime; compatibility adds no cleanup |
| Scope-finalizer cleanup | `NodeChildProcessSpawner.ts:677–706` may terminate referenced POSIX detached-group members after successful leader exit | process scope lasts through attempt; test successful leader with descendants |
| Detached/window defaults | `internal/nodeChildProcessSpawner.ts:4–18` | every row explicitly sets both options |
| Output rechunking | `NodeChildProcessSpawner.ts:424–466` uses PassThrough and `NodeStream.fromReadable` | pin split-UTF-8 and chunk-local progress differences; native bytes do not prove original chunk boundaries |
| Native non-waiting control | task-queue's current native control awaits helper commands; downloader uses the additive request capability | assert request return before helper/target exit and target distinctions; retain command scheduling and host differences in cutover evidence |

The implementation report carries this table to phase 9.1, which must remove or declare remaining
differences before swapping the application's layer. Tests exercise both layers with fake
executables; unavailable observations remain explicit expectations.

A process scope outlives `start` and lasts through its attempt. Closing it immediately after returning
a run would terminate the process. The executor's continuation scope likewise outlives synchronous
`run`; it stays open until owned continuations finish. Compatibility adds no descendant-termination
finalizer absent from today's site.

## 7. Pure modules

URL normalizers, filename rules, selectors, subtitle aliases, playlist planning, cookie predicates,
asset selection and progress aggregation retain algorithms and synchronous signatures with
section 2's explicit host inputs. `DownloadProgressAggregator` remains a plain stateful helper.

Replace native collections with Effect collections, preserving insertion order explicitly where
format groups, deduplication, profile items or cache eviction depend on it. HashMap iteration
does not reproduce Map insertion order. Replace format-group JSON keys with Schema encoding
that preserves tuple/null semantics. Keep equality classes, stable sorts, duplicate replacement
position and returned array mutability.

`matchCookieSites` reads time (`cookie-setup.ts:406`); its native operation takes Clock and legacy
passes current time synchronously. `inspectNetscapeCookies` shares that seam. Subtitle skip
selection shares cookie normalization's filesystem seam. Browser-path helpers use pure target
platform functions; FFmpeg dirname uses host path semantics. Home expansion, probes and builders
use host services, with old signatures in legacy.

Use `Function.dual` where `missingPipeableSignature` requires it, retaining existing call forms.
Use `Effect.fn`/`fnUntraced`, Clock, Random, `effect/crypto/SecureRandom`, Schema and Config.
Stable SHA-256 names/task IDs retain exact bytes; synchronous paths use pure synchronous hashing.
No async digest, suppression, diagnostic override, native collection or `any` cast is introduced.

### Review corrections to the pure and host contracts

The ambiguous optional-argument helpers `validateDownloadTimeRange`,
`buildFileNameCandidates` and `buildFilePathCandidates` take a single options object in the
strict package. Their compatibility wrappers retain the original positional signatures.
No unported application currently calls those strict helpers directly. OnlyFansCommand and
FanslyCommand aliases describe the schema Encoded input, preserving optional category while decoding
supplies the default. The unambiguous
`inspectNetscapeCookies(now, cookiesPath)(text)` form remains supported alongside data-first calls.

`DownloaderHost.jsonSyntaxMessage(input)` supplies the host parser's original syntax-error
message after Schema rejects malformed JSON. Compatibility derives it with the same runtime
parser as before; metadata retries inspect this message, preserving the three attempts and
one-second sleeps even for short non-JSON stdout containing transient network wording.
The strict package continues to decode process output through Schema.

Profile finalization covers exactly the old try region, including failure, defects and fiber
interruption. Cleanup releases admission before removing the Threads directory. A cleanup
failure replaces a body failure, and a throwing release prevents directory removal, as in the
old async finally. Early failures before that region retain the existing section-11 behavior.

Playlist field decoders retain unknown fields until normalization. Existing method-call
TypeErrors retain their V8 messages: the synchronous pure mapper throws them; effectful
metadata and Facebook-reels callers carry them in MetadataFailure with the original cause,
which compatibility rethrows. This follows section 9's existing null-root policy.

## 8. The compatibility package

Legacy entries export the old API over one runtime per stateful owner; pure exports may be
re-exported. Synchronous file services keep `get/list/map`, discovery and builders runnable
synchronously. EventEmitter behavior stays in legacy `DownloaderCore`, including inherited methods
and terminal order `history-updated` → `task-updated` → `queue-updated`.
Preserve import-time wrapper resolution; renderer schema/helper entries remain free of Node imports.

The process layer implements `DownloadProcess` directly over Node. Ordinary listeners enter
the synchronous sink with the downloader runtime's failure-unwrapping runner. The injected
`spawnFn` adapter enters the wrapper-observation boundary directly. Both preserve callback identity,
ordering and existing catches. Host services are ready before a synchronous facade call.

**First implementation step:** extract the inline Promise-settlement mechanism at
`Q/packages/task-queue-legacy/src/api/index.ts:166` into
`packages/task-queue-legacy/src/bridge/runtime.ts`, exported as
`@vidbee/task-queue-legacy/runtime`. Its small `runLegacyPromise` utility takes the warmed runtime,
effect and cause-to-legacy-error mapper; it uses `runFork`, adds an exit observer, and resolves or
rejects the returned Promise from that observer. Error mapping runs there, without an extra
`.then` or `.catch`. TaskQueueAPI and downloader-core-legacy both use it.

The same entry exports `runLegacySync`, using `runSyncExit` and the supplied cause mapper before
throwing. Preserve task-queue-legacy's current mapping rule
(`src/bridge/errors.ts:7`): find typed failure; unwrap original host failures; reconstruct declared
legacy errors; otherwise return the failure; squash the cause when no typed failure exists.
Downloader supplies its own error mapping for section 4, including callback defect identity.
Keep queue settlement/re-entry tests unchanged while extracting these helpers.

The queue runtime remains private (`src/api/index.ts:117–166`). Its bridge calls callback executors
inside `Effect.try`; its callbacks enter that runtime's sink synchronously. A downloader executor
therefore retains its own runtime and attempt scope. Asynchronous downloader finalization is
forked by its own sink, just as queue `emit` forks finish work into the queue's scope
(`Q/packages/task-queue/src/TaskQueue.layer.ts:351`).

- Retain core dependencies where pure imports remain; add legacy to desktop, CLI, browser-capture,
  subscriptions-core and UI. Internal versions use `workspace:^`; third-party versions use the
  root catalog and `catalog:`. Zod belongs only to legacy; wrapper retention follows actual users.
- Core gets strict source/test configurations and `check/build/test` scripts from the port guide.
  Legacy has an unported configuration and explicit `tsc --noEmit`; it does not inherit the strict base.
- Add both packages to desktop `bundledWorkspacePackages` (`electron.vite.config.ts:16`), update
  renderer dependency optimization for legacy schemas, and inspect packaged unresolved imports.
- Preserve CLI `local-client.ts` dynamic loading and inspect esbuild output. JavaScript build
  scripts retain their implementation and formatting.
- Move compatibility `*.node.ts` suites to legacy and update root `test:audit` (`package.json:34`).
  Keep compatibility Vitest suites and assertions. Native suites use `@effect/vitest` and
  `bunx --bun vitest run`; section 10 defines the explicit Node oracle.
- Core joins root Turbo check/test filters and Biome scope. Legacy joins root typechecking.
  Do not broaden legacy formatting.
- Add the section-6 ProcessControl request capability without changing existing recovery `kill`
  semantics. Both packages' tests distinguish request acknowledgement from target termination.

## 9. Deliberate changes

Only requirements-forced changes belong here and in `OWNER-REVIEW.md`:

1. **Previously unchecked malformed metadata may fail earlier.** A wrong-shaped core yt-dlp object
   can currently escape declared types or fail during mapping. Schema decoding must reject values
   that cannot inhabit the public model, including non-finite numbers such as JSON `1e999`.
   Use `BoundaryDecodeError`; legacy reports `Error("Invalid yt-dlp metadata.")` for newly rejected shapes.
   Characterize the exact old/new cases before implementation; do not classify ordinary ignored fields this way.

Measured phase-5 Core cases (the wrong-scalars characterization is the authorized assertion rewrite):

| Input/field | Before the port | Native/compatibility result |
| --- | --- | --- |
| `id: 7`, `title: false`, `duration: 1e999` in the characterized object | Numeric ID, boolean title and `Infinity` escape `VideoInfo` | `BoundaryDecodeError`; compatibility `Error("Invalid yt-dlp metadata.")` |
| Individually numeric `id`, boolean `title`, infinite `duration`/`view_count` | Wrong scalar or non-finite number survives mapping | Same declared rejection |
| Numeric `format_id`, boolean `ext`, infinite format `height` | Invalid scalar survives format mapping | Same declared rejection |
| Primitive roots and primitive entries in `formats` | Property boxing supplies valid fallback/default fields | Preserved; no new rejection for valid mapped defaults |
| `null` root; non-array `formats` | Original mapping `TypeError` | Preserved original class/message; unchanged characterization assertions |
| Malformed JSON | Parser `SyntaxError` | Native schema failure; compatibility reconstructs the original runtime parser exception |

Optional fields the old mapper ignores or trims keep that normalization before public-model
decoding. The declaration applies to mapped values that cannot inhabit `VideoInfo`, not every
unusual raw field. Retry builds metadata arguments on each of its three attempts and sleeps
through `DownloadTiming` for 1000 ms between transient failures.

Existing JSON syntax errors can remain exact through legacy reconstruction; they need no automatic
message change. Inventory key stripping, BOM-prefixed JSON rejection, false-on-failure existence
probes and Redgifs traversal TypeErrors remain preserved behavior.

Process timing differences are not accepted here in advance. The application uses the compatibility
layer in this phase. Section 6's native-layer differences are cutover obligations for phase 9.1,
which must remove or declare each one before swapping the application layer.

## 10. Verification the implementation owes

Characterization comes first against the old implementation. Keep assertions unchanged through
the port, changing only import/fixture wiring; deliberate-change cases retain explicit old/new expectations.

**Interpreter selection is part of the fixture.** Vitest remains hosted by
`bunx --bun vitest run`. Node-specific process oracles run old and new implementations in explicitly
selected Node subprocesses at the repository's pinned version, **22.23.4**
(`.node-version:1`, `mise.toml:3`). Resolve that executable through the repository toolchain,
verify its version and pass its absolute path to fixtures. A missing/wrong Node is a failed
prerequisite, not permission to substitute Bun.

Compare structured Node traces for missing executable, pre-aborted spawn signal, abort requested
inside a progress/std callback, and exact wrapper error formatting. Record event kind/order,
code/signal/killed where raw, spawn PID availability, synchronous markers, error class/message,
result and settlement markers. Assert error identity within each child process and serialize that
assertion; identity cannot be compared across subprocesses. Normalize only varying fixture paths,
PIDs and timestamps, not messages or event order.

Node oracle children, Redgifs/readline timing fixtures, signal/descendant fixtures and existing
fake downloader scripts run under explicitly selected Node. Generic protocol-output and scratch-file
fixtures may deliberately run under Bun in additional native-service tests, with a separately
selected Bun path and interpreter label. They supplement Node evidence. Replace
`#!${process.execPath}` and ambient `#!/usr/bin/env node` selection in fixtures, including
`test/redgifs-profile-map.node.ts:15`, the mapper/completion suites and Instagram fixture launchers.
Grandchildren use the fixture's explicit interpreter. Do not accidentally select Bun because
Vitest itself runs there.

Required coverage:

- Argument matrices: every option/default/override, custom-builder/rawArgs precedence, FFmpeg
  insertion, cookies/config/proxy, home/platform paths, filename/container/audio/subtitle settings
  and exact JSON argv.
- Progress/output parsing: chunk boundaries, split UTF-8, CR/LF, wrapper false positives, sidecars,
  multiple streams, processing order, paths, subtitle outcomes, tails and oversized carries.
- **Complete-facade synchronous delivery:** emit stdout, stderr, raw error and raw close through
  compatibility process → ported executor → legacy callbacks. Observe state immediately after
  each emission. Pin progress → processing → std, multiple wrapper matches, independent stderr,
  delayed child errors, completion conversion, callback identity/escape, cancellation inside a
  callback, finish-once and synchronous versus post-verification finish. A stream-only or
  state-machine-only test is insufficient.
- **Injected wrapper emitters:** keep existing `spawnFn` assertions; add no-child progress,
  original error identity and nonzero `close(7)`. Verify close-only recovery receives that close
  directly and wrapper conversion is not applied again.
- Real-wrapper oracle tests cover chunk splitting, listener exceptions, raw error then close,
  nullable code, actual killed state, full stderr and second-argument Node AbortSignal behavior.
  Exact process semantics/error strings use the Node subprocess comparison above.
- Fake executables emit recorded protocol, create media/manifests, fork descendants, exit nonzero
  or by signal, ignore TERM and delay pipes. Run both layers. Compatibility asserts parity;
  native asserts every section-6 result row and listed event difference, including acquisition
  failure, stream failure, cancellation races, rechunking and stock cleanup.
- Signal matrices cover every site's child/PID/group/tree target, fallback or absence, missing PID,
  swallowed PID-operation errors, repeated grace, Node abort, taskkill flags and non-waiting
  acknowledgement. Compare `signalPid` with owned `signalChild` and tree termination both while
  the leader runs and after it exits with descendants retaining pipes. No universal cleanup is added.
- Executor sequencing covers preflight finish/spawn, settings failure/cancel races, fallback
  identity, pause, post-stat cancellation, owned continuation scope and eventual scope cleanup.
- Both inventories cover key stripping, malformed/BOM JSON, invalid UTF-8, wrong shapes, identity,
  ENOENT, permissions, exact names/hash inputs, creation-only modes, unchanged existing modes,
  operation order, no added fsync, failed-rename residue and cache-before-save behavior.
  Known-items tests separately prove direct overwrite without rename.
- Inspector serialization, shared pending requests, cooldown, checkpoints, eviction/expiry;
  social aggregation/replacement, active exclusion, incremental IDs and admission/cleanup failures.
- **Redgifs lifecycle:** split multibyte UTF-8, CR/LF/default delayed-CRLF behavior, empty/long lines,
  final unterminated item and `null` at stdout end before child exit. Observe async item delivery,
  async TypeError/callback rejection, finally TERM before close, raw exit-code tracking, and
  subsequent close/abort/release cleanup. Syntax failures stay skipped; null retains its TypeError
  and Node message. Core-metadata section 9 does not apply.
- Shared runtime utilities preserve queue's settlement markers. Full queue/downloader tests cover
  queue → downloader launch, downloader → queue callbacks, nested callback/get/cancel re-entry,
  immediate reads and finish persistence suspended in the queue while downloader callbacks return.
  Neither synchronous sink may await verification.
- Error class/message/identity, non-Error injection, retry exhaustion, short-link fail-open,
  request options and Promise settlement at phase-4 timing points.
- Host tests pin implicit platform, cross-platform paths, Firefox probes, home expansion and
  `initialize()` environment assignment before its Promise returns.
- **Loopback goldens:** build separately before this phase on the build preceding both ports.
  `reports/4-loopback.md` records media bytes, MIME/length/Last-Modified, repeat/range responses,
  settings for cookies/proxy/config/subtitles/embedding, bundled-only kernel activation and FFmpeg
  expectations. Cancel after observed download-body request/progress, distinguished from metadata
  hydration. Compare stable lifecycle, output/history and file results, not raw progress/event
  counts. Repeated pre-port runs establish determinism; phase 5 passes them unchanged.
- Existing nine Vitest and twelve node:test files remain covered. Moving tests does not remove
  assertions; native Effect service tests are additional.
- Run package checks, `bun run port:check`, whole-repo `bun run check`, `bun run test`,
  `bun run deps:check`, Linux packaging, CLI build and goldens in port-guide order.
  Preserved behavior has zero golden changes.
- Offline manual exercise on an isolated synthetic profile covers local-file import, conversion,
  playlist enqueue, pause/resume/cancel/retry, profile get/list/reopen and descendant-held pipes.
  Fixture binaries do not establish live-site authentication/download proof.
- Never launch, stop or signal the owner's application or use its live profile. Source,
  fake-process, packaged golden, offline manual and live-network proof remain separate.

## 11. Behavior kept as it is

Candidates for the owner's review, not fixes in this phase:

- Wrapper nonzero conversion can bypass subtitle/thumbnail recovery (`yt-dlp-executor.ts:575–626`);
  injected nonzero close still reaches it.
- Core cancellation has no executor escalation; Redgifs has TERM only and no timeout.
- Generic mapping counts “bytes” as string length, retains full stdout and can miss pre-aborted signals.
- Download signal sites use bare PID/group IDs without start-time checks. Reuse can target another
  process/group. `ProcessControl` alone does not confer identity protection; adding registry checks
  is a separate behavior decision.
- Descendant gaps differ by site, especially child-only termination and Windows tree termination
  after leader exit. Close may remain pending while descendants retain pipes.
- Redgifs skips JSON syntax failures but rejects valid JSON `null` with TypeError
  (`redgifs-profile-service.ts:46–54`); stdout end can trigger that failure before child close.
- Social/Threads temporary-directory and admission ordering can leak a directory or lease on early failure.
- Inventory writes have no fsync or chmod of existing objects; failed rename leaves the temporary
  file. Social `get` creates files, `list` suppresses failures, and orphan `"mapping"` becomes
  `"partial"` only in memory.
- Instagram duplicate callers can receive the stored raw Promise rather than the first caller's
  mapped result; eviction follows insertion order; inspection reads can mark downloaded and save
  (`instagram-profile.ts:542–648,875–939`).
- Equal-count changed Instagram assets can share a download identity; failed/cancelled enqueue
  paths retry then add.
- Social assets are not individually stat-verified here; generic and social gallery completion differ.
- URL acceptance differs across normalizers; YouTube matching shadows the music playlist branch.
- Cookie health treats one fresh recognized cookie as sufficient; inspection does not enforce its
  advertised size cap.

## 12. Decisions on the draft's open questions

1. **Process backend.** Use package-owned `DownloadProcess`. Compatibility uses synchronous Node
   spawn/direct listeners; native uses `effect/process` and the stock Node spawner. The application
   keeps compatibility until phase 9.1; no custom handle promises unavailable raw observations.
2. **Signals.** Preserve per-site child/PID/group/tree policies, non-waiting acknowledgement and
   timer grace/reset behavior. `ProcessRegistry` owns identity checks. Never call `handle.kill`.
   Cancellation intent and raw Node killed state remain separate.
3. **Newly rejected metadata.** Characterize first; existing failures keep class/message.
   Section 9's fixed legacy message applies only to newly rejected core shapes.
4. **Timing scaffolding.** Reuse phase-4 `LegacyTiming` and shared compatibility runtime utilities.
   The first implementation step exports the inline settlement mechanism from task-queue-legacy;
   both packages settle from `runFork` exit observers and unwrap synchronous failures consistently.
5. **Inventory keys.** Keep today's stripping, with closed codecs and rewrite tests.
6. **Wrapper observations and delivery.** Real compatibility events feed wrapper emulation;
   its synchronous outputs precede executor stdout handling. The installed wrapper is the oracle.
7. **File reads/probes.** Preserve UTF-8 replacement/BOM, synchronous compatibility operations,
   false-on-access-failure probes and separate read/stat catches on both layers.
8. **Redgifs malformed input.** Preserve skipped syntax failures versus null traversal rejection,
   including TypeError and Node message; this is kept behavior.
9. **Host-dependent exports.** Use section 2's inputs/capabilities; browser paths stay target-platform
   calculations and the synchronous `FFMPEG_PATH` write belongs to `DownloadHost`.
10. **Loopback baseline.** Prove it separately before both ports, with fixture/report, observed-body
    cancellation, stable comparison and repeated runs; phase 5 passes it unchanged.
11. **Distinct process observations.** Completion is Raw or Native. Only compatibility supplies
    nullable code/signal and actual killed state; only native supplies numeric exit or PlatformError.
    Missing-executable compatibility returns a child/spawn `-1` then error/close; native acquisition
    failure returns PlatformError without a run. Section 6 defines and tests every site's native
    result now. Native AbortSignal enters the site's cancellation path and cannot be ignored.
12. **Redgifs stdout lifecycle.** Add stdout/stderr end observations. Use streaming decoding and
    readline-compatible splitting, flush final lines at stdout end, deliver items/exceptions from
    an async continuation, and track raw exit code for the finally condition. Require the
    unterminated-null/stdout-end-before-exit case.
13. **PID-only signalling.** Add `ProcessRun.signalPid` with today's missing-PID guard and swallowed
    errors. Generic Windows mapping names this operation. Native uses additive non-waiting
    ProcessControl request capabilities with handle PID, preserving existing queue `kill` callers.
    Test owned-child, PID and tree differences before and after leader exit.
14. **Injected spawn seam.** `spawnFn` lives in compatibility executor options and adapts directly
    to wrapper observations. Preserve payloads, error identity and nonzero close without a child
    or second wrapper conversion; existing assertions remain.
15. **Write semantics.** Use directory creation, direct write and rename operations with the
    per-site table in section 5. Preserve fixed/generated names, order, creation-only modes,
    default download-directory mode, no fsync/chmod and failed-rename residue.
16. **Node oracle.** Bun hosts Vitest; explicit pinned Node subprocesses compare old/new structured
    traces for Node-specific spawn, abort and wrapper-error behavior. Fixture interpreter selection
    is explicit, including grandchildren; Bun fixture runs are separately labelled.
17. **Runtime handoff.** Downloader compatibility executors use their own warmed runtime;
    callbacks re-enter queue's private runtime synchronously. The reverse executor call also
    synchronously enters downloader. Each sink returns after synchronous work and forks owned
    async continuations at the existing position. Section 8 names the shared settlement export.

## 13. Review

Reviewer: an independent session, read-only, 2026-11-18. It read clean `main` at `21d6718`,
the settled task-queue design, the draft, package source and tests, and installed Effect 4.1.4
and wrapper sources, and ran in-memory probes. One blocker, five major, one minor, one question:

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | blocker | The process abstraction has no defined channel for raw close, original child error and actual Node killed state required by wrapper parity. | Sections 5 and 6: package-owned `DownloadProcess`, explicit raw-event declarations, direct Node compatibility layer and wrapper-equivalent state machine. |
| 2 | major | Synchronous launch and a stream consumer do not preserve synchronous output-to-sink delivery. | Sections 5, 6 and 10: ordinary listeners call `runtime.runSync(sink.emit(event))`; full-facade immediate-observation tests pin ordering, exceptions and finish timing. |
| 3 | major | The assumed `ProcessControl.killTree` contract is wrong and obscures distinct signal policies and absent identity protection. | Sections 6 and 11: settled `kill(pid, signal)` contract, per-site child/group/tree policy table, descendant behavior and recorded PID-reuse exposure. |
| 4 | major | The stock-spawner comparison omits automatic cleanup, defaults and chunk merging. | Section 6: complete native-layer difference table handed to phase 9.1, explicit spawn options and differential executor tests on both layers. |
| 5 | major | Default FileSystem text decoding and existence probing change BOM and access-failure behavior. | Sections 3, 5 and 10: explicit `DownloadFiles` semantics, byte reads with BOM-preserving decoding, false-on-failure probes and both-layer tests; inventory codecs keep key stripping. |
| 6 | major | Redgifs valid JSON `null` rejects with TypeError rather than being ignored. | Sections 3, 4, 10 and 11: characterize and preserve the traversal rejection, including class and Node message. |
| 7 | minor | Several exports labelled pure hide filesystem, platform, path, clock or environment capabilities. | Sections 2, 5, 7 and 8: symbol-level dispositions, pure target-platform browser joining and synchronous host ownership of initialization's environment write. |
| 8 | question | Loopback goldens lack a concrete deterministic fixture, cancellation trigger and comparison contract. | Section 10: separate pre-port baseline step before both ports, `reports/4-loopback.md`, observed body/progress cancellation, stable lifecycle comparison and repeated pre-port runs. |

The reviewer found sound: public spawner construction and substitution, the sibling compatibility
package and warmed-runtime strategy, the 19-file consumer and test inventory, most characterized
behavior and error strings, and removal of the wrapper from ported execution once the compatibility
contract is supplied.

A second independent session reviewed the revision against clean `main` at `21d6718`, task-queue
through `71b7c4a`, source/tests and installed declarations, with read-only probes.
One blocker, three major, two minor, one question:

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 9 | blocker | The common raw completion contract is impossible for native handles, leaving native acquisition, failure and AbortSignal behavior undefined. | Sections 5, 6 and 12.11: discriminated Raw/Native outcomes, explicit acquisition failure, per-site native result matrix, mandatory abort handling and non-waiting ProcessControl requests. |
| 10 | major | Redgifs needs stdout end and asynchronous line consumption before child close to preserve final-line delivery and failure cleanup. | Sections 5, 6, 10 and 12.12: stream-end events, streaming decoder/readline rules, async item/error continuation, raw exit tracking and required unterminated-null test. |
| 11 | major | The process contract lacks Windows PID-only signalling distinct from owned-child and tree termination. | Sections 5, 6, 10 and 12.13: `signalPid`, missing-PID/error-swallowing policy, explicit Windows mapper row and running/post-leader-exit tests. |
| 12 | major | A raw-event-only pipeline cannot preserve the already wrapped injected `spawnFn` emitter. | Sections 6, 8, 10 and 12.14: wrapper-observation input, direct legacy-emitter adapter, preserved progress/error/nonzero-close assertions and no second conversion. |
| 13 | minor | The write abstraction obscures direct writes and creation-only modes, and applies an incorrect blanket directory mode. | Sections 5, 10 and 12.15: per-site primitive operations, names/order/modes, default download-directory creation, no fsync/chmod and failed-rename residue. |
| 14 | minor | Bun-hosted process comparisons cannot establish production Node event and exact error semantics. | Sections 10 and 12.16: pinned Node subprocess oracle, structured traces and explicit Node/Bun fixture interpreter selection. |
| 15 | question | The downloader-to-queue runtime handoff, continuation ownership and claimed reusable settlement helper are unspecified. | Sections 5, 8, 10 and 12.17: explicit two-runtime synchronous re-entry, owned immediate-start continuation scopes, and first-step export of shared `runLegacyPromise`/`runLegacySync` utilities. |

The second reviewer verified real-wrapper emulation, direct synchronous delivery and two-runtime
re-entry, BOM/access semantics, the existing signal-policy distinctions, host/schema dispositions,
Redgifs null rejection and the separate loopback-baseline prerequisites.

The implementation was additionally code-reviewed by independent sessions, with each finding
re-verified by a second reviewer and verification passes over each set of fixes. The 30 confirmed
findings, their resolutions and permanent oracle coverage are recorded in the
[phase 5 report](../reports/5.md#independent-code-review).
