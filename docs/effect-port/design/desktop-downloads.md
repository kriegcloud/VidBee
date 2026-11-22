# Design: desktop downloads (phase 9.1)

Status: frozen on 2026-11-22 after three independent review rounds; the implementation requirements section binds every implementation lane. Text before the freeze: third revision for architect review. The architect owns the decisions in this document. Section 12 records executed declaration, serialization and in-memory probes separately from implementation verification still owed. This document does not establish phase completion.

This revision adopts the frozen desktop-foundation amendment. It corrects the second review’s five findings: application completion interpretation, operation dependencies, retained metadata serialization, playlist parsing and implementation prerequisites. The later event-sourced model remains outside this phase.

Source trees:

- **V**: `~/YeeBois/workstation-apps/worktrees/VidBee/port-desktop-foundation`, HEAD `990ed4fe6be550aed68044e1eb64218ea64ffef2`. Desktop source references identify this tree.
- **G**: `~/YeeBois/workstation-apps/worktrees/VidBee/port-goldens-8`, HEAD `7c94ea05a537360da9a33d556b52e242658b3c7d`. Already ported packages are read here.
- **T**: `~/YeeBois/workstation-apps/worktrees/VidBee/port-standards-tooling`. Its standards editions and checkers govern production source and tests.

Paths are repository-relative. **M** means `apps/desktop/src/main`, **L** means `M/lib`, **R** means `apps/desktop/src/renderer/src`, and **S** means `apps/desktop/src/shared`. Package paths identify G unless otherwise stated. Line numbers identify existing source, not proposed companions.

The controlling documents are `PLAN.md`, its Amendments, `PORT-GUIDE.md`, the approved `desktop-foundation.md`, and the frozen foundation amendment. Package designs remain binding at their boundaries. The inventory is a discovery aid; the source anchors below govern where its earlier line numbers differ.

No repository was modified. Local writes were confined to probes. No network, application, additional agent or coding CLI session was used.

## 1. What this capability is, and what makes it risky

Downloads owns desktop media inspection, admission and control; active and historical download projections; thumbnail and local-poster resolution; playable-media preparation; browser-cookie selection; file operations; media grouping; and share capture. Home presents the active/history view. ShareCapture is the hidden renderer that paints cards and exports diagrams.

The task-queue, downloader-core and browser-capture packages already expose strict Effect services. Desktop still constructs their compatibility owners. This phase changes desktop orchestration and composition without creating replacement state beside those owners.

Six properties determine the design.

1. **Acknowledgement often precedes work.** `startDownload` returns an optimistic Boolean before URL expansion, metadata hydration and durable admission. Pause and resume acknowledge existence before their control operation settles. These results remain application acknowledgements, not durable receipts.

2. **Synchronous prefixes are observable.** Duplicate checks, settings snapshots, filesystem probes, filename reservations, raw listener delivery, profile reads, notification construction and the start of detached work occur before the original method returns.

3. **Desktop DTOs are application projections.** They include snake-case metadata, retained unchecked values, collection summaries, configured and executed cookie provenance, source-file lookup, subscription links and agent links. Package metadata models do not replace them.

4. **State has several legitimate owners.** The queue, admission leases, profile inventories, cookie jobs, filename reservations, image caches, preview preparation, capture chain, kernel and renderer overlays retain distinct ownership and lifetimes.

5. **Cancellation, signalling and completion differ.** A signal request need not await process termination. Active queue cancellation publishes before executor cancellation finishes. Player detach does not cancel preparation. Card capture has no caller signal; Mermaid export does.

6. **The renderer closure reaches later capabilities.** Download rows, playback and share cards consume transcript, subscription and AI views. Strict components receive browser-safe contracts and actions through composition. They do not import legacy stores or derive types from main implementation.

A2 and A6 apply throughout. Existing bugs are listed rather than repaired. The port retains successful unusual scalar values, truthiness, property presence, error boundaries, partial commits, synchronous prefixes and Promise settlement. An Effect calling an old Promise orchestrator is not a port of that orchestrator.

The phase-9.0 report records characterization and harness work over unchanged application source. It does not establish that the approved foundation runtime and transport have already been implemented.

## 2. Scope and file dispositions

Existing implementation filenames remain. New companions follow `Foo.model.ts`, `Foo.errors.ts`, `Foo.service.ts`, `Foo.layer.ts`, `Foo.driver.ts`, `Foo.rpc.ts`, `Foo.atoms.ts` and permitted `*.entry.ts` conventions.

Brace lists expand to the exact listed files. Each file has one lane. “Kept” means its implementation retains its existing owner; the named lane owns only the explicitly described integration edit. “Split” means strict implementation plus an explicitly unported compatibility adapter. Compatibility imports strict implementation; strict implementation never imports compatibility.

No existing public facade is deleted in this phase.

### Main-process implementations

| Files | Disposition and target | Lane |
| --- | --- | --- |
| `M/ipc/services/download-service.ts` | Port application implementation in place; remove decorators and `IpcService` inheritance. Old positional channels move to `M/ipc/legacy/Downloads.entry.ts`. | D |
| `M/ipc/services/history-service.ts` | Port in place; old channels move to `M/ipc/legacy/History.entry.ts`. | D |
| `M/ipc/services/thumbnail-service.ts` | Port in place; old channels move to `M/ipc/legacy/Thumbnail.entry.ts`. | F |
| `M/ipc/services/player-service.ts` | Port in place; old channels move to `M/ipc/legacy/Player.entry.ts`. | F |
| `M/ipc/services/file-system-service.ts` | Port in place; old `fs.*` channels move to `M/ipc/legacy/Files.entry.ts`. Import dialog filters from the early pure companion below. | F |
| `M/ipc/services/browser-cookies-service.ts` | Port in place; old channels move to `M/ipc/legacy/BrowserCookies.entry.ts`. | C |
| `L/download-facade.ts` | Split. Strict admission/control remains here. `L/legacy/download-facade.ts` retains `downloadEngine`, old callable declarations and the EventEmitter-shaped facade over the same owner. | D |
| `L/history-manager.ts` | Split. Strict reads/removals remain here. `L/legacy/history-manager.ts` retains `historyManager` and its synchronous/Promise signatures. | D |
| `L/task-queue-host.ts` | Split. Strict lazy ownership remains here, with `DesktopQueueHost.layer.ts`; old getters/lifecycle exports move to `L/legacy/task-queue-host.ts`. | H |
| `L/{download-metadata,download-path-policy,download-queue-events,path-resolver}.ts` | Port in place. Preserve calculations and evaluation positions. Clock/default-bearing compatibility exports live in `L/legacy/DownloadHelpers.entry.ts`. | D |
| `L/download-power-save.ts` | Port in place before queue-host activation. Add `DesktopPowerSave.layer.ts`; preserve initial scan, transition subscription and cleanup. | P |
| `L/LocalMediaDialog.model.ts` | New strict pure companion containing the extension arrays, dialog-filter model and `mediaFileDialogFilters`. It imports no queue, transcript or local-import orchestrator. | P |
| `L/projection.ts` | Port the application projector in place. Add `DownloadProjection.layer.ts`; source-file lookup is injected. | D |
| `L/{source-file,social-media-file}.ts` | Split pure selection from filesystem/manifest lookup. Add `SocialManifest.driver.ts`; synchronous compatibility lookup is composition-supplied. | D |
| `L/{task-queue-migrate,task-queue-migrate-policy}.ts` | Port calculations and migration orchestration in place. Add `TaskQueueMigration.layer.ts`, `MigrationSource.driver.ts`; retain `L/legacy/task-queue-migrate.ts`. | D |
| `L/{database,database-path}.ts`, `L/database/migrate.ts` | Keep current database ownership and migration timing. Expose the existing borrowed `SqlClient`; no driver cutover. | I |
| `L/{yt-dlp-info,yt-dlp-metadata-command}.ts` | Port in place with `DesktopMetadata.layer.ts` and `MetadataProcess.driver.ts`. Preserve separate video and playlist parsing. | D |
| `M/download-engine/{args-builder,format-utils}.ts`, `L/command-utils.ts` | Port pure calculations in place. Preserve unused public exports until retirement is proved. | D |
| `L/{ytdlp-manager,ytdlp-kernel-host,ytdlp-kernel-command,ytdlp-kernel-model,ytdlp-kernel-service,gallery-dl-manager,ffmpeg-manager}.ts` | Split strict binary/kernel orchestration from required host primitives. Add `DesktopBinaries.layer.ts`, `DesktopKernel.layer.ts`, `KernelFiles.driver.ts`, `KernelHttp.driver.ts`, `KernelProcess.driver.ts`; retain `L/legacy/{Binaries,Kernel}.entry.ts`. | K |
| `L/bounded-output-buffer.ts` | Port in place, retaining cap units and trailing-content policy. | K |
| `L/{browser-capture-sidecar-path,bundled-resources-path}.ts`, `M/utils/path-helpers.ts` | Port reached path/resource calculations with explicit host inputs. | K |
| `L/{browser-cookie-access,extension-cookies,social-session-manager,social-session-keyring,social-profile-manager}.ts` | Port orchestration in place. Add `ExtensionCookies.layer.ts`, `DedicatedSession.layer.ts`, `BrowserCookieFiles.driver.ts`. Keep HTTP adaptation in `L/legacy/extension-cookies-http.ts`. | C |
| `L/{cancelled-download-parts,thumbnail-cache,thumbnail-download,local-poster,local-poster-args,concurrency-limiter}.ts` | Port in place. Add `ThumbnailCache.layer.ts`, `LocalPoster.layer.ts`, `MediaFiles.driver.ts`, `ThumbnailHttp.driver.ts`, `PosterProcess.driver.ts`. | F |
| `L/{player-host,playable-media}.ts` | Port in place with `PlayableMedia.layer.ts`; retain `L/legacy/player-host.ts`. | F |
| `L/import-local-media.ts` | Port serial import/reuse → awaited transcript enqueue → history projection inside each iteration. Import/re-export pure dialog definitions from P. Retain the old Promise signature through `L/legacy/import-local-media.ts`. | D |
| `L/{video-library-files,video-library-host}.ts` | Port grouping, compensation and publication in place with `VideoLibrary.layer.ts`. Inject transcript and AI access. | D |
| `L/{share-capture-window,share-image-split}.ts` | Port in place with `DesktopCapture.layer.ts`, `ShareCapture.driver.ts`; retain `L/legacy/share-capture-window.ts`. | C |
| `L/{markdown-export,markdown-pdf}.ts` | Split reached export work from later-capability data access. Add `DesktopExport.layer.ts`; inject artifact/source access. | F |
| `L/ipc-coalescer.ts` | Port in place, preserving timers, merge order and per-ID flush/clear. | D |
| `L/queue-ref.ts` | Keep an unported composition adapter to the one attached queue view. | I |
| `M/index.ts`, `M/ipc/index.ts`, `M/settings.ts`, `L/{settings-host,settings-effects}.ts`, `L/app-icon-menu.ts` | Keep existing ownership. Edit only capability mounting, forwarding, supplied dependencies and existing concurrency/menu call sites. | I |
| `M/local-api.ts`, `M/mcp/{task-tools,export-tools}.ts` | Keep phase-9.5 ownership and existing validation/envelopes. Redirect calls to attached facades/services. | I |
| `L/{agent-management-host,subscriptions-host,profile-subscriptions,subscription-enqueue,transcript-host}.ts` | Keep later-capability ownership. Supply the same queue, admission, preparation, history and local-import facade. | I |
| `L/{media-transform-executor,subtitle-download-executor,subtitle-download,asr-model-executor}.ts` and existing cloud/transcription executor composition | Keep later-capability execution ownership. Inject existing executor capabilities into the router. | I |
| `M/ipc/services/site-icon-url.ts` | Keep foundation ownership; share the thumbnail owner with `App.GetSiteIcon`. | I |

`task-queue-migrate-policy.ts` exists in V although the inventory’s file-size table omitted it.

### Contracts and foundation prerequisites

A owns contract files; implementation companions remain with their implementation lane.

| Files | Disposition | Lane |
| --- | --- | --- |
| `L/{Downloads,History,Thumbnail,Player,Files,BrowserCookies,ShareCapture}.service.ts` | New native application contracts. Results are application values, not `Completion`. Transport tokens do not enter native application methods. | A |
| `L/{DesktopQueueHost,DesktopPowerSave,DesktopMetadata,DesktopBinaries,DesktopKernel,DownloadProjection,SourceFiles,TaskQueueMigration,ExtensionCookies,DedicatedSession,ThumbnailCache,LocalPoster,PlayableMedia,LocalImport,TranscriptEnqueue,VideoLibrary,DesktopExport}.service.ts` | Freeze cross-lane contracts before implementation. Later-capability ports are explicit dependencies. | A |
| `M/ipc/DownloadsDelivery.{service,layer}.ts` | Bind this capability’s dependency ledger and publisher/consumer policies to foundation delivery. Own no second transport ledger. | D |
| `S/RpcField.model.ts`, `S/RpcObservation.model.ts`, `S/DocumentDelivery.model.ts`, `S/DocumentDelivery.errors.ts` | Foundation-owned presence, retained-value, token, subscription, completion and delivery models. Adopt canonical implementations. | B |
| `M/ipc/DocumentSubscriptions.{service,layer}.ts`, `DocumentDelivery.{service,layer}.ts` | Foundation-owned registration and delivery mechanisms, including the reusable barrier specified in section 5. | B |
| `M/ipc/ElectronRpcServer.layer.ts`, `R/transport/ElectronRpcClient.layer.ts`, `R/transport/DocumentDelivery.{service,layer}.ts` | Foundation-owned bounded dispatch, terminal control and renderer watermarks. | B |
| `R/runtime/RendererInvocation.entry.ts`, `Invocation.atoms.ts`, `StreamRecovery.atoms.ts` | Foundation invocation ownership, optional private-atom adapter and repair identities. | B |
| `M/runtime/ApplicationOperations.{service,layer}.ts`, `L/SynchronousHost.service.ts` | Foundation accepted-operation and synchronous-host ownership. | B |
| `L/DesktopNotifications.{service,layer}.ts`, `OriginalFailure.errors.ts` | Shared explicit-recipient notification sink and main-only original failures. | B |
| `L/JsonSyntax.{service,errors,driver}.ts`, `L/legacy/JsonSyntaxHost.entry.ts` | Shared syntax-preserving primitive. The compatibility entry supplies only the native parser. | B |

B is phase-9.0 work adopted as a prerequisite. Phase 9.1 supplies the registration requirements, dependency families, source policies and regression cases; it does not fork those mechanisms.

### Package seams

K owns the following bounded package remediation surface. Existing files remain in their packages.

