# Design: desktop foundation (phase 9.0)

Status: reviewed, findings resolved (section 14).

Inputs: `PLAN.md` sections 3–7 and Amendments, the phase 9.0 kickoff, `PORT-GUIDE.md`, `tsconfig.base.json`, the reviewed db, task-queue and downloader-core designs, the phase 4 packages, the source inventory, the independent reviews, desktop source at commit `79f556b`, the reference desktop transport/runtime patterns, and installed Effect 4.1.4 sources.

This is a read-only design revision. No implementation, characterization run, packaged build, golden run or profile access is included.

Paths below are repository-relative. In tables, `M/` means `apps/desktop/src/main/`, `R/` means `apps/desktop/src/renderer/src/`, and `S/` means `apps/desktop/src/shared/`. Line numbers identify existing source. Proposed symbols and filenames are declarations of this design, not existing exports.

## 1. What the foundation is, and what makes it risky

The foundation owns the desktop process boundary: Electron RPC transport, shared models, application runtime composition, settings, application metadata and commands, window commands, renderer atom composition, and logging. It establishes the conventions that phases 9.1–9.5 follow.

D10 and D29 govern the transition: `effect/rpc` runs over Electron IPC while unported services continue using `electron-ipc-decorator`. There is no renderer HTTP transport. D28 leaves pi behind a driver in phase 9.4. D33 retains electron-log as the desktop sink. D34 retains full failure Causes and enables export only through an explicit environment switch. A8 permits bundled module settings and aliases; it does not permit decorators or weaker diagnostics in ported files.

Six properties decide the design:

1. **Settings are a synchronous, permissive application API.** `settingsManager` is constructed at import, writes during construction, and serves unported callers. `getAll()` preserves unknown stored keys. Reads, single writes, batch writes and reset apply different normalization and side effects. Replacing them with one strict settings decoder would change behavior (`M/settings.ts:69–270`; `M/lib/settings-host.ts:36–52`).

2. **Boot starts before the single-instance check.** Static imports initialize settings, IPC and capability modules before `index.ts` reaches `requestSingleInstanceLock()`. Moving all initialization behind the lock would change behavior (`M/index.ts:1–95`, `:964–990`).

3. **Renderer service calls use the proxy over `window.electron.ipcRenderer`.** Preload constructs a decorator proxy and spreads it into `window.api`, but the installed proxy has an empty target and only a `get` trap, so its service groups are not enumerable and the spread adds none. `window.api` supplies `on`, `removeListener`, `send` and `getPathForFile`; `R/lib/ipc.ts:23–29` constructs the callable renderer proxy (`src/preload/index.ts:8–43`; `node_modules/electron-ipc-decorator/dist/client.js:2–13`).

4. **Window commands use the focused window.** They do not use the calling renderer’s window. Changing this during transport work would change multiwindow behavior (`M/ipc/services/window-service.ts:33–65`).

5. **A document can disappear while a request is running.** A reload can retain a `webContents` while replacing its document. Sessions distinguish document generations. Transport cleanup cannot depend on React unmount or an unload message, and request-fiber interruption does not establish native completion.

6. **Settings and About are not isolated foundation screens.** Settings imports seven later-capability panels, and the renderer’s composition roots reach capability hooks, stores and thumbnail integration. Foundation operations move now, including calls inside those legacy components; capability implementation stays with its phase. Strict screens receive legacy panels and routing through injected slots and callbacks (`R/pages/Settings.tsx:1–7`, `:115–141`; `R/App.tsx:1–10`; `R/app-layout.tsx:1–52`).

The task-queue and downloader-core precedents supply the compatibility rule: strict code owns the new implementation; temporary unported compatibility preserves signatures, original errors, synchronous execution, callback prefixes and Promise timing. Legacy may import strict code. Strict code never imports legacy code. A `legacy/` name alone grants no exemption from strict compilation or scanning.

## 2. Shape of the phase

| Surface | Phase 9.0 | Later ownership |
| --- | --- | --- |
| RPC framing, Electron protocols, connection lifecycle and admission | Implement and test | All capability phases reuse |
| `src/shared` | Port all files; separate compatibility exports where necessary | Capability phases add boundary models |
| Settings persistence and application side effects | Port; retain synchronous compatibility API | Remove compatibility after its last caller |
| App and window services | Port all 22 existing methods across the three foundation services | Keep old invoke forwarders through the harness transition; remove in phase 10 |
| Kernel status consumption | New RPC stream and atoms; preparation engine remains a host dependency | Downloads |
| Renderer registry and runtime factory | Install once per document | All capability phases reuse |
| Settings preference state, About metadata, title-bar commands | New atoms and RPC | Foundation |
| Foundation calls inside later-capability components | Move to new clients in this phase | Components remain in their capability partitions |
| Embedded capability panels in Settings | Inject from legacy composition shells | 9.1 cookies/files; 9.3 transcription; 9.4 AI; 9.5 MCP/account |
| Download/history/thumbnail/player/filesystem/cookies services | Decorator IPC unchanged | 9.1 |
| Subscription service | Decorator IPC unchanged | 9.2 |
| Transcript service | Decorator IPC unchanged | 9.3 |
| AI service and agent implementation | Decorator IPC unchanged | 9.4 |
| MCP, local API, account | Existing transports unchanged | 9.5 |
| Database driver | Existing borrowed `better-sqlite3` path | Final cutover under the db design |
| Bootstrap orchestration in `M/index.ts` | Integrate foundation at existing execution points; retain named legacy ownership | Complete strict ownership as capability dependencies move |

The current registry contains 14 service classes. Removing settings, app and window leaves 11 decorated services (`M/ipc/index.ts:32–47`).

Existing files keep their names. New companions follow D21: `Foo.model.ts`, `Foo.errors.ts`, `Foo.service.ts`, `Foo.layer.ts`, `Foo.driver.ts`. This design also adopts `Foo.rpc.ts` and `Foo.atoms.ts`.

### The partial-unit ratchet

Adding a base-extending config at the desktop root is insufficient. Today `scripts/port-check.mjs:47–49` takes the directory of each base-extending config and recursively scans that directory, independently of `include` and `exclude`. Such a config would subject the entire legacy desktop tree to the textual rules.

Phase 9.0 extends the checker with an explicit partial desktop unit, without changing ordinary package behavior:

| Configuration | Ownership |
| --- | --- |
| `apps/desktop/tsconfig.ported.node.json` | Explicit foundation main, preload and shared roots; extends root base |
| `apps/desktop/tsconfig.ported.web.json` | Explicit foundation renderer and shared roots; extends root base |
| `apps/desktop/tsconfig.ported.test.json` | Foundation tests and source; same rules |
| Existing `tsconfig.node.json` and `tsconfig.web.json` | Remaining legacy roots; continue existing checks |
| Proposed `apps/desktop/port-units.json` | Exact file ownership, node/web membership and scheduled capability for every desktop TS/TSX file |
| Proposed `apps/desktop/port-units.baseline.json` | Committed ownership baseline used to reject strict-to-legacy regression |

The checker enforces:

- Every desktop TS/TSX file, including declarations, tests, workers and build configuration, belongs to a strict partition or a named legacy partition. New unowned files fail.
- Strict membership is monotonic. Every baseline strict path remains strict. Renames require an explicit old-to-new identity in the manifest; deletion does not authorize replacing strict implementation with a new legacy file.
- Shared files may belong to both strict environments; the report shows that membership.
- The strict compiler’s resolved graph, including type-only imports and declarations, contains no legacy application implementation.
- Strict source never imports the decorator registry, legacy renderer stores or compatibility implementations. Browser-safe contracts, slots and injected services cross the boundary.
- Legacy roots continue receiving their existing checks. Legacy importing strict code is allowed.
- Textual port rules apply to the actual strict file set, including tests. JavaScript build scripts remain under D7.
- `port:check` reports desktop as partially ported, with strict and remaining legacy counts.

The checker runs under plain Node and obtains resolved graphs from the installed native compiler, either directly or through its working Node launcher:

```sh
node node_modules/tsrs/bin/tsrs --listFilesOnly --noEmit --incremental false --composite false -p apps/desktop/tsconfig.ported.node.json
node node_modules/tsrs/bin/tsrs --listFilesOnly --noEmit --incremental false --composite false -p apps/desktop/tsconfig.ported.web.json
node node_modules/tsrs/bin/tsrs --listFilesOnly --noEmit --incremental false --composite false -p apps/desktop/tsconfig.ported.test.json
```

Do not run graph extraction through `bunx --bun tsrs`. The second review’s direct-pipe capture of that command exited successfully with exactly 65,536 bytes and an incomplete final filename. Its Node-launcher capture returned 556,385 bytes, a final newline, 515 desktop files and 221 main-source files; the installed native executable also returned the complete graph. Those observations verify the capture routes against the existing web configuration, not the proposed partial configs or checker. The launcher’s blocking-stdio setup, native execution and child fallback are visible in `node_modules/tsrs/lib/tsrs.js:4–59`; this design does not claim a proven internal cause for Bun’s truncation.

Complete capture is part of enforcement:

1. Spawn the installed executable or Node launcher from the plain Node checker, with stdout and stderr separately captured.
2. Consume both streams through process close. A process error, signal, nonzero exit, capture-limit error or incomplete stream fails the check. A successful exit alone is insufficient.
3. Capture all stdout; no display truncation, fixed 64 KiB buffer or silently truncated `maxBuffer` is permitted. Any configured safety ceiling fails closed when reached.
4. Require nonempty listing output terminated by a newline. Reject output ending mid-line, including a final path that happens to name an existing prefix.
5. Validate every listing entry as a complete existing file path, canonicalize it and resolve symlinks. Reject malformed, incomplete or nonexistent paths; do not discard such lines.
6. Require every explicit root assigned to that configuration by the ownership manifest to occur in the resolved graph. Missing roots fail, even if all received paths otherwise look valid.
7. Compare repository-owned files with the ownership manifest. Package sources retain their own unit ownership; following a package import into an unported implementation fails the strict graph check.

Run normal diagnostic checks separately; file listing is ownership evidence, not a substitute for compilation. Plain Node reports `typescript.createProgram` as `undefined` in this installation; the checker does not depend on the classic TypeScript compiler API.

The committed baseline is checked independently of the proposed manifest. The gate compares against the baseline from the target revision as well as the working tree’s baseline, so editing both files cannot erase a regression. Each capability promotion adds its strict paths to the baseline; historical strict membership is never reduced.

Negative fixtures prove rejection of:

| Fixture | Required result |
| --- | --- |
| Strict root imports legacy source through `@renderer`, `@shared` or another path alias | Resolved legacy path fails |
| Strict root uses `import type` from legacy implementation | Resolved legacy path fails |
| Strict declaration imports or re-exports legacy implementation | Declaration and implementation chain fails |
| A browser declaration shim derives a type through `typeof import(...)` of main implementation | Main implementation entering the web graph fails |
| Strict file is relabeled legacy in both current ownership files | Target-revision baseline rejects regression |
| New TS/TSX or declaration file lacks ownership | Inventory completeness fails |
| Resolved graph exceeds 64 KiB, with a forbidden legacy dependency near its end | Complete capture reaches and rejects that dependency |
| Successful process exit with a missing explicit root | Root-completeness check fails |
| Truncated path, nonexistent path or output ending without a newline | Capture validation fails before ownership can pass |
| Capture ceiling, stream error or subprocess error | Check fails; partial output is never accepted |

Both strict configs use A8’s `module: "esnext"` and `moduleResolution: "bundler"`, appropriate aliases and environment libraries/types. They retain the base diagnostics, `erasableSyntaxOnly`, and empty overrides. Neither enables decorators.

At final cutover, both original desktop configs extend the base, every application file belongs to the strict graph, and phase 10 removes partial-unit machinery.

## 3. Schemas

### Shared-file dispositions

“Model” means schema-backed DTOs with existing exported type names preserved. Existing modules remain at their paths and re-export companion models where useful. Plain object APIs use structs; classes are introduced only where identity or behavior requires them, with the required brand.

| File under `S/` | Disposition |
| --- | --- |
| `types/index.ts` | Retain exports and defaults; derive download, playlist, subscription and settings types from companion models; preserve mutable fields and arrays |
| `types/auth.ts` | Model account, credit, invitation, reservation, receipt and cache DTOs; no auth implementation imports |
| `types/ipc.ts` | Replace main-registry re-export with browser-safe transitional IPC declarations; delete after final compatibility consumer |
| `types/ytdlp-kernel.ts` | Model kernel status, states, source and preparation step |
| `types/player.ts` | Model attach request/result |
| `types/share-card.ts` | Model share payloads, layout and capture messages; retain pure helpers |
| `types/mermaid-export.ts` | Model render request/result and byte payload |
| `agent-chat.ts` | Model chat/thread/run/event DTOs; retain pure branch helpers; replace native collections |
| `agent-errors.ts` | Schema-backed failure model and strict error; retain parsing/classification; old `AgentUserError` constructor/class lives in compatibility |
| `agent-export.ts` | Stays pure |
| `agent-history.ts` | Retain title/preview logic; calendar grouping takes injected calendar contract; old synchronous exports get compatibility wrappers |
| `agent-markdown.ts` | Pure parsing stays; image embedding becomes Effect command plus image-reader service; old Promise callback API gets compatibility wrapper |
| `agent-notifications.ts` | Stays pure; model routing target |
| `agent-permissions.ts` | LiteralKit and existing parser, including missing-versus-invalid distinction |
| `agent-progress.ts` | Retain browser-safe package re-export |
| `agent-settings.ts` | Replace zod with Effect schemas; retain strictness, bounds and optionality; old zod exports move to compatibility |
| `agent-subtitles.ts` | Replace zod with Effect schemas; retain trimming, strict objects, bounds and cue limit |
| `agent-task.ts` | Replace zod union and flat parameters with Effect models; preserve both accepted surfaces |
| `agent-thread-patch.ts` | Model patch bookkeeping; replace Maps/Sets internally; ordered arrays retain observable order; legacy collection-shaped exports get adapters |
| `agent-ui.ts` | Retain browser-safe UI re-exports and model local projection |
| `ai-presets.ts` | LiteralKit/catalog models and HashMap lookup; existing catalog array order remains |
| `ai-prompt-text.ts` | Retain browser-safe package re-exports |
| `ai-prompts.ts` | Retain migration/default algorithms; strict functions receive time; legacy default-time signatures move to compatibility |
| `ai-provider-groups.ts` | Retain grouping; Schema JSON encoding for exact fallback key; explicit first-occurrence group order |
| `ai-run.ts` | Model snapshots/statuses; strict constructors receive time; preserve error flattening and ordered deduplication |
| `ai-thinking.ts` | Stays pure |
| `ai-types.ts` | Model provider, prompt, model and settings snapshots; API keys remain main-only |
| `app-icon-menu.ts` | Model state/commands; retain pure derivation and equality |
| `builtin-skills.ts` | Keep filename and build-time raw glob; isolate YAML parsing in a driver and decode frontmatter; preserve eager initialization and import order |
| `constants.ts` | Stays pure |
| `extension-chat-state.ts` | Retain and port pure transformations; no deletion based only on absent direct importers |
| `extension-chat.ts` | Model commands, events, sessions, catalog and export DTOs |
| `extension-cookies.ts` | Model persisted preferences and live connection/source DTOs |
| `extension-identity.ts` | Stays pure |
| `extension-overview-reuse.ts` | Retain matching/projection; preserve newest-item and tie behavior |
| `extension-overview.ts` | Model request/snapshot/job DTOs |
| `extension-source-url.ts` | Stays pure; retain URL acceptance |
| `extension-transcript.ts` | Model DTOs; Schema JSON decoding replaces casts; malformed input still returns an empty cue list where it does today |
| `live-log.ts` | Model payload; retain 80,000-character trailing cap |
| `mcp.ts` | Model status/capability DTOs |
| `media-transform.ts` | Replace zod; preserve arguments and order; remove legacy process-module dependency for its constant |
| `overview-result.ts` | Stays pure |
| `skill-install.ts` | Model DTOs; retain upload limit |
| `source-media-kind.ts` | Retain classification; strict schema-backed failure with compatibility error mapping |
| `subtitle-export.ts` | Stays pure; preserve cue order and exact serialized text |
| `transcript-export.ts` | Stays pure; model DTOs |
| `tts-models.ts` | Replace zod identifier schema; retain presets, parser and family inference; compatibility maps failures to original errors |
| `video-identity.ts` | Retain classification; HashSet membership |
| `video-localization.ts` | Replace zod; retain strictness, defaults, regexes, trimming and bounds |
| `whats-new.ts` | Stays pure; HashSet membership |
| `utils/download-file.ts` | Stays pure; explicit ordered deduplication |
| `utils/format-preferences.ts` | Stays pure |
| `utils/native-playable.ts` | Stays pure; HashSet membership |
| `utils/pending-download.ts` | Strict constructor takes time; old clock-default signature gets compatibility wrapper |
| `utils/video-info-metadata.ts` | Stays pure |

The inventory’s findings are visible in source: ambient time in `ai-prompts.ts:64`, `ai-run.ts:25`, `utils/pending-download.ts:23`; calendar operations in `agent-history.ts:42`; Promise callbacks in `agent-markdown.ts:256`; JSON casts in `extension-transcript.ts:116`; native collection return shapes in `agent-thread-patch.ts:436–464`.

Compatibility code lives outside the strict shared partition. Unported callers change imports in the same phase. Strict code never imports compatibility.

The zod replacement does not change still-unported MCP or pi surfaces. Existing zod objects used by those libraries remain in compatibility, including `.parse`, `.safeParse`, shape/introspection behavior and error formatting. Effect schemas become the strict source of truth, with parity tests for accepted/rejected values and defaults. Tool-advertised JSON Schema moves with its capability.

### Settings model

There are three application models:

| Model | Meaning |
| --- | --- |
| `SettingsDocument` | Open stored object; unknown keys and nested values survive |
| `AppSettings` | Normalized, typed application view, with tolerant field fallback |
| `PublicSettingsPatch` | Existing restricted agent/MCP input; its validation is not the generic desktop settings API |

`SettingsDocument` uses `S.Record(S.String, S.Unknown)` at the raw storage boundary. Typed open codecs use `S.StructWithRest` at every modeled object level that retains excess fields. Effect 4.1.4 has no excess-property “preserve” parser option; the task-queue review already rejected that approach.

`S/types/index.ts:418–510` supplies the field contract:

| Fields | Model and shared provisional default |
| --- | --- |
| `downloadPath` | String; `""`; host computes effective default |
| `maxConcurrentDownloads`, `maxConcurrentTranscriptions` | Finite numbers; `5`, `1`; generic settings API does not acquire agent API integer bounds |
| `browserForCookies` | String; `"none"` |
| `cookiesPath`, `proxy`, `configPath`, `preferredAudioLanguage`, `lastSeenWhatsNew` | Strings; `""` |
| `extensionCookieSources` | Mutable array of open preference objects; `[]`; `id`, `browser`, optional `variant` and `lastConnectedAt` |
| `language` | Existing language model; `defaultLanguageCode` |
| `theme` | String; `"system"`; storage is not narrowed to three themes |
| `oneClickDownloadType` | LiteralKit video/audio; `"video"` |
| `oneClickQuality` | Existing five-value preference model; `"best"` |
| `oneClickContainer` | Existing container model; `"auto"` |
| `subtitleLanguages` | Mutable string array; copy of `DEFAULT_SUBTITLE_LANGUAGES` |
| `filenameStyle` | Existing filename-style model; `"pretty"` |
| `asrTier` | Existing ASR tier model; `"minimal"` |
| `ttsModelId` | Identifier string; `DEFAULT_TTS_MODEL_ID` |
| `transcriptionProvider` | Local/cloud; `"local"` |
| `cloudTranscriptionModelId` | String; `DEFAULT_CLOUD_TRANSCRIPTION_MODEL` |
| `downloadMirror` | Auto/cn/global; `"auto"` |
| `agentManagementTools` | Ask/auto/full; `DEFAULT_AGENT_PERMISSION_MODE` |
| `downloadWithoutChannelSubfolders`, `embedThumbnail`, `shareWatermark` | Booleans; `false` |
| `oneClickDownload`, `closeToTray`, `hideDockIcon`, `launchAtLogin`, `subscriptionOnlyLatestDefault`, `enableDownloadNotifications`, `rememberLastAudioLanguage`, `downloadSubtitles`, `embedSubs`, `writeAutoSubs`, `embedMetadata`, `embedChapters`, `filenameViaVidBee`, `sequentialFilenames`, `autoTranscribeAfterDownload` | Booleans; `true` |

No new semantic decoder enters the synchronous legacy API. It continues accepting and returning what the old implementation accepts, including wrong-shaped known values, subject to its existing per-operation normalization.

Typed projection has this order:

1. Construct the existing store with effective host defaults. These spread shared defaults, set `downloadPath` to portable `Downloads` or the host’s `~/Downloads/VidBee`, and force `launchAtLogin: false` in portable mode (`M/settings.ts:40–49`, `:72–78`). No Linux-specific false login default is invented; platform support and side effects retain their existing behavior.
2. Run existing startup work, in order: download-path normalization/directory attempt; required-setting repairs; What’s New acknowledgement; portable-root marker (`:80–83`).
3. Preserve manager normalization for the operation being projected. `get` and `getAll` keep their different behavior (`:86–139`).
4. Decode each known field independently. A field that still fails its schema is presented using that field’s effective host default. Preserve unknown root and nested data where the model is open.
5. Emit one warning per load listing invalid keys, never their values. Projection performs no additional store write.

The existing write exceptions are explicit:

| Existing startup action | Keys/files it may write |
| --- | --- |
| Download-path normalization | `downloadPath` |
| Required-setting repair, under one existing catch boundary | `agentManagementTools`; portable `launchAtLogin`; `asrTier`; `subtitleLanguages`, in that order |
| What’s New acknowledgement | `lastSeenWhatsNew` when existing eligibility logic calls `markWhatsNewSeen` |
| Fresh-install locale, at readiness | `language`, only for a store captured as absent and when different |
| Portable-root bookkeeping | Existing portable-root marker, outside `config.json` |

Sources: `M/settings.ts:146–157`, `:198–208`, `:211–267`; `M/portable.ts`.

A tolerant fallback is a presentation value, not a repair patch. Single saves send only the selected key. Batch saves send only the supplied updates. Neither operation serializes the whole typed view back to storage.

`Settings.Get` applies the same tolerant projection to its selected field. Its client wrapper decodes with that key’s schema. Store construction/read failures can still fail the operation; a malformed known field alone does not make the Settings screen unloadable.

`SettingUpdate` correlates a known key with exactly that field’s schema. `SettingsPatch` is the ordered array of those updates used by the new RPC; it is distinct from `PublicSettingsPatch` and from the object accepted by legacy `setAll`.

The batch contract is:

- The caller captures `Object.entries(settings)` once, before schema encoding. Its observed order becomes array order.
- Encode and decode preserve array order. A conventional optional-field settings struct does not carry this ordering contract and is not the batch wire form.
- Decode rejects duplicate keys before any persistence or side effect. An object input cannot express duplicates, so accepting them on the new array surface would add semantics.
- Persistence iterates the decoded array directly and makes separate writes. It does not sort keys, group by schema field order or replace the sequence with a HashMap.
- After every write succeeds, reread actual manager values and apply supplied-key side effects in that same array order, skipping `undefined` where the existing side-effect path does.
- A later write failure preserves earlier writes and prevents the subsequent reread, side effects, transcription follow-up and broadcast.

Today `SettingsManager.setAll` loops over `Object.entries(settings)` and writes each key separately (`M/settings.ts:159–175`). `updateDesktopSettings` waits synchronously for that entire loop, rereads settings, constructs the supplied-key projection in `Object.keys(settings)` order, then runs side effects, optional transcription follow-up and broadcast (`M/lib/settings-host.ts:36–52`). `applyBatchSettingSideEffects` follows `Object.entries` order and skips `undefined` (`M/lib/settings-effects.ts:46–57`). The new ordered batch preserves all three orders and the partial-persistence failure boundary. Legacy objects keep their original path and permissiveness.

### Settings persistence and migration contract

Retain electron-store behind `SettingsStore.driver.ts`. Reimplementing its filesystem, default merging, dot notation, serialization or atomic-write policy is outside this phase. The installed constructor delegates persistence to Conf and derives Electron defaults before calling it (`node_modules/electron-store/index.js:10–101`).

Characterize both the installed store and `SettingsManager`:

| Operation | Contract to preserve |
| --- | --- |
| Construction | Resolve `userData/config.json`, retaining existing fallback/failure behavior when Electron path lookup throws; capture file existence before constructing Store |
| Defaults | Spread shared defaults, override download path, force portable login false |
| Constructor order | Ensure download directory → required settings → What’s New acknowledgement → portable marker |
| Download path | Empty/falsy or old `~/Downloads` becomes effective default; relocate paths inside previous portable root; preserve external paths |
| Directory creation | Attempt before string download-path write; log and continue on mkdir failure |
| Required repairs | Permission mode → portable login → ASR tier → subtitle languages; retain single catch boundary |
| `get` | Normalize ASR, TTS ID, provider, mirror and permission mode; portable login always false |
| `getAll` | Defaults → effective path → complete stored object → explicit normalized overrides; unknown keys survive |
| `set` | Force portable login; mkdir for string path; normalize permission mode only |
| `setAll` | Capture caller `Object.entries` order; write separately in that order; preserve partial writes on later failure |
| New `Settings.SetAll` | Ordered correlated-update array; reject duplicate keys before writes; preserve order through encode, decode, persistence and side effects |
| `reset` | Clear, then set defaults/effective path/login; no constructor repairs, mkdir or fresh-locale logic |
| Fresh locale | Only when file was absent at construction; apply after readiness at existing boot point |
| What’s New | Returning-user eligibility uses captured existence and marker; retain acknowledgement condition exactly |
| Application update | Persist all supplied updates first, reread actual manager values, apply supplied-key side effects in caller order, schedule transcription follow-up, broadcast |
| Reset side effects | Dock → auto-launch → queue concurrency; no settings-change broadcast |

Sources: `M/settings.ts:43–270`, `M/lib/download-path-policy.ts:30–50`, `M/lib/settings-host.ts:36–52`, `M/lib/settings-effects.ts:15–57`, `M/ipc/services/settings-service.ts:33–38`.

### Wire models

`S/ElectronRpc.model.ts` defines transport version `1`, main-issued document session ID, client-local protocol ID, direction-specific encoded envelope, connect response, end notification and typed transport failure.

Use one whole-message JSON serialization per Electron message. Electron supplies the outer boundary; NDJSON is unnecessary. `RpcSerialization.json.codecFor` supplies JSON-compatible schema codecs. PNG values use `S.Uint8ArrayFromBase64`; compatibility converts to/from `ArrayBuffer`.

Envelope models mirror installed `RpcMessage` declarations, with VidBee’s ingress restrictions from section 5. Payload, chunk, success and typed-error holes remain `unknown` until the selected RPC schema decodes them. The transport never casts arbitrary objects to `FromClientEncoded` or `FromServerEncoded`.

Request IDs preserve their string-or-number representation; `"1"` and `1` are distinct. Number IDs must be finite. String IDs beginning with `@effect/rpc/notification/` are reserved and rejected. Inbound `isNotification: true` requests are disallowed. `discard: true` remains a separate supported request form with an ordinary admitted ID. Admission and active-ID checks occur before dispatch.

Confirmed APIs: `node_modules/effect/src/Schema.ts` (`Record`, `StructWithRest`, `mutableKey`, `mutable`, `Finite`, `Uint8ArrayFromBase64`, `Array`, `makeFilter`); `rpc/RpcSerialization.ts:39–90`, `:139–151`; `rpc/RpcMessage.ts:64–163`, `:274–365`.

## 4. Errors

Foundation errors are branded, schema-backed `S.TaggedError` classes in companion `*.errors.ts` files.

| Error | Fields | Boundary |
| --- | --- | --- |
| `SettingsReadError` | operation, message | Store read/construction |
| `SettingsWriteError` | operation, optional key, message | Write/clear |
| `SettingsDecodeError` | operation, issue | Projection infrastructure, invalid typed input or duplicate batch key; field fallback itself is a warning |
| `DesktopOperationError` | operation, message | Electron or host operation failure |
| `DesktopPayloadError` | procedure, issue | Application validation requiring declared typed response |
| `ElectronRpcTransportError` | reason, message | Session, framing, reserved ID namespace, disallowed notification, duplicate live ID, request after Eof, delivery or drain failure |
| `ElectronRpcCapacityError` | resource, limit, scope, message | Admission or buffering overflow, including retained native work |
| `SharedOperationError` | operation, message | Strict replacement for shared throwable helpers |

`ElectronRpcCapacityError.resource` names document sessions, logical clients, unary requests, streams, frame bytes, buffered bytes, native work or command entries. `scope` identifies the affected logical client, window account or connect attempt without exposing settings, tokens or payloads.

Original host failures remain in main-only context for logging and compatibility mapping. Arbitrary Electron objects, filesystem objects and settings documents are not attached to serialized errors.

Expected failures cross RPC through declared schemas. Handler defects remain defects in RPC `Exit`. The server uses `disableFatalDefects: true` so a handler defect does not automatically become a connection-wide fatal failure. This option does not contain an interrupted protocol sink; drain supervision does that separately (`node_modules/effect/src/rpc/RpcServer.ts:267`, `:667–700`).

Unknown procedures receive the installed correlated defect exit, `Unknown request tag: …` (`RpcServer.ts:994–997`). Malformed transport data is a transport failure, not a fabricated domain response.

At the client Protocol boundary, transport failures use installed `RpcClientError` with `RpcClientDefect`. A decoded `ElectronRpcTransportError` or `ElectronRpcCapacityError` is retained as its cause and in the document’s transport-failure atom, so capacity failure is typed and visible rather than a hanging pull or silent loss (`rpc/RpcClientError.ts:27–65`).

Compatibility adapters:

- Rethrow original host errors where the old implementation exposed them.
- Preserve synchronous throws versus Promise rejections.
- Preserve Electron invoke wrapping on old channels.
- Preserve `AgentUserError`’s original class, name, code, retryable flag and messages (`S/agent-errors.ts:173–190`).
- Do not substitute `FiberFailure` for a legacy error.
- Preserve catch-and-return behavior, including site-icon fallback returning `null`.

Failure logs include full Cause information. Decode warnings identify keys/operations without logging secrets or complete settings documents.

## 5. The RPC transport

### Channels and preload surface

| Channel | Direction | Meaning |
| --- | --- | --- |
| `vidbee:rpc:connect:v1` | Renderer invoke → main | Establish document session |
| `vidbee:rpc:message:v1` | Renderer send → main | Encoded Request/Ack/Interrupt/Ping/Eof |
| `vidbee:rpc:message:v1` | Main → renderer | Encoded Chunk/Exit/Defect/Pong |
| `vidbee:rpc:end:v1` | Either direction | Close logical client/session with decoded terminal reason |

Preload adds one narrow bridge:

```ts
interface DesktopRpcBridge {
  readonly connect: () => Promise<unknown>
  readonly send: (frame: string) => void
  readonly subscribe: (receive: (frame: unknown) => void) => () => void
  readonly disconnect: (session: string) => void
}
```

It is exposed as `window.vidbeeRpc`. Drivers decode arguments and results; `unknown` is intentional at this boundary.