| Files | Disposition | Lane |
| --- | --- | --- |
| `packages/task-queue/src/{TaskQueue.layer.ts,classifier/index.ts,scheduler/RetryScheduler.layer.ts}` | Resolve the assigned native-control, date-classifier and retry obligations against independent compatibility oracles before activation. Preserve application behavior. | K |
| `packages/task-queue-legacy/src/{api/index.ts,bridge/runtime.ts}`, new `QueueAttachment.{service,layer}.ts` | Separate owner construction from facade attachment. Existing constructors remain available; attachment allocates no state owner. | K |
| `packages/downloader-core/src/{DownloadProcess.service.ts,Process.model.ts,Process.driver.ts}` | Qualify required acquisition, direct observation, unread-pipe, activation, close and signalling primitives. | K |
| `packages/downloader-core-legacy/src/{Process.layer.ts,YtDlpProcess.layer.ts}` | Extract only required primitive capabilities and preserve compatibility observations. | K |
| `packages/browser-capture/src/{CaptureTimers.service.ts,CaptureTimers.driver.ts,CaptureHost.service.ts,CaptureHost.driver.ts,CapturePlatform.layer.ts,ProfileExecutorNative.layer.ts}` | Resolve native process/timer qualification through the shared process vocabulary. | K |
| `packages/browser-capture-legacy/src/{PlatformHost.adapter.ts,PlaybackHost.adapter.ts,ProfileExecutorHost.adapter.ts}` | Supply exact remaining host primitives; preserve callback, activation and timer behavior. | K |
| Existing CLI native-layer composition and executable host entry | Keep shipping composition until K’s gate passes; I owns the later composition/distribution edit. | I |

An additional package file requires an explicit manifest assignment before editing. This table does not authorize a package-wide rewrite.

### Shared and preload

| Files | Disposition and target | Lane |
| --- | --- | --- |
| `S/types/index.ts` | Preserve old public declarations and exports. Re-export strict models separately where observations are wider. | A |
| `S/{Downloads,History,Files,BrowserCookies}.model.ts` | New application and wire models. | A |
| `S/{Downloads,History,Thumbnail,Player,Files,BrowserCookies,ShareCapture}.rpc.ts` | New browser-safe groups. | A |
| `S/Downloads.errors.ts` | New populated public operation failure. All seven groups use it in this phase. | A |
| `S/types/{player,share-card,mermaid-export}.ts`, `S/{extension-cookies,app-icon-menu,live-log}.ts` | Reuse foundation models; complete capability-specific companions without duplicating links. | A |
| `S/utils/{download-file,pending-download,video-info-metadata,native-playable}.ts` | Keep strict shared ownership; construction receives explicit time. | A |
| `S/types/ipc.ts`, `S/DesktopGlobals.d.ts` | Preserve browser-safe compatibility signatures and the approved bridge declaration. | I |
| `src/preload/{index.ts,index.d.ts}` | Keep narrow foundation bridge and actual legacy helpers. Add no capability-specific bridge or enumerated `window.api.download`. | I |
| Existing browser-safe subscription, transcript, agent, artifact and export contracts | Reuse their foundation definitions. Downloads adds no competing definitions. | A |

### Renderer

| Files under R | Disposition and target | Lane |
| --- | --- | --- |
| `pages/{Home,ShareCapture}.tsx` | Port in place; retain visual structure and capture output. | R |
| `store/{downloads,download-live-patch,video,video-request-coordinator,cookie-setup}.ts` | Split. New `store/{Downloads,History,Metadata,BrowserCookies}.atoms.ts` owns strict state/actions. Old modules project the same registry for remaining Jotai consumers. | R |
| `hooks/{use-download-events,use-history-sync,use-cached-thumbnail,use-local-poster,use-extension-cookie-connection,use-transcript-media-player,use-app-icon-playback-menu}.ts` | Port in place over strict clients/state; retain mount lifetimes and stale-result guards. | R |
| `hooks/{use-download-selection,use-download-origin-contexts,use-import-local-media}.ts` | Port local behavior; inject transcript views/import actions. | R |
| `components/download/{UnifiedDownloadHistory,DownloadDialog,SingleVideoDownload,PlaylistDownload,DownloadHistoryVirtualList,DownloadTaskTree,PlaylistDownloadGroup,DownloadItem,DownloadSelectionContextMenuItems,DownloadRecordContextMenuItems,DownloadParseErrorBanner,CookiesSetupDialog}.tsx` | Port in place. Replace capability IPC/Jotai access; preserve markup, classes, virtualizer, grouping, selection and action order. | R |
| `components/download/{DownloadTroubleshootButton,AgentTaskIndicator}.tsx` | Split presentation from later AI views/actions through browser-safe ports. | R |
| `components/download/{audio-format-preferences,download-contents,download-item-utils,format-presentation,playlist-expanded-state}.ts` | Port in place; preserve interpretation, identity, ordering and storage keys. | R |
| `components/playlist/PlaylistPreviewCard.tsx`, `components/video/AdvancedOptions.tsx` | Port reached download presentation/state in place. | R |
| `components/settings/{CookiesSetupPanel,ExtensionCookieSources}.tsx` | Port cookie/files operations; retain foundation settings ownership. | R |
| `components/ui/{remote-image,response}.tsx` | Port reached thumbnail/files operations; inject later artifact work. | R |
| `components/transcript/{TranscriptPlaybackHost,TranscriptVideoJsPlayer,TranscriptPlaybackBar,TranscriptPlaybackBarView,TranscriptPlaybackStandby,TranscriptPlaybackSlot,TranscriptPlayerNotice,TranscriptAudioEqualizer,TranscriptPlaylistPopover}.tsx` | Port player presentation/lifecycle; inject transcript views/cues. Keep one global playback host. | R |
| `store/{transcript-playback,transcript-playlist}.ts`, `hooks/use-transcript-playback-position.ts` | Port player state/actions; retain temporary Jotai projections. | R |
| `lib/{transcript-playback-position,transcript-playback-source,transcript-playback,transcript-player-frame,transcript-playlist,transcript-playlist-fly}.ts` | Port in place; retain bounds, thresholds, storage and order. | R |
| `store/transcript-playback-cues.ts` | Split strict cue consumption from phase-9.3 fetch/revision orchestration through injection. | R |
| `components/transcript/{AgentResponseShareCard,TranscriptPromptShareCard,TranscriptCaptionShareCard,TranscriptShareCardChrome}.tsx`, `components/transcript/share-card-logo.ts` | Port capture presentation in place. | R |
| `lib/{capture-prompt-share,share-card-fill,share-image-layout,mermaid-export}.ts`, `components/transcript/AgentResponseContent.tsx` | Port capture/measurement/rendering; inject AI artifact persistence. | R |
| `components/settings/ai-provider-icon.tsx` | Promote reached asset wrapper. | R |
| `lib/{download-error-guidance,download-list-focus,download-list-geometry,download-list-rows,download-list-scroll-margin,download-task-tree,download-transfer-locate,download-url,local-file-link,local-file-src,local-poster-input,open-context-menu,pick-local-media}.ts` | Port in place. Explicit sequences determine output order. | R |
| `components/ui/{add-url-popover,button,card,checkbox,context-menu,dialog,download-dialog-layout,dropdown-menu,input,label,progress,radio-group,scroll-area,select,sheet,tabs,tooltip}.tsx` | Promote reached wrappers after their package-UI closure is strict. | R |
| `components/subscription/{SubscriptionFormDialog,useProfileSubscribe}.tsx`, `store/{subscriptions,transcripts,agent-tasks}.ts` | Keep later-capability implementation ownership; inject views/actions into strict components. | I |
| `components/feedback/FeedbackLinks.tsx`, `store/{settings,ytdlp-kernel}.ts` | Keep foundation ownership and reuse its state. | I |
| `App.tsx`, `app-layout.tsx`, `router.tsx`, `main.tsx`, `lib/ipc.ts` | Keep composition-shell/legacy ownership; mount consumers at existing lifetimes. | I |

`TranscriptShareImageDialog.tsx` belongs to phase 9.4. It consumes the file/capture operations defined here. Phase 7’s strict UI closure is an acceptance prerequisite; a desktop wrapper cannot conceal an unported package implementation.

### Tests and integration files

| Files | Disposition | Lane |
| --- | --- | --- |
| `apps/desktop/test/{thumbnail-download,local-poster,local-poster-input,concurrency-limiter}.test.ts` | Port assertions with F; add resource/deadline/cache cases. | F |
| `apps/desktop/test/{video-library-files,gallery-source,upstream-history-sync}.test.ts` | Preserve assertions; add application parity cases. | D |
| `apps/desktop/test/list-marquee-scroll.test.ts` | Preserve assertions with renderer helpers. | R |
| `apps/desktop/test/transcription-lifecycle.test.ts` | Keep transcription ownership; integration wiring only. | I |
| `apps/desktop/test/vendored-runtime.test.ts` | Preserve binary/runtime coverage. | K |
| `apps/desktop/test/social-session-keyring.node.ts` | Preserve and explicitly include this suite in test wiring. | C |
| New `apps/desktop/test/desktop-downloads-characterization/` observers and immutable baseline fixtures | Record unchanged-build observations before implementation. | O |
| New foundation registration, completion, syntax and invocation tests | Transfer focused probes to permanent foundation tests. | B |
| New package attachment/acquisition/control/classifier/timer tests | Package remediation gate. | K |
| New pure dialog/power-save tests | Early prerequisite gate. | P |
| New queue-host ownership/lifecycle tests | Host activation gate. | H |
| New download/history/projection/migration/metadata/coalescer tests | Application gate. | D |
| New files/player/poster/thumbnail/export tests | Native/media gate. | F |
| New cookies/session/capture tests | Cookie/capture gate. | C |
| New atom/component tests | Renderer gate. | R |
| `apps/desktop/{package.json,electron.vite.config.ts,port-units.json,port-units.baseline.json,tsconfig.ported.node.json,tsconfig.ported.web.json,tsconfig.ported.test.json}`, root manifests/check wiring, candidate golden registration, phase report and ownership records | Integration writer only. Baseline expected observations remain immutable. | I |

The six decorated classes and their metadata registrations are deleted. Their callable channels remain as nondecorated forwarders. No facade, Jotai compatibility module, old preload helper or package compatibility entry is deleted before phase 10.

## 3. Schemas

Schemas precede service contracts and implementations.

Four representations remain distinct:

| Representation | Purpose |
| --- | --- |
| Construction DTO | Values deliberately constructed under an application input declaration |
| Observation DTO | Values actually returned by metadata interpretation, stores and projectors |
| Wire codec | Preservation and validation at the new transport boundary |
| Compatibility declaration | The unchanged callable declaration seen by unported consumers |

A wire decoder does not become a new validator in the old in-process, MCP, HTTP or CLI route.

### Presence and retained values

Use foundation’s canonical `RpcField.model.ts` and `RpcObservation.model.ts`.

| Application state | Wire treatment |
| --- | --- |
| Omitted optional key | Omitted |
| Own key with undefined | `RpcUndefined` |
| Own key with null | `RpcValue(null)` |
| Own key with defined value | `RpcValue(encoded value)` |
| Required result that may be undefined | Retained-value codec preserves undefined as a value |
| Retained subtree | Fully tagged recursive observation encoding |
| Authored array | `RpcArray`; dense data indices and no extra own properties |
| Binary | `S.Uint8ArrayFromBase64` |

`ObservedValue` preserves null, undefined, Boolean/string values, negative zero, NaN, infinities, bigint, object key order and dense array contents. Marker-shaped metadata remains data. Unsupported prototypes, descriptors, cycles, sparse/decorated arrays, noncanonical numeric tokens and exceeded traversal budgets fail visibly on the new path.

`RpcObserved(view)` validates the view’s type-side guarantees while encoding the original observation. It does not reconstruct the value through the view’s transformations or strip unknown keys.

Authored envelope order follows its schema. Retained subgraph order remains observable order.

All unary inner results in the checked declaration set use `RpcObserved` over their application result schema. Both metadata results therefore retain generated non-finite values. Typed package subgraphs used as inputs receive preserving companions where their nested optional properties need them. Default-bearing command inputs use the package’s encoded/input view, so admission does not prematurely apply defaults. `DownloadOptions.socialMedia`, including `StartDownload.socialMedia`, uses `Social.SocialMediaOptionsSchema.pipe(S.toEncoded, RpcObserved, RpcOptional)`. Empty and partial objects remain unchanged through transport; `download-facade.ts:159–177` applies the existing defaults at admission.

The old surfaces retain their existing serialization.

### Download and metadata DTOs

| Model | Contract |
| --- | --- |
| Constructed `VideoFormat` | Required `format_id,ext:string`; optional numeric `height,width,fps,filesize,filesize_approx,tbr,quality`; optional string `vcodec,acodec,format_note,video_ext,audio_ext,protocol,language` |
| Observed format | Preserve original object, all keys and unchecked field values. Selected formats are observations, not reconstructed construction DTOs. |
| Constructed `VideoInfo` | Required `id,title:string`, mutable formats; optional thumbnail, duration, extractor key, webpage URL, description, view count and uploader |
| Metadata result | Retained unknown value after existing parsing/inflation. No normalized package-metadata substitution. |
| `VideoInfoCommandResult` | Required `ytDlpCommand:string`; independently optional observed `info` and string `error` |
| `DownloadOptions` | Required URL and video/audio type; construction fields below; retained metadata fields below |
| `DownloadItem` | Required ID, URL, observed title, video/audio type, legacy status and creation time; optional fields below |
| `DownloadHistoryItem` | Same common metadata/provenance, required observed `downloadedAt`, optional creation time/download path; no invented active-only fields |

`DownloadOptions` fields are:

| Fields | Schema before optional-field encoding |
| --- | --- |
| `format,audioFormat,startTime,endTime,customDownloadPath,customFilenameTemplate,subscriptionId,batchId,batchTitle` | String |
| `audioFormatIds,tags` | Mutable dense string arrays |
| `downloadSubs,singleVideo` | Boolean |
| `containerFormat` | auto/mp4/mkv/webm/mov |
| `origin` | Package `TaskOrigin` |
| `batchOrder` | Finite number |
| `socialMedia` | Preserving input view of the existing social-options contract |
| `title,thumbnail,description,channel,uploader,viewCount,duration,selectedFormat` | `ObservedValue` |

The selected-format path is:

```text
metadata observation
→ field-local presentation
→ selection retaining original object
→ DownloadOptions.selectedFormat
→ existing admission interpretation
```

`format-presentation.ts:7–35` retains the original format; `DownloadDialog.tsx:937–985` forwards it. Headers, nullable fields and unknown nested values survive this path.