`subscribe` strips the Electron event and returns an idempotent unsubscribe closure. It exposes no native event object, `ipcRenderer` or caller-selected channel. Registration precedes `connect`.

Coexistence preserves:

- `window.electron`, including the existing invoke path.
- Actual `window.api.on`, `removeListener`, `send` and `getPathForFile` behavior.
- Better Auth globals and the `vidbee-auth` prefix.

No enumerated `window.api.app`, `.settings` or `.window` groups are added. Current preload declarations overstate that runtime surface; the declaration split corrects the types without adding properties (`src/preload/index.ts:14–43`; `index.d.ts:18–26`; installed decorator `dist/client.js:2–13`).

Retain current `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` and `webSecurity: false` settings (`M/index.ts:535–545`).

### Protocol declarations

```ts
// M/ipc/ElectronRpcServer.layer.ts
export declare const layer:
  Layer.Layer<
    RpcServer.Protocol,
    never,
    ElectronIpcMain | ElectronWindows | RpcSerialization.RpcSerialization
  >

// R/transport/ElectronRpcClient.layer.ts
export declare const layer:
  Layer.Layer<
    RpcClient.Protocol,
    never,
    DesktopRpcBridgeService | RpcSerialization.RpcSerialization
  >
```

Acquisition failure closes the connection and fails pending clients. It never leaves a half-mounted listener.

| `RpcServer.Protocol` member | VidBee meaning |
| --- | --- |
| `run(f)` | Supervised drains feed validated envelopes to `f(serverClientId, message)` |
| `disconnects` | Queue reporting every disconnected numeric server-client ID |
| `send(clientId, response)` | Encode/send only to owning document; update terminal accounting |
| `end(clientId)` | Send terminal control and release logical-client routing; native charges follow actual completion |
| `clientIds` | Snapshot of live IDs |
| `initialMessage` | Effect yielding `Option.none()` |
| `supportsAck` | `true` |
| `supportsTransferables` | `false` |
| `supportsSpanPropagation` | `true` |
| `supportsNotifications` | `false`; no server-originated Request protocol; inbound notifications are separately rejected at ingress |
| `codecFor` | Supplied serialization’s `codecFor` |

| `RpcClient.Protocol` member | VidBee meaning |
| --- | --- |
| `run(localClientId, f)` | Register scoped response sink |
| `send(localClientId, request)` | Route through connected document session |
| `supportsAck` | `true` |
| `supportsTransferables` | `false` |
| `codecFor` | Same serialization contract |

Main maps `(documentSession, localClientId)` to a main-issued numeric server-client ID. Correlation is `(serverClientId, requestId)`. A renderer cannot choose another document’s server-client ID.

Installed declarations are `node_modules/effect/src/rpc/RpcServer.ts:1132–1165` and `RpcClient.ts:938–959`; both expose `Protocol.make`. The server contract requires a `ReadonlySet` snapshot at this library boundary; internal indexes use Effect collections.

### Framing and identity

The outer frame contains version, session, logical client and serialized message. Both sides decode before dispatch.

Main authenticates the Electron sender:

- Main frame only.
- Registered application `webContents`.
- Current document generation.
- Existing packaged renderer origin/path or configured development URL.
- Session issued to that sender.

Hidden capture windows receive only their application role. They cannot impersonate visible documents.

Each document connection has one ordered inbound drain. Electron callbacks synchronously validate/admit and offer bounded commands; they do not execute handlers or launch an untracked fiber per callback. Registrations, counters and finalizers exist before the drain can start.

No global request mutex is introduced. Handlers may complete out of order; IDs correlate replies. Each stream retains chunk order. Settings preserves synchronous write sequencing through its service.

VidBee needs no inbound RPC notifications today. The renderer’s service proxy issues `ipc.invoke(channel, ...args)` and returns its Promise (`R/lib/ipc.ts:23–29`; `node_modules/electron-ipc-decorator/dist/client.js:2–13`). Foundation events are main-to-renderer sends consumed by listeners: settings changes, kernel status and Show-home (`M/lib/settings-host.ts:27–31`; `M/index.ts:844–860`; `M/lib/app-icon-menu.ts:85–94`; `R/app-layout.tsx:160–170`, `:214–220`; `R/store/ytdlp-kernel.ts:40–51`). Their replacement is renderer-initiated streaming RPC, not notification requests.

Ingress therefore rejects `Request.isNotification === true` as a transport violation before dispatch. It also rejects every ordinary or discarded request whose string ID starts with `@effect/rpc/notification/`. This reserves the full generated namespace, including suffixes not yet generated. Installed Effect rewrites notification IDs to that prefix plus a counter before dispatch, and duplicate active decoded IDs interrupt the server sink (`RpcServer.ts:267`, `:977–983`). `supportsNotifications: false` does not substitute for these explicit ingress rules.

### Active IDs and drain supervision

Before dispatching a Request, validate its notification policy and ID namespace, then atomically reserve its ID within its logical client. Reservation happens at ingress, before queued requests can race with one another. A second Request with the same live ID is a transport violation. It is never passed to the server sink.

Disconnect the offending logical client, fail its pending calls, remove its registrations, and report its numeric server-client ID through `disconnects`. Other logical clients and documents remain usable. If a document connection’s drain itself fails or is interrupted, invalidate that entire connection and disconnect all of its logical clients.

The logical-client state machine is:

```text
Open → InputEnded → Closed
  └────────────────→ Closed
```

`Eof` moves the client to `InputEnded` as soon as it is admitted. Already admitted requests finish normally. A Request arriving after that Eof is a transport violation; Ack and Interrupt for existing work remain usable while draining. A vanished document takes the disconnect path rather than graceful Eof.

ID, routing and work-charge release are distinct:

| Situation | Release rule |
| --- | --- |
| Ordinary unary request without outstanding native work | Release live ID and work admission after terminal Exit handling and request finalization |
| Stream | Release after terminal Exit and stream finalization; Chunk/Ack does not release it |
| Interrupt | Keep reservation through request finalization; keep application work and retained-byte charges through actual native completion |
| Unknown tag or payload rejection before handler start | Release after correlated terminal response is handled; no native lease exists |
| Inbound notification | Reject before dispatch; no handler or native work starts |
| Reserved-namespace ID | Reject before reservation/dispatch; no handler starts |
| Discarded request | Initial successful Exit acknowledges handler start; it does not release the running request’s reservation or work admission |
| Request fiber ends with native work outstanding | Terminal protocol bookkeeping may finish; application work slot, native-pool slot and retained bytes remain charged until driver completion |
| Disconnect | Remove routable identity and pending-call registrations immediately; retain outstanding native-work records and charges in the window account |
| Late/duplicate terminal or completion signal | No second release, negative counter or resurrection |

The installed server acknowledges discard before handler completion (`RpcMessage.ts:64–86`; `RpcServer.ts:270–279`, `:326–335`). Execution admission therefore cannot be inferred solely from outbound Exit messages.

Use the installed `RpcServer.make` request-lifetime hook to attach accounting to actual request execution, including discarded calls. Associate the admitted envelope with the decoded request before its handler starts. Request finalization enters the supervised control path; native completion has its separate driver signal. No foundation handler returns a deferred response; a later deferred-response handler must keep its reservation through deferred completion, because `onRequest` alone ends too early for that form (`RpcServer.ts:640–660`).

Every inbound and outbound drain has an exit supervisor. Unexpected success, typed failure, defect or interruption marks its connection dead before further dispatch. Cleanup is idempotent and completes through scope finalizers even when the sink was interrupted:

1. Mark connection dead and reject new ingress.
2. Remove document/client routing and response-sink registrations.
3. Wake local pending calls and pulls with the typed terminal reason.
4. Report every affected logical client through `disconnects`.
5. Interrupt owned drain/request/subscription scopes and release transport queues and charges for memory actually released.
6. Detach delivery from unfinished native operations. Keep their application work slots, native-pool reservations, retained-byte charges and resource ownership until the driver reports actual completion; discard results for dead documents.

Main does not consume its own `disconnects` queue to observe cleanup; `RpcServer` consumes it. Observation uses the installed `onDisconnect` option. That callback requests interruption but is not proof that native work has finished (`RpcServer.ts:645–655`).

`disableFatalDefects: true` remains a handler policy, separate from these transport guarantees.

### Admission and memory budget

Bound accepted work, not only queued frames. Limits apply before server dispatch and before a new logical-client mapping becomes live.

The initial numeric limits are:

| Resource | Per logical client | Per document | Application total |
| --- | ---: | ---: | ---: |
| Live document sessions | — | One per current document generation | 16 |
| Logical clients | — | 64 | 1,024 |
| Concurrent unary requests, including discarded work | 256 | 1,024 | 16,384 |
| Active streams | 64 | 256 | 4,096 |
| Accounted buffered bytes | 128 MiB maximum, subject to document and window quotas | 128 MiB | 2 GiB |
| One encoded frame | 64 MiB | Same | Same |

These are admission ceilings, not preallocated buffers. Decision 12.5 requires confirmation against payload measurements before implementation handoff. The phase report records measured maxima, the accounting formula and final constants; increases remain finite and documented.

Native work also reserves a persistent window-owned pool:

| Resource | Per originating window account | Application total |
| --- | ---: | ---: |
| Unfinished native operations capable of outliving their request, including queued capture closures | 64 | 1,024 |
| Retained bytes across live and disconnected document generations | 128 MiB, shared with that window’s current document buffers | Included in the existing 2 GiB ceiling |
| Application unary work slots held by unfinished native requests | Remain charged from original admission | Included in the existing 16,384 ceiling |

Reserve the native-pool slot before handing work to a driver or adding a closure to the capture chain. The slot covers both live and detached native work, so disconnect never needs an unbounded transfer into a new pool. Reconnect does not reset this account. Its identity is issued by main for the registered window lifetime, not derived from a renderer-selected ID or document session. If the window is destroyed while work remains, its closed account survives as an application-owned tombstone until completion. New windows still share the application ceilings.

A native operation that never completes keeps its finite charges. No timeout merely erases accounting or replays the operation. An actual cancellation may release charges only after the driver reports that the native operation and its retained state have finished. These restrictions apply to the new transport; retained old invoke channels keep their existing behavior.

The source gives a small foundation workload, but no finite app-wide concurrency maximum:

| Source path | Single-mount foundation workload |
| --- | --- |
| Renderer entry and kernel gate | Four unary calls: entry version, kernel snapshot, feedback version and OS version; one kernel listener and two title-bar listeners (`R/main.tsx:17–25`; `R/store/ytdlp-kernel.ts:25–51`; `R/components/kernel/KernelPreparationScreen.tsx:21`; `R/components/feedback/FeedbackLinks.tsx:15–40`; `R/components/ui/title-bar.tsx:19–34`) |
| Ready AppLayout | Three additional unary calls: settings load, version and What’s New eligibility; settings and Show-home listeners (`R/app-layout.tsx:160–170`, `:214–220`, `:303–315`; `R/components/whats-new/WhatsNewDialog.tsx:88–118`) |
| Settings, the busiest foundation preference mount | Settings load and platform read, plus cookie-panel platform fallback when mounted before a nonempty platform prop; conservative total of ten potentially outstanding foundation calls across the startup-to-Settings mount, with five foundation-related listener registrations in a mounted chrome tree (`R/pages/Settings.tsx:79–100`, `:1020–1021`; `R/components/settings/CookiesSetupPanel.tsx:269–285`) |
| About | Shared two-call app-info cache and existing kernel state; repeated metadata consumers share `appInfoPromise` (`R/components/feedback/FeedbackLinks.tsx:15–40`; `R/pages/About.tsx:31–35`) |
| Later-capability share dialog | One platform read when opened; native capture/copy are user actions (`R/components/transcript/TranscriptShareImageDialog.tsx:40–62`; `R/lib/capture-prompt-share.ts:138–149`) |

These are source-derived mount counts, not measured simultaneous peaks. Slow calls, StrictMode/remounts and rapid navigation can overlap. The cookie poll starts every two seconds without waiting for a preceding tick, ASR polling can run every 400 ms, and thumbnail calls depend on rendered data (`R/hooks/use-extension-cookie-connection.ts:40–75`; `R/components/settings/AsrModelPicker.tsx:62–82`; `R/components/ui/remote-image.tsx:17–25`). Claiming a fixed whole-app maximum from those sources would be false. The admission limits are far above the foundation mount workload, and measurement covers the wider application before the numbers are confirmed.

Accounting includes ingress, outbound queues, native-event buffers, serialized responses awaiting delivery, and retained payloads belonging to admitted requests. Charge JSON text before parsing; include UTF-8 bytes, retained string storage, decoded payload retention and binary storage. Base64 charge includes `4 * ceil(byteLength / 3)` plus JSON framing, rather than charging only decoded PNG bytes. Measure heap amplification separately; this accounting is not a claim that JavaScript heap overhead equals encoded size.

For native work, retained input, queued closures, intermediate buffers and pending results stay charged while retained. Reserve required bytes before retention or growth; releasing a transport queue does not release a copy held by the native operation. Completion may transfer a live response into outbound accounting, with no uncharged interval; a dead-document result is discarded and its storage released.

Reserve a separate bounded control allowance of 64 KiB per document for terminal notifications, completion, Ack and Interrupt. Data queues cannot consume it. A dead renderer cannot force repeated terminal-message allocation. Native completion after document teardown updates the application/window account directly and does not require a dead document’s control queue.

Documents have independent quotas. A document cannot consume another document’s slots or byte allowance. The persistent window aggregate additionally prevents successive generations from resetting retained charges. Dispatch ready document queues round-robin with a bounded turn; one document’s backlog cannot monopolize admission or drain scheduling. Logical-client admission checks document aggregates, and native admission checks window/application aggregates. Server concurrency alone is not the budget: installed `RpcServer` defaults to unbounded concurrency, and its waiting work would otherwise remain unbounded (`RpcServer.ts:141`).

Overflow ends the affected logical client with `ElectronRpcCapacityError`, interrupts its streams and fails pending calls. Release registrations and transport resources, retaining unfinished native work and its charges. If a connect attempt exceeds the session limit, reject that attempt visibly without evicting an existing document. If the physical sink fails, use connection-wide cleanup. Never silently drop a request or slide a loss-sensitive event queue.

### Streaming and backpressure

A main-to-renderer event becomes a renderer-initiated subscription:

```ts
Rpc.make("App.WatchYtDlpKernelStatus", {
  success: YtDlpKernelStatus,
  error: DesktopOperationError,
  stream: true
})
```

This is a streaming response. `RpcServer` and `RpcClient` own Chunk, Ack, Exit and Interrupt. The transport forwards them without another sequence protocol. The installed server waits for acknowledgements while streaming (`RpcServer.ts:457` onward).

RPC backpressure and native production are separate:

1. A slow renderer pauses acknowledged chunk production.
2. Native callbacks remain nonblocking and use the source-specific policy below.

| Stream | Producer policy | Initial state |
| --- | --- | --- |
| Settings changed | Coalescing invalidation slot; reread settings | Subscribe before initial read |
| Kernel status | Latest-value slot; intermediate progress may coalesce | Register, then snapshot without a gap |
| Show-home command | Ordered queue belonging only to a live subscription; 256 pending entries, with bytes charged to document budget | No snapshot, backlog or replay |

Kernel delivery preserves the live-event-wins rule: a late initial snapshot cannot overwrite a newer event (`R/store/ytdlp-kernel.ts:25–51`).

Show-home preserves current mounted-listener behavior. Main currently sends immediately after showing/focusing the window; AppLayout handles it only while its listener is mounted. It checks the current pathname and starts navigation without awaiting it (`M/lib/app-icon-menu.ts:85–94`; `R/app-layout.tsx:160–170`).

Its precise contract is:

- No mounted subscriber means the command is lost. Allocate no command queue and retain no pending command.
- A live subscriber receives commands in source order. Navigation remains detached from completion of the prior navigation.
- The queue holds at most 256 pending commands, excluding the chunk currently awaiting acknowledgement. It never coalesces commands.
- At capacity, terminate the affected client with visible `ElectronRpcCapacityError`; release the subscription and its queue. Do not retain commands for reconnection.
- Unsubscribe destroys the queue. Resubscription in the same document starts empty.
- Reload creates a new document session with no replay.
- Mount Show-home consumption with AppLayout’s command listener lifetime, not eagerly with the document provider. Eager provider subscription would create a backlog before AppLayout mounts.

Later capabilities distinguish replaceable progress from loss-sensitive deltas, logs and commands. Downloads retain current coalescing and terminal flush order until 9.1 (`M/index.ts:730–819`).

### Cancellation and lifecycle

- Interrupting a renderer call sends RPC Interrupt.
- Unmounting a stream atom closes its subscription scope and interrupts that RPC.
- Interrupting a status watcher removes only that watcher; it does not stop application work.
- Uncancelable native operations can finish after caller departure. Their result is discarded; native resources, application work slots and retained bytes stay owned and charged until actual completion.
- Eof is graceful input completion; vanished renderers disconnect.
- Main-frame navigation, reload, crash, destruction and window closure invalidate sessions. Hash-route navigation does not.
- Main observes lifecycle directly.
- Old-session frames cannot recreate registrations.
- Every terminal transport path wakes pending calls and pulls.
- One window’s failure does not interrupt another window.
- HMR releases only owned listeners and registrations. It does not repeat the legacy global `ipcMain.handle` monkey patch.

Today `AppService.showMessageBox` selects the focused window and returns `dialog.showMessageBox(window, options)`, or the unparented overload when none is focused (`M/ipc/services/app-service.ts:87–98`). The new JSON options do not carry an `AbortSignal`; disconnect does not invent dialog cancellation or change parenting.

Share capture uses a reused hidden renderer. `serializeCapture` chains `captureChain.then(capture, capture)` and retains each queued closure until its turn; either prior success or failure starts the next capture (`M/lib/share-capture-window.ts:450–462`). Caller disconnect does not remove that closure or destroy another caller’s capture. A queued capture receives its native lease when enqueued, and completes it only after its chain entry and cleanup actually finish.

Scopes, `Effect.acquireRelease`, `ensuring` and `onExit` own cleanup. JavaScript cleanup around `yield*` is forbidden. Request finalizers detach interest; driver completion releases retained native charges.

### Main mounting

`DesktopRpcs = SettingsRpcs.merge(AppRpcs, WindowRpcs)` is mounted once with merged handler Layers and the Electron Protocol.

The installed `RpcServer.layer` is the standard scoped mounting pattern, but it does not expose `onRequest`. This transport needs that hook for discarded-request and request-finalization accounting, so its server Layer uses the equivalent installed construction:

```ts
Layer.effectDiscard(
  Effect.forkScoped(
    RpcServer.make(DesktopRpcs, {
      disableFatalDefects: true,
      onRequest: trackAdmittedRequest,
      onDisconnect: observeDisconnectedClient
    })
  )
)
```

`trackAdmittedRequest` preserves the wrapped Effect’s success, error and environment types. It adds accounting and finalization, not a domain-error conversion. Request completion, protocol terminal handling and native completion are separately idempotent. The hook does not release unfinished native work.

Acquire the server before the first renderer can connect. Acquisition starts no queue or capability engine. Handler Layers receive existing hosts through injected services.

Confirmed APIs: `rpc/RpcGroup.ts:37–120`, `:411`; `RpcServer.ts:667–700`, `:1059–1078`; `Rpc.ts:976–1023`.

## 6. RpcGroup and atom conventions

Adopt colocated `Foo.rpc.ts`, exported `FooRpcs`, and `Foo.atoms.ts`. Procedure names are globally unique, with `Settings.`, `App.` and `Window.` prefixes. The old first `IpcContext` argument disappears from new contracts; sender identity belongs to transport.

Shared RPC modules import only browser-safe models, errors and public Effect modules.

### Foundation groups

`SettingUpdate` is a schema union correlating each known key with its field schema. It is not `{ key: keyof AppSettings; value: AppSettings[keyof AppSettings] }`.

The declarations and batch codec are:

```ts
// S/Settings.model.ts
export type SettingUpdateValue = {
  [K in keyof AppSettings]: {
    readonly key: K
    readonly value: AppSettings[K]
  }
}[keyof AppSettings]

export declare const SettingUpdate: S.Codec<SettingUpdateValue>

export const SettingsPatch = S.Array(SettingUpdate).check(
  S.makeFilter((updates) => {
    let seen = HashSet.empty<keyof AppSettings>()
    for (const update of updates) {
      if (HashSet.has(seen, update.key)) {
        return "Duplicate setting key"
      }
      seen = HashSet.add(seen, update.key)
    }
    return true
  })
)

export type SettingsPatch = typeof SettingsPatch.Type
```

The implementation of `SettingUpdate` is the union of one `{ key: literal, value: fieldSchema }` struct per field from section 3. The declaration states its correlated type; it does not authorize a cast from a widened key/value pair. Compile-only tests check the union against every `AppSettings` key. `S.Array` preserves update order, and the duplicate-key filter applies before handler execution. Installed `S.Codec`, `.check` and `S.makeFilter` are declared in `node_modules/effect/src/Schema.ts:1083`, `:213`, `:6804–6808`; the order-preserving array/filter form was also checked with an in-memory encode/decode probe.

The typed batch client captures the caller’s `Object.entries` sequence and decodes each entry through its correlated update schema in that sequence. It never first decodes the input as an optional-field `S.Struct`. No HashMap iteration determines output order.

```ts
// S/Settings.rpc.ts
export const SettingsRpcs = RpcGroup.make(
  Rpc.make("Settings.Get", {
    payload: { key: SettingKey },
    success: SettingValue,
    error: SettingsError
  }),
  Rpc.make("Settings.Set", {
    payload: SettingUpdate,
    success: S.Void,
    error: SettingsError
  }),
  Rpc.make("Settings.GetAll", {
    success: AppSettings,
    error: SettingsError
  }),
  Rpc.make("Settings.SetAll", {
    payload: { settings: SettingsPatch },
    success: S.Void,
    error: SettingsError
  }),
  Rpc.make("Settings.Reset", {
    success: S.Void,
    error: SettingsError
  }),
  Rpc.make("Settings.ShouldPromptWhatsNew", {
    success: S.Boolean,
    error: SettingsError
  }),
  Rpc.make("Settings.MarkWhatsNewSeen", {
    success: S.Void,
    error: SettingsError
  }),
  Rpc.make("Settings.WatchChanged", {
    success: S.Void,
    error: SettingsError,
    stream: true
  })
)
```

`SettingValue` is the field-schema union. The typed `get(key)` client wrapper decodes with the selected key’s schema; it does not assert a generic return type.

```ts
// S/App.rpc.ts
export const AppRpcs = RpcGroup.make(
  Rpc.make("App.GetVersion", {
    success: S.String,
    error: DesktopOperationError
  }),
  Rpc.make("App.GetPlatform", {
    success: S.String,
    error: DesktopOperationError
  }),
  Rpc.make("App.GetDownloaderStatus", {
    success: DownloaderStatus,
    error: DesktopOperationError
  }),
  Rpc.make("App.GetYtDlpKernelStatus", {
    success: YtDlpKernelStatus,
    error: DesktopOperationError
  }),
  Rpc.make("App.RetryYtDlpKernelPreparation", {
    success: YtDlpKernelStatus,
    error: DesktopOperationError
  }),
  Rpc.make("App.GetOsVersion", {
    success: S.String,
    error: DesktopOperationError
  }),
  Rpc.make("App.Quit", {
    success: S.Void,
    error: DesktopOperationError
  }),
  Rpc.make("App.ShowMessageBox", {
    payload: { options: MessageBoxOptions },
    success: MessageBoxResult,
    error: DesktopOperationError
  }),
  Rpc.make("App.GetSiteIcon", {
    payload: { domain: S.String },
    success: S.NullOr(S.String),
    error: DesktopOperationError
  }),
  Rpc.make("App.WatchYtDlpKernelStatus", {
    success: YtDlpKernelStatus,
    error: DesktopOperationError,
    stream: true
  }),
  Rpc.make("App.WatchShowHome", {
    success: S.Void,
    error: DesktopOperationError,
    stream: true
  })
)
```

`MessageBoxOptions` covers the installed serializable options:

| Field | Model |
| --- | --- |
| `message` | Required string |
| `type` | Optional LiteralKit: none/info/error/question/warning |
| `buttons` | Optional mutable string array |
| `defaultId`, `textWidth`, `cancelId` | Optional finite numbers |
| `title`, `detail`, `checkboxLabel` | Optional strings |
| `checkboxChecked`, `noLink`, `normalizeAccessKeys` | Optional booleans |
| `icon` | Optional string path |
| `signal`, native-image `icon` | Native values, outside JSON wire DTO |

Optional fields accept explicit `undefined` where existing declarations permit it. `MessageBoxResult` has finite `response` and boolean `checkboxChecked`.

The installed declaration includes `AbortSignal` and `NativeImage`; neither is a JSON DTO. Old invoke forwarding retains today’s actual Electron serialization/error behavior for those arguments. The new schema covers the full serializable option set rather than a current-caller subset. Compile-only parity checks compare it with the serializable projection of `Electron.MessageBoxOptions`, and separately pin rejection of native values (`node_modules/electron/electron.d.ts:22533–22621`).

```ts
// S/Window.rpc.ts
export const WindowRpcs = RpcGroup.make(
  Rpc.make("Window.CaptureShareCard", {
    payload: { payload: ShareCardPayload },
    success: S.Uint8ArrayFromBase64,
    error: DesktopOperationError
  }),
  Rpc.make("Window.WriteShareImage", {
    payload: { data: S.Uint8ArrayFromBase64 },
    success: S.Void,
    error: DesktopOperationError
  }),
  Rpc.make("Window.Minimize", {
    success: S.Void,
    error: DesktopOperationError
  }),
  Rpc.make("Window.Maximize", {
    success: S.Void,
    error: DesktopOperationError
  }),
  Rpc.make("Window.Close", {
    success: S.Void,
    error: DesktopOperationError
  }),
  Rpc.make("Window.IsMaximized", {
    success: S.Boolean,
    error: DesktopOperationError
  })
)
```

| Existing service/event | New procedure |
| --- | --- |
| Settings `get`, `set`, `getAll`, `setAll`, `reset`, `shouldPromptWhatsNew`, `markWhatsNewSeen` | Corresponding `Settings.*` declarations |
| App `getVersion`, `getPlatform`, `getDownloaderStatus`, `getYtDlpKernelStatus`, `retryYtDlpKernelPreparation`, `getOsVersion`, `quit`, `showMessageBox`, `getSiteIcon` | Corresponding `App.*` declarations |
| Window `captureShareCard`, `writeShareImage`, `minimize`, `maximize`, `close`, `isMaximized` | Corresponding `Window.*` declarations |
| `settings:changed`, `M/lib/settings-host.ts:29` | `Settings.WatchChanged`; retain legacy broadcast |
| `ytdlp-kernel:status`, `M/index.ts:844–860` | `App.WatchYtDlpKernelStatus`; retain old channel while needed |
| `app:show-home`, `M/lib/app-icon-menu.ts:94` | `App.WatchShowHome`; same target-window routing and mounted-listener semantics |
| Window-state events | No main-side maximize-state producer is added; existing title-bar event listeners are characterized separately |

Existing method definitions are `M/ipc/services/settings-service.ts:13–53`, `app-service.ts:15–127`, and `window-service.ts:16–65`.

### Service contracts

Schemas precede contracts. Existing service filenames hold implementations; companion files hold contracts and Layers.

| Service | Contract |
| --- | --- |
| `SettingsStore` | Synchronous raw get, set, document, ordered batch and clear effects; typed storage failures |
| `DesktopSettings` | Manager operations as effects; distinct raw compatibility and tolerant typed projections; typed batches iterate `SettingsPatch` directly |
| `SettingsEffects` | Existing dock/login/menu/concurrency effects and transcription follow-up; supplied-key order retained |
| `DesktopApp` | Nine app operations and scoped kernel/Show-home streams |
| `DesktopWindow` | Six window operations; focused-window semantics |
| `KernelHost` | Snapshot, prepare command and scoped event subscription over existing engine |
| `ShareCaptureHost` | Capture command, actual-completion sink and clipboard write; existing hidden-window serialization |
| `ElectronRpcAdmission` | Atomic reservations, active IDs, state transitions, window-owned native leases, byte accounting and idempotent release |

The admission contract is:

```ts
export interface RpcAdmissionLease {
  readonly documentSession: string
  readonly localClientId: number
  readonly requestId: string | number
  readonly windowAccountId: string
}

export interface RpcNativeWorkLease {
  readonly id: string
  readonly windowAccountId: string
}

export class ElectronRpcAdmission extends Context.Service<
  ElectronRpcAdmission,
  {
    readonly admitRequest: (
      input: RpcAdmissionRequest
    ) => Effect.Effect<
      RpcAdmissionLease,
      ElectronRpcTransportError | ElectronRpcCapacityError
    >
    readonly endInput: (
      client: RpcLogicalClient
    ) => Effect.Effect<void, ElectronRpcTransportError>
    readonly complete: (
      lease: RpcAdmissionLease
    ) => Effect.Effect<void>
    readonly retainNative: (
      lease: RpcAdmissionLease,
      retainedBytes: number
    ) => Effect.Effect<RpcNativeWorkLease, ElectronRpcCapacityError>
    readonly resizeNative: (
      lease: RpcNativeWorkLease,
      retainedBytes: number
    ) => Effect.Effect<void, ElectronRpcCapacityError>
    readonly completeNative: (
      lease: RpcNativeWorkLease
    ) => Effect.Effect<void>
    readonly disconnectClient: (
      client: RpcLogicalClient,
      reason: RpcTerminalReason
    ) => Effect.Effect<void>
    readonly disconnectDocument: (
      session: string,
      reason: RpcTerminalReason
    ) => Effect.Effect<void>
  }
>()("@vidbee/desktop/ElectronRpcAdmission") {}

export interface NativeCompletionSink {
  readonly completed: (lease: RpcNativeWorkLease) => void
}
```

`RpcAdmissionRequest`, `RpcLogicalClient` and `RpcTerminalReason` are schema-derived models, not trusted casts. Native byte counts are finite nonnegative counts validated at the driver/service boundary. Window account IDs and native lease IDs are main-issued.

`complete` records request execution finalization; it does not complete outstanding native leases. The application work slot is released only when request/protocol finalization permits it and all associated native leases have completed. After disconnect, delivery bookkeeping is already terminal, but native completion remains necessary.

`retainNative` atomically reserves the persistent window/application native-pool slot and retained bytes before native invocation or capture-chain enqueue. If reservation fails, the driver is not invoked. `resizeNative` reserves growth before retaining more bytes; failure cannot erase existing charges. `completeNative` is idempotent and runs only on the driver’s actual completion signal.

The driver registers completion observation before invoking work that can complete synchronously. It reports success, rejection or synchronous invocation failure after releasing its retained state and cleanup ownership. Request interruption, an RPC Exit, `onDisconnect` or the Promise adapter’s cancellation finalizer is not that signal. The completion sink enters the application-owned accounting path synchronously and remains reachable after the document scope closes. It retains only the bounded native record, not the document’s registry or routing tables.

For dialogs, observe settlement of the actual Electron Promise. For captures, observe completion of the actual serialized chain entry and cleanup, including time waiting in the chain. Native work keeps its existing queue order and parenting; admission does not replay or cancel it on behalf of a departed document.