The existing metadata golden’s null-codec format is filtered by the current video predicate. The probe separately changes only that codec to a selectable value and confirms that the real selector retains its nullable fields and object identity.

### Active/history census

The following common optional fields are retained observations unless a narrower contract is named.

| Family | Fields |
| --- | --- |
| Collection/provenance | `sourceMediaKind,collectionSummary,cookieSources,configuredCookieSources,subscriptionId` |
| Display/output | `thumbnail,error,duration,fileSize,savedFileName,filePath,description,channel,uploader,viewCount,tags,selectedFormat,resolvedFormatId,subtitleStatus,subtitleLanguages` |
| Grouping | `playlistId,playlistTitle,playlistIndex,playlistSize,mediaKind,batchId,batchKind,batchTitle,batchCategory,batchOrder,batchSourceCount,batchAssetCount` |
| Collection output | `outputDirectory,fileCount,downloadedCount,skippedCount,failedCount,totalSize` |
| Dates | `startedAt,completedAt` |
| Narrow provenance | `origin:TaskOrigin`, `parentId:string`, `taskKind:TaskKind`, agent conversation link |
| Narrow text | `ytDlpCommand,ytDlpLog:string` |

Active-only fields are `progress`, observed `speed`, package `internalStatus`, paused/retry-scheduled `subStatus`, string `statusReason`, finite `nextRetryAt,attempt,maxAttempts`, and package `errorCategory`.

`DownloadProgress` contains numeric `percent`, optional Boolean `indeterminate`, and optional string `currentSpeed,eta,downloaded,total`. The observed numeric codec accepts NaN: the existing package projector can calculate it from a retained NaN progress input (`packages/task-queue/src/projection/index.ts:231–239`). Serialization preserves that observation rather than rejecting the event. Authored finite domain inputs remain finite.

The application projector remains authoritative:

- Active construction initially owns `collectionSummary`, `sourceMediaKind` and `configuredCookieSources`, including undefined (`L/projection.ts:148–157`).
- History initially owns those fields and `startedAt` (`:315–326`).
- Title uses `proj.title ?? proj.url`; empty string survives.
- Agent links require agent origin and three nonempty strings: download ID, thread ID and prompt ID.
- Null parent ID becomes own undefined.
- Nullish status reason and retry time are omitted.
- Substatus exists only for paused/retry-scheduled.
- `downloadedAt` is first start or creation, not completion.
- Executed and configured cookie provenance remain separate.
- Source-file resolution remains injected at its current interpretation point.

### Other models

| Model | Complete field contract |
| --- | --- |
| `PlaylistEntry` | `id,title,url:string`, finite one-based index; optional thumbnail and package media kind |
| `PlaylistInfo` | `id,title`, mutable entries, entry count; existing mapper defaults/filtering |
| `PlaylistDownloadOptions` | URL/type; optional format, entry IDs, start/end indices, filename/folder formats, destination and container |
| `PlaylistDownloadResult` | Group ID, playlist ID/title, type, selected total, start/end indices; ordered mutable `{downloadId,entryId,title,url,index}` entries |
| Instagram input | `inspectionId`, required categories; optional item IDs, destination and settings |
| Instagram result | `groupId,username,totalSourceCount,totalAssetCount,tasks`; each task has download ID, category and source/asset counts |
| OnlyFans/Fansly command input | URL/action; optional category at the input boundary |
| OnlyFans/Fansly download input | URL, item IDs, optional destination |
| Profile output | Reuse actual G profile/inventory views, including optional properties and existing saved-reader stripping policy |
| Social source/preview | Existing source platform/URL/kind/category/owner/thread/auth/category-list view; preview posts/images/videos/limited |
| Local poster request | Optional nullable file path and directory |
| Player attach | `{filePath}` → `{playablePath,reason?}` |
| Export source | `{url,label?}` |
| Path result | `{path}` or null; split-image result also has count |
| File validation | `{valid,reason?}`; picker reasons remain not-found/sqlite/binary/not-netscape |
| Browser profile validation | Existing `browserUnsupported,empty,cookiesFileNotFound,pathNotFound,profileNotFound` reasons |
| Installed browser | ID and supported Boolean, in discovery order |
| Cookie health | Existing status/source/browser/path/sites/reason view |
| Extension connection | `connected,browser?,lastSeenAt?,sites,activeSourceId?,sources` |
| Extension source | ID/browser, optional variant/last-connected/legacy/last-seen, connected Boolean and sites |
| Mermaid request | Source, svg/png/jpg format, light/dark theme |
| Mermaid image | Bytes, width and height |
| Share ready | Request ID, width/height; optional error, diagram and layout |

Share payloads remain:

| Case | Required | Optional |
| --- | --- | --- |
| Caption | `kind:"caption"`, quote `{after,before,quote,startMs,endMs}`, tagline | Nullable cover/byline/title; duration |
| Prompt | `kind:"prompt"`, markdown, prompt title, tagline | Artifacts, run ID, thinking label, skill labels; nullable cover/byline/title/user text |

Artifacts retain ID, thread/run/source-download links, image/video kind, name/path/poster, start/end and dimensions. Skill labels retain name and optional label.

Layout retains width, height, padding, optional footer top, safe breaks and preferred breaks. Initial readiness remains `{requestId:0,width:0,height:0}`.

### Checked forms

The declarations were constructed and typechecked, not only described. Representative forms are:

```ts
export class VideoInfoCommandResult extends S.Opaque<
  VideoInfoCommandResult,
  { readonly brand: unique symbol }
>()(
  S.Struct({
    info: ObservedValue.pipe(RpcOptional),
    ytDlpCommand: S.String.pipe(S.mutableKey),
    error: S.String.pipe(RpcOptional)
  }).pipe(
    $I.annoteSchema("VideoInfoCommandResult", {
      description: "Desktop metadata observation and displayed command."
    })
  )
) {}

export const ObservedNumber = S.declare(Predicate.isNumber).pipe(
  RpcObserved,
  $I.annoteSchema("ObservedNumber", {
    description: "Retained numeric projector observation, including NaN."
  })
)

export class DownloadProgress extends S.Opaque<
  DownloadProgress,
  { readonly brand: unique symbol }
>()(
  S.Struct({
    percent: ObservedNumber.pipe(S.mutableKey),
    indeterminate: S.Boolean.pipe(RpcOptional),
    currentSpeed: S.String.pipe(RpcOptional),
    eta: S.String.pipe(RpcOptional),
    downloaded: S.String.pipe(RpcOptional),
    total: S.String.pipe(RpcOptional)
  }).pipe(
    $I.annoteSchema("DownloadProgress", {
      description: "Desktop progress with original property presence."
    })
  )
) {}
```

`S.mutableKey` permits property assignment. `S.mutable` permits array mutation. Both are used where compatibility callers mutate values.

Production exports also require the T identity, schema-first, services and JSDoc rules: meaningful annotations, schema-derived aliases, deterministic service identities, canonical categories, `@since 0.0.0` and titled, checked Examples. Probe compilation is not a textual-standards receipt.

## 4. Errors

`DownloadsFailure` is the public operation failure. It carries operation, populated message and kind: validation, metadata, profile, cookie, file, process, persistence or capture.

Main-only failures retain the original thrown value. The foundation `OriginalFailure` carrier is recognized by identity/tag, not by searching arbitrary objects for `original` or `cause`.

```ts
export class MainFailure extends S.TaggedError<
  MainFailure,
  { readonly brand: unique symbol }
>($I`MainFailure`)(
  "MainFailure",
  {
    operation: S.String,
    legacyMessage: S.String,
    original: S.Defect({ includeStack: true })
  },
  $I.annote("MainFailure", {
    description: "Expected main failure retaining its original host value."
  })
) {}
```

The seven native `Desktop*` services are authoritative and expose complete application operations with `MainFailure` or applicable original-preserving package failures. There is no parallel `MainDownloads`/`MainHistory` application contract. Compatibility unwraps originals at the old exposed boundary, preserving the identical object, class, code and message. RPC adapters alone map declared application failures once to `DownloadsFailure`, then capture cuts inside `Completion`. Delivery failures remain outside. False, null, undefined, empty arrays and error-result DTOs remain successes where they are successes today.

### Desktop-produced messages

| Producer | Exact text or formatting |
| --- | --- |
| `L/download-facade.ts:262,265` | `Some selected posts are no longer in the saved profile map.`; `Saved profile contains an invalid post URL.` |
| Facade failed transition, `:389` | Raw classified message, otherwise `Download failed` |
| `L/yt-dlp-info.ts:79,148` | `Failed to parse video info: <error>`; `Failed to parse playlist info: <error>` |
| With-command catch, `:128` | Existing Error message, otherwise `Failed to fetch video info` |
| `L/yt-dlp-metadata-command.ts:17,48–77` | Original pre-abort reason; later `Metadata request aborted` with name `AbortError`; `yt-dlp metadata exceeds the 64 MiB safety limit`; stderr or `yt-dlp metadata exited with code <String(code)>` |
| `L/ytdlp-manager.ts:54,64` | `yt-dlp kernel is not activated` |
| Kernel-host getter | `yt-dlp kernel service is not initialized` |
| `L/ffmpeg-manager.ts:28,93` | `ffmpeg not initialized. Call initialize() first.`; `Bundled ffmpeg/ffprobe not found in <dir>. Ensure they are packaged under resources/ffmpeg/.` |
| `L/gallery-dl-manager.ts:57,93` | `GALLERY_DL_PATH does not exist: <path>`; `gallery-dl binary not found. Set GALLERY_DL_PATH or package <name> in resources.` |
| `L/social-session-manager.ts:46,50,56,86` | `A dedicated browser session is available for X and TikTok profiles.`; `Install Chrome or Chromium to sign in to this profile.`; `The dedicated login window is already open.`; `Close the dedicated login window before mapping or downloading.` |
| `L/player-host.ts:30` | `Media file is missing: <path>` |
| `L/playable-media.ts:365,422,438,503` | `ffmpeg produced an empty preview file`; trimmed stderr, otherwise `ffmpeg exited with signal <signal>` or `ffmpeg exited with code <code>` |
| Preview fallback | Original remux error wins when fallback transcode also fails |
| `L/thumbnail-download.ts:35–56`, `thumbnail-cache.ts:171` | `Invalid thumbnail response (<status>)`; `Thumbnail response has no body`; `Thumbnail exceeds size limit`; `Thumbnail response is empty`; `Thumbnail response is not an image` |
| `L/extension-cookies.ts:116–150` | `Invalid extension cookie source order`; `Invalid extension cookie source`; `Cannot remove a connected extension cookie source` |
| `L/browser-cookie-access.ts:223–225` | `ERROR: could not find <label> cookies database\nmacOS Files & Folders permission is required to read browser cookies` |
| `L/video-library-files.ts:26,36,49,128,135,160,174` | `Video must be a regular file`; `Video folder must be a regular directory`; `Video grouping refused a non-regular file or destination collision`; `Skill name cannot produce a safe filename`; `AI result manifest must be a regular file`; `AI result destination must be a regular file`; `AI result revision already exists; keeping both existing files` |
| `L/share-image-split.ts:12,42,125,177` | `Share image count must be a positive integer`; `Share image dimensions must be positive`; `Share image is empty`; `Share image pages are empty` |

Native filesystem, Electron, process, callback and injected dependency failures retain their original class, code, message and identity where exposed. Existing catches that log and return false/null remain at their current boundaries.

Capture errors remain:

| `L/share-capture-window.ts` | Text |
| --- | --- |
| `:117` | `Share card repaint timed out` |
| `:159,438` | `Share card capture is empty` |
| `:164` | `Share card stitch requires nativeImage.createFromBitmap` |
| `:170` | `Share card capture strip is empty` |
| `:180` | `Share card capture strips must share a width` |
| `:188` | `Share card stitch is empty` |
| `:264` | `Share capture window was closed` |
| `:285` | `Share image is empty` |
| `:299` | `Share card layout timed out` |
| `:404` | `Share card capture rect is empty` |
| `:429` | `Share card paint is empty` |
| `:482` | Renderer-supplied diagram error |
| `:485` | `Mermaid diagram export is empty` |
| `:505` | `Share card pagination layout is missing` |
| `:526` | `Share capture image cannot be encoded as PNG` |

Kernel errors remain:

- `Kernel command aborted: <executable>`
- `Kernel command timed out after <ms>ms: <executable>`
- `Kernel command exited with code <code>: <executable> <stderr>`
- `Unsupported platform: <platform>`
- `Kernel state must contain a relative path`
- `Kernel state path resolves outside kernel root`
- `<runtime> returned an empty version`
- `Unexpected Node version output: <firstLine>`
- `Kernel bundle size mismatch`
- `Kernel update timed out`
- `Managed kernel is not ready`
- `Persistent kernel state is unavailable`
- `yt-dlp mirror download failed with HTTP <status>`
- `Kernel path is not a file: <filePath>`
- `Kernel file is not executable: <filePath>`

Their producers are `ytdlp-kernel-command.ts:56–68`, `ytdlp-kernel-model.ts:19,60,67` and `ytdlp-kernel-service.ts:197–921`. Existing preparation/update catches retain status, fallback and retry behavior.

### Package errors

Reuse package failures and their existing compatibility mappers.

| G producer | Message |
| --- | --- |
| `TaskQueue.layer.ts:167` | `applyTransition: missing task <id>` |
| `:556` | `add: parent task <id> is missing or being removed` |
| `:834,837` | `Task not found: <id>`; `Title must contain 1–200 characters` |
| `:855,863,877` | `Source and destination paths are required`; `Finish or cancel tasks using this file before renaming it`; `Finish or cancel dependent tasks before renaming their source file` |
| `:940` | `removeFromHistory: <id> is not in a terminal state` |
| `fsm/index.ts:25` | `IllegalTransition: <from> -> <to>`, with ` (<reason>)` only for a truthy reason |
| Completion guards | `finalize-success requires output`; `completed requires output.size > 0` |
| `scheduler/Scheduler.layer.ts:249,283,299` | `maxConcurrency must be ≥ 1 integer, got <n>`; `maxConcurrentDownloads must be ≥ 1 integer, got <n>`; `maxPerGroup must be null or ≥ 1 integer, got <n>` |

Panic precedence is journal failure, failed fallback transition, fallback persistence failure, then original transition failure after preceding work succeeds (`TaskQueue.layer.ts:159–205`).

Profile, URL, inventory, browser and executor messages remain package-owned contracts. Desktop forwards their actual `legacyMessage` or original failure; it does not substitute the tagged error’s default message or reword the package guidance.

Cookie HTTP responses remain:

| Status | `{error}` |
| --- | --- |
| 403 | `Extension origin required` |
| 401 | `Invalid start token`; `Extension session expired` |
| 400 | `Invalid connect payload`; `Invalid cookies payload`; `Cookie domain outside requested scope` |
| 404 | `Unknown cookie request` |
| 405 | `Method not allowed` |
| 429 | `Too many extension sessions` |

## 5. RpcGroups, reply dependencies and streams

Import `Completion`, `Subscription`, `Token`, `Registered` and `Cut` from `S/DocumentDelivery.model.ts`; `DeliveryError` from its error companion; and the canonical preservation codecs.

Every unary has:

```ts
Rpc.make("Capability.Operation", {
  payload: OperationPayload,
  success: Completion({
    success: ApplicationResult.pipe(RpcObserved),
    error: DownloadsFailure
  }),
  error: DeliveryError
})
```

Both application success and application failure capture cuts. An application failure does not escape through the outer error channel and bypass its notification prefix.

Each stream has `Subscription(Event)` success and an outer union containing `DownloadsFailure` and `DeliveryError`.

### Dependency families

The ledger uses:

| Symbol | Family | Original publication |
| --- | --- | --- |
| **D** | `downloads`, `Downloads.Watch` | Facade events at `L/download-facade.ts:350–420`, then recipient sends at `M/index.ts:735–818` |
| **T** | `transcript`, `Transcript.WatchChanges` | Queue transition subscription at `L/transcript-host.ts:1191–1207`; full publication flushes partials before updated at `:1164–1172` |
| **∅** | None | The operation publishes no relevant origin-document observation before its acknowledgement; the reason appears in its row |

D/T dependencies cover publications already admitted at the old recipient send point before the application exit. They do not wait for later control, hydration, execution or cleanup.

For example, queue admission emits transition then snapshot before returning (`packages/task-queue/src/TaskQueue.layer.ts:604–608`). The facade and transcript subscriber can both publish from that transition. History removal also invokes transcript cleanup, which publishes an empty snapshot (`L/transcript-host.ts:750–759`).

A missing optional live registration contributes no cut. An explicitly required token cannot be bypassed by its closure. In phase 9.1, T may still have only legacy consumers; the ledger is already correct for its later migrated registration.

The following tables are exhaustive for the 72 unary members. Payloads are named new-wire fields; old positional arguments remain unchanged.

### Downloads

| Procedure | Payload | Inner result and existing completion boundary | Families; source |
| --- | --- | --- | --- |
| `FanslyProfileCommand` | `{input}` | Profile at command completion; retains Fansly-specific validation | ∅: profile command does not publish download/transcript observations; facade `:441–443` |
| `OnlyFansProfileCommand` | `{input}` | Profile at existing command boundary | ∅: same publication reason; `:453–455` |
| `ListFanslyProfiles` | None | Synchronous read/clone array | ∅: read only; `:444–446` |
| `ListOnlyFansProfiles` | None | Synchronous read/clone array | ∅: read only; `:457–459` |
| `DownloadFanslyProfile` | `{input}` | `{count}` after existing enqueue operation | D,T: queue admissions; `:447–450` |
| `DownloadOnlyFansProfile` | `{input}` | `{count}` after existing enqueue operation | D,T: queue admissions; `:461–464` |
| `InspectSocialMedia` | `{url}` | `{source,preview}` after preview | ∅: preview has no application publication; `:308–318` |
| `OpenSocialProfileLogin` | `{url}` | Void at current browser-launch boundary | ∅: native launch, no observation family; `:233–235` |
| `GetSocialProfile` | `{url}` | Synchronous profile result | ∅: profile read; `:237–239` |
| `ListSocialProfiles` | None | Synchronous profile array | ∅: profile read; `:241–243` |
| `MapSocialProfile` | `{url,category}` | Saved/returned mapping acknowledgement before traversal completes | ∅: file/profile state, no current renderer event; `:245–247` |
| `StopSocialProfile` | `{url}` | Profile after existing stop settlement | ∅: no download/transcript publication; `:249–251` |
| `DownloadSocialProfileItems` | `{url,category,ids,destination?}` | `{count}` after serial admission | D,T: `:253–305` |
| `DownloadSocialMedia` | `{request}` | `{groupId,ids}` after admission; current settings overwrite supplied settings | D,T: `:321–334` |
| `ResolveUrl` | `{url}` | Resolved or fail-open original URL | ∅: resolver only; `:425–427` |
| `GetVideoInfo` | `{url}` | Retained desktop metadata | ∅: metadata/cookie work has no renderer publication; `:429–431`, `yt-dlp-info.ts:97–108` |
| `GetVideoInfoWithCommand` | `{url}` | Retained command-result DTO; pre-try failures reject | ∅: same publication reason; facade `:433–435`, metadata `:110–131` |
| `GetPlaylistInfo` | `{url}` | Desktop playlist DTO | ∅: metadata only; facade `:437–439`, metadata `:136–165` |
| `ListInstagramProfiles` | None | Inspection ID/profile/totals/optional mapping only | ∅: read only; facade `:467–469` |
| `CancelInstagramProfileMapping` | `{url}` | Immediate Boolean | ∅: profile cancellation has no download event; `:471–473` |
| `InspectInstagramProfile` | `{url,categories?}` | Full inspection after existing operation | ∅: profile state has no current application stream; `:475–480` |
| `StartDownload` | `{id,options}` | Immediate Boolean acknowledgement | D,T: optimistic queued and any synchronous startup prefix; `:486–556`, sends `M/index.ts:780–786` |
| `CancelDownload` | `{id}` | Pending acknowledgement or queue-cancel settlement | D,T: `:599–619`; partial-file cleanup excluded |
| `CancelAllDownloads` | None | `{cancelled,failed}` after serial snapshot cancellation | D,T: `:622–640` |
| `PauseDownload` | `{id}` | Existence Boolean before detached control settlement | D,T: only already-published prefix; `:647–658` |
| `ResumeDownload` | `{id}` | Same acknowledgement distinction | D,T: `:661–673` |
| `RetryDownload` | `{id}` | Boolean after distinct admission/retry branch | D,T: `:679–709` |
| `GetQueueStatus` | None | `{active,pending}` | ∅: synchronous read; `:823–828` |
| `GetActiveDownloads` | `{token}` | Projected nonterminal library tasks, descending creation time | ∅: read; active downloads token required; `:830–856` |
| `UpdateDownloadInfo` | `{id,updates}` | Void after no-op/log | ∅: no mutation/publication; `:875–882` |
| `StartPlaylistDownload` | `{options}` | Result after serial loop; individual failures swallowed | D,T: `:712–820` |
| `StartInstagramProfileDownload` | `{input}` | Existing admission result | D,T: `:859–872` |

### History

| Procedure | Payload | Inner result and boundary | Families; source |
| --- | --- | --- | --- |
| `GetHistory` | `{token}` | Full terminal library history | ∅: read; active downloads token required; `history-manager.ts:83–116` |
| `GetHistoryById` | `{id}` | Item or undefined after attempt-log read | ∅: read; deliberately no downloads cut, avoiding hydration cycles; `:119–140` |
| `AddHistoryItem` | `{item}` | Void after no-op warning | ∅: no mutation/publication; `:148–154` |
| `RemoveHistoryItem` | `{id}` | Boolean after queue removal and current cleanup handling | D,T: `:40–80,159–162`; transcript cleanup `transcript-host.ts:750–759` |
| `RemoveHistoryItems` | `{ids}` | Count after trim/deduplication and serial removal | D,T, including a committed prefix before later failure; `:168–179` |
| `RemoveHistoryByPlaylistId` | `{playlistId}` | Count after serial matching removals | D,T: `:185–199` |
| `ClearHistory` | None | Void after serial removal | D,T: `:205–212` |
| `GetHistoryCount` | None | `{active,completed,error,cancelled,total}`; active stays zero | ∅: read; `:214–239` |

### Thumbnail and player

| Procedure | Payload | Inner result and boundary | Families; source |
| --- | --- | --- | --- |
| `Thumbnail.GetThumbnailPath` | `{url?:string|null}` | Path or null after current cache/fetch boundary | ∅: cache work has no application publication; thumbnail service `:9–22` |
| `Thumbnail.GetLocalPoster` | `{request?:LocalPosterRequest|null}` | Path or null | ∅: same reason; service `:25–34` |
| `Player.Attach` | `{input}` | Attach result after preparation | ∅: generation/preparation state, no playback command publication; player service `:15–21`, `player-host.ts:27–52` |
| `Player.Detach` | None | Void after generation increment | ∅: no command publication; host `:56–58` |
| `Player.SyncIconMenu` | `{state}` | Void after menu-state publication in main | ∅: menu commands occur only on later user action; service `:30–32` |

### Files

All procedures below retain the method-specific path, catch and Promise boundaries in `M/ipc/services/file-system-service.ts`.

| Procedure | Payload | Inner result and boundary | Families; source |
| --- | --- | --- | --- |
| `ReadClipboardFilePaths` | None | String array after synchronous read/parse | ∅: clipboard read; `:32–58` |
| `SelectDirectory` | None | String or null after dialog | ∅: native result; `:61–71` |
| `SelectFile` | None | String or null | ∅: native result; `:74–87` |
| `SelectMediaFiles` | None | String array; cancellation is `[]` | ∅: native result; `:90–105` |
| `SaveTextFile` | `{options:{content,defaultFileName,threadId?,thinkingLabel?,source?}}` | `{path}` or null after write | ∅: file export; `:111–148` |
| `SaveMarkdownPdf` | `{options:{markdown,defaultFileName,title?,threadId?,thinkingLabel?,source?}}` | `{path}` or null after PDF write | ∅: file export; `:157–189` |
| `SaveBinaryFile` | `{options:{data,defaultFileName}}` | `{path}` or null after write | ∅: file export; `:198–223` |
| `SaveSplitShareImage` | `{options:{payload,defaultFileName,imageCount?}}` | `{path,count}` or null after capture/save | ∅: hidden-document capture is awaited; it is not an origin-document observation dependency; `:227–240` |
| `ShareFile` | `{options:{data,fileName}}` | Boolean after current share callback; false off macOS | ∅: native share result; `:249–278` |
| `ValidateCookiesFile` | `{filePath}` | Validation result | ∅: file read; `:290–337` |
| `GetDefaultDownloadPath` | None | Current portable/XDG/home path | ∅: read/probe; `:340–362` |
| `OpenFileLocation` | `{filePath}` | Existing Boolean after reveal/fallback | ∅: shell operation; `:365–408` |
| `OpenFile` | `{filePath}` | Existing Boolean | ∅: shell operation; `:411–437` |
| `CopyFileToClipboard` | `{filePath}` | Existing Boolean | ∅: clipboard operation; `:440–479` |
| `OpenExternal` | `{url}` | Boolean after web-URL guard/shell | ∅: shell operation; `:482–498` |
| `OpenMacFilesAndFoldersSettings` | None | Boolean after current fallback sequence | ∅: shell operation; `:501–520` |
| `ShowDownloadCompletedNotification` | `{title,body,filePaths,downloadPath}` | Boolean after construct/listen/show; click work excluded | ∅: OS notification, not a renderer stream; `:523–577` |
| `FileExists` | `{filePath}` | Existing Boolean | ∅: filesystem read; `:661–678` |
| `DeleteFile` | `{filePath,allowMissing?}` | Boolean; default false; file or empty directory only | ∅: filesystem mutation without current broadcast; `:681–733` |

### Browser cookies and capture readiness

| Procedure | Payload | Inner result and boundary | Families; source |
| --- | --- | --- | --- |
| `BrowserCookies.ListInstalledBrowsers` | None | Discovery-order array | ∅: discovery read; browser service `:113–130` |
| `GetExtensionConnection` | None | Snapshot after pruning | ∅: polling view, no current renderer broadcast; `:136–138` |
| `SetExtensionSourceOrder` | `{sourceIds}` | Snapshot after preference write | ∅: direct settings write does not call settings broadcast; `extension-cookies.ts:116–136` |
| `RemoveExtensionSource` | `{sourceId}` | Snapshot after recheck/write | ∅: same reason; `:140–157` |
| `InspectCookieHealth` | `{input:{browser,profile,cookiesPath}}` | Existing health result | ∅: read/inspection; browser service `:161–184` |
| `GetBrowserProfilePath` | `{browser}` | String, including empty string | ∅: read; `:191–215` |
| `ValidateBrowserProfilePath` | `{browser,profilePath}` | Existing validation result | ∅: read; `:218–276` |
| `ShareCapture.Ready` | `{message,tokens}` | Void after resolving associated pending readiness; not capture completion | ∅: no synchronous origin publication; `share-capture-window.ts:229–243`. Both active capture tokens are required. |

`Files` replaces the renderer’s old `fs` group. Old channels retain `fs.*`.

### Native-only operations and enclosing replies

Native operations do not manufacture `Completion`. Their enclosing RPC owns cuts.

| Native operation | Publication obligation |
| --- | --- |
| Preparation helper | No publication; do not merge it with interactive start |
| Restore/flush/concurrency/start/stop | Preserve raw synchronous callbacks; an enclosing RPC includes D/T for any published queue prefix |
| URL-history predicate | None; read only |
| Raw subscription | Registration only; synchronous callback contract |
| Local import | D/T for task import/enqueue and caller transcript broadcasts; phase 9.3 owns its RPC ledger |
| Queue rename/relocation | Preserve queue snapshots and transcript subscriber effects; management RPC declares the applicable D/T dependencies |
| Card/pages/Mermaid capture | Commands target the authenticated hidden document; capture result waits its existing ready/render boundary |
| Cookie connect/wait/fulfil | Preserve HTTP waiter publication and envelopes; these are not renderer-family cuts |
| Binary/kernel preparation | Foundation kernel-status family applies to enclosing foundation commands |
| Video-library completion callbacks | Preserve queue/reference and file-publication order; detached work does not become part of an earlier acknowledgement |

### Registration barrier

Phase 9.0 implements one reusable `DocumentSubscriptions` primitive.

Acquisition order is:

```text
reserve registration and terminal capacity
→ install document-generation/attempt identity and finalizer
→ allocate bounded queue/accounting
→ install source listener with incremental release ownership
→ verify attempt is still active
→ emit Registered {token, epoch}
→ emit ordered Observation {token, epoch, sequence, value}
```

The queue exists before installation can publish synchronously. Installers use:

```ts
install(
  publish: (event: Event) => void,
  ownRelease: (release: () => void) => void
): void
```

Each release is registered before the next fallible step. Installation failure closes the attempt, attempts every registered release, discards queued observations and emits no `Registered`. Cleanup failures remain reported and owned.