Callback protocols use commands and synchronous sinks. Required synchronous work completes before the host callback returns. Async continuations belong to a scope. Register pending capture/request state before issuing a command that can complete synchronously.

### Renderer clients and atoms

```ts
export class SettingsClient extends AtomRpc.Service<SettingsClient>()(
  "@vidbee/desktop/SettingsClient",
  {
    group: SettingsRpcs,
    protocol: ElectronRpcClientLive,
    runtime: desktopAtomRuntimeFactory
  }
) {}
```

App and window clients use the same factory and Protocol Layer. Installed APIs are `node_modules/effect/src/reactivity/AtomRpc.ts:43–78`, `:169–240`.

Streaming `.query` returns a pull atom, not an automatically draining subscription (`AtomRpc.ts:124–145`, `:235` onward). Always-live atoms explicitly consume scoped client streams.

| Existing state/action | Replacement |
| --- | --- |
| `settingsAtom` | Writable Effect Atom view with same provisional defaults |
| `settingsLoadedAtom` | Effect Atom boolean, initially false |
| `enableDownloadNotificationsAtom` | Derived Effect Atom |
| `loadSettingsAtom` | Read tolerant view, normalize language, attempt language change, publish view and loaded flag |
| `saveSettingAtom` | Preserve optimistic whole-object snapshot and whole-object rollback |
| `saveAllSettingsAtom` | Capture caller entries as ordered updates; preserve save-first, merge-on-success behavior |
| `ytdlpKernelStatusAtom` | Effect Atom with unchanged initial preparing status |
| Kernel subscription/retry hook | Scoped stream consumer and retry mutation; same result shape |
| Feedback metadata cache | One document-lifetime load and cached fallback on failure |
| Settings platform state | App client/atom with initial empty platform |
| Title-bar handlers | Window mutations |

Preserve existing caught-error behavior. Current settings save actions log failures and do not rethrow them to callers (`R/store/settings.ts:35–67`). Do not add retries, fix optimistic races, invalidate every query after every mutation or change cached-failure behavior.

Sources: `R/store/settings.ts:10–67`, `R/store/ytdlp-kernel.ts:8–65`, `R/components/feedback/FeedbackLinks.tsx:15–69`.

### Renderer ownership and injection

Every caller of settings, app or window moves to the new clients, including callers inside legacy capability components. There are 12 executable direct caller modules when multiline calls are included; the proxy’s documentation examples are not consumers.

The foundation ownership table is authoritative for the moved surface:

| Renderer module | Resulting ownership | Boundary/change |
| --- | --- | --- |
| `main.tsx` | Legacy composition shell | Install foundation provider for normal and ShareCapture paths; entry version uses new app client |
| `App.tsx` | Legacy composition shell | Retain router, capability providers and kernel-gate composition; consume strict kernel hook |
| `router.tsx` | Legacy composition shell | Construct Settings/About route adapters and inject routing/capability slots |
| `app-layout.tsx` | Legacy composition shell | New settings/app clients and foundation streams; capability hooks remain legacy |
| `pages/Settings.tsx` | Strict | Preference state and controls; injected panels, path pickers and navigation; no legacy imports |
| `pages/About.tsx` | Strict | New metadata/kernel atoms; no desktop thumbnail implementation import |
| `components/feedback/FeedbackLinks.tsx` | Strict | New app-info/settings/kernel state |
| `components/ui/title-bar.tsx` | Strict | New window mutations; narrow event driver for existing event helper use |
| `components/kernel/KernelPreparationScreen.tsx` | Strict | Strict app-info/kernel state and injected clock/logging effects |
| `components/kernel/DownloadEngineRow.tsx` | Strict | Existing presentation over strict model |
| `components/kernel/kernel-error-report.ts` | Strict | Pure report builder takes timestamp; caller obtains it through clock boundary |
| `components/settings/SettingsSectionNav.tsx` | Strict | Pure navigation presentation |
| `components/error/ErrorBoundary.tsx`, `ErrorPage.tsx` | Legacy composition shell | ErrorBoundary version call uses new app client; retain existing browser/error-reporting orchestration |
| `components/whats-new/WhatsNewDialog.tsx` | Legacy composition shell | Eligibility/acknowledgement use new settings client; transcript selection/navigation remains legacy |
| `components/settings/CookiesSetupPanel.tsx` | Legacy capability component, 9.1 | Settings state/actions and platform call use strict clients/atoms; cookie/filesystem calls remain decorator IPC |
| `components/settings/AsrModelPicker.tsx`, `CloudTranscriptionSettings.tsx` | Legacy capability components, 9.3 | Receive strict settings values/actions; transcript/account calls retain their phases |
| `components/settings/AiProvidersPanel.tsx`, `AiPromptsPanel.tsx` | Legacy capability components, 9.4 | Retain AI calls; foundation settings observation uses strict state where consumed |
| `components/settings/McpPanel.tsx`, `AccountPanel.tsx` | Legacy capability components, 9.5 | Retain capability calls |
| `components/transcript/TranscriptShareImageDialog.tsx` | Legacy capability component | Platform read moves to App client; preserve open guard, cancellation guard, user-agent initial fallback and swallowed error; filesystem save/share stays legacy (`:40–62`) |
| `lib/capture-prompt-share.ts` | Legacy capability adapter | Window capture/copy use new client; preserve existing Promise helpers, DOM waits and Blob results |
| `store/settings.ts`, `store/ytdlp-kernel.ts` | Legacy compatibility adapters | Existing Jotai exports project the strict registry; strict consumers import new atom modules directly |
| `lib/ipc.ts` | Legacy capability adapter | Remaining decorator proxy; no executable foundation callers remain |
| `lib/logger.ts`, `i18n.ts` | Legacy composition adapters | Existing consumers retain signatures; strict code receives logging/language services rather than importing adapters |
| `desktop-chrome.ts` | Legacy composition contract | Router/chrome composition remains outside strict screen graphs |
| `env.d.ts` | Strict browser declaration | Browser-safe environment augmentation only |
| Proposed `Settings.atoms.ts`, `App.atoms.ts`, `Window.atoms.ts` | Strict | Client/state/action ownership |
| Proposed `runtime/DesktopAtomRuntime.ts`, `DesktopAtomProvider.tsx` | Strict | Shared memoization, registry and scoped runtime mounting |
| Proposed `transport/ElectronRpcClient.layer.ts` and drivers | Strict | Decoded transport boundary |
| Proposed `composition/SettingsRoute.tsx`, `AboutRoute.tsx` | Legacy composition shells | Import strict screens and supply legacy panels/providers/callbacks |
| Proposed browser global declarations | Strict | Structural browser-safe contracts; no main implementation imports |

The remaining current modules retain explicit legacy capability ownership. The following table names the sets; braces denote the listed files, not a wildcard exemption. The committed manifest expands them into individual paths.

| Modules under `R/` | Ownership |
| --- | --- |
| `pages/{Home,Chat,ShareCapture,Subscriptions,Transcript}.tsx` | Legacy capability components |
| `components/agent/{AgentChat,AgentUiCards,ChatSuggestions}.tsx` | Legacy capability components, 9.4 |
| `components/download/{AgentTaskIndicator,CookiesSetupDialog,DownloadDialog,DownloadHistoryVirtualList,DownloadItem,DownloadParseErrorBanner,DownloadRecordContextMenuItems,DownloadSelectionContextMenuItems,DownloadTaskTree,DownloadTroubleshootButton,PlaylistDownload,PlaylistDownloadGroup,SingleVideoDownload,UnifiedDownloadHistory}.tsx` | Legacy capability components, 9.1 and adjacent AI presentation |
| `components/download/{audio-format-preferences,download-contents,download-item-utils,format-presentation,playlist-expanded-state}.ts` | Legacy capability helpers, 9.1 |
| `components/playlist/PlaylistPreviewCard.tsx`, `components/video/AdvancedOptions.tsx` | Legacy capability components, 9.1 |
| `components/settings/{AiProviderDialog,CloudCacheStatistics,CreditHistory,CreditReservations,ExtensionCookieSources,GitHubSkillDialog,McpCapabilities,SkillDetailsDialog,ai-provider-icon,asr-family-icon,asr-model-row}.tsx` | Legacy capability components under their cookie/transcription/AI/account owners |
| `components/settings/{account-table,ai-model-icon,asr-model-shared}.ts` | Legacy capability helpers |
| `components/subscription/{SubscriptionFormDialog,useProfileSubscribe}.tsx` | Legacy capability components, 9.2 |
| `components/transcript/{AgentChatMessageView,AgentChatRunFeedback,AgentChatScrollState,AgentEventStream,AgentReasoningSelect,AgentResponseContent,AgentResponseShareCard,AgentThinkingContent,AsrUpgradeDialog,PromptClockText,SpeakerAvatar,SpeakerCountDialog,TabUnderline,TranscriptAgentMessageRow,TranscriptAudioEqualizer,TranscriptAudioStage,TranscriptCaptionShareCard,TranscriptCaptionsPane,TranscriptExportDialog,TranscriptInfoPane,TranscriptModelsBanner,TranscriptOverviewResult,TranscriptPlaybackBar,TranscriptPlaybackBarView,TranscriptPlaybackHost,TranscriptPlaybackSlot,TranscriptPlaybackStandby,TranscriptPlayerNotice,TranscriptPlaylistPopover,TranscriptProgressThinking,TranscriptPromptGuidance,TranscriptPromptHistory,TranscriptPromptPane,TranscriptPromptShareCard,TranscriptPromptThinking,TranscriptShareCardChrome,TranscriptSidePanel,TranscriptSourceSwitch,TranscriptSpeakersPane,TranscriptVideoJsPlayer}.tsx`, `components/transcript/share-card-logo.ts` | Legacy capability components/helpers, 9.1/9.3/9.4 |
| `components/ui/{add-url-popover,command-menu,remote-image,sidebar}.tsx` | Legacy capability/composition adapters |
| `components/ui/{accordion,badge,bubble,button,card,checkbox,context-menu,dialog,download-dialog-layout,dropdown-menu,hover-card,image-with-placeholder,input,item,label,message-scroller,message,popover,progress,radio-group,resizable,response,scroll-area,select,separator,sheet,sonner,switch,table,tabs,textarea,tooltip}.tsx`, `components/ui/streamdown-plugins.ts` | Legacy UI adapters unless promoted as a strict dependency below |
| `hooks/{use-agent-chat,use-agent-task-events,use-app-icon-playback-menu,use-bilingual-captions,use-cached-thumbnail,use-cloud-account,use-download-events,use-download-origin-contexts,use-download-selection,use-extension-cookie-connection,use-history-sync,use-import-local-media,use-ipc-example,use-local-poster,use-prompt-run,use-streaming-transcript,use-transcript-media-player,use-transcript-playback-position}.ts` | Legacy capability hooks |
| `store/{agent-chat-launch,agent-tasks,cookie-setup,download-live-patch,downloads,subscriptions,transcript-models,transcript-playback-cues,transcript-playback,transcript-playlist,transcript-prompt-tab,transcript-reading,transcripts,video-request-coordinator,video}.ts` | Legacy capability stores |
| `lib/{ai-credits,ai-prompt-label,desktop-value-cohorts,download-error-guidance,download-list-focus,download-list-geometry,download-list-rows,download-list-scroll-margin,download-task-tree,download-transfer-locate,download-url,format-clock,local-file-link,local-file-src,local-poster-input,mermaid-export,open-context-menu,pele-mermaid-plugin,pick-local-media,plain-translate,prompt-markdown,settings-navigation,share-card-fill,share-image-layout,skill-usage-suggestions,thinking-header,transcript-bilingual,transcript-caption-selection,transcript-detail-merge,transcript-follow,transcript-index,transcript-karaoke,transcript-library,transcript-playback-position,transcript-playback-source,transcript-playback,transcript-player-frame,transcript-playlist-fly,transcript-playlist,transcript-search,transcript-speakers,transcript-stream,transcript-tab-scroll,transcript-tab-search,transcript-view-transition,transcript-virtual,transcript-vtt}.ts`, `data/popularSites.ts` | Legacy capability helpers |
| `lib/url.ts`, `lib/utils.ts` | Strict dependencies of Settings/About/navigation presentation |

Strict screen dependencies are promoted in place, never imported under a legacy exemption. This includes the UI adapters actually reached by those screens: `badge`, `button`, `card`, `dialog`, `input`, `item`, `progress`, `scroll-area`, `select`, `separator`, `switch`, `tabs`, `textarea`, `tooltip` and their resolved local dependencies. Their exact resolved closure joins the strict manifest/baseline. Remaining adapters retain the ownership above. Phase 7’s package UI implementation must already satisfy its own strict gate.

The Settings injection contract is browser-safe:

```ts
export interface SettingsCapabilityProps {
  readonly settings: AppSettings
  readonly platform: string
  readonly onChange: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => void | Promise<void>
  readonly onOpenAccount: () => void
}

export interface SettingsCapabilitySlots {
  readonly Account: React.ComponentType
  readonly Providers: React.ComponentType
  readonly Prompts: React.ComponentType
  readonly Cookies: React.ComponentType<{ readonly platform: string }>
  readonly CloudTranscription: React.ComponentType<SettingsCapabilityProps>
  readonly AsrModels: React.ComponentType<SettingsCapabilityProps>
  readonly Mcp: React.ComponentType
}

export interface SettingsHostActions {
  readonly selectDownloadDirectory: () => Promise<string | null>
  readonly selectConfigFile: () => Promise<string | null>
  readonly navigateTab: (tab: SettingsNavTab) => void
  readonly openAccount: () => void
}

export interface SettingsProps {
  readonly capabilities: SettingsCapabilitySlots
  readonly host: SettingsHostActions
  readonly chromePlatform: string
  readonly requestedTab: SettingsNavTab | undefined
}

export interface AboutProps {
  readonly capabilityContent?: React.ReactNode
}
```

The legacy route adapter supplies component slots, not eagerly executed panel functions. Strict Settings invokes them at the existing positions under the existing tabs and supplies the existing props. It neither imports their implementations nor changes their mount policy. The adapter supplies filesystem picker callbacks and router state/navigation, avoiding a strict screen’s type dependency on the registered legacy router.

About retains shared presentation and app/kernel state. Desktop-specific thumbnail resolution stays in the legacy provider already composed by App; any additional legacy content enters through `capabilityContent`. Strict About never imports `remote-image.tsx` to acquire that provider.

Jotai projections subscribe to the same Effect registry and forward actions into it. They do not own a second independently writable settings object. The old filenames remain compatibility imports; new strict components import the strict atom modules.

### Global declarations

Current `src/preload/index.d.ts:2–6` imports both `../main/ipc` and `../main/lib/auth-client`. A type-only purpose does not keep those implementations out of a resolved graph.

Split declarations as follows:

| Declaration | Contents |
| --- | --- |
| Proposed `S/DesktopGlobals.d.ts` | Structural `vidbeeRpc`, actual `api` helpers and the browser-safe subset/type contract of `electron` used by renderer code |
| Proposed `S/DesktopAuthBridge.model.ts` | Explicit browser-safe auth bridge DTOs/signatures, checked against installed Better Auth types in the legacy/node partition |
| `src/preload/index.d.ts` | Browser-safe re-exports/augmentations only; no main imports or `typeof authClient` |
| Transitional `S/types/ipc.ts` | Hand-declared browser-safe legacy service signatures; no main registry re-export |
| Legacy/node parity fixture | Compares transitional declarations with actual services and auth bridge types |

The strict web config includes the browser declarations explicitly and does not include `src/main/**/*`. Main source entering transitively still fails the resolved-graph check. Declaration shims cannot hide that dependency.

## 7. Runtime composition and boot order

### Main