Tokens are main-issued and validated against authenticated document, logical client, generation, family and exact registration identity. Unknown, closed, replaced, foreign-client and old-generation tokens fail `RegistrationClosed`. Main never waits for a future family latch.

The renderer:

- Drains `Downloads.Watch`, receives `Registered`, then starts token-bearing active/history reads.
- Drains both capture streams, receives both registrations, then sends every Ready message with those active tokens.
- Retires old tokens on teardown/replacement. A stale finalizer cannot remove a replacement.
- Keeps registration admission independent of ordinary unary slots.

Required-token validation occurs outside application-exit capture and finishes before invoking the native application method, including its synchronous construction prefix. Both snapshot adapters call `requireActive(token, "downloads")`; an authenticated active token for another family is insufficient. Ready requires exactly one active `capture-card` token and one active `capture-mermaid` token. Duplicate tokens or a missing family fail before application work. Tokens are transport concerns, not arguments added to the native history/download APIs.

### Stream policies

| Stream | Observation | Initial/read policy | Order, absence and replay |
| --- | --- | --- | --- |
| `Downloads.Watch` | Queued, Updated, Started, Progress, Log, Completed, Error, Cancelled, Removed | Registered before active/history reads | Live only; no synthetic replay |
| `Downloads.WatchDeeplink` | `{url,type:"single"|"playlist"}` | Registered at the existing dialog listener lifetime | Retain existing boot-pending deep-link owner; no second backlog |
| `Player.WatchIconMenu` | next/previous/toggle | Registered at existing playback-command listener lifetime | Ordered live commands; none while absent; no replay |
| `ShareCapture.Watch` | `{requestId,payload:ShareCardPayload}` | Registered before initial Ready | Authenticated hidden document; ordered commands |
| `ShareCapture.WatchMermaid` | `{requestId,payload:MermaidExportPayload}` | Registered before initial Ready | Same hidden document; ordered commands |

Download events retain these application shapes:

```ts
export const DownloadEvent = S.TaggedUnion({
  Queued: { item: DownloadItem },
  Updated: { id: S.String, updates: ObservedUpdates },
  Started: { id: S.String },
  Progress: { id: S.String, progress: DownloadProgress },
  Log: { id: S.String, chunk: S.String },
  Completed: { id: S.String },
  Error: { id: S.String, error: S.String },
  Cancelled: { id: S.String },
  Removed: { id: S.String }
})
```

Updated properties retain omission versus own undefined. Every stream uses the foundation observation envelope; raw event values are not sent after `Registered`.

### Raw delivery, coalescing and cuts

There is one application owner and two observation boundaries.

- Raw facade callbacks remain synchronous at `download-facade.ts:350–420`.
- Renderer publication remains after the single existing coalescing boundary at `M/index.ts:735–818`.
- Legacy delivery is not implemented by draining an RPC stream.

The queue event bus retains typed-before-wildcard delivery, registration order and its existing live traversal/caught-listener-failure policy. The facade retains its own EventEmitter behavior, including duplicate listeners, re-entry and exception boundary. A generic foundation publisher cannot replace either traversal policy.

Renderer order remains:

1. Queue transition precedes snapshot.
2. Queued clears unsent progress/log entries for that ID.
3. Progress keeps the latest value per ID; 250 ms from first pending push.
4. Logs append in order; 200 ms from first pending push.
5. Terminal/removal flushes progress, then logs, clears both, then publishes the terminal/removal event.
6. Updated and Started are not coalesced.

Publication sequence advances only after immutable recipient admission at the old send point. Coalescer insertion is not publication.

Each subscription admits at most 1,024 pending application observations, excluding the chunk awaiting Ack, subordinate to foundation byte limits. Per-subscription overflow terminates that subscription visibly. Aggregate client/document exhaustion terminates the offending logical client. No sliding loss, second coalescer or unbounded overflow bookkeeping is allowed.

The frozen Protocol adapter must terminate a stalled-Ack subscription through correlated terminal control. It must also let unrelated replies progress when an installed RpcClient stream queue is full.

### Renderer application watermark

For downloads, “applied” means completion of the existing synchronous handler prefix:

| Event | Prefix completed before watermark |
| --- | --- |
| Queued | Validate ID, check current active row, perform existing insertion/ignore |
| Updated | Apply structural/live patch; initiate terminal history read if applicable |
| Started | Apply downloading status and renderer-time stamp |
| Progress | Apply current field interpretation/overlay update |
| Log | Append capped log overlay |
| Completed | Apply terminal status/time and initiate detached history read |
| Error | Apply error state, toast/guidance and cookie-prompt decisions; initiate history read |
| Cancelled/Removed | Remove active/history records and associated current cleanup |

`handleCompleted` and `handleUpdated` start independent history reads (`R/hooks/use-download-events.ts:129–161,232–241`). Their eventual settlement is outside the watermark. Reads may finish in either order. `History.GetHistoryById` has no downloads dependency, so it cannot await the event whose handler started it.

For each unary, renderer completion handling is:

```text
receive Completion
→ await only its cuts
→ return Success.value
  or expose the populated application Failure
```

No receipt is sent to main. Ack remains transport admission, not application. Replacement cannot satisfy an old token’s cut. Termination fails unsatisfied cuts. Retired records remain bounded under foundation’s retention rules.

### Cancellation

RPC interruption removes caller interest and transport resources. It does not silently cancel admitted downloads, mapping, thumbnail work or player preparation.

| Capture operation | Application cancellation |
| --- | --- |
| Card | No caller AbortSignal; queued work survives caller departure |
| Paginated card | Same chain and no caller signal |
| Mermaid | Existing required caller signal remains explicit |

Mermaid checks at queued closure entry, registers active-window destruction on abort, checks after acquisition and after readiness, and removes its listener during cleanup (`share-capture-window.ts:464–491`). Pre-aborted queued work creates no window. Active abort can reject readiness with the closed-window error. Later chain entries continue.

## 6. Services, drivers and Layers

Runtime execution belongs in entrypoints and compatibility facades. Ordinary services, Layers and drivers return Effects.

Native application contracts expose inner results. A helper extracting those results from RPC types must unwrap `Completion.Success.value`; it must not make a native service return `Completion`.

The checked declarations include all seven complete native `Desktop*` services, handler Layers, native-only contracts and renderer atoms. The native unary contracts return `Effect<InnerResult, MainFailure>`; history includes reads/removals and the URL predicate, and files, player and cookies retain the same original-preserving failure route. Downloads includes preparation, lifecycle and raw registration; player includes disposal; capture includes card/pages/Mermaid and renderer registration. `Main.service.ts` declares only the distinct queue host. The handler Layers are transport adapters over these services and introduce no application state owner. They map native failures once to `DownloadsFailure`, capture application success/failure, then obtain the declared dependency families on both exits. Token validation occurs before application-method invocation and that capture. `Compatibility.entry.ts` checks the connected native-to-facade path; `contracts.ts` checks the connected native-to-RPC-handler path.

Representative native contracts are:

```ts
export class DesktopQueueHost extends Context.Service<
  DesktopQueueHost,
  {
    readonly queue: Effect.Effect<TaskQueueShape, MainFailure>
    readonly start: Effect.Effect<void, MainFailure>
    readonly stop: Effect.Effect<void, MainFailure>
    readonly waitReady: (
      signal: AbortSignal
    ) => Effect.Effect<void, MainFailure>
    readonly persistent: Effect.Effect<boolean>
    readonly dbPath: Effect.Effect<string | null>
    readonly applyConcurrency: Effect.Effect<void>
    readonly stopProfileMappings: Effect.Effect<void, MainFailure>
    readonly dispose: Effect.Effect<void, MainFailure>
  }
>()($I`DesktopQueueHost`) {}
```

| Service | Native contract beyond the RPC census |
| --- | --- |
| Downloads | Preparation; restore; flush; concurrency update; synchronous raw registration returning unsubscribe |
| History | Separate completed-media URL predicate; list/detail/removal with original failures |
| Queue host | Lazy acquisition, start/stop/readiness, persistence/path, caps, profile stop and separate disposal |
| Metadata | Video, with-command, playlist and hydration with optional application signal |
| Capture | Card PNG, pages with optional count, Mermaid with required signal, window classification/destruction, clipboard publication |
| Cookie bridge | Connection/order/removal/health, settings overlay, connect/wait/fulfil/clear |
| Player | Attach/detach/dispose; preparation lifetime remains separate |
| Binaries/kernel | Existing getters, preparation/update/lifecycle over explicit primitives |
| Local import | Serial import/reuse, transcript enqueue inside each iteration, then history projection |
| Source files/library | Source lookup, grouping, relocation and result publication with current compensation boundaries |

### Main call graph

```text
existing boot/composition
├─ existing database owner → borrowed SqlClient
├─ settings and binary/kernel services
├─ one lazy strict queue host
│  ├─ TaskStore / TaskEvents / TaskPersistence
│  ├─ Scheduler / RetryScheduler / Watchdog / ProcessRegistry
│  ├─ one SourceAdmission owner
│  └─ executor router
│     ├─ OnlyFans / Fansly owners
│     ├─ host routing / DRM fallback / browser capture
│     ├─ yt-dlp / gallery-dl
│     └─ injected later-capability executors
├─ desktop admission / control / profile orchestration
├─ application projection / history / migration / video library
├─ files / thumbnails / posters / player / cookies / capture
└─ handler Layers → foundation server

legacy facade / old invoke / MCP / HTTP / subscriptions / agents
→ existing surface validation and warmed runners
→ the same services and state owners
```

### One queue and compatibility attachment

The compatibility `TaskQueueAPI` constructor acquires its own private graph/runtime (`packages/task-queue-legacy/src/api/index.ts:112–170`). It cannot be constructed beside a native Layer.

The new owner/attachment seam:

1. Preserves the current lazy acquisition point.
2. Acquires one queue graph, store, event registry, scheduler set, persistence adapter and admission owner.
3. Exposes its strict services.
4. Attaches the old API to those already acquired services and captured warmed runners.
5. Returns that same attached view from all old getters and `queue-ref`.
6. Preserves shared startup, recovery, cap restoration and retry after start failure.
7. Keeps stop separate from disposal.

Attachment allocates no queue graph, state store, scheduler, database adapter, admission owner or runtime. The old constructor remains available to independent consumers such as the CLI’s separate process.

The desktop retains qualified timing capabilities where required: named turns, synchronous probes, immediate continuation starts, captured execution context, `PreventSchedulerYield` and exit-observer Promise settlement. Selecting strict services does not authorize selecting different native timing.

### Database rule

`node-sqlite-before-cutover` remains enabled.

- Strict code requests `SqlClient`.
- Composition borrows the existing `better-sqlite3` handle’s adapter, statement cache and permit.
- No second queue connection or driver opens the same file.
- Desktop imports no value from `@effect/sql-sqlite-node` or `@vidbee/db/node`.
- Borrowed runtime release precedes handle closure.
- Synchronous facade transactions contain SQL and pure work only.
- Queue writes retain explicit `BEGIN IMMEDIATE`.
- Both-client persistence tests run in separate processes.

Existing pre-queue migration connections and readonly social-manifest lookups remain separately scoped existing operations. They do not authorize a second persistent queue handle.

Session import, history import and standalone merge retain separate transactions, markers and failure positions.

### Shared syntax-preserving parser

Foundation adds a narrow `JsonSyntax` capability:

```ts
export class JsonSyntax extends Context.Service<
  JsonSyntax,
  {
    readonly parse: (
      text: string
    ) => Effect.Effect<unknown, JsonSyntaxFailure>
  }
>()($I`JsonSyntax`) {}
```

The driver invokes an injected synchronous parser with `Effect.try`; `JsonSyntaxFailure` retains the actual thrown value in a main-only `S.Defect({ includeStack:true })` field.

`L/legacy/JsonSyntaxHost.entry.ts` supplies native parsing only. It contains no metadata process, retry, settings or Promise orchestration. Direct native JSON parsing stays outside the strict graph; no driver filename, suppression or allowlist grants an exemption.

Video and playlist policies are separate:

| Operation | Parsing policy |
| --- | --- |
| Video | Parse full stdout. On syntax failure, choose the first trimmed line beginning `{` or `[`. Parse that line once. If absent, retain the full-output error. A malformed first eligible line does not cause a search for a later valid line. Then inflate estimates. |
| Playlist | Parse full stdout once, then run the existing mapper inside the existing catch. There is no line fallback. |

Video formatting remains at `yt-dlp-info.ts:76–80`; playlist formatting remains at `:140–149`. With-command settings, cookie overlay and argument construction remain outside its catch.

### Resource owners

| Owner | State/resources and scope |
| --- | --- |
| Queue host | Lazy process-lifetime graph; readable after stop |
| Admission | Shared ordered source leases |
| Downloads | Pending starts, sequence reservations, log buffers and raw listeners |
| History | Derived queue view; no second writable history store |
| Profiles | Existing inventory/cache/browser/map state, one owner per manager |
| Cookie bridge | Sessions, jobs, waiters, preferences and temporary-file cleanup |
| Thumbnail | URL cache, shared in-flight work, four fetch slots and FIFO waiters |
| Poster | Source-key cache, two render slots and temporary outputs |
| Preview/player | Shared preparation cache and player generation |
| Video library | Per-download chains and compensation |
| Capture | Hidden-window owner and serial card/diagram chain |
| Document | Registration attempts, delivery queues, invocation gates and renderer state |
| Window/application | Accepted native work and retained bytes surviving document loss |

Use `acquireRelease`, `ensuring`, `onExit` and owned scopes. JavaScript `try/finally` around `yield*` is forbidden.

Register pending/lifecycle state before starting a fiber that can finish synchronously. Preserve the specific source exception: optimistic Queued occurs before pending-start insertion; insertion then precedes continuation launch. Completion cleanup is identity-guarded.

### Driver policies

| Edge | Required policy |
| --- | --- |
| Metadata child | Existing binary/argv/environment, ignored stdin, 64 MiB stdout cap, stderr policy, raw close/error behavior and tree-kill |
| Thumbnail HTTP | Four-slot FIFO; 10 MiB; 15-second request/body deadline after slot acquisition |
| Thumbnail cache | Lookup and atomic publication outside that fetch deadline |
| Poster | Two renders; 20-second exec boundary; video seek 1 second then 0, still seek 0; nonempty output |
| Preview | Existing codec/cache/MPEG-TS bridge; no added conversion deadline; original-error precedence |
| Kernel | Existing mirror/probe/update/fallback/publication/timer behavior |
| Files | Preserve BOMs, fractional timestamps, modes, names, false-on-existence-failure and failed-publication residue |
| Electron | Preserve focused-window dialog overloads, clipboard formats, notification callbacks and share callback |
| Browser | Reuse package Playwright driver and existing profile owners |