One application `ManagedRuntime` owns foundation services and RPC. Package legacy facades retain established runtime ownership. “One main runtime” does not authorize another queue, database connection or package-facade instance.

```text
Environment / Clock / randomness / platform services
  + Electron drivers
  + electron-log sink and MinimumLogLevel "All"
  + injected legacy host bridges
        ↓
SettingsStore → DesktopSettings → SettingsEffects
KernelHost / app metadata → DesktopApp
window / dialog / capture / clipboard → DesktopWindow
        ↓
Settings + App + Window handlers
        ↓
RpcServer + admission + Electron Protocol
```

`ManagedRuntime.make` and disposal are installed APIs (`node_modules/effect/src/ManagedRuntime.ts:120–220`, `:325`). Shared Layer values provide memoization; reconstructing equivalent Layers per service must not duplicate stores/listeners.

The composition entrypoint injects unported hosts. Strict Layers do not import them. Lazy callbacks avoid cycles and do not start work merely because a Layer is built. Window/native admission accounts belong to this application lifetime and survive document scope disposal.

### Boot sequence

| Existing point | Foundation integration |
| --- | --- |
| Static imports | Preserve portable setup, settings construction and capability import effects |
| `M/index.ts:79–95` | Preserve profile/name, background flags and logger initialization |
| `:105–151` | Preserve platform switches and privileged scheme registration |
| `:964–990` | Preserve single-instance lock, second-instance handling and exit branch |
| `:1028–1078` | Model ID, fresh locale, protocol/auth registration, initial callback and shortcut wiring |
| Existing IPC availability point | Foundation runtime/server ready before renderer creation; legacy registrations remain |
| `:1081–1099` | Start optional ffmpeg and kernel preparation, create renderer immediately, start idle model fill |
| `:1101` | Preserve parallel tool-preparation join |
| `:1107–1126` | Queue migration; queue start; video library; transcription/broadcasts; media readiness/imports; same catches |
| `:1129` | Start extension API with existing automation/MCP ownership |
| `:1131–1148` | Background log, auto-launch, tray, subscriptions and pending links/media |
| Quit handlers | Existing confirmation/preparation and stop order; release foundation scopes without taking over unrelated jobs |

Do not move queue start ahead of renderer creation, tray ahead of extension startup or fresh-locale selection into a detached task.

`M/index.ts` stays explicitly legacy until its final capability dependencies move. Renaming or relocating its body does not make it strict.

### Drivers

| Edge | Foundation ownership |
| --- | --- |
| Electron `app` | Metadata, paths, lifecycle, login settings and quit driver |
| `BrowserWindow`/`webContents` | Identity, focused-window operations, lifecycle and sends |
| `ipcMain` | Owned registration and synchronous ingress sink |
| Preload `contextBridge`/`ipcRenderer`/`webUtils` | Drivers for narrow bridge and retained compatibility |
| `dialog` | Message box now; filesystem dialogs remain 9.1; actual native completion reported independently of request interruption |
| `clipboard`/`nativeImage` | Existing share-image operation |
| `Tray`/`Menu` | Existing ownership; foundation effects wrapped where touched |
| `shell` | Existing external-open boot behavior; filesystem service moves 9.1 |
| `nativeTheme` | Existing use only; no new policy |
| `powerSaveBlocker` | Downloads, 9.1 |
| `safeStorage` | AI/account, 9.4/9.5 |
| Filesystem/path | Public Effect platform services in strict logic; electron-store retains persistence |
| Timers/clock | Effect Clock and scoped sleeps; compatibility retains required synchronous/unref behavior |
| Randomness/UUID | Injected `SecureRandom` service and its `uuidV4` operation |
| Environment/process metadata | Captured configuration service |

A driver filename permits Promise adaptation; it does not exempt globals or Node-import diagnostics. Required synchronous native operations remain explicit injected compatibility drivers where strict APIs cannot preserve them.

Installed Node Layers: `@effect/platform-node/src/NodeServices.ts:42`, `NodeFileSystem.ts:23`, `NodePath.ts:24`. Clock and UUID contracts: `effect/src/Clock.ts:192–333`, `effect/src/crypto/SecureRandom.ts:87`. `uuidV4` is a service member, not an assumed module-level export.

### Legacy coexistence and old invoke forwarders

The three foundation classes cease being decorator services. Their existing filenames hold strict implementations.

A legacy registrar retains every old channel through the same application services. It does not round-trip through the new JSON protocol or typed settings view.

| Old channel | Exact positional arguments | Result before Electron invoke wrapping |
| --- | --- | --- |
| `settings.get` | `(key)` | Existing manager value |
| `settings.set` | `(key, value)` | `void` |
| `settings.getAll` | `()` | Existing manager object, including unknown keys and existing normalization |
| `settings.setAll` | `(settings)` | `void`; original object enumeration/write order |
| `settings.reset` | `()` | `void` |
| `settings.shouldPromptWhatsNew` | `()` | `boolean` |
| `settings.markWhatsNewSeen` | `()` | `void` |
| `app.getVersion` | `()` | `string` |
| `app.getPlatform` | `()` | `string` |
| `app.getDownloaderStatus` | `()` | Promise of `{ ytdlpReady, ffmpegReady }` |
| `app.getYtDlpKernelStatus` | `()` | Kernel status |
| `app.retryYtDlpKernelPreparation` | `()` | Promise of kernel status |
| `app.getOsVersion` | `()` | `string` |
| `app.quit` | `()` | `void` |
| `app.showMessageBox` | `(options)` | Promise of Electron message-box result |
| `app.getSiteIcon` | `(domain)` | Promise of string or `null` |
| `window.captureShareCard` | `(payload)` | Promise of `ArrayBuffer` |
| `window.writeShareImage` | `(data: ArrayBuffer)` | `void` |
| `window.minimize` | `()` | `void` |
| `window.maximize` | `()` | `void`; toggles maximize/unmaximize |
| `window.close` | `()` | `void` |
| `window.isMaximized` | `()` | `boolean` |

The registrar preserves the installed decorator wrapper’s async invoke behavior, original error value/message, console error prefix `Error in IPC method ${channel}:`, and Electron’s renderer-side rejection wrapping (`node_modules/electron-ipc-decorator/dist/index.js:26–40`). It preserves synchronous service prefixes and uses the settled exit-observer Promise bridge where exact settlement matters.

Golden harness transport facts are recorded precisely:

| Harness file | Current use of foundation channels |
| --- | --- |
| `apps/desktop/scripts/port/golden/worker.mjs:108–115` | Launches `../cdp-shots.mjs` and records `renderer/smoke`; contains no direct `ipcRenderer.invoke` |
| `apps/desktop/scripts/port/cdp-shots.mjs:13`, `:96–112` | Navigates home/subscriptions/chat/settings/about and observes errors/body/screenshots; contains no direct foundation invoke |
| Renderer reached by those routes | Uses old proxy calls listed in section 6, including settings load, app version/platform/OS/kernel reads, What’s New eligibility and capability-panel platform reads |
| `golden/cases.mjs` | MCP settings/application probes; does not call old Electron channels directly |
| `golden/loopback-cases.mjs` | MCP settings setup and loopback operations; does not call old Electron channels directly |
| New pre-change foundation probes in section 10 | Explicitly invoke the old channels in the table above; the same probes remain unchanged after the port |

Thus the checked-in harness does not contain a hidden direct foundation-invoke probe. Its route smoke exercises renderer callers indirectly. The old channels nevertheless remain for unchanged pre-change probes, compatibility consumers and transport parity.

Each capability phase adds parallel probes on its new RPC path and proves identical answers before switching that capability’s harness transport. Existing golden answers remain unchanged. Phase 10 removes the old foundation forwarders together with `electron-ipc-decorator`, after the harness has switched and no source consumer remains.

`M/settings.ts` becomes strict logic. Unported modules import a temporary synchronous `settingsManager` facade retaining its eight public methods. Warmed synchronous services run under the facade’s synchronous runner; no asynchronous filesystem effect runs under `runSync`.

The CLI uses descriptor/automation transports rather than importing `settingsManager` (`apps/cli/src/transport/descriptor.ts:10–83`). Preserve that route.

The database remains on the borrowed-handle runtime and existing driver. No foundation value import loads `node:sqlite`. Existing journal migration ownership/timing stays with its host under decision 12.11; the eventual driver cutover remains governed by the db design.

### Renderer

- `DesktopAtomRuntime.ts` owns `Atom.context({ memoMap: Layer.makeMemoMapUnsafe() })`.
- All clients share that factory and the same Protocol Layer.
- One document registry/provider owns foundation state and scoped runtime mounting.
- Both normal App and ShareCapture paths receive the provider.
- Show-home consumption mounts only with AppLayout.
- Jotai remains for legacy stores; compatibility projects the same strict state.
- Document destruction closes sessions even if React cleanup never runs.
- Strict screens receive legacy integration through section 6’s slots and callbacks.
- The renderer logging Layer, including `References.MinimumLogLevel: "All"`, is installed in the shared runtime factory.

Reference: `~/YeeBois/projects/beep-effect/apps/professional-desktop/src/runtime/ProfessionalAtomRuntime.ts:18–31`, `ProfessionalAtomProvider.tsx:16–50`.

The installed reference binding exposes `RegistryProvider` options and delays disposal by 500 ms (`~/YeeBois/projects/beep-effect/node_modules/@effect/atom-react/src/RegistryContext.ts:78–119`). StrictMode tests account for delayed disposal; they do not assume immediate cleanup.

Adopt scoped listeners, decoded ingress and queue-fed callbacks from the reference transport. Do not copy its private packages, Tauri APIs, Rust sidecar framing, bearer-token HTTP transport or HTTP fallback. Electron sender identity and document generations supply this boundary.

## 8. Logging and observability

`DesktopLogger.layer.ts` installs one Effect logger backed by `ElectronLog.driver.ts`. Only the driver imports `electron-log/main`.

`Logger.make` receives message, level, Cause, fiber and date; `Logger.layer([logger])` replaces defaults unless merging is requested (`node_modules/effect/src/Logger.ts:104–109`, `:545`, `:1195–1218`). Desktop uses replacement to avoid duplicate lines.

Every main, preload and renderer logging runtime provides `References.MinimumLogLevel` as `"All"`:

```ts
export const DesktopMinimumLogLevelLive =
  Layer.succeed(References.MinimumLogLevel, "All")

// In each process's logging Layer, with that process's sink logger:
export const LoggingLive = Layer.mergeAll(
  Logger.layer([logger]),
  DesktopMinimumLogLevelLive
)
```

The process-specific `logger` is the main sink logger or the preload/renderer forwarding logger. Install this context in the final main runtime, preload logging runtime, renderer Atom runtime factory and any retained facade runtime that executes these Effect log calls. Provide it during logging Layer acquisition as well when acquisition itself logs. Do not merely provide it while constructing the logger and leave executing fibers at the default.

Effect’s default minimum is `"Info"` and it filters before invoking the logger (`node_modules/effect/src/internal/references.ts:54–56`; `internal/effect.ts:6743–6747`). `"All"` is required so development’s verbose/debug/silly entries reach electron-log. The public reference is `effect/References`, declared at `node_modules/effect/src/References.ts:361`; the reference desktop also provides it explicitly (`~/YeeBois/projects/beep-effect/apps/professional-desktop/src/runtime/Observability.ts:90–93`).

| Existing call/level | Effect representation | Sink |
| --- | --- | --- |
| `log.info(a, b, …)` | Info with ordered argument vector | `log.info(a, b, …)` |
| Scoped warning | Warning plus scope annotation | Corresponding `log.scope(...).warn(...)` |
| Error | Error | `error` |
| Warning | Warn | `warn` |
| Info | Info | `info` |
| Verbose | Debug plus original-level annotation | `verbose` |
| Debug | Debug | `debug` |
| Silly | Trace plus original-level annotation | `silly` |
| Fatal | Fatal | `error` |
| Failure Cause | Existing arguments followed by complete Cause rendering | Same level/scope |

Do not JSON-stringify or join argument vectors. Preserve Error arguments and first textual arguments so offline log recognition remains valid.

Retain `configureLogger` behavior:

- Development console/file level `silly`; production `info`.
- Development IPC logging enabled at `silly`; production disabled.
- Existing default file resolution, including portable configuration.
- Existing file format and rotation.
- Maximum file size `10 * 1024 * 1024`.
- Error catching without dialogs.
- Existing `Log file location:` line.

Sources: `M/config/logger-config.ts:9–40`; installed `node_modules/electron-log/src/node/transports/file/index.js:35–70`.

electron-log’s existing transport-level filtering remains the only level filter for these entries. All six original levels reach its sink in development and production. Its console/file transports emit all six in development and error/warn/info in production; its IPC transport emits all six in development and none in production. The installed transport loop skips disabled transports and compares each transport’s threshold against the original level (`node_modules/electron-log/src/core/Logger.js:36`, `:117–125`, `:165–173`).

`formatDesktopConsoleLog` retains local `HH:mm:ss`, trimmed scope padded to width ten, first-string prefix joining, remaining argument identity and prefix-only empty output (`M/lib/desktop-console-format.ts:1–25`). Strict logic receives time; it does not create ambient dates.

Legacy direct electron-log callers remain until their capabilities move. Renderer/preload Effect loggers use a dedicated decoded logging bridge into the same sink, without recursively invoking the application logger. The forwarding runtimes also use minimum `"All"` and preserve the original electron-log level, scope and ordered arguments. They do not filter production debug entries before forwarding; the sink’s existing transports decide output. Existing renderer-console warning gating remains separate.

### Optional OTLP

Switch: `VIDBEE_OTLP_ENABLED=1`. Endpoint override: `VIDBEE_OTLP_ENDPOINT`, default `http://127.0.0.1:4318/v1/traces` only when enabled.

Disabled means `Layer.empty`: no exporter, processor, timer, HTTP client or endpoint discovery is constructed. Importing configuration does not activate SDK defaults.

Enabled uses `@effect/opentelemetry/NodeSdk.layer` with an explicitly supplied trace exporter/processor, service name `vidbee-desktop` and app version. Export RPC/driver spans; no automatic instrumentation or upstream telemetry. Shutdown flush is scoped and bounded.

| Dependency | This checkout | Required pin |
| --- | --- | --- |
| `effect` | Installed, 4.1.4 | Existing |
| `@effect/platform-node` | Installed | Existing catalog |
| `@effect/atom-react` | Absent | `4.1.4` |
| `@effect/platform-browser` | Absent | `4.1.4` |
| `@effect/opentelemetry` | Absent | `4.1.4` |

Pins are from the reference catalog (`~/YeeBois/projects/beep-effect/package.json:35–39`). Add root catalog entries and desktop `catalog:` dependencies. Import browser services only as needed; no aggregate `BrowserServices.layer` is assumed.

`NodeSdk.layer` and its processor/configuration fields are verified in the reference installation’s `@effect/opentelemetry/src/NodeSdk.ts:37–51`, `:113–155`. Verify exporter/processor constructors against the pinned installation before implementation; no guessed constructor is part of this contract.

`GOLDENS.md:111–119` records existing catalog/favicon requests and DNS evidence. Disabled observability adds zero network/DNS activity. It does not silently remove existing application requests to manufacture an empty whole-app DNS log.

## 9. Deliberate changes

The new boundary and strict rules require these changes:

1. **New RPC validates inputs and outputs.** Malformed values previously accepted unchecked can fail on the new typed surface. Old channels and synchronous compatibility preserve their permissive signatures, values and errors. New settings batches use ordered correlated-update arrays and reject duplicate keys before persistence; object callers retain their existing enumeration order.

2. **Malformed known settings fields receive tolerant typed presentation.** Existing manager normalization and startup repairs run first, with exactly their existing writes. Remaining malformed fields use effective host defaults in the typed view, with one key-only warning per load and no additional persistence. Old APIs retain their existing raw/normalized results. An unrelated single or batch update does not write fallback values for other keys.

3. **New wire binary is schema encoded.** New clients receive `Uint8Array`; old callers retain `ArrayBuffer`.

4. **Failure logs gain full Cause information.** Existing arguments, scope, location, format, rotation and transport-level filtering remain. Effect minimum `"All"` preserves delivery of the original six levels to electron-log.

5. **Desktop gains partial-unit enforcement.** Status stays partial until both complete application configs satisfy the base. Graph enforcement requires complete compiler capture.

6. **The new transport has explicit resource and lifecycle failure contracts.** Reserved notification-namespace IDs, inbound notifications, duplicate live IDs, requests after Eof, failed drains and exhausted admission/buffer budgets terminate the affected client or connection visibly. Show-home overflow follows that rule; there is no new backlog or replay. Unfinished native work retains application slots and bytes in a finite window-owned pool across disconnect/reconnect, releasing them only on actual driver completion. These limits apply to the new transport, not retroactively to retained old invoke channels.

There is no deliberate change to settings defaults, migration rules, batch write/side-effect order, optimistic save behavior, focused-window selection, boot order, close-to-tray, native dialog behavior, capture serialization, scheduling or capability behavior.

Any further unavoidable difference requires an old/new example, an entry here and in `OWNER-REVIEW.md`. Passing tests with broadened normalization does not authorize it.

## 10. Verification the implementation owes

### Characterization before changing source

Record on the packaged build immediately preceding 9.0:

| Area | Required cases |
| --- | --- |
| Settings file | Missing, empty, partial, unknown root/nested keys, malformed JSON, wrong-shaped known values, null/undefined, dotted keys and serialization failures |
| Settings writes | Every field family; ordered batch; insertion order reversing schema declaration order; later-write failure; mkdir failure; clear/set reset failure |
| Normalization | Permission missing/invalid/legacy; ASR; syntactically valid unknown-family TTS ID; provider; mirror; subtitle filtering |
| Paths | Normal/old default, custom path, portable fresh, relocated internal path, external path, marker failures |
| Fresh install | File-existence capture, locale, log line and What’s New acknowledgement |
| Returning profile | Locale retained; current/stale/missing marker |
| Side effects | Exact caller-key order, conversions, skipped undefined, detached transcription work, broadcast timing and reset’s absent broadcast |
| Renderer state | Provisional values, language/load failures, optimistic save success/failure, overlapping saves and stale rollback |
| Boot | Import effects, ordered milestones, log lines, background launch and second-instance exit |
| Preload | Actual enumerable API keys, absent service groups, event wrapper identity, removeListener, send and file-path helper behavior |
| Native dialog | Focused-window and no-focus overloads; unresolved native Promise survives caller departure; no added cancellation |
| Share capture | Serialized captures start in enqueue order after prior success or rejection; queued closures survive caller departure |
| Logging | Six original levels, argument/scope fidelity and development/production transport outputs |

Malformed-settings fixtures explicitly separate existing repairs from new presentation:

1. Load wrong-shaped fields that the manager does not repair, alongside fields it does repair.
2. Record constructor writes and the raw stored document.
3. Read old `get`/`getAll` results.
4. Read the new typed view and warning keys.
5. Perform an unrelated single update; compare persisted values with the old implementation’s result.
6. Repeat with an unrelated batch update.
7. Assert no fallback value for an unrelated malformed field was persisted, and unknown nested data remains.
8. Repeat in portable mode and with injected platform/home defaults.

Settings batch characterization and codec tests use a caller object inserted as `launchAtLogin`, `hideDockIcon`, `language`, reversing those fields’ schema declaration order:

| Case | Required observation |
| --- | --- |
| Encode/decode round trip | Ordered updates remain `launchAtLogin`, `hideDockIcon`, `language`; no struct-derived reordering |
| Successful persistence | Three separate writes in caller order, followed by reread and auto-launch → dock → language-menu side effects, then broadcast |
| Failure writing `hideDockIcon` | `launchAtLogin` remains written; `hideDockIcon` fails; `language` is not written; no subsequent reread, setting side effect, transcription follow-up or broadcast |
| Duplicate wire key | Decode rejects before the first write or side effect |
| Empty batch | Preserve the existing empty application-update behavior, including reread/broadcast |
| Legacy object path | Existing permissive values, object enumeration, partial writes and error timing remain unchanged |

Show-home characterization has four named cases:

| Case | Required observation |
| --- | --- |
| Before listener mount | Command is lost; later mount causes no navigation |
| Slow consumption | Live commands remain ordered; navigation start does not wait for prior navigation completion; capacity boundary produces explicit failure |
| After unsubscribe, then same-document resubscribe | Commands during absence are lost; old queue is gone; new subscription starts empty |
| Across reload | Old-session commands cannot replay or reach new document; new subscription starts empty |

Use isolated synthetic profiles. Do not mutate the running profile.

### Pre-change renderer probes

Existing route smoke is not a complete IPC characterization. Add separate probes without rewriting existing cases:

- `renderer--foundation-settings-read`: individual keys, complete object and eligibility.
- `renderer--foundation-settings-write`: single/batch update, caller order, reread, restart persistence and unknown-key round trip.
- `renderer--foundation-settings-malformed`: ordered repairs, tolerant view and unrelated single/batch persistence.
- `renderer--foundation-settings-reset`: defaults and side effects on a disposable profile.
- `renderer--foundation-whats-new`: fresh/returning/current/stale marker and acknowledgement.
- `renderer--foundation-app`: version, platform, OS, downloader/kernel status and offline retry.
- `renderer--foundation-settings-events`: listener-before-write, payload/count/order and removal.
- `renderer--foundation-kernel-events`: snapshot race and retry.
- `renderer--foundation-show-home`: four cases above.
- `renderer--foundation-window`: maximize toggle, isMaximized, minimize, close and absent focus.
- `renderer--foundation-share`: PNG signature/dimensions and clipboard write.
- `renderer--foundation-preload`: actual helpers and existing invoke path.
- `renderer--foundation-screens`: controls, About diagnostics and reload persistence.

Message boxes and quit run as separate controlled/manual cases. Site icons pin offline fallback/errors, not remote success.

Pre-change probes call old channels and retain their recorded observations. No pre-change probe calls a bridge that does not exist yet.

### Transport tests

Use `@effect/vitest` with injected Electron drivers:

- Unary success/declared failure; optional payloads, Unicode and binary.
- Multiple chunks, empty stream, failure after chunks and terminal Exit.
- Ack pauses production without blocking native callbacks.
- Interrupt before dispatch, during handler, awaiting Ack and after completion.
- Cleanup on success, expected failure, defect and interruption.
- Synchronous completion during command issuance; no stale registration.
- Two clients in one document; two windows with identical IDs.
- Reload/navigation/crash/destruction; stale frames and reconnect.
- Malformed JSON, frames, envelopes, headers, IDs, payloads and responses.
- Unknown procedure/handler defect followed by successful request.
- Send failure, absent client and late/duplicate terminal messages.
- Out-of-order unary completion and ordered stream chunks.
- Multi-megabyte text/settings/PNG; exact bytes and measured memory.
- Subscribe/unsubscribe and HMR without duplicate owned listeners.
- Helper ordering and both data-last overload forms.
- Legacy signatures, errors, synchronous prefixes and Promise settlement.

The four transport-regression cases from the first review’s finding 1 are mandatory:

| Case | Assertions |
| --- | --- |
| Duplicate live ID | Two queued Requests reuse an ID before dispatch/completion; offender disconnects before second handler runs; pending work cleans up |
| Request after Eof | Request is rejected, cannot recreate ended client, and leaves no handler/registration |
| Sink interruption | Forced sink interruption kills connection, removes all mappings, reports clients through disconnects and fails pending calls/pulls |
| Unaffected second window | A second document continues unary/stream work through each offender failure |

Notification-namespace tests cover both collision orderings:

| Case | Assertions |
| --- | --- |
| Ordinary reserved ID, then notification | Request ID `@effect/rpc/notification/0` is rejected before dispatch; a subsequent notification cannot enter the sink or start a handler |
| Notification, then ordinary reserved ID | Notification is rejected before dispatch; a subsequent reserved ID cannot enter the sink or start a handler |
| Reserved ID with `discard: true` | Same namespace rejection; discard does not exempt the ID |
| Ordinary supported discarded request | Start acknowledgement is separate from execution completion; no notification rewriting occurs |
| Other document during each violation | Valid unary and streaming requests remain usable; no sink interruption leaks across documents |

Run the two ordering cases both within one queued ingress sequence and with fresh connections, so rejection cannot be masked by an already closed client.

Additional admission tests:

- Flood valid never-ending subscriptions with fresh IDs until client/document limits are reached.
- While flooding, a second document continues unary requests within a bounded scheduling delay.
- Assert typed visible overflow, complete watcher/request/ack/queue/map cleanup, and counters returning to baseline when no native work remains.
- Flood logical-client creation, unary requests and oversized binary/text separately.
- Verify aggregate document limits cannot be evaded with more logical clients.
- Verify control allowance remains available when data allowance is exhausted.
- Test discard acknowledgement before actual completion.
- Test string/number ID distinction and reuse only after terminal finalization.

Native retention tests use unresolved fake dialogs and captures:

1. Admit a native request, start or enqueue the driver operation, then disconnect its document.
2. Verify routing, pending pulls and transport queues disappear, while the application unary slot, native-pool slot and retained bytes remain charged.
3. Reconnect repeatedly in the same window and repeat. The persistent account reaches its finite operation or byte limit; further work fails visibly before driver invocation or capture enqueue.
4. Verify a new document generation and additional logical clients do not reset the window account.
5. Repeat separately with unresolved dialogs, an active capture and queued capture closures. Pin focused/no-focus dialog overloads and capture enqueue/start order.
6. Interrupt the request fiber before native settlement. Its finalizer runs, but no native charge is released.
7. Settle individual native operations with success and rejection. Only their actual completion and released retained state return their charges; no late result reaches the departed document.
8. Exercise synchronous invocation failure/completion, duplicate completion signals, completion after window destruction and a dead document’s missing control queue.
9. Verify another window remains usable within its own quotas and the application total remains bounded across newly created windows.
10. Verify response-accounting transfer has no uncharged interval, and no cancellation or retry is invented for old invoke callers.

### Logging tests

Exercise all six original electron-log levels: error, warn, info, verbose, debug and silly.

| Runtime/environment | Required observation |
| --- | --- |
| Main, development | All six reach the sink once with original level, argument vector and scope; console/file/IPC admit all six |
| Main, production | All six reach the sink once; console/file admit error/warn/info; IPC admits none |
| Preload forwarding, development and production | All six cross the decoded bridge once and reach the main sink; only the existing electron-log transport thresholds filter output |
| Renderer forwarding, development and production | Same six-level forwarding and sink behavior, including Debug and Trace representations |
| Runtime/context integration | Main, preload, renderer Atom and relevant compatibility runtimes observe minimum `"All"` during acquisition and execution |
| Error/Cause formatting | Error arguments and ordered text remain; full Cause is appended without duplicate default logger output |
| Forwarding failure | No recursive logging loop or duplicate sink invocation |

Check original-level annotations distinguish verbose from debug and silly from other Trace output. A sink-only test without the executing runtime’s minimum-level context is insufficient.

### Ownership tests

Run resolved node/web/test graph checks and all negative fixtures from section 2. The graph larger than 64 KiB must put its forbidden legacy dependency near the end and prove that complete capture reaches it. Separately inject successful-exit truncated listings, missing explicit roots, nonexistent paths, missing final newline and capture failures; all fail closed.

Assert no strict renderer path reaches `main/ipc`, `auth-client`, legacy stores or capability components through aliases, type-only imports or declarations.

Mount strict Settings/About with injected test slots. Verify slots receive current values/actions, preserve tab mount behavior, and path-picker/navigation callbacks execute through the legacy shell. Verify the transcript share-image dialog’s platform read uses the new App client while its filesystem operations retain their capability route.

### Gate and manual proof

Run strict node/web/test configs, `bun run check`, `bun run test`, `bun run deps:check`, `bun run port:check`, packaged Linux build and the unchanged full golden suite. Preserve existing golden documents. Record five consecutive packaged passing runs required by `GOLDENS.md`.

Inspect main, preload and renderer bundles separately. Preserve native externalization (`apps/desktop/electron.vite.config.ts:35–70`), reject unresolved new workspace imports, and verify no `node:sqlite` is introduced.

Offline manual exercise owes:

- Settings/About through new foundation clients, including failure presentation and restart persistence.
- Injected legacy capability panels through retained transports.
- A second owned window, focus-sensitive commands and isolated cleanup.
- Reload during settings/kernel subscriptions.
- Quit with an active stream and no stalled shutdown.
- Tray/background/close-to-tray behavior.
- New RPC and a decorated capability working in one packaged session.
- Six-level logging and renderer/preload forwarding with development/production filtering.
- Disabled OTLP with no exporter traffic.
- Enabled OTLP against an owned local collector, received span and bounded shutdown.
- Resource measurements required by decision 12.5, including retained native work.

Linux proof does not establish packaged macOS/Windows behavior. Their branches compile under D2; platform launch, Dock/login/protocol, clipboard and native-dialog proof remain separately reported.

## 11. Behavior kept as it is

| Behavior | Source |
| --- | --- |
| Generic legacy settings lacks semantic validation; unknown stored keys survive | `M/settings.ts:69–139` |
| Manager operations normalize differently | `M/settings.ts:86–183` |
| Batch persistence follows caller object enumeration order and retains earlier writes on later failure | `M/settings.ts:159–175` |
| Supplied-key side effects follow caller order only after all writes succeed | `M/lib/settings-host.ts:36–52`; `M/lib/settings-effects.ts:46–57` |
| Required repairs stop at first caught failure | `M/settings.ts:232–267` |
| Reset neither broadcasts nor reruns constructor repairs | `M/ipc/services/settings-service.ts:33–38` |
| Shared provisional defaults differ from host defaults | `S/types/index.ts:468`; `M/settings.ts:73–78` |
| Failed optimistic save restores entire earlier object and catches failure | `R/store/settings.ts:35–52` |
| App-info failure is cached for document lifetime | `R/components/feedback/FeedbackLinks.tsx:15–40` |
| Window commands target focused window; absent focus gives no-op/false | `M/ipc/services/window-service.ts:33–65` |
| Message box uses focused-window overload, otherwise unparented overload | `M/ipc/services/app-service.ts:87–98` |
| Share capture reuses hidden window independently of caller focus | `M/ipc/services/window-service.ts:16–23` |
| Share captures serialize through a Promise chain after prior success or rejection | `M/lib/share-capture-window.ts:450–462` |
| Kernel retry waits for preparation; watcher cancellation is separate | `M/ipc/services/app-service.ts:44–48` |
| Icons try primary/fallback, accept image/icon content, log failures and return null | `M/ipc/services/app-service.ts:103–127` |
| Windows label uses final build token and threshold 22000 | `M/ipc/services/app-service.ts:51–78` |
| Legacy registration globally replaces `ipcMain.handle` registrations | `M/ipc/index.ts:22–29` |
| Initialization precedes single-instance lock | `M/index.ts:1–95`, `:964` |
| `webSecurity` and sandbox are false | `M/index.ts:535–545` |
| Window state saves on closed; initial maximize waits for intentional show | `M/lib/window-state.ts:44–77` |
| TTS parsing accepts syntactically valid unknown-family IDs | `S/tts-models.ts:176–179` |
| Built-in skills depend on eager Vite glob/YAML behavior | `S/builtin-skills.ts:4–20` |
| Show-home has no mounted-listener backlog | `M/lib/app-icon-menu.ts:94`; `R/app-layout.tsx:160–170` |
| Transcript share dialog reads platform only while open, guards late completion and ignores failure | `R/components/transcript/TranscriptShareImageDialog.tsx:40–62` |
| Development transports admit silly/debug/verbose; production console/file threshold is info and IPC is disabled | `M/config/logger-config.ts:15–24` |