The narrow process vocabulary remains the package vocabulary: `ProcessSpec` deliver/unread policies and `ProcessRun` activation, stdin, liveness, close observation and signal requests. No desktop spawn implementation competes with it.

Raw acquisition, omitted observers, unread pipes, late close registration, timer liveness and synchronous stat precision require independent oracles. A host seam may retain a primitive; it may not retain an old download or metadata orchestrator under a driver name.

### Local import before phase 9.3

`TranscriptEnqueue` is an injected native contract. During this phase its compatibility supplier lives in I’s unported composition and calls the established transcription owner. Phase 9.3 replaces that supplier.

`import-local-media.ts:190–248` keeps, inside each iteration:

```text
import/reuse parent
→ await transcript enqueue
→ project returned history
→ advance to next path
```

`transcript-host.ts:620–635` retains its caller’s post-loop broadcasts. Parent imports are not batched. The old Promise facade keeps the current callable input, including its compatibility queue/store declarations, while binding the same injected owners.

## 7. Renderer

All clients share the foundation Protocol Layer, `desktopAtomRuntimeFactory` and document registry. A hook creates neither a transport nor a registry.

### Invocation and completion

Direct invocation-owned client Effects are the default. Shared `AtomRpc.Service.mutation` state is not an invocation correlation mechanism.

The concrete Start action consumes `Completion`:

```ts
export const startDownload = Effect.fn(
  "Downloads.startDownload"
)(function* (payload: StartPayload) {
  const client = yield* DownloadsClient
  const completion = yield* client(
    "Downloads.StartDownload",
    payload
  )
  const delivery = yield* DocumentDelivery
  yield* delivery.awaitCuts(completion.cuts)

  if (completion.exit._tag === "Failure") {
    return yield* completion.exit.error
  }
  return completion.exit.value
})
```

The complete client-to-action form typechecks in `probes/revision3/Completion.service.ts`. A duplicate result is Boolean false; it is never a truthy completion object. An inner failure reaches the action’s existing failure path after its cuts.

`RendererInvocation.entry.ts` owns each invocation from reservation through settlement:

```text
reserve/register cancellation
→ create fiber behind start gate
→ install fiber and Exit observer
→ release gate
→ execute client/action Effect
```

Document teardown settles pending callers, interrupts installed execution fibers, then disposes AtomRegistry. Component unmount follows existing callback/stale-result policy. It does not automatically cancel accepted main work.

Optional private result atoms are constructed per invocation, use the same completion adapter and belong to the document invocation owner. They are not the default recipe.

### Atom replacements

| Existing symbols | Replacement and preserved behavior |
| --- | --- |
| `downloadRecordsAtom` | Effect HashMap keyed `active:<id>` / `history:<id>`; explicit arrays determine order |
| `addDownloadAtom,updateDownloadAtom,removeDownloadAtom,clearCompletedAtom` | Registry actions; retain missing-row and undefined-update behavior |
| `addHistoryRecordAtom,replaceHistoryRecordsAtom` | Terminal replacement removes active row/live overlay |
| `removeHistoryRecordsAtom,removeHistoryRecordAtom,removeHistoryRecordsByPlaylistAtom` | Actual removal retains playback-playlist cleanup |
| `clearHistoryRecordsAtom,clearHistoryRecordsByStatusAtom` | Preserve cache-clear versus actual-removal distinction |
| `downloadsArrayAtom,activeDownloadsArrayAtom,historyDownloadsArrayAtom` | Same filters and descending creation ordering |
| `historyStatsAtom,downloadStatsAtom,activeDownloadsCountAtom` | Same counts; active excludes pending |
| `downloadLivePatchesAtom` and selectors/actions | Separate progress/log overlay; 80,000-character log cap; indeterminate-only equality omission retained |
| Metadata value/source/loading/error/command atoms | Initial null/null/false/null/null |
| `fetchVideoInfoAtom,clearVideoInfoAtom` | Request-identity invalidation; late result ignored without aborting main |
| Cookie request/auto-prompt atoms | Same request/null and document prompt guard |
| Playback session/clock/presentation/volume/rate/aspect/controls/slots | One playback owner |
| Playlist/progress/actions | Same storage, ordering, 100-ID bound and resume rules |
| Transcript/AI/subscription state | Injected later-owner views/actions |

Jotai compatibility adapters project the same registry and forward actions into it. They own no independently writable state.

### Presentation interpretation

Permissive observations are consumed through field-local contracts at existing interpretation sites.

| Site | Contract |
| --- | --- |
| Title/description/byline | Preserve current empty/null/falsy behavior and failure policy |
| Format selection/grouping | Preserve codec truthiness, numeric comparisons, transport preference, stable order and original format |
| Size estimation | Preserve `filesize || filesize_approx`, positive numeric bitrate and duration truthiness/coercion |
| Collection/retry/playback | Consume source/collection fields without erasing raw values; retain completed-collection retry early return |
| Tags/languages/cookies | Decode the consumed field at its existing consumption point |
| Source/poster | Preserve nullish versus falsy choice and collection-directory policy |
| Progress | Preserve the current numeric test, including retained NaN; do not add finite normalization at serialization |

No whole-object decode turns a previously successful observation into a rendering/admission failure. No cast turns an observation into trusted construction data. Presentation views do not overwrite the raw object later submitted to main.

### Lifetimes and cache policy

- Subscribe and receive Registered before initial active/history reads.
- Active loading adds rows; history loading replaces history. Their existing late-read race remains.
- Completed, Error and terminal Updated can start independent history reads.
- Started uses renderer time.
- Thumbnail/poster unmount suppresses hook publication, not shared native work.
- Cookie polling is immediate plus every two seconds and may overlap.
- Playback keeps five-second resume/end-distance rules, one-second save cadence and existing clock publication.
- Storage keys remain `vidbee.transcript.playlist`, `vidbee.transcript.playback-position` and `playlist_expanded_<groupId>`.
- No global TTL, automatic retry or universal post-mutation invalidation is added.
- ShareCapture retains dark theme, 2× zoom, wash, layout, font/image waits and diagram rendering.
- Home, dialogs, rows, focus, collapse state, selection and share output have no visual redesign.

## 8. Other consumers

| Consumer | Transitional route and preserved contract |
| --- | --- |
| Main download/history imports | Explicit compatibility facade → same strict owner; unwrap the canonical original failure without reducing it to a public DTO |
| Old invoke channels | Nondecorated positional forwarder; same async wrapper/catch/log/adoption behavior |
| MCP task tools | Existing zod/tool validation → preparation/management facade → same queue/history |
| MCP Mermaid export | Existing caller AbortSignal → explicit Mermaid operation |
| Automation HTTP | Existing raw body interpretation/envelopes → attached queue view |
| Extension `/video-info` | Existing auth/origin route → desktop metadata → existing projection; formats remain untouched |
| Extension cookie HTTP | Retained HTTP adapter → one bridge owner |
| CLI desktop transport | Existing automation API and sequencing |
| CLI local transport | Independent process queue as today; shipping native composition gated by K |
| Subscriptions | Same preparation/admission/history/queue views |
| Transcription/AI/agents | Injected queue/files/history/local-import contracts; later persistence/execution retains its owner |

MCP absolute-destination checks and zod constraints do not become queue-wide validation. HTTP permissive admission does not acquire renderer schemas. Extension presentation does not become desktop metadata normalization.

Old positional signatures, mutable declarations, ArrayBuffer conversion, synchronous throws versus rejections, error classes/messages, callback prefixes and settlement remain until phase 10.

The old invoke forwarder retains the installed decorator shell’s `async`/`return await`, catch/log/rethrow and `Error in IPC method <channel>:` prefix. A warmed exit-observer runner alone does not reproduce those outer turns.

## 9. Exact semantics and their producer after the port

Section 5 specifies every operation’s payload, result, reply boundary, source and dependency families. The following branch ledger adds the distinctions that cannot be inferred from a signature.

| Operation/branch | Today’s behavior and source | Producer after port |
| --- | --- | --- |
| Interactive start | Synchronous subscription/settings/input/identity checks; duplicate checks; Queued before pending registration; continuation begins before true returns (`download-facade.ts:486–556`) | Downloads owner with qualified synchronous prefix |
| Start continuation | Await startup; check cancellation before expansion; expand; check; hydrate; check; path; reserve sequence; mkdir attempt; await add (`:506–535`) | Same ordered Effect continuation |
| Alternate admitted ID | Remove optimistic row and return before late cancellation (`:536–539`) | Identity-specific branch; never cancel deduplicated other task |
| Same-ID late cancel | Cancel admitted ID only after same-ID branch (`:540–542`) | Same branch |
| Pending cleanup | Remove only the exact pending object still in the map (`:550–553`) | Identity-guarded finalizer |
| Preparation | Hydration/path/mkdir without interactive short-link expansion, sequence reservation or social grouping (`:219–229`) | Separate preparation operation |
| Pending cancel | Mark cancelled, delete pending, emit cancelled, true; no hydration AbortController (`:599–608`) | Pending-start owner |
| Persisted cancel | Missing false; await queue cancel; log/false on failure; cleanup excluded (`:610–619`) | Queue and application catch |
| Cancel all | Snapshot active then pending IDs, first-occurrence order; serial cancel; failed count checks remaining nonterminal state (`:622–640`) | Ordered application operation |
| Pause/resume | False only for missing ID; start control prefix before true; detached failure logs (`:647–673`) | Acknowledgement plus owned continuation |
| Active queue cancel | Persist/emit cancelled before executor lookup/cancel; no general finish wait (G `TaskQueue.layer.ts:653–697`) | Queue kernel |
| Active queue pause | Active run retains pending pause until finish (`:698–724`) | Queue kernel |
| Synchronous acquisition pause | Ignored when neither active run nor suspended start exists | Preserved no-op |
| Native acquisition defects | Assigned row-49 behavior is resolved before activation; compare compatibility’s intentional row-44 gaps separately | K; no blanket “all controls become reliable” change |
| Completed-social retry | Add with current full settings/group, may deduplicate, true; no completed→queued transition (`download-facade.ts:679–692`) | Separate admission branch |
| Failed/cancelled retry | Retry in place; refresh browser/file cookies and proxy only (`:694–709`) | Retry policy and queue |
| UpdateInfo | Empty returns; nonempty logs and changes nothing (`:875–882`) | Explicit no-op |
| Rename | Separate existence and trimmed 1–200-character validation; persist/snapshot (G `TaskQueue.layer.ts:832–849`) | Queue rename |
| Retry due | Current retry-scheduled status is eligibility; no added attempt/deadline guard (`:497`) | Existing callback |
| Retry callback failure | Reinsert at tick-captured `now + 1000`, new sequence, existing tie order (`RetryScheduler.layer.ts:46–75`) | Retry scheduler |
| Panic | Journal/fallback transition/fallback persistence/original error precedence (`TaskQueue.layer.ts:159–205`) | Transition interpreter |
| Playlist | Explicit IDs beat range; source order; one-based clamped/reordered range; serial planned admission; per-entry catches; selected total may exceed admissions (`download-facade.ts:712–820`) | Pure plan plus serial admission at same call site |
| Profile selection | Saved order, unique-requested count check, URL validation; platform branches differ (`:253–305`) | Pure selection plus profile owner |
| Profile commands | Separate get/list/map/stop policies; map saves/returns before traversal | Existing package owners |
| Sequence naming | Numeric-prefix scan; max filesystem/reservation index; reservations survive failure/cancel (`:108–153`) | Pure decision and process owner |
| History list | Terminal library kinds; completion/downloaded-date sort; downloadedAt first-start/create (`history-manager.ts:83–116`; projection `:309–330`) | History/projector |
| History detail | Terminal check without list’s explicit kind filter; latest attempt log; attach only truthy log (`:119–140`) | Detail operation |
| URL predicate | Completed media kinds and exact trimmed URL (`:234–249` in the source inventory’s original layout) | Separate main read |
| History count | Terminal-only iteration; active zero | Derived count |
| History deletion | Legacy deletion first, swallowed failure; serial queue removal; swallowed transcript-cleanup failure; no encompassing transaction (`:40–80,155–212`) | History plus injected cleanup |
| Recursive queue delete | Wait relevant finishes, one durable recursive deletion, then memory/events (G `:935–992`) | Queue/persistence owner |
| Relocation | Guard active/dependent use; atomic reference/timestamp batch; memory rollback; snapshots after success (G `:853–912`) | Queue relocation |
| Startup | Lazy singleton/shared starting; ready after recovery/caps; retry after failure; stop retains object (`task-queue-host.ts:106–377`) | Host and attachment |
| Capacity | Positive configured download cap else 4; conversion/model/dedicated-browser caps 1; current restoration order | Host composition |
| Standalone merge | No `.migrated` means merge even into nonempty target (`task-queue-migrate.ts:397–438`) | Migration service |
| Session/history import | Separate versions/read recovery/transactions/markers; rolledBack does not undo earlier commits (`:129–145,462–530`) | Migration service |
| Video metadata | Full parse, first eligible-line fallback, inflation; exact catch position (`yt-dlp-info.ts:29–80`) | Metadata plus JsonSyntax |
| Playlist metadata | Full output parsed once, then map; warning plus valid line still fails (`:136–149`) | Separate playlist policy |
| With-command | Settings/overlay/args before try; execution/parse errors become error DTO (`:110–131`) | Same boundaries |
| Hydration | Fail open unless aborted (`download-metadata.ts:13–41`) | Metadata helper |
| Thumbnail | Falsy URL null; shared URL work; cache/magic policy; cache failures log/null | Thumbnail owner |
| Thumbnail deadline | Slot acquisition before timeout; request/body only, not queue wait/cache/publication (`thumbnail-download.ts:15–24`; cache `:163–177`) | Fetch-attempt scope |
| Poster | Recognized missing/empty file does not fall back to directory; source mtime/size key; two slots and seek fallback | Poster owner |
| Player | Increment generation before missing-file check; audio fast path; stale attach still returns path; detach/dispose increment only (`player-host.ts:27–68`) | Player owner |
| Preview | In-flight key omits cacheDir; preview-v4/path/mtime/size key; nonempty cached output accepted (`playable-media.ts:387–472`) | Preview owner |
| Cookie health | Connected extension, nonblank file, browser, unconfigured; file health stronger than picker | Cookie service |
| Cookie job | Publish/flush before waiter registration; 12-second timeout drops session; serial source requests (`extension-cookies.ts:365–390`) | Bridge owner |
| File operations | Current trim/quote/path, false/log catches, reveal fallback, web guard, nonrecursive delete | Files/native drivers |
| Notification | Support check, construct/listen/show, true; click tries ordered files then directory (`file-system-service.ts:523–577`) | Notification owner |
| Grouping | Link companions, relocate references serially, unlink originals; compensate; active agent blocks grouping | Library owner |
| Local import | Per-item import/reuse → awaited enqueue → history projection; post-loop caller broadcasts | LocalImport plus injected TranscriptEnqueue |
| Card/pages | Shared chain; prior failure does not block next; no caller signal; pending readiness before command (`share-capture-window.ts:376–461,499–507`) | Capture owner |
| Mermaid | Queued pre-abort creates no window; active abort destroys it; cleanup removes listener; later chain advances (`:464–491`) | Signal-aware capture operation |