Preserve truthiness explicitly: empty path fallback, boolean side-effect conversion, optional conversion height, blank image content and default labels must not become mere null checks.

HashMap/HashSet iteration does not determine emitted arrays, group order, serialized fields or listener order. Keep explicit ordered sequences where observable.

Existing title-bar listeners request `window-maximized` and `window-unmaximized`, while the inspected main code supplies no corresponding producer. Do not add one during this port (`R/components/ui/title-bar.tsx:19–34`). Record listener-wrapper cleanup behavior during characterization; any cleanup difference beyond the new scoped transport’s required lifecycle belongs in section 9 before implementation.

## 12. Decisions on the draft’s open questions

The following decisions were recorded on 2026-11-18 under the plan’s amendments. Choices that alter plan wording are recorded in `OWNER-REVIEW.md`.

1. **Downloader-core precedent.** The reviewed downloader-core design is an input to this revision and has been checked against the foundation contracts. Preserve its compatibility direction, warmed runtime ownership, synchronous sinks, exit-observer settlement and shared queue/database ownership.

2. **“Settings and About entirely on the new path.”** Every settings/app/window operation and its state moves to `effect/rpc`, including calls inside later-capability components. Embedded filesystem, cookies, transcription, AI, MCP and account implementations retain their phases. Legacy shells inject them into strict screens; no temporary capability-forwarding RPC contracts are added.

3. **Malformed settings.** Existing manager normalization and startup repairs precede tolerant field decoding. Use effective host defaults, including portable download path/login behavior. New projection writes nothing. Existing startup writes remain exactly those listed in section 3. Warn once per load with invalid keys only. Old channels/facades retain existing raw/normalized values. Unrelated single/batch updates do not persist fallback values for other keys.

4. **New settings RPC.** Typed known-key surface on the new path; exact raw key/value compatibility on old channels and in-process facade.

5. **Transport budget.** Adopt section 5’s finite admission limits for sessions, clients, unary work, streams, bytes and native work. Measure largest current payloads with golden probes and an isolated real-profile copy before confirming constants. Record final numbers and memory/accounting evidence. Overflow is typed, visible and terminal for the affected client.

6. **Loss-sensitive streams.** Each capability specifies its own policy. Foundation provides coalescing state/invalidation and ordered bounded delivery with explicit failure. Show-home has no absent-subscriber backlog or replay.

7. **DNS.** Preserve offline baseline; observability adds no traffic when disabled.

8. **OTLP.** Use reference-pinned `@effect/opentelemetry` and verify actual exporter/processor constructors before use.

9. **Message box.** Model the installed full serializable option set with declaration-parity tests. Native signal/image objects are outside JSON DTOs; old invoke behavior remains.

10. **Main bootstrap.** `M/index.ts` remains explicitly legacy and calls foundation at existing execution points. It becomes strict when its final orchestrated capability moves.

11. **Database.** Keep driver, borrowed handle ownership and migration timing. No second driver. This decision qualifies the db design’s earlier phase-9.0 journal-service wording; eventual driver cutover remains phase 9.5/10 under its gate.

12. **Partial-unit ratchet.** Use compiler-resolved file listings, exact ownership and a committed monotonic baseline. Do not assume classic TypeScript compiler APIs. Report partial status and counts.

13. **Active IDs and supervised drains.** Reserve live IDs per logical client before dispatch. Duplicate live IDs and requests after Eof disconnect the offender. Drain failure/interruption invalidates its connection and reports every logical client through disconnects. Inbound notifications are rejected; discarded work keeps its separate completion rules.

14. **Renderer ownership.** Section 6 names strict modules, legacy shells and capability modules. Legacy imports strict; strict never imports legacy. Browser declarations carry no main implementation dependencies.

15. **Preload compatibility.** Preserve actual helper properties and the proxy invoke path. Do not create enumerated `window.api` service groups.

16. **Old-channel lifetime.** Retain exact foundation invoke forwarders through the harness transition. Capability phases prove old/new answers before switching probes; phase 10 removes forwarders with decorators.

17. **Complete compiler capture.** The plain Node checker runs the installed native compiler or its Node launcher, consumes complete output and fails closed on capture/process errors, missing roots, invalid paths or a missing final newline. The greater-than-64-KiB negative fixture is mandatory.

18. **Notification namespace.** Reserve `@effect/rpc/notification/` for Effect. Reject ordinary and discarded IDs in it, and reject inbound notifications because the current renderer requires none. Test both collision orderings before server dispatch.

19. **Logging minimum.** Main, preload and renderer logging runtimes provide `References.MinimumLogLevel: "All"`. Existing electron-log transport thresholds are the only level filters; six-level tests cover both environments and forwarding paths.

20. **Native completion and reconnect.** Request-fiber finalization does not release unfinished native work. Reserve the finite native pool before invocation/enqueue; keep application slots and bytes charged to the originating window account across document generations and window destruction until driver completion. Preserve dialog parenting and capture serialization.

21. **Settings batch order.** The new batch wire form is an ordered array of correlated `SettingUpdate` values built from caller `Object.entries` order. Reject duplicate keys on decode. Preserve that sequence through persistence and supplied-key side effects, including partial writes and absence of side effects after a later write failure.

The alternatives and adopted choices are:

| Question | Alternatives considered | Adopted |
| --- | --- | --- |
| Missing downloader precedent | Proceed without it; read it | Read and check it |
| Entire Settings tree | Pull capabilities into 9.0; temporary capability RPC; inject retained capability panels | Preserve D10 ownership with injection |
| Malformed typed fields | Fail view; tolerant presentation; automatic repair | Tolerant presentation after existing normalization/repairs, no added writes |
| Generic settings API | Raw new API; typed new API with compatibility | Typed new API and exact old compatibility |
| Transport bounds | Frame-only; server concurrency only; full admission/accounting | Full admission/accounting |
| Loss-sensitive events | Unbounded buffer; sliding loss; explicit bounded failure | Per-capability semantics and explicit failure |
| Show-home absence | Backlog; replay; current loss | Current loss, no replay |
| DNS | Remove existing requests; preserve baseline | Preserve baseline |
| OTLP | Guessed convenience API; verified NodeSdk wiring | Verified pinned wiring |
| Message-box fields | Current-caller subset; full serializable declaration | Full serializable declaration |
| Main strictness | Port all orchestration now; retain explicit partition | Retain explicit partition |
| Database | New driver/service during foundation; preserve host | Preserve host and timing |
| Ownership tooling | Directory scans; classic compiler API; installed compiler listings | Complete installed-compiler capture under plain Node and committed baseline |
| Foundation compatibility removal | Last UI caller; after harness transition | Phase 10 after parity and harness switch |
| Notification collision | Namespace reservation alone; inbound notification prohibition alone; both | Both; current renderer needs no inbound notifications |
| Log filtering | Effect environment thresholds; electron-log transport thresholds | Effect minimum `"All"` and existing electron-log thresholds |
| Native work after disconnect | Release on fiber end; retain per generation; persistent finite window pool | Persistent finite window pool plus application charges until actual completion |
| Settings batch wire order | Optional-field object; explicit key metadata; ordered correlated updates | Ordered correlated-update array, duplicate rejection |

The reference conventions adopted are schemas before services, browser-safe RPC contracts, colocated atoms, app-local Layer composition, scoped listeners and registry-owned state. Broader reference restructuring belongs to phase 11.

## 13. The recipe a capability phase follows

The following text goes into `PORT-GUIDE.md`.

1. **Inventory and characterize first.** List decorator methods, events, atoms, components, host exports and legacy facades. Record uncovered packaged MCP, HTTP and renderer observations before changing behavior. Preserve errors, ordering, initialization and timing.

2. **Write models before contracts.** Add browser-safe `Foo.model.ts` and branded `Foo.errors.ts`. Reuse package models. Use LiteralKit, finite numbers, mutable legacy shapes and open codecs at every persisted level retaining unknown keys. Decode boundaries; never cast into trust. Represent observable batch order explicitly.

3. **Declare `Foo.rpc.ts`.** Export `FooRpcs`, unique tags and explicit payload/success/error schemas. Use `stream: true` for subscriptions. Remove context arguments; transport owns identity. Respect the reserved request-ID namespace and inbound notification prohibition.

4. **State stream semantics.** Define subscription-before-snapshot, order, coalescing, capacity, overflow, absence, replay/resnapshot, cancellation and ownership. Ack supplies consumer backpressure; native callbacks remain nonblocking.

5. **Define services and Layers.** Runtime execution belongs in entrypoints/facades. Inject Electron, filesystem, environment, timers, clocks, randomness and third-party drivers. Promise adapters belong in drivers; filenames grant no diagnostic exemption. Native operations that can outlive a request report actual completion and retain their admission charges until then.

6. **Implement handlers over services.** Build `FooRpcs.toLayer(...)`, merge into `DesktopRpcs`, and provide at the existing composition root. Reuse transport, admission, runtime and host resources. Do not create another queue or database handle.

7. **Port renderer state end to end.** Add `Foo.atoms.ts`, `AtomRpc.Service` and the shared runtime factory. Streaming queries are pull atoms unless drained. Preserve provisional values, optimistic behavior, errors and cache lifetime. Legacy components may import strict clients/state.

8. **Keep compatibility concrete.** Forward old channels/events only while consumers or baseline probes need them. Preserve positional signatures, binary/results, original errors, synchronous prefixes and Promise settlement. Compatibility imports strict; the dependency never reverses.

9. **Shrink registry and ratchet.** Remove the capability’s decorated class, promote exact ownership/baseline paths, and list remaining consumers. Compiler-resolved graphs include aliases, type-only imports and declarations. Capture the whole graph under plain Node and fail closed. Never conceal implementation behind shims or copied declarations.

10. **Apply review lessons mechanically.** Use finalizers, `acquireRelease`, `ensuring` and `onExit`; never JavaScript cleanup around `yield*`. Register state before synchronously completing work can run. Preserve truthiness, order, callback prefixes and both data-last overload forms. Do not equate request-fiber finalization with native completion or rely on Effect’s default log minimum.

11. **Run the gate.** Strict source/tests, whole-repo checks/tests, dependency and port checks, packaged Linux build and unchanged goldens pass. Add new-path probes proving parity before switching harness transport. Exercise coexistence and offline behavior. Distinguish local, packaged, hosted and platform evidence.

12. **Remove scaffolding after the final consumer and probe.** Phase 10 deletes decorators, compiler flags, Jotai, retained zod compatibility, package facades, foundation old-channel forwarders and obsolete preload/proxy/event adapters. Both desktop configs extend the base; partial-unit machinery goes. Search source, manifests and lockfile, then run the full gate.

## 14. Review

There were two independent review rounds. Each reviewer was an independent session on the review-panel tier, read-only, on 2026-11-18.

The first reviewer read the plan, port guide, rule set, draft, inventories, precedents, desktop source and installed Effect APIs, and ran in-memory transport probes. Two major findings, two minor findings and two implementation questions; no blocker.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Major | Duplicate live request IDs can interrupt a connection drain and strand requests. | Section 5 reserves IDs before dispatch, defines Eof and all release paths, supervises every drain and disconnects failed connections; section 10 adds duplicate-ID, request-after-Eof, sink-interruption and unaffected-window tests. |
| 2 | Major | Frame/queue bounds alone leave accepted requests, subscriptions and client mappings unbounded. | Section 5 declares numeric session/client/unary/stream/byte admission limits, source workload counts, binary accounting, document fairness and visible terminal overflow; sections 10 and 12.5 require flood/cleanup tests and measured confirmation. |
| 3 | Minor | Malformed-settings wording contradicts tolerant fallback and confuses shared defaults with host defaults. | Sections 3, 9.2 and 12.3 define existing normalization/repair first, effective host defaults second and no added writes; section 10 pins unrelated single/batch persistence. |
| 4 | Minor | `window.api` is described as a callable service-group surface that its proxy spread does not expose. | Sections 1 and 5 describe actual helper properties and renderer invoke proxy; no new enumerated groups; sections 6 and 10 correct declarations and characterization. |
| 5 | Question | Renderer strict ownership, injection and declaration boundaries are unspecified, and a platform caller is omitted. | Sections 2 and 6 assign ownership, slots/callbacks, browser-safe globals, compiler-list extraction, committed baseline and negative fixtures; every foundation caller moves, including `TranscriptShareImageDialog`. |
| 6 | Question | Show-home behavior without a subscriber, across resubscription and at capacity is undefined. | Section 5 preserves lost-when-unmounted behavior, specifies 256-entry live queue, explicit overflow and no replay; section 10 adds the four characterization cases. |

The first reviewer found sound the installed core Effect APIs, settings compatibility distinctions, coexistence and borrowed resource ownership, runtime/Atom conventions, capability recipe and offline verification approach.

The second reviewer read the revised design, source, inventories, precedents and installed APIs, and ran compiler-output captures and in-memory Effect/transport probes. It confirmed all six first-round resolutions. One major finding, two minor findings and two implementation questions; no blocker.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Major | `bunx --bun tsrs --listFilesOnly` can exit successfully with a truncated resolved graph. | Section 2 prescribes the native compiler or Node launcher from a plain Node checker, complete stream capture, explicit-root/path/final-newline validation and fail-closed errors; section 10 requires the graph exceeding 64 KiB with a forbidden dependency near its end; section 12.17 records the decision. |
| 2 | Minor | Ordinary IDs can collide with Effect’s generated notification IDs despite distinct wire IDs. | Sections 3 and 5 reserve `@effect/rpc/notification/`, reject ordinary/discarded IDs in it and explicitly disallow inbound notifications based on today’s renderer calls; section 10 tests both collision orderings; section 12.18 records the restriction. |
| 3 | Minor | Effect’s default minimum log level drops development verbose/debug/silly entries before electron-log receives them. | Sections 7 and 8 provide `References.MinimumLogLevel: "All"` in main, preload and renderer runtimes and retain electron-log’s transport filtering; section 10 adds six-level development/production and forwarding tests; section 12.19 records the decision. |
| 4 | Question | Disconnect accounting does not say which charges survive while native work remains unfinished. | Sections 5 and 6 keep application slots and retained bytes through actual driver completion and reserve a finite window-owned native pool before invocation/enqueue; section 10 adds unresolved-dialog/capture reconnect tests; section 12.20 records the lifetime contract. |
| 5 | Question | An unspecified settings patch codec can reorder separate writes and supplied-key side effects. | Sections 3 and 6 declare ordered correlated-update arrays built from caller `Object.entries` order, reject duplicates and preserve failure boundaries; section 10 pins reversed declaration order and later persistence failure; section 12.21 records the decision. |

The second reviewer found sound the actual Effect Protocol pair and Ack behavior, supervised cleanup and document isolation, the first-round admission mechanism, Show-home policy, all 22 foundation methods and 12 direct renderer caller modules, renderer injection/declaration boundaries, Atom ownership, coexistence and verification limits.

This revision also checked the supplied downloader-core design, including its compatibility direction, synchronous sinks, per-owner warmed runtimes, exit-observer Promise settlement and shared queue/database ownership. The foundation preserves those contracts and the settled db/task-queue precedents.

## 15. Still open

No unresolved behavior decision remains from either review round.

Decision 12.5 still requires payload and memory measurements before confirming the numeric admission constants, including the native-work pool and retained-byte accounting. Installed exporter/processor constructor checks, packaged characterization, unchanged golden parity and platform proof remain implementation gates, not evidence supplied by this design revision.

If characterization exposes another behavior difference, preserve the old path and record the concrete alternatives here before choosing a change that section 9 does not already authorize.