### Suspension and settlement

The implementation records actual await/adoption points, not a guessed universal yield count.

| Path | Required sequence |
| --- | --- |
| Synchronous methods | Complete old synchronous prefix before return |
| Start | Startup → cancellation → expansion → cancellation → hydration → cancellation → add → alternate-ID branch → optional cancel → identity cleanup |
| Cancel | Pending branch has no queue await; persisted branch awaits/catches queue cancel |
| Pause/resume | Begin control prefix before acknowledgement; settlement remains detached |
| Retry | Distinct add/retry awaits and settings snapshots |
| Playlist/profile | Per-entry awaits, catches and final adoption |
| History detail | Task/projection prefix, attempt-log await, final result |
| History removal | Serial queue awaits followed by current cleanup |
| Metadata | Overlay/process/retry/parse and outer async adoption |
| Files | Individual dialog/write/export/shell/callback awaits |
| Capture | Chain continuation, acquisition/readiness, paint/result, cleanup and outer PNG/pages adoption |

Download-service async forwarding remains method-specific (`download-service.ts:99–117,132,187,207,215`). Thumbnail methods add their existing async forwarding. Browser health and each file method retain their own async bodies. History directly forwards.

Every old invoke adds the installed decorator wrapper’s async/`return await` and catch/rethrow. Named compatibility turns apply to failure exits too. Cleanup-failure precedence is explicit. Exact numerical settlement parity remains a current-build characterization gate.

## 10. Obligations for the later model

The model may move behind these contracts. This phase adopts no aggregate topology, durable receipt, outcome ledger, replay mechanism, scheduled-command policy or migration authority from the draft.

The replacement must preserve:

- Boolean/void acknowledgements, synchronous prefixes, Promise settlement and raw callback order.
- Completed-social admission retry, failed/cancelled in-place retry, no-op UpdateInfo and separate rename.
- Early active cancellation, pending active pause, ignored synchronous-prefix pause and measured acquisition controls.
- Panic precedence, retry eligibility and captured-time reinsertion.
- One authority for each state family.
- Structural task plus progress-baseline atomicity, recursive deletion atomicity and multi-task relocation atomicity.
- Existing partial commits across history cleanup, profile/file publication and grouping.
- Immediate committed service reads; delayed model recording cannot make them stale.
- Process-epoch reservations/pending controls/optimistic starts without new restartability.
- Live notification loss across crash; durable recording does not authorize replayed notifications.
- DTO fields, links, property presence, error boundaries and surface-specific validation.
- Per-operation reply cuts without durable receipts or a main-side renderer fence.

Pure decisions move now, at unchanged call sites:

| Decision | Module |
| --- | --- |
| Queued visibility | `download-queue-events.ts` |
| Input/identity, retry branch/settings overlay, social selection | `download-facade.ts` pure companions beside the implementation |
| Sequence index/template choice | Facade policy companion; filesystem observations supplied |
| Playlist selection/order/path naming | Existing package plan plus desktop policy |
| Projection/link/filter decisions | `projection.ts` |
| History list/detail/URL eligibility and batch-ID normalization | `history-manager.ts` pure companion |
| Migration eligibility/status/path conversion | `task-queue-migrate-policy.ts` and migration companion |
| Dialog filters/media extension classification | `LocalMediaDialog.model.ts` |
| Poster/preview source, key, codec and argument decisions | Existing media modules |
| Cookie priority/path/sniff interpretation | Existing cookie modules |
| Capture pagination/layout decisions | `share-image-split.ts` and shared layout models |

The later model must independently exercise those decisions and the actual handlers. Feeding a legacy-computed result into a new model and comparing it proves no decision parity.

## 11. Deliberate changes

There is no deliberate application behavior change.

The new transport necessarily has the foundation’s declared differences: typed payload boundaries, preserved-value wire encoding, Uint8Array wire binary, active registration tokens, finite admission/accounting and visible delivery/overflow failures. Legacy routes retain their existing behavior.

Package-native differences are not silently accepted here. K must qualify equivalent primitives or retain the explicitly named primitive boundary. An unresolved difference blocks activation; a green typecheck does not authorize it.

## 12. Verification

### Executed local probes

The current checked set is `probes/revision3/`. Earlier probe recipes are historical and are not authoritative declarations.

All eight commands below exited zero. `verification.json` records commands, results and declaration/harness hashes.

```sh
node probes/node_modules/tsrs/bin/tsrs -p probes/revision3/tsconfig.json
bun probes/revision3/corpus.mjs
bun probes/revision3/invocation.mjs
bun probes/revision3/barrier.mjs
bun probes/revision3/source-oracles.mjs
bun probes/revision3/cuts.mjs
bun probes/revision3/freeze.mjs
bun probes/capture-oracle.mjs
```

The tsconfig extends V’s real base settings, preserves diagnostic severities and overrides, and uses bundled module settings plus test-style no-emit/nonincremental options. It imports installed Effect 4.1.4 and real VidBee packages. The identity alias points to T’s actual package.

| Probe | Executed evidence |
| --- | --- |
| `revision3/contracts.ts`, `OriginalFailure.errors.ts`, `Main.service.ts`, `Compatibility.entry.ts`, `ReplyCuts.service.ts`, `Completion.service.ts`; tsrs command | Complete 77-member declaration set; seven services/handler Layers; native-only contracts; atoms/client action; inner-result extraction; exhaustive 72-unary dependency ledger; required-token adapter forms; zero diagnostics |
| `revision3/corpus.mjs` | Empty and partial Start social options retain their input view, then receive the existing six admission defaults; 32 named schema samples; all 72 unaries and five streams; payloads, success/failure Completion, cuts, Registered/Observation and RPC exits through actual `RpcSerialization.json.codecFor` and whole-message JSON |
| Same corpus | Actual active/history projectors; actual renderer selected-format identity; source-extracted estimate inflation producing Infinity; both metadata result paths; NaN progress projector; null/omitted/own-undefined, negative zero, nested unknown keys and marker-shaped values |
| Same corpus | Retained object key-order checks; binary bytes; missing history result; caption/prompt cases; all download event cases; sparse/decorated-array rejection; mutation of the tested active-list RPC success path detected |
| `revision3/invocation.mjs` | Canonical invocation owner plus real ManagedRuntime/AtomRegistry: false, populated failure, delayed success/failure cuts, reverse overlap and document teardown |
| `revision3/barrier.mjs` | Real in-memory RpcServer/RpcClient via RpcTest; suspended subscription; no premature registration/read; Registered before Observation; token-bearing active/history reads and capture Ready; foreign/stale/closed rejection; listener teardown and acquisition failure |
| `revision3/source-oracles.mjs` | Independently source-extracted video and playlist parsing; exact syntax strings; playlist warning-line discriminator; source-extracted Completed/Updated prefixes and overlapping history application B then A |
| `revision3/cuts.mjs` | Unchanged serial history-removal body with controlled dependencies: first removal commits/publishes, second fails; failure waits for both downloads and transcript prefix cuts |
| `probes/capture-oracle.mjs` | Unchanged capture body with injected native hosts: queued pre-abort creates no window, active abort closes pending window, later capture proceeds |

The freeze corrections were checked with `node probes/node_modules/tsrs/bin/tsrs -p probes/revision3/tsconfig.json` (exit 0, no diagnostics), `bun probes/revision3/freeze.mjs` and `bun probes/revision3/corpus.mjs` (both exit 0). Their real output is:

```text
PASS A1 checked native -> legacy identity/class/code/message; native -> RPC populated failures and cut capture (3 operations)
PASS A2 actual downloads/history/Ready handler Layers: unrelated/duplicate/missing/foreign/stale/replaced/closed tokens execute zero application prefixes; valid families succeed
PASS StartDownload socialMedia {} and {media:"images"} preserve input without defaults; admission parser then supplies all six defaults
{"schemas":32,"rpcs":77,"streams":5,"unaries":72,"metadataInflationPreserved":true,"presence":true,"negativeControls":true}
```

`freeze.mjs` uses the actual checked download, history, files and capture handler Layers with RpcTest and the supplied registration owner. It exercises original queue-log/removal and filesystem failures through both facades and RPC. The separate custom barrier harness now checks the named families too; it remains insufficient evidence for production registration integration. IR-1 and IR-2 retain the production and mutation proof obligations. Source extraction uses an in-memory Bun transpiler, with no temporary output in a repository.

The corpus uses representative constructed values from the actual declarations/stores as well as real projectors and source-extracted producers. It does not execute every production operation.

RpcTest is an in-memory no-serialization transport. The codec corpus separately executes actual JSON serialization. These are distinct proofs, not a serialized Electron integration claim.

The barrier harness supplies the declared Observation envelope explicitly. It does not certify the frozen amendment probe’s ordinary-stream implementation. The amendment’s final implementation requirements remain mandatory, including terminal arbitration, replacement obligations, exhaustive release, immediate cleanup and post-completion defect reporting.

No React application, Electron window, external service, packaged build or platform-native operation was launched.

### Current-build characterization before source changes

O records immutable expectations from the current build, with source/build/lockfile/fixture provenance. Candidate wiring may change; expected observations may not be regenerated from candidate results.

| Permanent probe | Required recording |
| --- | --- |
| `C-facade-turns` | Every callable method’s return/throw/settlement markers, immediate reads/events, wrapper adoption and synchronous/deferred success/failure |
| `C-start-races` | Queued re-entry, pending identity, held startup cancellation, expansion/hydration/add cancellation, alternate ID, identity cleanup |
| `C-controls` | Active/acquiring/synchronous-prefix controls, late finish, panic precedence, retry callback reinsertion/ties |
| `C-history` | Complete field/presence census, dates/order/ties, list/detail/URL distinction, logs, serial partial deletion and transcript publication |
| `C-metadata` | Scalars/nulls, nullable formats/headers, generated non-finite values, full/fallback syntax, one-shot playlist, pre-try failure, retries/abort |
| `C-profiles` | Every get/list/command/map/stop/download branch, Fansly distinction, ordering/counts, partial enqueue/save failure |
| `C-cookies` | Discovery/Firefox paths, sniff versus health, preferences/source priority, waiter re-entry/timeout and overlapping polling |
| `C-files` | Dialog overload/options/cancel, path transformations, clipboard bytes, notification click ordering, ENOENT and empty-directory races |
| `C-images` | Cache/FIFO/deadline/publication; fifth request waits outside deadline; poster fallback/stale results |
| `C-player` | Codec/remux/transcode/cache, competing cacheDir, stale attach, detach/dispose, fallback error identity |
| `C-library-import` | Link/reference/unlink/compensation, collisions/symlinks, exact Markdown/manifest bytes, per-item transcript enqueue |
| `C-capture` | Chain order, request/window association, listener identity, abort checks, layout/paint/error output |
| `C-renderer` | Actual actions, optimistic duplicate false path, metadata selection, terminal/history races, notification/cookie prompts and remounts |
| `C-surfaces` | MCP/HTTP/CLI/extension bytes, envelopes, validation, errors and sequencing |

Existing task/history/loopback goldens remain useful. Route smoke does not prove per-control interactions, thumbnail/poster bytes, codecs, capture output, physical clipboard or microtask order.

Missing goldens include full dialog format/audio/clip interaction, row/multiselection controls, native file operations, image/poster output, player timing, sequence races, grouping bytes, ShareCapture output and successful concurrent cookie fulfilment. Add them on the current build before implementation where a stable offline oracle exists.

### Permanent implementation tests

| Sections | Named tests and gate |
| --- | --- |
| 2 | `T-ownership`: exact manifest, monotonic baseline, complete resolved graph, aliases/type imports/declarations and package UI closure |
| 3 | `T-codec-census`: complete production groups and actual producer→consumer→next-request paths; acceptance/presence/mutability/key order and negative controls |
| 4 | `T-errors`: deliberate text, original identity/class/code, false/null catches, panic and fallback precedence |
| 5 | `T-delivery`: full actual Protocol pair, delayed event/fast reply, partial failure cuts, token replacement/closure, stalled Ack, overflow, replay absence and unaffected requests |
| 5,7 | `T-consumer-overlap`: actual handler prefixes, watermarks and independently settling history reads |
| 6 | `T-one-owner`: construction counters, lazy start/retry/stop/disposal, one borrowed handle, attachment without allocation |
| 6 | `T-native`: independent acquisition, unread pipes, omitted observers, signalling, reaping, liveness, sync stat and actual-completion accounting |
| 6 | `T-local-import`: per-item ordering and unchanged compatibility supplier before phase 9.3 |
| 7 | `UI-invocations`: actual React actions, false/error interpretation, overlapping calls, StrictMode/provider/HMR and teardown |
| 7 | `UI-parity`: actual screens, storage, focus/selection/virtualization and visual parity |
| 8 | `T-legacy-surfaces`: old callable/type fixtures and unchanged external surface observations |
| 9 | `T-semantic-traces`: independent old/new branch and settlement traces |
| 10 | `T-model-seam`: pure decision oracles and renderer bundle exclusion; no model architecture assertion |

Mutation proofs must reject delayed Queued, early pending insertion, expansion before cancellation, cancellation of an alternate admitted ID, awaited pause acknowledgement, delayed active cancellation, retained synchronous-prefix pause, ordinary retry for completed social tasks, UpdateInfo wired to rename, flattened panic precedence, later-clock retry reinsertion, dropped collection fields, restrictive selected metadata, own undefined converted to null, non-finite metadata rejection, playlist fallback, shared mutation-result state, premature/reused registration, lost replacement cuts, reversed terminal flush, whole-operation thumbnail timeout, detach cancellation, reordered cookie waiter publication and duplicate queue/database ownership.

Each mutation runs on a fresh scratch candidate after baseline success. Keep the intended failing assertion and raw trace. The candidate is never its own oracle.

### Packaged and platform gates

`P-linux` requires strict node/web/test checks through patched tsrs; standards/identity/JSDoc/Example checks; port/ownership/dependency checks; whole-repository checks/tests; Linux, CLI and extension builds; unchanged old goldens plus newly recorded cases; and isolated offline exercise of Home, metadata, playlist/control/history, thumbnails/posters, playback and share rendering.

`P-native` requires actual process acquisition/control/retained-pipe oracles and real cleanup/accounting. `P-cli` requires executable bytes, signal/lifetime behavior and source-unavailable distribution checks before changing shipping composition. The independent review/fix-verification loop remains required.

Linux cannot prove Windows clipboard formats, macOS permissions/share sheets/Dock, other-platform process/codec integration or launchers. Headless tests cannot prove physical clipboard paste, dialog appearance, notification clicks or window-manager behavior. Offline tests cannot prove current login, remote extractors, signed media URLs, live cookie permissions or Widevine playback.

The current recorder-argument failure remains A2 behavior (`OWNER-REVIEW.md` row 77). Successful recording is not an existing passing golden.

## 13. Implementation lanes

These are future allocations, not sessions started by this document. Worktrees belong under `~/YeeBois/workstation-apps/worktrees/VidBee/<lane>`. At most three implementation lanes run concurrently.

| Order | Lane | Exclusive responsibility | Gate |
| --- | --- | --- | --- |
| 0 | O — characterization | Current-build observers and immutable expectations | C probes, provenance and mutation sensitivity |
| 1 | K — package/kernel/native prerequisites | All K package/binary/path/runtime rows | Row-49/native control, classifier, process/timer and attachment oracles; no desktop activation |
| 2 | B — foundation adoption | All shared foundation rows | Production amendment regressions, serialization, invocation, barrier, teardown and syntax gates |
| 2 | A — contracts | All A models/RPCs/errors/native service contracts | Complete codec/input/output/consumer census and mutable compatibility declarations |
| 3 | P — early host prerequisites | Pure media dialog companion, power-save implementation and tests | Strict graph contains no local-import/transcript orchestrator; queue scan/listener/blocker parity |
| 4 | F — files/media | All F implementations/tests | A/B/P/K; file/cache/deadline/player/native parity |
| 4 | C — cookies/capture | All C implementations/tests | A/B/K; profile construction, source ordering, HTTP and capture lifecycle parity |
| 5 | H — queue activation | Queue-host implementation/attachment/lifecycle | K/B/A/P/C and root-supplied later executor contracts; one graph/handle/admission owner |
| 6 | D — downloads/history | All D implementations/tests and capability delivery policy | H/F/C; exact branch/error/settlement/projection/migration/import/library gates |
| 6 | R — renderer | All R files/tests | A/B and strict UI prerequisite; development may overlap D; final gate waits for real services |
| 7 | I — integration | All I roots, adapters, manifests, candidate wiring and reports | Complete strict graph, package/distribution/golden/offline exercise and independent review |

I is available from contract freeze onward to supply composition and ownership edits needed for each lane’s gate. Integration is not postponed until order 7.

The backward dependencies are removed:

- F imports `LocalMediaDialog.model.ts`, not D’s `import-local-media.ts`.
- H imports P’s strict power-save implementation, not later D work.
- Main service contracts are frozen by A before F/C/H/D.
- H receives later executors through explicit contracts supplied by I.
- D’s local-import orchestrator receives `TranscriptEnqueue`; it does not require phase 9.3 implementation completion.

Every section-2 file belongs to exactly one lane. A discovered dependency receives an explicit allocation before editing; it is not silently assigned as a helper.

## 14. Behavior kept as it is

These are owner-review candidates, not fixes:

- Queued precedes pending registration and permits re-entry.
- Pause/resume true means existence.
- Pending cancel does not abort hydration.
- Alternate-ID deduplication returns before late cancellation.
- Completed-social retry may deduplicate and still return true.
- UpdateInfo and AddHistoryItem are no-ops.
- History active count is zero; list/detail/URL filters differ.
- Initial history replacement and terminal hydration race.
- Indeterminate-only progress changes may be discarded.
- Sequence reservations survive failed/cancelled admission.
- Playlist selected count may exceed admitted entries; filename/folder-format options remain unused.
- Cookie publication precedes waiter registration.
- Cookie polling may overlap; any connected extension has health priority.
- Picker sniff is weaker than health inspection.
- Player detach/dispose do not cancel preparation; stale attach returns its path.
- Preview sharing ignores cacheDir; cached nonempty output is not reprobed.
- Unknown thumbnail-cache magic may be accepted.
- A recognized missing poster file does not fall back to directory.
- Cancelled-part cleanup follows stat symlinks and lexical containment.
- File deletion handles files and empty directories only.
- Share temporary PNGs have no deletion path.
- Card-listener cleanup differs from Mermaid’s token pattern.
- Card/pages have no caller signal.
- Grouping compensates; failed rollback can retain both copies.
- Repeated video-library initialization can add listeners.
- Migration rolledBack does not undo earlier commits.
- Standalone merge can run into a nonempty target.
- Queue construction/persistence failure can select memory.
- Power blocking covers all running/processing task kinds.
- Per-site signals retain PID/group/descendant gaps.
- Raw/native process observation and unread-pipe distinctions remain explicit.
- The existing recording failure remains.
- Profile inventory/cache/partial-state behavior remains governed by reviewed package contracts.

## 15. Open questions

The review’s former choices are settled in the body: foundation ownership, preserving codecs, invocation-owned completion, active tokens, one queue attachment, narrow parser primitive, separate playlist policy, injected local transcript enqueue and prerequisite lane order.

One conditional closeout decision remains:

| Question | Options | Recommendation |
| --- | --- | --- |
| If a required raw process/timer/parser primitive still cannot satisfy strict standards at phase 10, how is that boundary closed? | Qualify an equivalent strict primitive; explicitly revise the standard’s host boundary; authorize a measured behavior change; hold closeout | First qualify the equivalent primitive. Otherwise hold closeout and present the exact diagnostic, old/new trace and smallest boundary decision. Do not relabel residual compatibility as fully ported. |

Payload/accounting measurements, missing platform evidence and failed parity tests are implementation obligations. They do not authorize a new behavior choice.

## 16. Review disposition

“Addressed” means the revised contract and named focused probe address the design finding. Production implementation and section-12 gates remain owed.

| Finding | Disposition and evidence |
| --- | --- |
| **REVIEW N1 — Completion returned as application result** | Addressed in sections 5 and 7. `Completion.service.ts` typechecks the real client-to-action path. `invocation.mjs` executes false, populated failure, pending cuts, reverse overlap and document teardown. |
| **REVIEW N2 — Operation dependency families absent** | Addressed by the exhaustive 72-unary ledger in section 5 and checked `Dependencies`/handler Layers in `contracts.ts`. Queue paths include downloads and transcript publication. `cuts.mjs` exercises source serial partial removal and failure waiting for both prefixes. `source-oracles.mjs` exercises actual Completed/Updated synchronous prefixes and overlapping hydration. Full production delayed-event/fast-reply tests remain `T-delivery`. |
| **REVIEW N3 — Metadata serialization rejects successful observations** | Addressed for both metadata result paths and retained event/history subtrees. `corpus.mjs` executes all 77 declarations, source-generated Infinity, nested presence, negative zero, NaN progress, actual projectors/selection and mutation of the tested RPC path. |
| **REVIEW N4 — Playlist gains video fallback** | Corrected in sections 6 and 9. `source-oracles.mjs` independently executes source video and playlist bodies; warning plus valid JSON line succeeds only for video. Exact syntax formatting is compared. |
| **REVIEW N5 — Backward lane dependencies** | Corrected in sections 2, 6 and 13. P owns pure dialog filters and power-save before F/H; A freezes main contracts; I supplies explicit later-capability ports. This is allocation/dependency design, not executed graph acceptance. `T-ownership` and `T-local-import` are the named implementation gates. |
| **REVIEW decision — Local import before 9.3** | Section 6 names `TranscriptEnqueue`, its current compatibility supplier and unchanged Promise facade. Per-item enqueue/history order and post-loop broadcasts remain explicit. Proof owed: `C-library-import`, `T-local-import`. |
| **REVIEW decision — Concrete permissive presentation** | Sections 3 and 7 separate construction, observation and field-local interpretation. `corpus.mjs` proves the selected-format/projector wire paths; `C-renderer` and `UI-parity` must exercise actual remaining component cases. |
| **REVIEW-1 #1 — Nullable metadata rejected on admission** | Retained selected metadata stays observation data. `corpus.mjs` uses actual selection with nulls/headers/extra values through StartDownload. |
| **REVIEW-1 #2 — Collection/source fields dropped** | Both projectors and consumers retain them. `corpus.mjs` compares actual active/history results and detects closed-ID mutation. |
| **REVIEW-1 #3 — Original JSON syntax lost** | Shared narrow JsonSyntax capability; distinct video/playlist policies. `source-oracles.mjs` compares original syntax text. Complete process/pre-try integration remains `C-metadata`/`T-errors`. |
| **REVIEW-1 #4 — Registration barrier missing** | One foundation document-generation primitive with active tokens, failure-atomic installation and teardown. `barrier.mjs` uses suspended real in-memory server/client subscriptions, token-bearing reads/Ready and closed/foreign/stale rejection. Production amendment regression coverage remains B’s gate. |
| **REVIEW-1 #5 — Capture cancellation conflated** | Card/pages and Mermaid remain distinct. `capture-oracle.mjs` exercises queued/active abort and later chain progress against unchanged capture body. |
| **REVIEW-1 #6 — Start cancellation order** | Section 9 retains cancellation before expansion, alternate-ID return before late cancel and identity cleanup. Full current-build/mutation proof remains `C-start-races`/`T-semantic-traces`; no source-only proof is claimed. |
| **REVIEW-1 #7 — Ownership/order incomplete** | Every listed file has one lane; K precedes activation; P removes F/H backward dependencies. `T-ownership` and `T-one-owner` remain required. |
| **REVIEW-1 #8 — Thumbnail deadline too broad** | Section 6 puts deadline inside admitted fetch attempt. Fifth-request discriminator remains `C-images`/F’s tests; no new runtime deadline proof is claimed here. |
| **REVIEW-1 #9 — Mutable declarations unproved** | Checked schemas retain mutable keys/arrays and separate compatibility declarations. Complete old/new declaration and mutation fixtures remain `T-codec-census`/`T-legacy-surfaces`. |
| **REVIEW-1 G1 — Main-only contracts missing** | Corrected by final-review A1: the seven native `Desktop*` services are authoritative and retain original failures, including complete history reads/removals and files/player/cookies operations. Section 6 adds explicit local-import/later ports. |
| **REVIEW-1 G2 — Raw versus coalesced events unclear** | Section 5 retains two observation boundaries and one coalescer. Source anchors are explicit; actual listener/recipient/order proof remains `C-facade-turns`/`T-delivery`. |
| **REVIEW-1 G3 — Promise settlement under-specified** | Section 9 preserves per-path await/adoption and decorator shells. Exact counts are not claimed by generic probes; `C-facade-turns` and `T-semantic-traces` record them. |
| **REVIEW-1 G4 — Permissive values unusable by renderer** | Field-local presentation contracts and raw retention are explicit. `corpus.mjs` proves representative wire/selection paths; full component proof remains `C-renderer`/`UI-parity`. |
| **Model review finding 1** | Control, retry, no-op/rename, panic and reinsertion corrections incorporated in sections 4 and 9. They are compatibility obligations, not adoption of the model draft. |
| **Model review finding 5 and section-14 table** | Sections 8–10 preserve application acknowledgements, validation, immediate reads, atomic units and external envelopes. Interface/codec probes are explicitly separated from actual-handler, packaged and later-model proof. |
| **FINAL A1 / finding 1 — Native failures** | Corrected in sections 4, 6, 8 and 12; authoritative native services retain original failures, facades unwrap them, RPC adapters map once before capturing cuts. Connected declarations typecheck; `freeze.mjs` passes both surfaces for three injected failures. Production proof and mutation remain IR-1. |
| **FINAL A2 / finding 2 — Registration families** | Corrected in sections 5, 6 and 12; snapshots require downloads, Ready requires one card and one Mermaid registration, and validation precedes application construction. Checked-adapter negative probes pass with zero invalid application prefixes. Production registration coverage remains IR-2. |
| **FINAL A3 / finding 3 — Social defaults** | Corrected in sections 3 and 12 and the authoritative schema/corpus: preserving encoded input for Start social options; empty/partial round trips do not insert defaults; admission then supplies the six existing defaults. Legacy/MCP/HTTP/CLI validation is unchanged. Remaining census proof is IR-5. |
| **FINAL B1 — Original failures through both surfaces** | Carried as IR-1. |
| **FINAL B2 — Production registration adapters** | Carried as IR-2. |
| **FINAL B3 — Shared admission wiring** | Carried as IR-3. |
| **FINAL B4 — Completion policy and actual consumers** | Carried as IR-4. |
| **FINAL B5 — Remaining parity evidence** | Carried as IR-5. |

The design was frozen after its final review with the A1–A3 corrections and IR-1–IR-5 implementation requirements.

## 17. Implementation requirements

Implementation lanes are bound by every requirement below and must prove each one before their integration and acceptance gates.

1. **IR-1 — Prove original failures through both surfaces.** Inject an original filesystem error and a queue-log/removal error. The legacy facade must expose the identical object, class, code, and message; RPC must expose one populated `DownloadsFailure` after required cuts. A mutation that maps inside the shared native service must fail.
2. **IR-2 — Exercise production registration adapters.** Test unrelated-family tokens, duplicate capture tokens, missing capture family, foreign client, stale generation, closed/replaced registration, and suspended installation. Invalid requests must execute zero application prefixes. The current custom barrier handlers are insufficient evidence.
3. **IR-3 — Freeze shared admission wiring before C/H integration.** C and H must receive the same `SourceAdmission` owner through composition. C must neither import H’s unported implementation nor allocate a replacement owner. Prove the resolved dependency graph and mutual exclusion/release order between profile work and queue work using that shared owner.
4. **IR-4 — Connect the corrected completion policy to actual consumers.** Against the production Protocol pair, delay Queued while returning Start’s reply; preserve false acknowledgements; make serial history removal fail after a published prefix; and let Completed/Updated hydration finish in reverse order. Replies must wait for their cuts, while hydration remains detached from watermarks.
5. **IR-5 — Record the remaining parity evidence before replacing source.** Preserve independent old/new traces for synchronous re-entry, start cancellation branches, service/decorator adoption turns on success and failure, and local-import iteration order. Extend the producer → wire → consumer → next-request census to the actual presentation sites and default-bearing inputs. Each named regression mutation must fail its intended assertion; passing constructed samples alone is insufficient.