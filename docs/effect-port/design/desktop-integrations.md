# Design: desktop integrations (phase 9.5)

Status: frozen on 2026-11-22 after three independent review rounds; the implementation requirements section binds every implementation lane. Text before the freeze: third revision for architect review. The foundation amendment’s decisions are binding. This document defines capability contracts and implementation gates; it does not establish production acceptance or authorize a transport cutover.

**Wire reproduction limit:** complete SDK-compatible MCP exchanges and raw packaged HTTP traffic were not reproduced in this revision. Existing goldens principally record normalized response bodies. They do not establish every header, initialization exchange, transfer frame, malformed-envelope response, cancellation sequence or shutdown observation. The replacement protocol remains gated on the current-build recordings in section 12.

Only local probes were written. No repository was changed, application launched, listening socket opened, network connection made, additional agent started or coding CLI session created.

| Name | Worktree | Evidence used |
| --- | --- | --- |
| V | `~/YeeBois/workstation-apps/worktrees/VidBee/port-desktop-foundation` | Desktop implementation, plan, guide, foundation design and characterization report; inspected head `990ed4fe` |
| G | `~/YeeBois/workstation-apps/worktrees/VidBee/port-goldens-8` | Current package, CLI and extension integration state; inspected head `7c94ea05` |
| T | `~/YeeBois/workstation-apps/worktrees/VidBee/port-standards-tooling` | Enforced standards editions |

Paths are repository-relative. **M/** means `apps/desktop/src/main/`, **R/** means `apps/desktop/src/renderer/src/`, and **S/** means `apps/desktop/src/shared/`. Desktop source references identify V unless marked G. Proposed files and exports are contracts, not claims that production modules already exist.

The governing inputs are `PLAN.md` sections 3–7, the phases 9.1–9.5 instructions and Amendments; `PORT-GUIDE.md`; the approved foundation and its frozen amendment; `reports/9.0.md`; the reviewed package designs and their subsequent corrections; the enforced standards editions; the supplied inventory checked against reached source; and the capability-semantic corrections in `MODEL-REVIEW-2.md`. The event-sourced model remains later work. Nothing else in its draft becomes a decision here.

The parallel 9.1 and 9.2 designs now exist. Their earlier readiness and private-atom recipes are superseded by the frozen foundation amendment. This document uses their visible service ownership and imports the amendment mechanisms under their production names.

## 1. What this capability is, and what makes it risky

This capability exposes desktop operations through MCP and loopback HTTP, supplies the account and device-authentication services, owns extension overview/transcript/chat sessions, and moves its renderer consumers to the approved Electron RPC and atom conventions.

The MCP registry moves to `effect/ai/McpServer`. HTTP endpoint implementations move to `effect/http-api` behind an ordered compatibility dispatcher. The phase-8 extension receives a generated `HttpApiClient` behind its existing `ExtensionHttp` service. The phase-8 CLI retains its transport and sequencing.

A2 and A6 include accepted values, results, errors, synchronous prefixes, Promise settlement turns, publication recipients and order, null versus omission, partial failures and races. Admission is distinct from terminal completion.

The principal risks are:

1. MCP, automation, extension and decorator callers apply different validation to the same underlying operation.
2. Framework routing and decoding can run before the old authorization, token-consumption or body-parsing boundary.
3. JSON cannot directly preserve every observation previously carried by Electron structured clone.
4. Several replies acknowledge work before it completes.
5. A request can publish observations before either successful or failed settlement.
6. Extension jobs, account coalescing, queue state and conversations already have owners.
7. Detached callbacks begin synchronous work in source order while their asynchronous continuations overlap.
8. Native operations, shared reads and admitted jobs can survive the initiating request.
9. Discovery metadata, descriptor bytes, headers, status codes and protocol error prefixes are client contracts.

The foundation conventions remain binding: `Foo.rpc.ts`, unique tags, `FooRpcs.toLayer(...)`, `Foo.atoms.ts`, `AtomRpc.Service`, one document registry, the shared runtime factory, application-owned Layers, bounded transport, original-error compatibility and full-Cause logging with minimum level `"All"`.

## 2. Scope and file dispositions

Existing filenames stay. New files use the approved companion grammar. Braces enumerate files; they do not assign a whole directory.

Each row has one writer. Contract files remain C-owned throughout implementation. Runtime lanes consume them and propose contract corrections to C; there is no implicit ownership transfer.

### Main, shared and compatibility files

| Existing file or new target | Disposition | Lane |
| --- | --- | --- |
| `M/mcp/{server,http,config,tool}.ts` | Port implementation in place: ordered registry, framing adapter, request lifecycle, credential policy and tool execution. Retain compatibility exports until phase 10. | M |
| `M/mcp/{settings,task,subscription,transcript,ai,export}-tools.ts` | Port in place over the existing capability owners. Preserve definitions, projections, validation and acknowledgement boundaries. | M |
| New `M/mcp/{McpCatalog.model,McpProtocol.model,Mcp.errors,Mcp.service}.ts` | Schema, error and service declarations. Catalog data derives from current discovery/source, with provenance. | C |
| New `M/mcp/{Mcp.layer,McpFiles.driver,McpCrypto.driver}.ts` | Implement MCP services and genuine platform primitives. | M |
| `M/local-api.ts` | Port listener orchestration and ordered dispatch in place. Preserve explicit start/stop operations and existing exports. | H |
| New `M/{LocalApi.api,LocalApi.errors,LocalApi.service}.ts` | Server/client API declarations and listener contract. Server declarations deliberately avoid early semantic decoding. | C |
| New `M/LocalApi.layer.ts` | Listener and dispatch implementation. | H |
| `M/lib/{local-api-guard,extension-origin,extension-token,automation-descriptor}.ts` | Port in place. Preserve classification, token comparisons, descriptor serialization and failure policy. | H |
| New `M/lib/{LocalApiAccess.model,LocalApiAccess.service}.ts` | Access models and service contracts. | C |
| New `M/lib/{LocalApiAccess.layer,IntegrationFiles.driver}.ts` | Access state and genuine file primitives. | H |
| `M/lib/extension-overview.ts` | Port in place; sole overview-job owner. | X |
| `M/lib/extension-transcript.ts` | Port in place; sole transcript-job owner. | X |
| `M/lib/extension-chat.ts` | Port in place; sole session, expiry, stream-membership and exporting-flag owner. | X |
| `M/lib/extension-chat-{actions,events,source,cards}.ts` | Port in place; preserve action interpretation, browser projections, source-import coalescing and SSE ordering. | X |
| New `M/lib/{ExtensionOverview,ExtensionTranscript,ExtensionChat}.service.ts` | Frozen extension service declarations. | C |
| New `M/lib/{ExtensionOverview,ExtensionTranscript,ExtensionChat}.layer.ts` | Implement the declared owners. | X |
| `M/lib/extension-chat-requests.ts` | Borrow the strict 9.4 admission implementation. Preserve compatibility signature. No second association table or admission map. | D4 |
| `M/lib/auth-client.ts` | Split interpretation/coalescing from Better Auth primitives. Keep old exports forwarding to the same owners. | A |
| `M/lib/cloud-device.ts` | Port orchestration in place. | A |
| New `M/lib/{DesktopAccount,DesktopAuth,CloudDevice}.service.ts` | Service declarations. | C |
| New `M/lib/{DesktopAccount,DesktopAuth,CloudDevice}.layer.ts` | Account, authentication and device implementations. | A |
| New `M/lib/{BetterAuth,AccountHttp,DeviceCrypto,DeviceStorage,MachineIdentity}.driver.ts` | Genuine third-party, HTTP, storage, crypto and process edges. | A |
| `M/ipc/services/account-service.ts` | Keep an explicitly unported decorator forwarder until phase 10. Move application logic into `DesktopAccount`. | A |
| `M/ipc/services/mcp-service.ts` | Keep an explicitly unported decorator forwarder until phase 10. Move application logic into `DesktopMcp`. | M |
| `S/mcp.ts`, `S/types/auth.ts` | Keep public names and compatibility exports; derive DTO types from models without importing main implementation. | C |
| New `S/{Mcp.model,Account.model,Mcp.errors,Account.errors,Mcp.rpc,Account.rpc,ExtensionIntegrations.model,ExtensionIntegrations.errors}.ts` | Browser-safe models, errors and complete RPC declarations. | C |
| `S/{extension-chat,extension-overview,extension-transcript,extension-source-url,extension-identity,extension-overview-reuse}.ts` | Refine existing strict contracts and keep pure algorithms at their existing paths. | C |
| `S/extension-cookies.ts` | Keep 9.1 ownership. | D1 |
| `S/{agent-chat,agent-ui,ai-types,ai-prompts,agent-task,agent-settings,agent-subtitles,agent-thread-patch}.ts` | Borrow foundation/9.4 contracts. | D4 |
| New `M/lib/AccountNotifications.service.ts` | Stateless domain contract over foundation `DesktopNotifications`. | C |
| New `M/lib/AccountNotifications.layer.ts` | Stateless domain adapter; no recipient map, queue or independent notification state. | I |
| `M/lib/cloud-transcription.ts` | 9.3 owns implementation. I supplies only the final notification-sink wiring at the two existing publication points. | I |
| `M/lib/agent-management-host.ts` | Final delegation wiring only. Decisions remain with task/settings/subscription/AI owners. | I |
| `M/index.ts`, `M/ipc/index.ts`, existing `DesktopRpcs` composition | Integrate Layers, compatibility forwarders, readiness payload and existing startup points. | I |
| `apps/desktop/src/preload/{index.ts,index.d.ts}`, `S/types/ipc.ts` | Integrate browser-safe declarations and exact existing helper/Better Auth surfaces. | I |
| Desktop strict configs, `port-units.json`, `port-units.baseline.json`, desktop manifest and bundler configuration | Promote exact closures and wire dependencies after their gates pass. | I |

Decorated forwarding files remain outside the strict implementation graph. Strict services never import them. Keeping a decorator in a promoted file is not an acceptable intermediate implementation.

### Renderer, extension and CLI

| Files | Disposition and replacement | Lane |
| --- | --- | --- |
| `R/components/settings/{McpPanel,McpCapabilities,AccountPanel,CreditHistory,CreditReservations}.tsx` | Port calls and state ownership; preserve presentation, labels, clipboard/navigation behavior and component lifetime. | R |
| `R/components/settings/account-table.ts` | Keep pure constants and promote its reached graph. | R |
| `R/hooks/use-cloud-account.ts`, `R/lib/{ai-credits,settings-navigation}.ts` | Port reached behavior in place, preserving overlap and stale-response policy. | R |
| New `R/lib/{Mcp.atoms,Account.atoms,AccountController.service,AccountController.layer}.ts` | Clients and per-mounted-consumer controllers. No global balance cache. | R |
| `R/App.tsx` | Integrate the actual `KernelGate` readiness producer. Preserve its position before the kernel-ready branch. | I |
| `R/app-layout.tsx` | Integrate account/auth registrations and retained logical auth-callback lifetime. | I |
| `R/pages/Settings.tsx` and capability-slot assembly | Composition only. | I |
| `R/components/settings/{AiProvidersPanel,CloudTranscriptionSettings}.tsx` | Cross-phase import wiring only; component implementation remains with its capability. | I |
| `R/hooks/use-extension-cookie-connection.ts`, `R/components/settings/{CookiesSetupPanel,ExtensionCookieSources}.tsx`, `R/components/download/UnifiedDownloadHistory.tsx` | Keep 9.1 ownership. | D1 |
| G `apps/extension/src/ExtensionHttp.layer.ts` | Replace request construction with generated calls behind the unchanged service. | H |
| G extension `ExtensionHttp.service.ts`, background/browser/cache/popup controllers, entrypoints and `wxt.config.ts` | Keep phase-8 signatures and behavior; change only required client imports/wiring. | H |
| G `apps/cli/src/transport/*`, `AutomationSession` and executable fixture | Keep implementation; consume as the permanent CLI oracle. | I |

There are no account-credit or MCP Jotai atoms in the inspected consumers. Their state is local React state/ref/Promise ownership (`AccountPanel.tsx:418`, `McpPanel.tsx:31`, `use-cloud-account.ts:12`).

The adjacent `settingsAtom`, `settingsLoadedAtom`, `enableDownloadNotificationsAtom`, `loadSettingsAtom`, `saveSettingAtom` and `saveAllSettingsAtom` remain foundation-owned. This phase consumes their replacements and preserves foundation optimistic rollback.

### Package remediation

All paths below are P-owned. P coordinates the contract with C and D1 before C’s freeze.

| Files | Required disposition |
| --- | --- |
| G `packages/task-queue/src/{Task.model,TaskQueue.model,Events.model,Classifier.model,Persist.model}.ts` | Add observation types; retain semantic authored/stored-read models separately. |
| G `packages/task-queue/src/{TaskQueue.service,TaskStore.service,TaskEvents.service,TaskPersistence.service,TaskExecutor.service}.ts` | Carry observation tasks through the actual owner interfaces. |
| G `packages/task-queue/src/{TaskQueue.layer,TaskStore.layer,TaskEvents.layer,TaskPersistence.layer,TaskExecutor.layer}.ts` | Implement one broadened owner, not a parallel queue. |
| G `packages/task-queue/src/{TaskObservation.model,TaskObservation.service}.ts` | New observation declarations and same-owner capability. |
| G `packages/task-queue/src/{index,types,schemas}.ts`, package export map | Expose the reviewed contracts without importing a native node SQLite driver. |
| G queue projection, scheduler and executor modules reached by observation tasks | Refine their actual inputs at existing interpretation points; preserve sorting, coercion, failures and timing. Exact closure belongs in P’s manifest. |
| G `packages/task-queue-legacy/src/` queue attachment, types, event/projection and persistence adapters | Preserve legacy structural signatures and attachment to the same native owner. |
| Queue source/store/persistence/event/facade tests | Add malformed observation and interpretation-point differential cases. |

The broadening cannot stop at `add`. Section 3.2 defines the complete affected interface.

### Tests

| Files | Lane |
| --- | --- |
| Existing `apps/desktop/scripts/port/golden/{run,worker,cases,client,cli,loopback,loopback-cases}.mjs`, `loopback.test.mjs`, `normalize.test.mjs`, `GOLDENS.md`, `apps/desktop/test/golden/*` | O |
| `scripts/test-setup-vidbee-mcp.py`; new `apps/desktop/test/{McpCatalog,McpProtocol,McpLifecycle}.test.ts` | M |
| New `apps/desktop/test/{LocalApiDispatch,LocalApiLifecycle,AutomationDescriptor,ExtensionAccess}.test.ts`; G `apps/extension/test/ExtensionHttp.generated.test.ts` | H |
| New `apps/desktop/test/{ExtensionOverview,ExtensionTranscript,ExtensionChat,ExtensionChatEvents}.test.ts` | X |
| New `apps/desktop/test/{Account,DesktopAuth,CloudDevice}.test.ts` | A |
| New `apps/desktop/test/{McpRenderer,AccountRenderer,AccountPolling}.test.tsx` | R |
| New `apps/desktop/test/{IntegrationContracts,AccountWire,IntegrationCodecCensus}.test.ts` | C |
| New `apps/desktop/test/{AccountNotifications,AccountReadiness,DesktopIntegrationsComposition}.test.ts` | I |
| Queue remediation tests and existing db/package differential gates | P |

JavaScript characterization harnesses retain D7’s disposition. Production strict tests use the enforced test conventions.

### Borrowed files and services

| Owner | Assumed ownership |
| --- | --- |
| Foundation | `RpcField.model.ts`, `RpcObservation.model.ts`, `DocumentDelivery.model.ts`, `DocumentDelivery.errors.ts`; main `DocumentSubscriptions`/`DocumentDelivery`; Electron Protocol adapters; renderer `DocumentDelivery`; `RendererInvocation.entry.ts`; optional `Invocation.atoms.ts`; `ApplicationOperations`; `StreamRecovery`; `DesktopNotifications`; `OriginalFailure`; `JsonSyntax`; `SynchronousHost`; shared runtime, registry, settings/app/window services and logging |
| D1: 9.1 | Downloads/history/capture application services; `DesktopQueueHost`; `download-facade.ts`, `task-queue-host.ts`, `queue-ref.ts`, projectors, metadata/files/browser-cookie services, kernel/profile/binary hosts, `social-profile-manager.ts`, serial `import-local-media.ts`, `AgentResponseContent.tsx`, player/capture presentation and cookie renderer files |
| D2: 9.2 | `DesktopSubscriptions`, `DesktopSubscriptionHost`, `SubscriptionTaskAccess`, `SubscriptionAdmission`, `SubscriptionOwner`; `subscriptions-host.ts`, profile orchestration and desktop subscription projections |
| D3: 9.3 | `transcript-host.ts`, `remote-captions.ts`, transcript/status/detail/export/source contracts, caption process ownership and Cloud transcription implementation |
| D4: 9.4 | Conversation/thread/run/prompt services, `agent-chat-store.ts`, `agent-chat-runner.ts`, `ai-prompt-runner.ts`, `ai-store.ts`, composer/catalog/events/artifacts/exports, capability/management hosts, `extension-chat-requests.ts`, `TranscriptShareImageDialog.tsx` |
| Phase 10 database closeout | `database.ts`, `database-path.ts`, `database/{migrate,schema}.ts`, final handle retirement and driver selection |

The visible 9.1 revisions use both earlier `DesktopDownloads` terminology and later `MainDownloads`/`MainHistory`/`MainCapture` partitions. Bind the exported contracts selected by that phase; do not create another runtime to accommodate a naming difference.

Foundation owns the shared parser implementation and its narrow unported host injection. Earlier 9.1/9.2 copies that allocate these primitives locally do not override the frozen amendment.

## 3. Schemas

Schemas precede services and implementations.

Production data models use branded `S.Opaque` over annotated structs, deterministic identity composers, same-name schema-derived types and the enforced JSDoc editions. Errors use branded `S.TaggedError`. Mutable legacy fields and arrays remain mutable.

The probes use structural cores to qualify APIs and encoding. They do not establish production annotation, identity or documentation compliance.

### 3.1 Boundary interpretation

| Boundary | Contract |
| --- | --- |
| Electron RPC | Explicit payload/result/error codecs; amendment preservation encoding for retained observations |
| MCP discovery | Frozen descriptors; never regenerated from Effect annotations |
| MCP protocol envelope | Existing SDK envelope acceptance before tool validation |
| MCP tool input | Existing strict Zod acceptance, defaults, trim/refinement/union order and issue text, reproduced with Schema |
| MCP output | Existing projector and JSON serialization; no new semantic result validation |
| Automation | Parse JSON once, then preserve existing property access, coercions and defaults |
| Extension | Route-specific manual/strict acceptance at its current position |
| Account response | Current validation/projector; unchecked branches remain unchecked |
| SQL | Query-shaped models supplied by the authoritative owner |
| Config files | Reader-specific acceptance and failure policy; malformed MCP credentials fail closed |

A retained observation is not a cast into a semantic domain type.

### 3.2 Queue observation contract

Automation currently forwards `input`, `priority`, `groupKey`, `parentId` and `maxAttempts` without semantic task validation (`M/local-api.ts:308–316`). Caller-supplied `id` is discarded; the returned `{id}` is preserved.

G’s semantic `TaskInput` requires a string URL and enumerated kind (`Task.model.ts:79–89`). `Task` embeds that input and further narrows priority/group/parent/max-attempt fields (`:173`). `TaskStoreShape` and snapshot events carry that same type. A permissive HTTP decoder cannot satisfy those interfaces by assertion.

P introduces an observation task with **all current task fields**. Fields derived from unchecked admission and successful raw pause reasons are widened, with required mutability retained:

```ts
const ObservationTaskView = S.Struct({
  ...Task.fields,
  kind: S.mutableKey(S.Unknown),
  input: S.mutableKey(S.Unknown),
  priority: S.mutableKey(S.Unknown),
  groupKey: S.mutableKey(S.Unknown),
  parentId: S.mutableKey(S.Unknown),
  maxAttempts: S.mutableKey(S.Unknown),
  statusReason: S.mutableKey(S.Unknown)
})

const ObservationTask = RpcObserved(ObservationTaskView)

const ObservationTransition = S.Struct({
  ...TransitionEvent.fields,
  reason: S.mutableKey(S.Unknown)
})

const ObservationTransitionContext = S.Struct({
  ...TransitionContext.fields,
  reason: S.Unknown.pipe(S.optional, S.mutableKey)
})

const ObservationPersistTransition = S.Struct({
  ...PersistTransitionInput.fields,
  task: S.mutableKey(ObservationTaskView)
})

const ObservationEvent = RpcObserved(S.Union([
  S.Struct({
    ...SnapshotChangedEvent.fields,
    task: ObservationTaskView
  }),
  ObservationTransition,
  ProgressEvent,
  TaskRemovedEvent,
  OrphanKilledEvent,
  ErrorClassifiedEvent,
  LogEvent
]))
```

`ObservationTaskView.statusReason` and `ObservationTransition.reason` preserve successful raw values, including `17`, `false` and `0`. Undefined pause input retains the default `"user"` (`G TaskQueue.layer.ts:688`); transition construction retains `reason ?? null` (`G fsm/index.ts:82`). Do not coerce scalar reasons to strings. The transition context, pending-pause map (`G TaskQueue.layer.ts:83`, `:703`), persistence adapters and observation outputs carry the same raw reason, retaining mutable fields and arrays. Check observation closure at operation outputs, not only admission inputs.

The type-side view verifies owner-created metadata without reconstructing the retained input. The wire side preserves input keys, nested values, ownership and numeric identity.

| Interface | Exact affected contract |
| --- | --- |
| Add | `{input:unknown,priority?:unknown,groupKey?:unknown,parentId?:unknown,maxAttempts?:unknown}` → `Effect<{id:string}, QueueError>` |
| Get | `(id:unknown)` → observed task or undefined |
| List | Optional `{status?:unknown,groupKey?:unknown,parentId?:unknown,limit?:unknown,cursor?:unknown}` → observed tasks and current `string|null` cursor |
| Cancel | `(id:unknown)` → existing void/error result |
| Pause | `(id:unknown,reason?:unknown)` → existing void/error result; undefined defaults to `"user"`; successful raw reason survives transition, persistence, task read and snapshot |
| Transition context / pending pause | Mutable optional raw `reason`; one existing pending-pause map stores raw values; existing nullish-to-null construction |
| Resume, retryManual, removeFromHistory | `(id:unknown)` → existing void/error result |
| Global concurrency | `(n:unknown)` → existing void/error result |
| Per-group concurrency | `(group:unknown,n:unknown)` → existing void/error result |
| Stats | Current `TaskQueueStats` |
| Subscribe | Synchronous ordered observation-event callback and existing unsubscribe semantics |
| Store get/has/remove/snapshot | Accept the observation lookup key; retain current equality/index semantics |
| Store insert/update | Observation task; same duplicate/missing errors |
| Store list | Observation options and observation page |
| Persistence writes | Observation task serialization at the existing write boundary |
| Persistence reads | Existing semantic stored-read codec and existing malformed-versus-invalid policy |
| Executor selection | Observe current kind/input at the existing selection point; no earlier whole-task decoder |
| Domain executor input | Decode only the guarantees actually required at that executor’s old interpretation point |

Unknown kinds or absent URLs must not acquire an earlier rejection. The existing later failure remains a later failure. Engine-error text outside declared types need only fail where the plan permits that qualification; successful wrong-kind/null/NaN behavior remains owed.

The queue still owns one store, scheduler, event bus, admission map and persistence implementation. Strict authored admission remains assignable to the broadened entrance. Reads that can encounter malformed admitted tasks cannot continue claiming an unconditional semantic `Task`.

The complete task shape, observation events, store/queue interfaces and strict-input adapter direction compile in `probes/QueueObservation.service.ts` against real package declarations. `revision3-queue.mjs` exercises the real `TaskStore` Layer’s insert/get/list/snapshot and all seven proposed event variants through the JSON codec.

That evidence does **not** prove queue admission, persistence, executor or facade remediation. P must land those implementations and their independent differential tests before dependent activation.

### 3.3 MCP DTOs

| Model | Fields |
| --- | --- |
| Status | `enabled:boolean`, `running:boolean`, `url:string|null`, `configPath:string`, `toolCount:number`, `httpConfig:string` |
| Capability | `name`, `labelKey`, `description`: strings |
| Capability group | `id:string`, `kind:tools|resources|prompts`, ordered `items` |
| Credentials | `enabled:boolean`, token matching `/^[a-f0-9]{64}$/` |
| Published document | Ordered `{version:1,enabled,token,url,pid}`; pid null when endpoint null |

`httpConfig` intentionally exposes the MCP bearer to the trusted Settings renderer. It is absent from ordinary HTTP status, MCP tool output and logs.

### 3.4 Account application observations

The models follow `auth-client.ts`’s real validators and projectors.

| Value | Acceptance and projection |
| --- | --- |
| User | Copy email/id/name; image nullish → null |
| Credit bucket | Five number-kind fields: expiringSoon/quota/remaining/reserved/used |
| Credit usage | Bucket plus number-kind prompt/transcription usage; optional granted/purchased buckets |
| Required credit numbers | Preserve negative numbers, NaN, infinities and negative zero |
| Interrupted/reconciling credits | Finite number → `Math.max(0,value)`; otherwise own undefined property |
| Reservations | Array ≤50; requestId string ≤128, including empty; reserved/reconciling; nullable taskLabel; six nonnegative safe-integer amount/time fields |
| Recovery time | Absent/undefined/null/nonnegative safe integer accepted; projector returns own `recoveryStoppedAt`, including undefined |
| History cursor | Nonnegative safe-integer `at`; id string length 1–256; retain complete accepted object |
| Receipt | Four strings ≤256; four nullable strings ≤1,024; nonnegative safe-integer amounts/time/token counts; refunded ≤ credits; retain complete accepted object |
| History | Items ≤50 and required nextCursor, cursor or null |
| Snapshot | Outer object with credits/reservations; invoke existing nested projectors |
| Overview | Snapshot first; truthy invitationOverview; invited/gifted items arrays; preserve those branches unchanged |
| Invitation overview/pages and cache stats | Unchecked response observations |

Receipt fields are `id`, `requestId`, `feature`, `status`, `createdAt`, `credits`, `refundedCredits`, `taskLabel`, `basis`, `pricingVersion`, `model`, `inputTokens`, `outputTokens` (`auth-client.ts:217–239`).

Negative zero is valid even in safe-integer fields. A private codec must preserve it.

Invitation pagination has two input categories:

- Deliberately authored nominal cursors are strings.
- Cursors retained from unchecked responses are observations.

The renderer’s Load More truthiness check remains unchanged. A retained numeric `17` or boolean `true` must reach Cloud as that value (`AccountPanel.tsx:555`, `:690–708`; `auth-client.ts:375–392`). The RPC must not narrow it to string.

### 3.5 Account preservation codecs

Import the foundation’s `RpcOptional`, `RpcObserved` and `ObservedValue`. Do not implement account-local sentinel or recursive codecs.

```ts
const AccountCredits = RpcObserved(CreditUsageView)
const AccountReservations = RpcObserved(ReservationsView)
const AccountSnapshot = RpcObserved(SnapshotView)
const AccountHistory = RpcObserved(HistoryView)
const AccountOverview = RpcObserved(OverviewView)
const AccountPassthrough = ObservedValue

const HistoryInput = S.Struct({
  cursor: HistoryCursorView.pipe(RpcObserved, RpcOptional)
})

const InvitationPageInput = S.Struct({
  cursor: RpcOptional(ObservedValue)
})
```

`RpcObserved(view)` checks type-side guarantees and serializes the retained observation recursively. It does not rebuild it through the view’s field order or transformations.

| Observation | Required preservation |
| --- | --- |
| Omitted field | Remains omitted |
| Own undefined | Remains an own undefined property |
| Null | Remains null |
| `-0`, NaN, infinities | Numeric identity restored |
| Cursor/receipt extras | Retained recursively |
| Object key order | Retained, including the order used by the next Cloud request body |
| Marker-shaped user object | Ordinary retained data |
| Unsupported graph | Foundation typed admission/encoding failure; no silent stripping |

The account census includes safe-integer fields, cursor extras, receipt extras, unchecked branches and values returned and subsequently submitted. `S.Unknown` through default JSON is insufficient.

`revision3-wire.mjs` uses actual source-extracted account projectors and the complete amended RPC schemas. It checks property ownership, `Object.is`, recursive exceptional values, cursor order and the next outbound Cloud body.

### 3.6 Extension observations and external JSON

Extraction observations and external JSON projections are separate contracts.

| Model | Contract |
| --- | --- |
| Overview input | Open accepted object: requestId/sourceUrl/transcriptText and optional languages/origin/forceRegenerate |
| Overview snapshot | Status, text, nullable error/errorCode, thinking, thinkingMs, updatedAt |
| Transcript input | Open accepted requestId/sourceUrl/language/refresh object |
| Extraction observation | Title, author, duration, tracks, selectedTrackId, segments, status/error fields and actual extras, including `cookieSources` |
| Transcript job snapshot | Retained extraction observation or current empty/error snapshot; no finite-number strengthening |
| External transcript JSON | Current JSON serialization: non-finite numbers become null; undefined object members disappear |
| Chat source | Source URL/title/duration, optional language, auto and ordered start/end/text segments |
| Chat state | Catalog revision, catalog and nullable thread; conversation sequence remains distinct |
| Browser file/video results | Existing `{name,dataUrl}` and `{videos,nextCursor}`; no local paths |
| Chat event | Snapshot/agent/settings/task with existing optional source and redactions |

The snapshot preservation boundary is `RpcObserved` over an open view. The HTTP boundary uses the existing JSON projection. A closed transcript DTO would erase `cookieSources`; finite duration/segment schemas would reject values currently serialized as null.

Evidence: `remote-captions.ts:125–149`, `:240–249`; `extension-transcript.ts:99–120`, `:192–194`. `revision3-wire.mjs` checks retained cookie sources and infinity-to-null HTTP behavior.

Overview retains its request-ID regex, nonblank transcript ≤1,000,000 characters, source URL ≤2,048 and existing public-source predicate, optional languages ≤64 and current origin/boolean checks (`extension-overview.ts:57–101`). Unknown fields participate in identity.

Transcript requestId is validated but excluded from identity. Language trimming occurs at its current interpretation point (`extension-transcript.ts:42–75`, `:155–158`).

Chat commands retain their current per-command validation. Cards retain strict request schemas and conversation-reference checks. URL validation stays syntactic; no DNS lookup or new SSRF policy is introduced.

## 4. Errors

Main-only failures retain the original host value in foundation `OriginalFailure` until boundary mapping. `DesktopAccount` carries `AccountOperationError | OriginalFailure`; `DesktopMcp` and `McpConfiguration` carry `McpOperationError | OriginalFailure`. Device operations carry recognized original failures, including foreign parser, network, storage and non-Error values. Legacy facades unwrap only the recognized carrier and restore the original value/class/message/identity; no arbitrary cause-chain unwrapping or side table is permitted. Only the RPC handler converts this channel into the declared public error inside `Completion`. Browser errors contain operation and exact public message. They do not serialize arbitrary native objects, credentials, complete bodies or cookies.

| Error | Role |
| --- | --- |
| `McpOperationError` | MCP Settings operation/message |
| `AccountOperationError` | Account operation/message |
| `IntegrationHostFailure` | Main-only original value and legacy message |
| `IntegrationDecodeFailure` | Boundary and content-free issue |
| `LocalApiFailure` | Internal status/operation/message before HTTP formatting |
| Foundation `OriginalFailure` | Recognized original-failure carrier |
| Foundation `DeliveryError` | Outer transport/registration/delivery failure |
| Foundation `JsonSyntaxFailure` | Original parser exception |

Application failures appear inside `Completion`; delivery failures remain outside it.

### MCP protocol and tool errors

| Producer | Observable result |
| --- | --- |
| Unknown tool, `mcp/server.ts:159–162` | InvalidParams message `MCP error -32602: Unknown tool: <name>` |
| Invalid prompt, `server.ts:210–219` | `MCP error -32602: A known prompt and its required argument are needed` |
| Unknown resource resolver plus wrapper, `server.ts:138`, `:192–207` | `MCP error -32602: MCP error -32602: Unknown VidBeep resource URI` |
| Tool validation/application failure, `server.ts:165–176` | Successful JSON-RPC result with `isError:true` and sanitized text |
| Tool non-Error failure | `Desktop tool failed` |
| Resource non-Error failure | `Resource unavailable` |
| Error text | Existing sanitization and 4,000-character cap |
| `tools/call arguments:null` | SDK envelope rejection before tool execution |
| Transport/body/access failure | Section-8 JSON-RPC transport envelope |

The SDK constructor supplies its prefix. Do not prepend it twice except where the existing nested resource path does so. `semantics.mjs` exercises actual SDK constructors and outer null rejection.

### MCP handler-owned messages

| Producer | Exact text |
| --- | --- |
| `task-tools.ts:81` | `customDownloadPath must be an absolute path` |
| `task-tools.ts:88` | `Subtitle-only downloads accept url, type, title, language, format and customDownloadPath` |
| `task-tools.ts:121` | `language requires type: subtitles` |
| `ai-tools.ts:32` | `Agent thread not found: <threadId>` |
| `ai-tools.ts:123` | `Message not found` |
| `ai-tools.ts:147` | `Media task not found` |
| `ai-tools.ts:191`, `:200`, `:204` | `title is required`; `messageId is required`; `Unknown conversation action` |
| `ai-tools.ts:248` | `A non-empty transcript is required` |
| `transcript-tools.ts:63` | `No transcript is available. Start transcription and wait for completion, or select an available caption source.` |
| `transcript-tools.ts:155` | `All media paths must be absolute` |
| `transcript-tools.ts:191`, `:198`, `:203`, `:207` | `speakerCount is required`; `key is required`; `tier is required`; `Unknown transcription action` |
| `transcript-tools.ts:293` | `A local source video is required` |
| `transcript-tools.ts:309`, `:312` | Existing returned `message` or `reason` |
| `transcript-tools.ts:329` | `tier is required` |
| `export-tools.ts:63`, `:79` | `Media task not found: <downloadId>`; `Agent conversation not found` |
| `export-tools.ts:87`, `:91` | `A non-empty assistant reply is required`; `Wait for this assistant reply to complete before exporting` |
| `export-tools.ts:122` | `imageCount requires imageMode=pages` |
| `export-tools.ts:270–277` | `diagramIndex <index> is out of range; this reply contains <count> Mermaid diagrams (zero-based)`; `This assistant reply contains no Mermaid diagrams`; `A Mermaid diagram must contain between 1 and 100000 characters` |
| `export-tools.ts:327–337` | `No transcript is available`; `Every segment must belong to the selected transcript source`; `Choose at least one caption segment` |

Schema issue text and borrowed capability failures remain separate producer families. Their exact fixtures must be recorded; replacing them with generic Schema diagnostics is not permitted.

### Account and device errors

| Exact text | Producer |
| --- | --- |
| `Unable to load account data.` | Account RPC non-OK response, `auth-client.ts:148–156` |
| `The AI credit response is invalid.` | Credit projector, `:300–307` |
| `The AI reservation response is invalid.` | Reservation validation, `:198–200` |
| `Invalid AI credit history cursor.` | Before request, `:260` |
| `The AI credit history response is invalid.` | History response, `:267–274` |
| `The AI credit snapshot is invalid.` | Snapshot outer validation, `:329–340` |
| `The account overview response is invalid.` | Overview checks after snapshot, `:350–365` |
| `Invalid AI request ID.` | Cancellation validation, `:279–282` |
| `Unable to cancel the AI task.` | Cancellation response status, `:290–293` |
| `Cache statistics are unavailable.` | `account-service.ts:55–64` |
| `Secure device storage is unavailable.` | `cloud-device.ts:54–60` |
| `Device challenge failed.` | `cloud-device.ts:83–90` |
| `Could not save feedback. Please try again.` | `cloud-device.ts:114–129` |
| `enabled must be a boolean` | Old MCP invoke guard, `mcp-service.ts:24–27` |

Filesystem, crypto, Better Auth, HTTP and body failures preserve their original facade behavior. New callers receive the declared boundary mapping.

### HTTP and extension errors

| Producer | Exact text or family |
| --- | --- |
| Outer guard, `local-api.ts:434–609` | `Forbidden`; `Forbidden host`; `Forbidden origin`; `Missing URL`; `Method not allowed`; `Not found` |
| Automation, `local-api.ts:215–424` | `Unauthorized`; `Unknown automation op: <op>`; `Unknown subscriptions op: <op>`; fallback `Invalid request body`; `Automation handler failed`; `Subscriptions handler failed` |
| Token/video, `:520–580` | `Extension origin required`; `Too many pending extension handshakes`; `Invalid token`; `Missing url`; `Failed to fetch video info` |
| Body reader, `:124–146` | `Request body too large`; original JSON syntax diagnostic |
| Outer catch, `:605–609` | Error.message or `Unhandled request error` |
| Cookies, `extension-cookies.ts:236–373` | `Invalid start token`; `Invalid connect payload`; `Too many extension sessions`; `Extension session expired`; `Invalid cookies payload`; `Unknown cookie request`; `Cookie domain outside requested scope` |
| Overview, `extension-overview.ts:202–265` | `Invalid overview input`; `Request identity changed`; `Too many overview requests. Wait for a running overview to finish.`; `Overview session expired` |
| Transcript, `extension-transcript.ts:120–208` | `Invalid transcript input`; `Too many caption requests. Wait for a running extract to finish.`; `Transcript session expired`; `Cancelled`; fallback `Caption extract failed`; errorCode `network` |
| Chat route, `extension-chat.ts:303–473` | `Invalid video captions`; `Chat session expired`; `Too many chat connections`; `An export is already running`; `Unknown chat endpoint`; `Invalid chat command`; fallback `Desktop chat failed` |
| Chat body/media, `:70`, `:420–448` | `Request is too large`; `Invalid attachment`; `Attachment is too large to show in the browser`; `Attachment unavailable` |
| Chat state, `:196–239` | `Conversation no longer exists`; `Skill is no longer available` |
| Chat actions, `extension-chat-actions.ts:31–208` | `Invalid assistant reply`; `Assistant reply is unavailable`; `Wait for this reply to finish`; `A non-empty assistant reply is required`; `Export is too large to download in the browser`; `Invalid chat action`; `Invalid model`; `Invalid image upload`; `This reply was not generated by Cloud`; `Invalid export options`; `Unknown chat action` |
| Cards/admission | `Conversation is unavailable`; `Task is not referenced by this conversation`; `Request identity changed` (`extension-chat-cards.ts:41–45`, `extension-chat-requests.ts:25`) |

Borrowed download/subscription/transcription/AI/export failures keep their owner’s mapping. MCP sanitization does not apply to generic HTTP errors.

`JsonSyntax.parse` parses once and preserves the original exception. Strict code does not reject with Schema and then reparse to manufacture native text. Foundation supplies the narrow unported parser injection and owns its phase-10 removal obligation. A `.driver.ts` filename grants no native-JSON exemption.

## 5. RpcGroups, reply cuts and streams

### 5.1 Foundation binding

Import `Completion`, `Subscription`, `Token`, `Registered` and `Cut` from `S/DocumentDelivery.model.ts`, `DeliveryError` from `S/DocumentDelivery.errors.ts`, and preservation codecs from the foundation modules.

Every unary uses:

```ts
Rpc.make("Capability.Operation", {
  payload: Payload,
  success: Completion({
    success: Result,
    error: OperationError
  }),
  error: DeliveryError
})
```

Application services expose inner results. The handler captures success or application failure, maps a recognized main-only original failure once to `AccountOperationError` or `McpOperationError` inside `Completion`, and attaches the operation’s cuts on both exits. The renderer awaits those cuts before exposing the inner result/error. No application failure bypasses cuts through the outer error channel.

Cuts concern observations published before this invocation’s completion boundary. They do not wait for future terminal work. They do not form a document-wide fence or receipt RPC.

### 5.2 Actual declarations

```ts
const InitialAccountRead = S.Struct({
  creditsToken: RpcOptional(Token)
})

const McpRpcs = RpcGroup.make(
  Rpc.make("Mcp.GetStatus", {
    success: Completion({
      success: McpStatus,
      error: McpOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Mcp.GetCapabilities", {
    success: Completion({
      success: CapabilityGroups,
      error: McpOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Mcp.SetEnabled", {
    payload: { enabled: S.Boolean },
    success: Completion({
      success: McpStatus,
      error: McpOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Mcp.RotateToken", {
    success: Completion({
      success: McpStatus,
      error: McpOperationError
    }),
    error: DeliveryError
  })
)

const AccountRpcs = RpcGroup.make(
  Rpc.make("Account.GetOverview", {
    payload: InitialAccountRead,
    success: Completion({
      success: AccountOverview,
      error: AccountOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Account.GetAiCreditSnapshot", {
    payload: InitialAccountRead,
    success: Completion({
      success: AccountSnapshot,
      error: AccountOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Account.GetAiCreditHistory", {
    payload: HistoryInput,
    success: Completion({
      success: AccountHistory,
      error: AccountOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Account.GetCacheStats", {
    success: Completion({
      success: AccountPassthrough,
      error: AccountOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Account.GetAiCredits", {
    payload: InitialAccountRead,
    success: Completion({
      success: AccountCredits,
      error: AccountOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Account.GetAiReservations", {
    success: Completion({
      success: AccountReservations,
      error: AccountOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Account.CancelAiReservation", {
    payload: { requestId: S.String },
    success: Completion({
      success: ObservedValue,
      error: AccountOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Account.GetInvitationOverview", {
    success: Completion({
      success: AccountPassthrough,
      error: AccountOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Account.GetInvitedUsers", {
    payload: InvitationPageInput,
    success: Completion({
      success: AccountPassthrough,
      error: AccountOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Account.GetGiftedCreditRecords", {
    payload: InvitationPageInput,
    success: Completion({
      success: AccountPassthrough,
      error: AccountOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Account.WatchCreditsUpdated", {
    success: Subscription(ObservedValue),
    error: S.Union([AccountOperationError, DeliveryError]),
    stream: true
  }),
  Rpc.make("Account.WatchAuthContinue", {
    success: Subscription(ObservedValue),
    error: S.Union([AccountOperationError, DeliveryError]),
    stream: true
  })
)
```

The three `ObservedValue` positions carrying void have application value undefined. Their use preserves that required value through JSON; it does not expand the operation’s application result contract.

These declarations construct and typecheck in `probes/Revision3.entry.ts`. `revision3-wire.mjs` exercises each actual unary success/failure schema and each actual stream element/error schema through `RpcSerialization.json.codecFor`.

### 5.3 Operation dependency families

Family names identify existing observation owners:

| Family | Existing publication source |
| --- | --- |
| `account.credits` | `account:credits-updated` sends |
| `account.auth` | `auth:continue` sends |
| Downloads | D1’s downloads/task observation publication |
| Subscriptions | D2’s subscription invalidation publication |
| Transcripts/models | D3’s transcript and ASR/model publications |
| Agent/prompt/catalog | D4’s conversation, prompt and catalog publications |
| Settings | Foundation settings publication |

Borrowed family identities are imported from their owning phase, not duplicated string registries.

| Operations | Dependency families for reply cuts | Reason/source |
| --- | --- | --- |
| All four MCP Settings RPCs | **None** | Credential/status/capability operations publish no renderer observation before returning; `mcp-service.ts:11–42`, `mcp/config.ts:25–115`. Closing external protocols is awaited where specified, but is not a renderer family. |
| Account overview/snapshot/credits/reservations/history | **None** | Cloud read and projection produce no local invalidation; `auth-client.ts:136–275`, `:298–369`. |
| Account invitation overview/pages/cache | **None** | Unchecked read results do not publish local events; `auth-client.ts:370–392`, `account-service.ts:55–64`. |
| Cancel reservation | **None** | POST status acknowledgement produces no local credits send; caller refresh is separate, `auth-client.ts:279–294`. |
| Auth setup, callback exchange, protocol registration | **None at the account-service boundary** | Better Auth bridge publications retain their own existing protocol; main continuation notification is a distinct producer, `auth-client.ts:401–439`, `index.ts:312–343`. |
| Sign Cloud request / dislike result | **None** | Device challenge/proof/feedback operations do not publish account invalidations; `cloud-device.ts:77–130`. |
| Renderer-ready flush | `account.auth`, then `account.credits`, plus existing foundation/dependency flushes | Main performs deep links → auth → credits → starts media-import flush, `index.ts:281–294`. |
| Direct continuation/credit deep link | Corresponding account family, only at the actual active-main send point | `index.ts:312–343`. |
| Cloud transcription success | `account.credits` at each of the two existing send points | Success send and outer finalizer send, `cloud-transcription.ts:42–48`, `:111–119`. |
| HTTP status/token/health/handshake/stats/get/list | **None** | Read/access/descriptor operations have no renderer publication, `local-api.ts:215–333`, `:520–602`. |
| Automation add/control/limits/removal | Downloads, restricted to publications actually emitted before the awaited queue operation settles | `local-api.ts:308–354`; G `TaskQueue.layer.ts:538–610`, control operations. No future executor completion cut. |
| Automation subscription operations | Subscriptions; Downloads additionally for linked-task cancellation/admission | `local-api.ts:388–418`, `subscriptions-host.ts:192`; owning D2 completion policy governs. |
| Overview start/cancel | Agent/prompt family only where the D4 call publishes before admission/cancel returns; job-map changes themselves have no renderer family | `extension-overview.ts:202–280`. |
| Transcript start/read/cancel | **None for the extension-job owner** | It stores/polls a private job and requests child kill; no desktop transcript publication is added, `extension-transcript.ts:99–208`. |
| Chat source connect | Downloads/transcripts only for actual source-import publications before resolution; Agent/catalog for actual conversation publication | `extension-chat-source.ts:12–123`, `extension-chat.ts:303–347`. |
| Chat create/send/select/rename/delete/stop/branch/approval/image operations | Agent/catalog and any existing Settings publication reached by that operation | `extension-chat.ts:183–269`; D4 owns the exact pre-admission publications. |
| Chat model action | Settings/Agent catalog where current model selection publishes | `extension-chat-actions.ts:161–166`. |
| Chat feedback | **None** | Device feedback has no local notification, `extension-chat-actions.ts:186–192`. |
| Chat read/options/tasks/videos/media/export | **None unless the called owner’s existing operation publishes** | Read/file/export paths introduce no new invalidation; `extension-chat.ts:355–448`, cards/actions delegates. |
| Extension clear/expiry/prune | **None for desktop state** | Release private jobs/sessions/streams; persistent conversation state remains. |
| Cookie operations | D1’s existing cookie/settings families at their existing publication points | `extension-cookies.ts:131–183`, `:236–373`; no integration-local family. |
| Local API start/stop | **None for renderer state** | Preserve explicit lifecycle and descriptor operations; no new status notification, `local-api.ts:626–710`. |

External HTTP and MCP replies do not acquire Electron envelopes or a renderer acknowledgement wait. Their adapters preserve the original publication-before-reply sequence directly. When the same application operation is called through renderer RPC, its capability owner supplies the applicable cuts.

The MCP operation census in section 8 identifies each tool’s borrowed dependency family. Reads have none because they project existing state without publishing; mutations inherit only their existing pre-reply publications.

### 5.4 Token-bearing initial reads and readiness

Account streams have one first element:

```ts
Registered {
  token,
  epoch
}
```

Installation is failure-atomic. Each release is registered before the next fallible step or synchronous publication. The renderer retains the main-issued token only after consuming `Registered`.

`Account.GetOverview`, `Account.GetAiCreditSnapshot` and `Account.GetAiCredits` accept an optional `creditsToken`. It is present only when the caller had a logical credits listener at the corresponding old call site. A call made before that listener exists sends no token. Main-only and legacy reads acquire no transport barrier.

A supplied token must be active for the authenticated document/client/generation and `account.credits` family immediately before the read begins. A cached family latch is insufficient. Stale, foreign or replaced tokens fail with `DeliveryError`; the read does not begin.

Other account/MCP unaries have no initial-read token requirement: their current call sites do not depend on installing one of these streams before reading.

The actual readiness producer remains `KernelGate` in `R/App.tsx:22–39`. Its effect sends readiness even when the kernel is unready and AppLayout is absent. Preserve that behavior.

The existing command is retained:

```ts
// app:renderer-ready private payload
const AccountReadiness = S.Struct({
  creditsTokens: S.Array(Token),
  authTokens: S.Array(Token)
})
```

I extends the existing helper/handler, not a second readiness channel. Legacy sends without the payload mean empty account-token lists.

The document invocation/registration owner records logical listener presence synchronously at the old registration point. At the old readiness point:

1. Capture the logical registrations that already exist.
2. Wait for their `Registered` values.
3. Send only their active tokens.
4. Main validates every supplied token before changing readiness state or clearing pending booleans.
5. If registration was replaced while waiting, reacquire the current token for the still-present logical registration. Never silently omit an obligation to make readiness succeed.
6. Preserve the existing flush order: deep links, auth continuation, credits, then start media imports.
7. With no logical account listener, send empty lists immediately. Pending booleans still clear and the absent listener still loses the event.
8. Later mounting does not replay an already-sent event.

Kernel-preparation startup must therefore remain capable of losing pending auth/credit events. Unconditionally waiting for future AppLayout registrations would change behavior.

`revision3-readiness.mjs` checks the actual source readiness position and flush functions, plus a local adapter using the amendment’s real active-token checks. It does not establish the production React/transport integration.

### 5.5 Stream behavior

| Property | Credits updated | Auth continue |
| --- | --- | --- |
| Value | Undefined invalidation | Undefined continuation command |
| Snapshot | None | None |
| Order | Source publication order per recipient | Source publication order per recipient |
| Coalescing | None | None |
| Capacity | 256 entries plus foundation byte/account budgets | Same |
| Overflow | Subscription exhaustion terminates that subscription; aggregate exhaustion follows the offending-client policy | Same |
| Replay | None | None |
| Absence | Event lost | Event lost |
| Physical lifetime | One document/family drain while logical credits listeners exist; release when the last listener leaves | One document/family drain until document destruction |
| Logical lifetime | Existing cleanup behavior | Effective leaked callbacks retained until document destruction |
| Cancellation | Release physical resources | Document destruction releases physical resources and retained callbacks |

Ordinary accumulating `AccountClient.query` pull atoms are not the event drain. Installed `AtomRpc.ts:229–243` calls `runtime.pull` without disabling accumulation; `Atom.ts:1538–1566` retains previously delivered elements. Use direct scoped AccountClient stream consumption through one document/family owner. `Stream.runForEach` dispatches each new element once to logical listeners in registration order; it stores no delivered-event history and never replays earlier observations to newly registered listeners. Consumer state stays separate. Credits registration/release follows actual listener presence; auth retains the approved logical callback multiplicity until document destruction. Retained transport entries and logical callbacks remain within foundation bounds.

The Protocol terminal path must work while the server waits for Ack. The frozen amendment’s implementation corrections are prerequisites, including ordinary observation envelopes, terminal arbitration and retirement of replaced-token obligations.

Auth callbacks run their synchronous prefixes in source order: open Settings, inspect bridge, initiate `getUser`. Each continuation is then independently owned. Awaiting all of `continueDesktopSignIn` inside a serial stream consumer is incorrect.

The old preload registers a wrapper; AppLayout removes the original callback (`preload/index.ts:19–26`, `app-layout.tsx:261–269`). Retain the effective mount/unmount/remount multiplicity. Reserve logical callbacks before registration, within the amendment’s 256-callback/256-KiB document limits. Detached continuations reserve their own invocation/operation capacity. Exhaustion fails visibly; it does not evict older callbacks.

### 5.6 Notification targeting

`AccountNotifications` delegates to `DesktopNotifications` with explicit recipients.

| Producer | Recipients/timing |
| --- | --- |
| Credit deep link | Active main window; existing pending boolean and readiness flush |
| Auth continuation | Activate main window; existing pending boolean; active-main send |
| Cloud success | Every nondestroyed BrowserWindow before accepted result returns |
| Cloud outer finalizer | Every nondestroyed BrowserWindow again |
| Pre-try session failure | No newly added send |

For each recipient, legacy forwarding remains at its original send point. Migrated encoding/admission failure is contained and cannot suppress a later legacy recipient. A migrated logical consumer uses one delivery path.

Cloud success still sends twice. Controller-level in-flight guards may coalesce resulting reads; transport must not coalesce the notifications.

## 6. Services, drivers and Layers

The principal contracts are `Context.Service` classes with deterministic identities.

| Service | Operations/state |
| --- | --- |
| `DesktopMcp` | getStatus, getCapabilities, setEnabled, rotateToken |
| `DesktopAccount` | Ten account unaries; one shared-read map |
| `DesktopAuth` | Better Auth initialization, bridge, callback/protocol operations |
| `CloudDevice` | Cached installation-key outcome, proof and feedback orchestration |
| `ExtensionOverviews` | start/get/cancel/clear; one job map |
| `ExtensionTranscripts` | start/get/cancel/clear; one job map |
| `ExtensionChats` | connect/read/command/action/events/clear; one session map |
| `DesktopLocalApi` | Explicit start/stop, port and listener state |
| `AutomationAccess` | One rotating global token/expiry |
| `ExtensionStartTokens` | One bounded origin-bound one-use token store |
| `McpConfiguration` | Lazy credential cache, endpoint, persistence/authorization |
| `DesktopMcpRegistry` | Ordered public registry over application services |
| `DesktopMcpRequests` | Accepted request protocols, membership, deadlines and access recheck |
| `AccountNotifications` | Stateless targeted adapter |

Main service error channels preserve originals until the boundary. The account service retains inner application types:

```ts
type MainAccountFailure = AccountOperationError | OriginalFailure
type MainMcpFailure = McpOperationError | OriginalFailure

class DesktopAccount extends Context.Service<
  DesktopAccount,
  {
    readonly getOverview:
      Effect.Effect<AccountOverview, MainAccountFailure>
    readonly getAiCreditSnapshot:
      Effect.Effect<AccountSnapshot, MainAccountFailure>
    readonly getAiCredits:
      Effect.Effect<AccountCredits, MainAccountFailure>
    readonly getAiReservations:
      Effect.Effect<AccountReservations, MainAccountFailure>
    readonly getAiCreditHistory:
      (cursor?: HistoryCursor) =>
        Effect.Effect<AccountHistory, MainAccountFailure>
    readonly getCacheStats:
      Effect.Effect<unknown, MainAccountFailure>
    readonly cancelAiReservation:
      (requestId: string) =>
        Effect.Effect<void, MainAccountFailure>
    readonly getInvitationOverview:
      Effect.Effect<unknown, MainAccountFailure>
    readonly getInvitedUsers:
      (cursor?: unknown) =>
        Effect.Effect<unknown, MainAccountFailure>
    readonly getGiftedCreditRecords:
      (cursor?: unknown) =>
        Effect.Effect<unknown, MainAccountFailure>
  }
>()($I`DesktopAccount`) {}
```

`DesktopMcp.getStatus`, `getCapabilities`, `setEnabled` and `rotateToken`, and fallible `McpConfiguration` operations use `MainMcpFailure`. `CloudDevice.signCloudRequest(body: Record<string, unknown>)` returns `Effect<Record<string, unknown>, OriginalFailure>`; `dislikeCloudResult(resultId: string)` returns `Effect<void, OriginalFailure>`. Deliberate device failures retain their existing messages in that recognized carrier. RPC adapters map the carrier to the declared public error inside `Completion`; legacy adapters restore its original foreign value. These declarations and both boundary adapters typecheck in `probes/Freeze.entry.ts`.

Nominal legacy invitation signatures remain strings; the strict observation-facing service also accepts values retained from unchecked responses.

| Extension operation | Result/completion |
| --- | --- |
| Overview start | `{id,token,snapshot}` after current admission prefix; not terminal prompt completion |
| Transcript start | `{id,snapshot,token}` after job registration and extraction start prefix |
| Overview/transcript get/cancel | Current snapshot; cancel does not imply native exit |
| Chat connect | Session plus current state after source/admission boundary |
| Chat command/action | Existing operation result/state boundary |
| Chat events | Exact SSE lifecycle |
| Clear | Existing private-resource cleanup; persistent content survives |

Capabilities contain id/origin/token. Route failures retain status/message internally.

### Main call graph

```text
Existing bootstrap / one application runtime
  ├─ foundation settings, windows, logging and native admission
  ├─ existing database handle → borrowed SqlClient
  ├─ D1 downloads/queue/history/metadata/cookies/capture
  ├─ D2 subscriptions
  ├─ D3 transcription/captions
  ├─ D4 conversations/prompts/artifacts/exports
  ├─ DesktopAuth → Better Auth driver
  ├─ DesktopAccount → HTTP primitives + shared-read owner
  ├─ CloudDevice → storage/crypto/machine identity/HTTP
  ├─ AccountNotifications → DesktopNotifications
  └─ DesktopLocalApi
       ├─ ordered peer/Host/Origin dispatcher
       ├─ MCP framing adapter → McpServer registry → owners
       ├─ automation HttpApi → observation queue/subscriptions
       └─ extension HttpApi → job/session/cookie owners

McpRpcs / AccountRpcs → toLayer handlers → DesktopRpcs
  → existing Electron Protocol

Legacy invoke/main facades → exact compatibility adapters
  → the same warmed owners
```

Main services do not call one another through loopback HTTP.

`Effect.tryPromise` is limited to genuine asynchronous third-party edges. Wrapping an old account workflow, extension handler or download facade in it does not port that workflow.

### Resources and settlement

| Resource | Scope/release |
| --- | --- |
| Listener | Explicit API lifetime and current stop sequence |
| MCP protocol | Per accepted request; isolated IDs; idempotent close |
| MCP request slot | Reserve before body read; release on current close/failure paths |
| Automation queue subscription | Server lifetime |
| Heartbeat | Existing client-presence lifetime |
| Extension tokens/jobs/sessions | Existing TTL/prune/clear points |
| Caption child/reaper | D3 ownership; kill request distinct from exit |
| Chat action abort | Existing response-close point after body read |
| Shared account read | Account owner through request/body/deadline/cleanup |
| Better Auth | Existing process initialization lifetime |
| Installation key | First outcome, including rejection, cached for process lifetime |
| Configuration files | Persistent, with file-specific publication policy |
| Export/temp files | Existing export owner’s cleanup and failure precedence |

Use Effect acquisition/finalization APIs. Never put JavaScript `try/finally` around `yield*`.

State and finalization observers must exist before an immediately completing fiber can run. Preserve intentional publication positions separately.

For account coalescing (`auth-client.ts:136–163`):

1. Read cookie.
2. Serialize body.
3. Construct key from cookie/route/body.
4. Return existing pending request if present.
5. Start the request’s synchronous host prefix.
6. Publish the shared pending entry.
7. Read status/body.
8. Delete the map entry in the existing finally position.
9. Preserve projection and outer async-adoption settlement.

A lifecycle cell may protect immediate completion without moving the public deduplication entry before the host prefix. Such an eager entry changes synchronous re-entry.

Legacy adapters preserve the named await/adoption/finally turns, `PreventSchedulerYield`, immediate callback prefixes and exit-observer settlement. Request interruption removes caller interest; it does not undo admitted work, token consumption, another shared reader or native work.

### Database-driver cutover

**`better-sqlite3` and the node driver must never access the same database file in one process.**

Phase 10 database/composition closeout owns the cutover. Phase 9.5 removes borrowers and supplies evidence.

Until then:

- Borrow the existing handle through `SqlClient`.
- Do not import node-driver value modules through service tags.
- Open no integration-owned connection.
- Release borrowed runtimes before closing the owned handle.
- Preserve transaction modes and synchronous SQL-only facade paths.

The cutover must inventory and retire every constructor, raw reference, prepared statement, Drizzle wrapper and migration path; stop admission, drain writers/native continuations, release and close the old handle, prevent reopening, then select the node driver once.

Both-client tests run in separate processes. Migration, persisted-content, rollback, startup/import timing and unchanged packaged goldens are required. A CLI in another process does not justify mixed-driver access in desktop.

The current database cache is installed before migrations succeed (`database.ts:20–38`). This phase adds no reset/retry behavior.

## 7. Renderer

`McpClient` and `AccountClient` use `AtomRpc.Service`, the existing Electron protocol Layer and `desktopAtomRuntimeFactory`. They share the document registry and memoized application Layer identities.

Account event streams use the direct scoped drain in section 5.5, not accumulating `AccountClient.query` pull atoms. One document/family owner consumes `Registered` and dispatches new observations to its ordered logical listeners without retained event history or replay to later listeners. Credits physical registration/release follows actual listener presence; auth retains its approved callback multiplicity until document destruction. Consumer state remains per consumer.

All calls use foundation `RendererInvocation.entry.ts`’s document invocation owner. It reserves before starting, installs the fiber before opening its start gate, settles each invocation independently, and settles pending callers on document destruction.

The superseded fresh-atom-default recipe is removed. Optional private result atoms are adapters beneath the invocation owner; they do not independently call `runPromiseExit` or own document teardown.

| Consumer | Preserved state/lifetime |
| --- | --- |
| MCP panel | Mount status/capabilities together; disposed guard, busy/config-open state; mutations replace status; no polling |
| MCP capabilities | Ordered translated search/count/expansion |
| Account panel | Per-mounted-panel user, credits, reservations, pages, retained cursors, errors/loading and request versions |
| Credit refresh | Existing per-version in-flight guard; overview can supply credit data |
| History invalidation | Existing JSON comparison and version increment only on change |
| Credit history | Expansion-triggered read, append-by-ID dedupe, version/cleanup guards; full cursor retained |
| Cancellation | Cancel then refresh; no optimistic removal or balance adjustment |
| Reservation clock | Existing 15-second presentation clock |
| `useCloudAccount` | Per-consumer state and existing weaker stale guards/overlap |
| Auth continuation | Ordered synchronous prefixes and independent continuations |
| Settings | Foundation optimistic snapshot/rollback |
| Cookie connection | D1’s owner/poller |

Polling remains completion-based: signed-in user, visible document, reserved credits and recoverable reservations; delay `min(240000, 60000 * 2 ** failures) + random * 1500`; stop automatic retries after five failures; focus/visibility/credit events reset the cycle; retain one-running-poll guard (`AccountPanel.tsx:480–539`).

Unmount stops scheduling/publication according to existing guards. It does not revoke a shared Cloud read.

Better Auth keeps `authenticate`, `getUser`, `onAuthenticated`, `onAuthError`, `onUserUpdated`, `requestAuth`, `signOut`, channel/storage project `vidbee-auth`, and browser-safe declarations. No renderer declaration derives types through main implementation.

No visual or localization change is selected.

## 8. Other consumers and external wire contracts

### 8.1 MCP catalog and operation census

Freeze the complete descriptors from current discovery and source. Preserve field/property order, `$schema`, required/default/bound/union structure, descriptions, annotations and output schema. Production owns compatibility data with source provenance; it does not import test fixtures.

Common input rules remain ID length 1–200; offset integer ≥0 default 0; limit integer 1–100 default 25; HTTP(S) URL ≤4,096 without embedded credentials.

Abort is checked before inner parsing and side effects (`mcp/tool.ts:48–52`). Inner nullish input defaults to `{}` only after protocol-envelope acceptance.

Dependency abbreviations below refer to section 5’s borrowed families. “None” means no publication-producing operation; mutation rows name the potential pre-reply families, restricted to the called owner’s actual publication points.

| Tool | Contract and acknowledgement | Dependencies/source |
| --- | --- | --- |
| `get_app_status` | Empty → version/platform/engine/extension/queue | None; `settings-tools.ts:13` |
| `get_settings` | Empty → public settings | None; `:26` |
| `update_settings` | Strict partial settings → updated/settings after existing writes | Settings; `:33` |
| `get_ai_settings` | Empty → AI snapshot | None; `:40` |
| `manage_ai_settings` | Existing action union → action result | Settings/Agent for mutations, none for reads; `:47` |
| `list_tasks` | Query/kind/status/group/parent/cursor/limit → tasks/nextCursor | None; `task-tools.ts:160` |
| `get_task` | ID → summary/detail/log/retry/children | None; `:170` |
| `get_queue_stats` | Empty → stats | None; `:181` |
| `create_task` | Advertised flat parameters, then strict task union → existing admission result | Downloads or Transcripts; `:188`, `agent-management-host.ts:108` |
| `download_media` | Existing download options → created/task after admission | Downloads; `task-tools.ts:194` |
| `download_batch` | 1–50 URLs/options → serial per-URL results/errors | Downloads; `:201–219` |
| `manage_task` | Pause/resume/cancel/retry/remove/rename/rename_file → summary/removal | Downloads; `:230` |
| `configure_queue_group` | Group and 1–64 or null → stats | Downloads if owner publishes; `:241` |
| `inspect_media_engine` | Status/formats/playlist/probe/update/repair → existing action result | None for reads; D1 kernel family for update/repair; `:251` |
| `list_download_history` | Query/status/offset/limit → sanitized page | None; task tools |
| `list_subscriptions` | Query/offset → page of 20, counts, no items | None; subscription tools |
| `get_subscription` | ID → rule/count, no items | None |
| `test_subscription` | URL → probe, downloadsTested false | None |
| `create_subscription` | Existing MCP patch/URL → tested creation | Subscriptions and actual admission Downloads |
| `update_subscription` | ID/patch → update/test result | Subscriptions |
| `remove_subscription` | ID → removed true | Subscriptions/Downloads cancellation |
| `refresh_subscription` | ID → subscription | Subscriptions/Downloads |
| `list_subscription_items` | IDs/offset/limit → items/total, no nextOffset | None |
| `queue_subscription_item` | IDs → queued/taskId | Downloads/Subscriptions |
| `list_transcripts` | Query/offset/limit → statuses | None; `transcript-tools.ts:104` |
| `get_transcript` | Paging/query/times/includeWords false → selected-source page | None; `:117` |
| `import_media` | 1–50 absolute paths → import result | Downloads/Transcripts at serial import points; `:149` |
| `start_transcription` | ID/force false/speakerCount → admission status | Downloads/Transcripts; `:160` |
| `manage_transcription` | Retry/cancel/rediarize/select_source/upgrade → status | Downloads/Transcripts/models; `:174` |
| `update_transcript_segment` | Existing text/time/speaker patch → status | Transcripts; `:211` |
| `insert_transcript_segment` | Position/text/speaker → segmentId/status | Transcripts; `:225` |
| `delete_transcript_segments` | 1–500 IDs → status | Transcripts; `:240` |
| `export_transcript` | Existing format/style/group/paging/defaults → page or file | None; `:248` |
| `export_subtitled_video` | ID/soft default or hard → export result | Owner’s actual task publications only; `:286` |
| `manage_asr_model` | Status/download/select/delete/tier → existing result | None for status; models for mutations; `:317` |
| `list_agent_threads` | Download/query/paging → descending-update page | None; `ai-tools.ts:63` |
| `get_agent_thread` | Paging/allBranches false → thread/messages, existing caps | None; `:86` |
| `get_agent_message` | Character paging/includeThinking false → slice/count/cursor | None; `:111` |
| `create_agent_thread` | Download ID → thread status | Agent/catalog; `:141` |
| `send_agent_message` | Text/thinking/retry input → admission status | Agent; `:152` |
| `manage_agent_thread` | Stop/rename/delete/branch → existing result | Agent/catalog; `:174` |
| `decide_agent_tool` | IDs/approved/remember false → submitted true | Agent/Settings where remembered; `:209` |
| `get_agent_events` | Thread/after 0 → ≤50 events/cursor/thread | None; `:224` |
| `start_ai_prompt` | IDs/force false → admission status/error | Prompt; `:241` |
| `get_ai_prompt_run` | Character paging → run projection without thinking | None; `:264` |
| `stop_ai_prompt` | IDs → stopped projection | Prompt; `:286` |
| `list_skill_results` | Download/paging → saved results | None; `export-tools.ts:157` |
| `export_skill_result` | IDs/format/image options → file | None; `:209` |
| `export_mermaid_diagram` | Index/format/theme → file | None; `:257` |
| `export_caption_share_image` | Download/1–100 segment IDs/options → PNG | None; `:320` |

Subscription tool source positions are `subscription-tools.ts:24–108`. Their application contracts remain distinct from desktop and automation projections.

Success is text `JSON.stringify({result:value ?? null})` plus `structuredContent:{result:value ?? null}`. Omit `isError` on success. Resource text contains the underlying value without the tool wrapper.

Resources remain ordered status/settings/tasks/subscriptions/ai, then templates tasks/{id}, transcripts/{downloadId}, agents/{threadId}. Preserve URI matching, decoded-ID validation, names/descriptions and MIME `application/json`.

Prompts remain `summarize_media(downloadId)`, `download_and_transcribe(url)` and `diagnose_task(id)`. Preserve descriptions, arguments and generated text. Required arguments are truthy and ≤4,096; do not add trim/URL parsing.

Server name remains `vidbee-desktop`; version is `app.getVersion()`; instructions/capabilities remain `mcp/server.ts:138–151`.

### 8.2 MCP HTTP

Preserve this order (`mcp/http.ts:56–132`):

1. No-store header.
2. Availability.
3. Bearer.
4. POST.
5. JSON content type.
6. Capacity.
7. Construct/reserve isolated protocol.
8. Body read.
9. Response-liveness check.
10. Membership/availability/bearer recheck.
11. Dispatch.
12. Idempotent cleanup.

| Condition | Status/message/header |
| --- | --- |
| Disabled/unavailable | 503 `Desktop MCP is disabled or unavailable` |
| Unauthorized | 401 `Unauthorized`; `WWW-Authenticate: Bearer realm="VidBeep Desktop MCP"` |
| Wrong method | 405 `Use POST for stateless Streamable HTTP`; `Allow: POST` |
| Wrong content type | 415 `Content-Type must be application/json` |
| 16 active requests | 429 `Too many concurrent MCP requests`; `Retry-After: 1` |
| Body >1 MiB | 413 `Request body too large` |
| 15-second body timeout | 408 `Invalid MCP request` |
| Other read/dispatch failure before response | 400 `Invalid MCP request` |
| Access changed during body | 401 `MCP access changed while reading the request` |

Envelope:

```json
{"jsonrpc":"2.0","id":null,"error":{"code":-32000,"message":"..."}}
```

Content type is `application/json`.

MCP bearer prefix matching is case-insensitive, suffix is untrimmed, comparison is constant-time after equal-length check, and enabled/live endpoint is required. Automation bearer handling remains different.

Disable/rotation closes protocol requests, not admitted jobs or the listener.

### 8.3 Loopback HTTP

Bind exactly `127.0.0.1`, trying 27100–27120 sequentially. Accepted peer observations remain `127.0.0.1`, `::1`, `::ffff:127.0.0.1`. Preserve Host parsing, duplicate-header handling and caller classification from `local-api-guard.ts`.

Dispatch order:

1. Peer guard.
2. Host/caller classification.
3. `/mcp`, CLI-only.
4. Verified extension CORS.
5. Chat, overview, transcript, cookie namespaces.
6. Generic OPTIONS.
7. Missing URL.
8. Automation namespace/CLI classification.
9. Token route.
10. Generic GET restriction.
11. Video-info/status/not-found.

General JSON is `application/json; charset=utf-8` plus no-store. Extension helper JSON is `application/json` plus no-store.

Trusted extension CORS remains:

```text
Access-Control-Allow-Origin: <verified origin>
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-VidBee-Extension
Vary: Origin
Cache-Control: no-store
```

Non-GET extension operations require matching actual Origin. Protected GET may use the trusted custom header alone. No wildcard or additional framework CORS policy is added.

`handleRaw` does not bypass query/header/path decoding or method routing. Server compatibility declarations omit those semantic requirements; an outer namespace dispatcher preserves precedence and delegates recognized operations to `HttpApiBuilder`. Separate client declarations may describe required client fields.

Unknown paths/methods must reach the same namespace logic. An authorized unknown automation POST parses its body before 404; unauthorized returns 401 first.

| Route | Contract |
| --- | --- |
| `GET /status` | Existing flags; browser/lastSeen included by truthiness |
| `POST /token` | Actual trusted Origin; ignored body; token/60000; capacity 128 |
| `GET /video-info` | Consume origin token before URL check; trim URL; formats nullish → [] |
| Health | GET only, no bearer; ok/schemaVersion/persistent |
| Handshake | POST only; parse valid JSON before rotation; empty body {}; arbitrary parsed value ignored |
| Events | GET check before bearer; exact SSE |
| Stats | GET plus bearer; raw stats |
| Other automation | Non-POST 404; POST bearer before body/operation |
| Add | Select five fields; discard request id; return queue `{id}` |
| Get | Null or `{task,projection}` |
| List | Forward status/groupKey/parentId/limit/cursor; nullish cursor → null; ignore query/kind |
| Controls | Await existing operation, then `{ok:true}`; retry means retryManual |
| Limits | Existing operation-specific interpretation; nullish per-group n clears |
| Subscription routes | Existing core list/get/resolve/add/update/remove/refresh/itemsList/itemsQueue, coercions and whole-body forwarding |

Automation uses its 64-KiB reader. Parse failure is 400; caught operation failure is 500.

The one-use discriminator is: valid token plus missing URL → 400 `Missing url`; reuse with URL → 401 `Invalid token`.

### 8.4 Extension routes and state

| Route/family | Contract |
| --- | --- |
| Connect | Consume one-use token before ≤16-KiB body validation; session/45000 |
| Cookie wait | Pending job or 25-second idle/sites; close cleanup |
| Cookies | ≤2 MB, ≤4,000 rows; current session/request/domain checks |
| Overview start | Consume before ≤2-MB input; `{id,token,snapshot}` |
| Overview read/cancel | Capability; reused desktop run is not stopped |
| Transcript start | Consume before ≤16,384-byte input; `{id,snapshot,token}` |
| Transcript read/cancel | Current snapshot; kill request then error snapshot, no exit wait |
| Chat connect | One-use token; source/download admission; session plus state |
| Chat read/command | Capability and current command interpreter |
| Chat events | Four streams/session; exact SSE |
| Options/model | Composer options; model result plus state |
| Images | 28,001,000-byte body; base64/name/thread checks; null result plus state |
| Feedback | Owned completed Cloud reply; null result plus state |
| Export | Existing input; browser files plus state; racy flag sequence retained |
| Tasks/videos | Existing strict inputs and ownership; no state member |
| Media | Artifact ownership/MIME/32-MB checks; dataUrl |

Overview: one-hour TTL, maximum 32; ID from origin/requestId; digest from JSON serialization of the complete accepted input. Preserve reuse/cancel/expiry.

Transcript: 30-minute TTL, maximum 16, ordinarily two running. Existing-ID refresh bypasses the new-job capacity branch. Preserve kill/replace and late-completion races.

Chat: one-hour TTL, maximum 32, existing oldest-expiry eviction and stream closure. Persistent conversations survive cleanup.

Export remains check flag → await body → set flag → unconditional clear (`extension-chat.ts:377–403`). Two held bodies can both enter. First completion can clear the flag while the second remains active, admitting a third.

### 8.5 External streams

| Stream | Contract |
| --- | --- |
| Automation registration | Write `event: connected\ndata: {"ok":true}\n\n`, then add client and install queue listener |
| Automation events | Synchronous source order; only snapshot-changed adds legacy projection; no snapshot/coalescing/replay |
| Automation heartbeat | `: heartbeat\n\n` every 15 seconds |
| Automation cleanup | Last client stops heartbeat; queue subscription remains until server stop |
| Automation overflow | Existing writes ignore backpressure and have no explicit byte cap |
| Chat registration | Subscribe task/agent/settings before initial snapshot |
| Chat ordering | Callback order; deletion sends agent then snapshot; settings sends snapshot then settings |
| Chat projection | Empty artifact/image paths; omitted posterPath |
| Chat capacity | Four streams/session; destroy when queued bytes plus next frame exceeds 32,000,000 |
| Chat reconnect | Fresh snapshot; no Last-Event-ID replay |
| Cookie long poll | D1’s pending-check/waiter/idle/close sequence |

Renderer RPC bounds do not silently replace external SSE behavior.

### 8.6 Files, startup and shutdown

| File/lifecycle | Contract |
| --- | --- |
| MCP path | Trimmed `VIDBEE_MCP_CONFIG`, otherwise sibling `mcp.json` |
| MCP read | Lazy cache; missing generates enabled credentials; malformed existing file fails closed |
| MCP write | Recursive mkdir0700; fixed `<file>.<pid>.tmp`; pretty JSON; write0600; non-Windows chmod; rename; cache next credentials after success |
| MCP endpoint | Change memory before persistence; failed write can leave memory changed |
| Automation path | First path cached; override/platform resolution unchanged |
| Automation data | Ordered version/schemaVersion/kind/host/port/tokenHash/tokenIssuedAt/tokenExpiresAt/pid/pidStartedAt/updatedAt/appVersion |
| Automation write | Direct pretty JSON, current directory/mode/chmod warning/swallow policy; no new atomic rename |
| Token publication | SHA-256 hash only; descriptor timestamps use current descriptor clock point |
| Removal | Existing force-remove/swallow behavior |
| Start | Bind/log → queue-start catch → descriptor catch → MCP catch → return port |
| Concurrent starts | No new mutex |
| Stop | MCP → automation unsubscribe/heartbeat/end → await listener close → clear extension jobs/sessions/cookies/tokens → remove descriptor → queue-stop catch |

MCP and automation credentials remain independent.

### 8.7 Extension generated client and CLI

Keep G’s `ExtensionHttp.requestJson(method,url,deadlineMs)` signature.

Generated calls use response-only mode plus exact request transformation. Preserve:

- Sequential 21-port scan.
- Any 2xx after the body attempt qualifies, regardless of body `ok`.
- Token failure ends the selected attempt.
- Bodyless token POST.
- Only application-added `X-VidBee-Extension`; browser controls Origin.
- Exact `?url=<encodeURIComponent(url)>&token=<encodeURIComponent(token)>` order.
- No new Accept/content-type/auth/body/retry/cache/redirect behavior.
- 800-ms status/token and 60-second metadata deadlines through body handling.
- Body failure → null before status interpretation.
- Timeout after observed headers uses that status with null body.
- Disabled trace propagation.
- Existing metadata/storage/TTL/icon/popup/navigation behavior.

Evidence: G `ExtensionHttp.layer.ts:38–73` and phase-8 controllers.

CLI retains `AutomationSession`, 60-second refresh slack, supplied/cached-token behavior, one 401 re-handshake retry for POST/stats, no handshake retry, separate add then get, unknown IDs, list fallbacks and 30-second deadline including body. The server comment does not create an RSS client.

### 8.8 Installed Effect mismatches

| Installed behavior | Adapter |
| --- | --- |
| Stock MCP HTTP admission/Accept requirements | Ordered compatibility ingress |
| Empty stock 405/415 | Existing JSON-RPC body/headers |
| Protocol negotiation/session behavior | Recorded SDK-compatible framing |
| Generated tool schemas | Frozen full descriptor data |
| Toolkit success `isError:false` | Direct compatible result omitting it |
| Toolkit input failure as InvalidParams | Existing tool-error result after envelope acceptance |
| Toolkit output validation | Existing projector/serialization |
| Unknown tool `Tool '<name>' not found` | Exact SDK-prefixed message |
| Resource/prompt matching/messages | Existing resolver and prefix layering |
| Additional advertised facilities | Do not advertise/expose |
| `handleRaw` early query/header/path decode | Permissive server declarations and late interpretation |
| Method router misses | Namespace catchall |
| Typed response stripping/reordering | Compatible value projection/encoding |
| Generated response decoding | Response-only |
| Generated query encoding | Exact URL transform |
| Trace defaults | Propagation disabled |
| Generic SSE formatting | Explicit existing frames/comments |
| Scoped server shutdown | Explicit current stop sequence |

Installed source locations include `McpServer.ts:1230–1289`, `:1371–1432`, `:2997–3019`, `:3329–3336`.

Use public `McpServer.addTool`, `callTool`, resource/template and prompt facilities. Compatibility framing must not become a second application registry.

Complete initialize/notification/ping/malformed/batch/cancellation/disconnect equivalence remains unproved.

## 9. Semantics table

Sections 5 and 8 supply the per-operation dependency census and external acknowledgement boundaries. This table records load-bearing races and interpretation rules.

| Operation | Current behavior and evidence | Producer after port |
| --- | --- | --- |
| MCP enable/disable/rotate | Persist first; enable does not wait for close; disable/rotate await close attempts, `mcp-service.ts:24–42` | DesktopMcp/config/request owner |
| MCP admission | Abort before inner parse; operation-specific admission reply, `mcp/tool.ts:48–52` | Compatibility validator/registered handler |
| Batch download | Serial admission; per-URL errors, `task-tools.ts:201–219` | MCP over D1 |
| Active cancel | Persist/emit cancelled before executor cancel; generally no finish-deferred wait, G `TaskQueue.layer.ts:653–685` | Existing queue |
| Pause during synchronous acquisition | Ignored unless active run or suspended-start state, G `:701` | Existing queue |
| Panic | Journal/fallback failures can supersede original error, G `:169–189` | Existing failure path |
| Retry due | Current retry-scheduled status is eligibility; no new attempt/deadline guard, G `:497` | Existing scheduler/queue |
| Retry callback failure | Captured now+1000, new sequence, G `RetryScheduler.layer.ts:46` | Existing scheduler |
| Completed social retry | May add with current settings and return true; not completed→queued, `download-facade.ts:679` | D1 |
| Information patch | Log-only no-op; rename separately mutates, `download-facade.ts:875`, G queue `:832` | Separate D1 operations |
| Subscription output | Desktop items/downloadId differs from core taskId and MCP no-items | D2 surface projectors |
| Missing update/null interval | Preserve missing result/current null interpretation | D2 |
| Forced refresh-all | Direct forced calls overlap; scheduler pending flag is narrower, G `Subscriptions.layer.ts:349` | D2/core |
| Automation add/list | Selected fields; request id discarded; query/kind ignored, `local-api.ts:308–333` | Observation owner |
| Unknown POST | Auth first; authorized malformed body fails before 404, `:281–303`, `:357` | H dispatcher |
| Automation expiry | Invalid only when now > expiresAt, `:110` | Access owner |
| Extension expiry | Expired at ≤now; wrong origin does not consume, `extension-token.ts:9–43` | Start-token owner |
| Video info | Consume before blank URL; trim afterward, `local-api.ts:545–580` | H/D1 |
| Overview identity/start | Full-input digest; register before prompt start; prefix before reply, `extension-overview.ts:210–259` | X/D4 |
| Overview reuse | Cancel/expiry does not stop reused desktop work | X |
| Transcript identity | Origin/sourceURL/trimmed language; requestId excluded, `extension-transcript.ts:155–158` | X |
| Transcript refresh/cancel | Existing-ID capacity bypass; kill then snapshot; late overwrite remains, `:160–207` | X/D3 |
| Extraction snapshot | Store result directly, including cookieSources; HTTP JSON handles non-finite values, `:112–115` | X projection |
| Chat admission | Lookup/digest/admit/insert in one synchronous transaction, `extension-chat-requests.ts:11–34` | D4 |
| Chat deletion/reuse | Cascade removes association; public request identity reusable | D4 |
| Chat export | Check/read/set/clear race, `extension-chat.ts:377–403` | X |
| Account request | Cookie/body/key before request; same pending key shares, `auth-client.ts:136–163` | A |
| Account history | Cursor validation before request; extras/order retained, `:241–275` | A/preservation |
| Invitation pages | Own cursor passed into `{cursor,limit:20}` without semantic check, `:375–392` | A |
| Cancel reservation | Trim only emptiness; send original ID; status-only wait, no explicit timeout, `:279–294` | A |
| Cache | Separate unchecked GET, no shared deadline/coalescing, `account-service.ts:55–64` | A |
| Readiness | KernelGate sends while preparation screen can exclude listeners, `App.tsx:22–39` | I/token-bearing bridge |
| Pending flush | Clear booleans at send; auth before credits; absent listener loses event, `index.ts:281–343` | Shared sink/I |
| Cloud notifications | Success send plus finalizer send; pre-try failure differs, `cloud-transcription.ts:42–48`, `:111–119` | I/D3 |
| Auth callback | Raw suffix after `#token=`, including empty; `auth-client.ts:407–428` | DesktopAuth |
| Auth renderer continuation | Settings prefix, then independent user read, `settings-navigation.ts:9–17` | Document invocation owner |
| Auth listener | Wrong callback removal retains multiplicity, `preload/index.ts:19–26`, `app-layout.tsx:261–269` | Logical document registrations |
| Installation key | First outcome including rejection cached; only ENOENT generates; exclusive create, `cloud-device.ts:54–80` | CloudDevice |
| Signing | Sorted-object digest; exact challenge array; SHA256/P256/P1363/base64, `:17–26`, `:77–111` | Pure policy/driver |
| Feedback | Signing failure falls back unsigned, `:114–130` | CloudDevice |
| Start/stop | Existing partial failures and close-before-extension-clear order, `local-api.ts:626–710` | H |
| Database initialization | Cache before migration success, `database.ts:20–38` | Existing database owner |

Matching final values is not settlement proof. Candidate tests must observe old await/adoption/finally positions, source publication and caller continuation.

## 10. Obligations for the later model

The later model moves behind these contracts. This phase introduces no aggregate, durable command receipt, outbox or model host.

The replacement must preserve:

- Surface-specific acceptance and projections, including successful wrong-kind observations.
- Admission versus terminal completion and synchronous prefixes.
- Queue cancel/pause/retry/no-op distinctions.
- Subscription desktop items/downloadId, core taskId, missing results, null interpretation, forced overlap and notification differences.
- Atomic task structural/progress writes, recursive deletion and relocation.
- Subscription item replacement, transcript replacement, chat persistence/sequence and extension admission transactions.
- Immediate service reads and existing live-only notifications.
- Conversation sequence and catalog revision independently of model position.
- Association cascade deletion and request-identity reuse.
- Current token/session/config lifetimes; historical records cannot recreate live credentials.
- Existing partial failure, late completion and restart behavior.

A service-owned committed outcome remains authoritative. Model recording cannot re-adjudicate or reorder it. If complete history is promised, adoption must supply recoverable ordered outcome capture, identity generation, immutable body, transaction/command identity, applied watermark and deletion rules. Best-effort audit absence cannot become a business decision.

Pure decisions move now at unchanged call sites:

| Decision | Placement |
| --- | --- |
| Peer/Host/Origin classification | Existing guard/origin modules |
| Token expiry/capacity | Access policy with explicit clock |
| MCP metadata/order/pagination/URI/prompt/error interpretation | MCP pure compatibility modules |
| Automation field selection/coercions/defaults | Boundary policy |
| Overview identity/reuse/digest input | Existing overview/reuse modules |
| Transcript identity/language/track/error choice | Existing transcript/shared modules |
| Chat projection/guards/reference selection | Existing delegates |
| Account validators/projectors/cursor/coalescing-key inputs | Account pure policy |
| Device digest ordering/challenge message | Device pure policy |

Moving a decision adds no await, transaction, fence, durable record or new captured input. Native acquisition, scheduling, publication, HTTP and continuation lifetime remain services.

## 11. Deliberate changes

No application behavior change is selected.

The foundation’s reviewed finite admission and typed delivery failures apply to the new Electron path. Private preservation encoding remains internal.

This phase does not select stricter automation, global account caching, export mutual exclusion, auth-listener repair, deduplicated Cloud notifications, transcript terminal fences, a start mutex, configuration regeneration, bounded automation SSE, new URL policy or changed JSON diagnostics.

An unavoidable difference requires an independently observed old/new example and a separate recorded decision.

## 12. Verification owed

### 12.1 Executed local evidence

The receipt is `probes/revision3-verification.json`. All seven commands exited zero:

```sh
node node_modules/tsrs/bin/tsrs \
  -p probes/tsconfig.revision3.json \
  --noEmit --incremental false --composite false

bun probes/revision3-wire.mjs
bun probes/revision3-lifecycle.mjs
bun probes/revision3-readiness.mjs
bun probes/revision3-http.mjs
bun probes/revision3-queue.mjs
bun probes/semantics.mjs
```

The TypeScript config extends V’s real base through the existing probe config, uses permitted bundled resolution/environment libraries, and retains diagnostic severities without suppressions. `rootDir` accommodates imported real package sources. Zero diagnostics are recorded in `revision3-run-0.txt`.

| Probe | Evidence | Limit |
| --- | --- | --- |
| `Revision3.entry.ts` and typecheck | Complete amended 14 unaries/two streams, account service and AtomRpc clients; imports real Effect APIs and amendment modules | Structural/API proof, not production standards acceptance |
| `revision3-wire.mjs` | Actual unary completion success/failure schemas, actual stream element/error schemas, real JSON codec/framing, source account projectors, presence/order/-0/extras/unchecked cursors/next Cloud body, transcript cookieSources and HTTP null conversion | No production handler or complete external protocol |
| `QueueObservation.service.ts` | Full task-derived observation contract, store/read/control/event signatures, strict-input adapter direction against real interfaces | Does not make unchanged package implementation satisfy widened outputs |
| `revision3-queue.mjs` | Real TaskStore insert/get/list/snapshot retains malformed task; observation task and all seven event variants round-trip | No queue admission/persistence/executor remediation proof |
| `revision3-lifecycle.mjs` | Amendment invocation owner: reverse completion, independent failure, pending document teardown; real registration checks reject stale/foreign token | No production React component or full transport |
| `revision3-readiness.mjs` | Actual KernelGate signal position; source flush order/boolean clearing; local token-gated adapter preserves empty-list loss and rejects replacement before flush | No packaged startup or candidate bridge integration |
| `revision3-http.mjs` | Installed raw-handler early decoding; two-use token discriminator including second error body; unknown POST auth and malformed-body precedence | In-memory Web handler, no Node raw headers/socket |
| `semantics.mjs` | Source auth overlap, source multiwindow credit sends, SDK prefixes/outer null rejection, source leaked listener behavior, original syntax carrier; export schedule model | Export is a schedule model; notifications are not full Cloud workflow |

The wire probe originally exposed a non-finite extraction-view failure; the retained extraction boundary was corrected to `RpcObserved` and the complete command rerun successfully. Construction/codec failure is not counted as a pass.

A closed-cursor-schema mutation is rejected by the comparison in `revision3-wire.mjs`. Broader mutation acceptance remains owed.

Older `Contracts.ts`, private-atom and local-Deferred registration results are pre-amendment API/component evidence. They do not prove the current completion, registration or invocation contracts.

### Final-review correction evidence

The freeze receipt is `probes/freeze-verification.json`. The corrected declarations in `QueueObservation.service.ts`, `Revision3.entry.ts` and `Freeze.entry.ts` typecheck with V’s real base settings, unchanged diagnostic severities and no suppressions. The freeze config adds the corrected direct-stream, main-service and boundary-adapter declarations to the existing declaration closure.

```sh
node node_modules/tsrs/bin/tsrs -p probes/tsconfig.freeze.json --noEmit --incremental false --composite false
bun probes/freeze-queue.mjs
bun probes/freeze-events.mjs
bun probes/freeze-errors.mjs
```

Real output (all exit zero; compiler produced no diagnostics or other output):

```text
A1 PASS: real queue/store/memory persistence/events; pause 17,false,0,null,undefined => 17,false,0,null,"user"; transition before snapshot; task/transition/snapshot codecs pass; old narrow task/transition codecs reject 17,false,0. Full operation closure remains IR-1.
A2 PASS: direct Stream.runForEach drain; 1024 delivered events, one in dispatch/zero retained history; ordered injected logical listeners, add/remove during delivery, no replay to late listener, scoped interruption releases source/listeners. Actual React/multiple-family lifecycle remains IR-2.
A3 PASS: source-extracted account parser rejects with identical SyntaxError; main OriginalFailure restores parser/network/storage/non-Error identity; account/MCP Completion codecs carry only public operation/message, no original. Full facade settlement/device workflows remain IR-3.
```

The six existing runtime commands in section 12.1 were rerun and also exited zero; `freeze-run-4.txt` through `freeze-run-9.txt` retain their output. A1 exercises the actual queue pause operation, store, event bus and memory persistence with injected scheduler/process edges, plus corrected transition-context/persistence codecs and narrow-codec negative controls. A2 qualifies the direct drain with an injected logical-listener registry and scoped source, not production React integration. Its retention count excludes the test’s assertion trace; the adapter holds no event history. A3 checks a source-extracted account parser failure, recognized carrier identity and actual account/MCP completion codecs; it does not establish full facade settlement or device workflows. IR-1–IR-3 remain mandatory.

### 12.2 Record on the current build before source changes

The following are **owed recordings**, not executed results.

| Recording/test owner | Required current-build observations |
| --- | --- |
| `McpCatalog.test.ts` / O catalog recorder | All 50 full descriptors/order, resources/templates/prompts/instructions/capabilities |
| `McpProtocol.test.ts` / O raw recorder | Initialize, notifications, ping, versions/Accept/content type, malformed envelopes, unknown methods/tools, batches, cancellation/disconnect |
| `McpLifecycle.test.ts` | Capacity/deadline/rotation/disable while body held; close duplication; admitted job survival |
| MCP schema oracle | Every field/default/refinement/union/excess key; exact issue text and handler-not-started traces |
| `LocalApiDispatch.test.ts` / O raw HTTP recorder | Peer/Host/header duplicates/origins; all method/path/namespace precedence; malformed authorized unknown POST |
| Queue observation differential | Raw null/scalar/unknown-kind values through admission, immediate reads, events, writes, executor selection and reload |
| `ExtensionAccess.test.ts` | Wrong-origin nonconsumption, exact expiry boundaries, consume-before-body/URL, second-use body |
| Extension owner tests | Identities, capacity/expiry, reused overview, refresh/cancel late outcomes |
| `ExtensionChat.test.ts` | Two held export bodies, overlapping exports, first clear and third admission; actual handler |
| `ExtensionChatEvents.test.ts` | Subscribe-before-snapshot, deletion/settings order, redaction, byte threshold and reconnect |
| `Account.test.ts` / `AccountWire.test.ts` | Cookie/body/key, ten-second lifetime, synchronous re-entry, shared callers, cleanup/settlement, all value distinctions |
| `AccountReadiness.test.ts` | Kernel-ready and preparation startup, listeners absent/present, pending flush and effective loss |
| `AccountNotifications.test.ts` | Cloud success/failure/pre-try failure; two live/destroyed windows; exact sends/order |
| Renderer source recorder | Real mount/unmount/remount, overlapping starts, stale/version guards, polling/jitter, cancellation-refresh order |
| `CloudDevice.test.ts` | Existing/missing/decrypt/exclusive-create key, cached rejection, basic_text, digest/signature and unsigned feedback |
| Descriptor/lifecycle tests | Exact bytes/modes, write/chmod/rename failures, partial memory changes, port exhaustion, concurrent start and stop ordering |
| CLI executable oracle | Add/get, unknown IDs, 401/re-handshake, descriptor/autostart sequencing |

### 12.3 Candidate integration tests

These require new implementation and cannot be described as old-build recordings.

| Test | Required proof |
| --- | --- |
| `IntegrationCodecCensus.test.ts` | Every production declaration, completion/failure/cut, stream Registered/observation/error, retained subtree and void/presence position through real `RpcSerialization.json` and production codecs |
| `AccountReadiness.test.ts` | Actual private readiness payload, authenticated active-token validation, held/replaced registration, no invented listener, empty-list loss |
| `AccountRenderer.test.tsx` | Actual invocation owner, reverse completion/failure, teardown while pending, real Registry/provider lifecycle |
| `AccountNotifications.test.ts` | Mixed legacy/new recipients, no duplicate logical delivery, migrated codec failure cannot suppress legacy |
| `ExtensionHttp.generated.test.ts` | Exact target/headers/body, response-only behavior, body-inclusive deadline and observed-status timeout |
| `DesktopIntegrationsComposition.test.ts` | One queue/store/account map/device-key owner/notification owner/database handle; strict graph closure |
| Foundation production regression suite | All frozen amendment implementation requirements, including observation envelopes, replaced-token cuts and all-release teardown |
| Package remediation suite | Actual widened owner and all D1–D4 adapters before activation |
| Packaged exercise | Real Electron Protocol, Settings/account/MCP panels, loopback/extension/CLI and cleanup on synthetic profiles |

### 12.4 Mutation and full gates

Independent old fixtures and candidate implementations receive the same raw input. Do not feed the old result into candidate decision code and compare the stored copy.

Named tests must kill:

| Mutation | Discriminator |
| --- | --- |
| Early semantic task decode | Queue malformed-admission/read/event differential |
| Early required-query decode | `ExtensionAccess.test.ts`, two-use token |
| Router miss before authorization/body | `LocalApiDispatch.test.ts`, unauthorized and malformed authorized unknown POST |
| Undefined→null, -0→0, reordered/stripped extras | `IntegrationCodecCensus.test.ts`, ownership/Object.is/key-order/next-body assertions |
| String-only retained invitation cursor | `AccountWire.test.ts`, response→Load More→Cloud body |
| Dropped cookieSources/finite extraction validation | `ExtensionTranscript.test.ts`, D3 result→job→HTTP |
| Missing/doubled MCP prefix | `McpProtocol.test.ts` |
| Export lease before body | Actual two-held-body `ExtensionChat.test.ts` |
| Collapsed/retargeted credit notifications | `AccountNotifications.test.ts` |
| Awaited auth continuation | `AccountRenderer.test.tsx`, both starts before either resolves |
| Fixed auth wrapper cleanup | Mount/unmount/remount renderer test |
| Old private atom recipe | Pending document teardown renderer test |
| Cached/stale registration acceptance | `AccountReadiness.test.ts` |
| State publication after immediate completion | Account/MCP lifecycle tests |
| HashMap/HashSet-driven public order | Catalog/listener/SSE differential |
| Extension cleanup before listener close | `LocalApiLifecycle.test.ts` |

Run strict node/web/test graphs, schema/identity/JSDoc/standards checks, port checks, whole-repository checks/tests, dependency checks, extension/CLI builds, Linux packaging and unchanged goldens. Preserve foundation repeated-run, provenance, isolated-profile and archive-integrity requirements.

Linux does not prove macOS secure storage/protocol registration or Windows identity/signalling. Fake Cloud responses do not prove authentication, billing, cancellation or verifier acceptance. Those remain separately reported acceptance exercises.

## 13. Implementation lanes

At most three implementation lanes run concurrently in convention-compliant worktrees. Section 2 is the exclusive file allocation.

| Order/lane | Work | Gate |
| --- | --- | --- |
| O | Current-build characterization and independent fixtures | Baseline passes; discriminating mutations fail |
| F prerequisite | Production foundation amendment modules | Frozen implementation requirements and regression tests pass |
| C + P contract coordination | Freeze observation interfaces, capability models/errors/RPC/API/service declarations | Exact declaration construction, JSON census, real-interface typecheck and standards checks |
| P | Real queue/store/persistence/event/executor/facade remediation | One owner; no assertions; malformed/scalar/null/timing differential |
| A | Account/auth/device implementations | Request/coalescing/value/settlement/storage tests |
| M | MCP registry/catalog/framing/lifecycle/tools | Complete discovery/schema/protocol differential |
| X | Extension job/session/delegates | Identity/admission/race/projection/SSE/resource tests |
| H | Listener/access/descriptors/generated client | Dispatch/auth/token/bytes/deadline/shutdown tests |
| R | Renderer clients/controllers/components/hooks | Real invocation/lifetime/readiness/polling and unchanged presentation |
| I | Composition/preload/readiness/notifications/manifests | Combined strict graph, one-owner proof, unchanged goldens and packaged exercise |
| D1–D4 | Borrowed capability implementations | Their reviewed gates and actual adapters |

Order:

1. O records the selected current integration build before implementation.
2. F publishes the shared mechanisms.
3. C and P resolve observation interfaces together; C freezes contracts.
4. P lands actual package remediation.
5. A/M/X can prepare against injected frozen contracts.
6. H native activation waits for P and actual D1–D4 adapters.
7. R integrates the corresponding landed services and foundation invocation owner.
8. I alone assembles shared files and runs the complete gate.

Injected services unblock preparation, not activation. Package remediation lands before dependent native activation. Database-driver activation remains phase 10’s separate gate.

## 14. Behavior kept as it is

| Behavior | Consequence |
| --- | --- |
| Handshake lacks prior automation bearer | Same-user loopback trust boundary |
| One global automation token rotates | Other CLI sessions may re-handshake |
| MCP Settings contains bearer configuration | Trusted renderer intentionally receives credential |
| Video failure includes stack/details | Existing disclosure retained |
| URL check is syntactic | No DNS safety guarantee |
| Overview identity includes unknown fields/order | Similar inputs may conflict |
| Transcript late completion remains | Cancel/refresh is not terminal fencing |
| Export flag is racy | Overlap and early clear remain |
| Automation SSE ignores backpressure | Existing resource risk retained |
| Stop waits for listener before extension clears | Streams/long polls may delay stop |
| Credit numbers are permissive | Existing UI interpretation remains |
| Cursor/receipt extras/order survive | Data may be forwarded back to Cloud |
| Invitation cursors are unchecked | Truthy wrong-kind values may be sent |
| Installation-key rejection is cached | Recovery does not retry automatically |
| Signing failure permits unsigned feedback | Feedback remains available |
| Auth wrapper cleanup misses | Callbacks accumulate within admitted document capacity |
| Auth/account callbacks overlap | Completion order may affect state |
| Cloud success sends twice | Existing refresh triggers remain |
| Preparation readiness can precede listeners | Pending event may be lost |
| Subscription work can outlive removal | No new existence/abort guard |
| Endpoint memory changes before persistence | Memory/file state can differ |
| Concurrent starts lack mutex | Existing overlap retained |
| Database cache precedes migrations | Failed initialization may leave cache |

Security contracts remain loopback binding, peer/Host guards, trusted extension identities, actual-Origin write checks, independent token stores, exact expiry comparisons, one-use admission, constant-time MCP comparison, file permissions and browser artifact redaction.

Logs retain current endpoint/path/subsystem/connection observations. Add no URL/header/body logging containing query tokens, bearers, cookies, transcripts, private keys or attachments. Full Causes pass through the foundation sink with sensitive values excluded at driver boundaries.

The inventory’s pre-phase-8 CLI/extension descriptions are historical. G’s actual implementation is the consumer oracle.

## 15. Open questions

These are architect/dependency decisions, not permission requests.

| Question | Options | Recommendation |
| --- | --- | --- |
| Final MCP framing after raw recording | Public McpServer registry with explicit compatible framing; another public composition that reproduces all recorded observations | Keep explicit framing and public registry; select only after protocol differential |
| Queue observation rollout | Broaden actual same-owner interfaces and update interpreters; add a second permissive queue; narrow HTTP acceptance | Broaden one owner. Block activation until P and all consumers pass |
| Native JSON diagnostic edge at phase 10 | Qualified cause-preserving parser; recorded narrow exception after failed remediation; separate diagnostic behavior change | First qualify an equivalent parser; retain foundation injection until resolved |
| Driver cutover ownership | Perform in 9.5; perform in phase 10 | Phase 10 owns whole-process retirement and activation |
| Shared names still moving in parallel drafts | Bind final exported family/service identities; create integration aliases/runtimes | Bind final exports through I; create no duplicate owner |
| Admission constants | Accept probe values as final; measure complete production retention | Retain foundation bounds provisionally and measure before cutover |

Recursive account preservation and invocation ownership are settled foundation bindings, not open alternatives.

## 16. Review disposition

The design was frozen after its final review with the A1–A3 corrections below.

Executed evidence below refers only to section 12.1’s named probes. Production gates are explicitly identified as owed.

| REVIEW.md finding | Disposition and evidence |
| --- | --- |
| **1 — Blocker: queue prerequisite lacks complete contract** | Section 3.2 now declares observation task/store/read/event/control/limit/persistence/interpretation contracts, not only add. `QueueObservation.service.ts` compiles against real package interfaces; `revision3-queue.mjs` exercises the real store and seven event variants. Actual queue/persistence/executor remediation remains P’s mandatory pre-activation gate; no completed implementation proof is claimed. |
| **2 — Account codecs remain lossy** | Sections 3.4–3.5 and 5 bind complete amended declarations to `RpcObserved`/`ObservedValue`, including safe-integer -0 and recursive extras. `revision3-wire.mjs` checks source projectors, ownership, numeric identity, key order and next Cloud body through actual completion schemas and JSON framing. |
| **3 — Unchecked invitation cursors become strings** | Page requests carry `RpcOptional(ObservedValue)`. `revision3-wire.mjs` exercises numeric/boolean response cursors and reconstructed Cloud bodies. Production Load More integration is owed in `AccountWire.test.ts`. |
| **4 — Superseded renderer invocation helper** | Section 7 selects direct document-owned invocation Effects; private atoms are optional subordinate adapters. `revision3-lifecycle.mjs` uses the amendment entry for reverse completion, failure and pending teardown. Actual React/provider integration is owed. |
| **5 — Missing concrete readiness binding/dependencies** | Section 2 assigns `App.tsx`; section 5 declares every unary’s dependencies, initial-read tokens, exact existing readiness command payload, active-token validation and absent-listener loss. `revision3-readiness.mjs` checks actual source position/flushes and a token-gated local adapter. `revision3-lifecycle.mjs` rejects stale/foreign tokens. Candidate bridge/startup proof remains owed. |
| **6 — Transcript drops cookieSources/rejects serializable numbers** | Section 3.6 separates retained extraction observations from external JSON. `revision3-wire.mjs` checks cookieSources and infinity-to-null HTTP projection. The full D3→X→H connection is owed in `ExtensionTranscript.test.ts`. |
| **7 — Verification overstates older contracts** | Section 12 separates executed amended-contract probes, old-source recordings and candidate tests. `revision3-wire.mjs` uses actual amended schemas; `revision3-http.mjs` adds malformed authorized unknown POST and exact second-use token body; lifecycle/readiness probes add teardown and active-token checks. Older results are labelled pre-amendment evidence. |
| **8 — Contract-file ownership conflicts** | Section 2 assigns all model/error/API/RPC/service declarations permanently to C; implementation Layers/drivers remain with their runtime lanes. Readiness and package paths are included. Section 13 supplies the serial freeze/activation order. This is a document ownership correction, not a runtime probe claim. |

| REVIEW-1 item retained for closure | Disposition |
| --- | --- |
| Raw-handler/router precedence | Preserved in section 8.3; `revision3-http.mjs` exercises the discriminators. Complete raw HTTP proof remains owed. |
| MCP prefixes/outer validation | Section 4; actual SDK checks rerun in `semantics.mjs`. Complete replacement framing remains owed. |
| Export race | Sections 8.4 and 9 preserve it; `semantics.mjs` checks the schedule model. Actual handler race test remains owed. |
| Notification producers/recipients | Section 5.6 includes both Cloud sends and pre-try distinction; `semantics.mjs` checks source multiwindow sends. Full workflows/mixed consumers remain owed. |
| Detached auth continuation | Sections 5.5 and 7 retain overlap; `semantics.mjs` checks actual source starts before resolution. |
| Extension ownership | Sections 2, 6 and 13 allocate owners/contracts/implementation/tests without a duplicate session or conversation authority. |
| Auth listener leak | Explicitly retained; `semantics.mjs` reproduces source mount/unmount/remount multiplicity. |
| Native JSON diagnostics | Foundation `JsonSyntax` and its owned unported injection remain binding; `semantics.mjs` checks original exception identity through the supplied capability. |
| Stray draft text | Removed. |

| REVIEW-FINAL.md finding | Disposition and evidence |
| --- | --- |
| **1 / A1 — Queue observations reject successful raw pause reasons** | Corrected in sections 2, 3.2 and 12: mutable raw task/transition reasons, transition/pending-pause interfaces and persistence adapters. Corrected declarations typecheck; `freeze-queue.mjs` exercises real queue pause, persistence, ordered events and codecs. Complete observation closure is required by IR-1. |
| **2 / A2 — Account watch-query path retains unbounded event history** | Corrected in sections 5.5, 7 and 12: direct scoped streams, one document/family drain, ordered logical dispatch, no replay, bounded retained state and listener-based credits lifetime. `Freeze.entry.ts` typechecks actual client stream calls; `freeze-events.mjs` qualifies the drain over 1,024 events. Production consumer integration is required by IR-2. |
| **3 / A3 — Main account error channel loses original failures** | Corrected in sections 4, 5.1, 6 and 12: recognized originals survive account/MCP/config/device main services; only RPC maps to public completion errors, while legacy restores the original. Service/adapter declarations typecheck; `freeze-errors.mjs` exercises original identity and public codec separation. Complete facade settlement is required by IR-3. |
| **B1 — Complete queue observation closure** | Carried as IR-1. |
| **B2 — Qualify the account event consumer** | Carried as IR-2. |
| **B3 — Prove facade failures and settlement** | Carried as IR-3. |
| **B4 — Exercise actual readiness integration** | Carried as IR-4. |
| **B5 — Mutate the actual operation codecs** | Carried as IR-5. |
| **B6 — Qualify external adapters before activation** | Carried as IR-6. |

## 17. Implementation requirements

Implementation lanes are bound by every requirement below and must prove each one; these requirements supplement the existing gates and do not renumber them.

1. **IR-1 — Complete queue observation closure.** P shall run each permissive automation operation through the actual queue, store, persistence, events, immediate reads and relevant projectors. Prove numeric/boolean/null reasons, malformed admitted inputs and field substitutions against independent old fixtures. An early decoder and a narrowed transition/snapshot codec must each fail the suite.
2. **IR-2 — Qualify the account event consumer.** R/I shall test simultaneous AppLayout, AccountPanel and `useCloudAccount` listeners; registration and removal during delivery; remount; two auth events with held user reads; and late mounting. Prove exact callback counts/order, no replay, bounded retention after substantially more than 256 delivered events, and complete document teardown.
3. **IR-3 — Prove facade failures and settlement.** A/M shall record synchronous prefixes and named await/adoption/finally boundaries for retained exports, including coalesced account reads and MCP enable/disable/rotation. Inject original parser, network, storage and non-Error failures. Prove legacy class/message/identity where owed, independent caller settlement, and no original-value leakage into RPC.
4. **IR-4 — Exercise actual readiness integration.** I shall test kernel-ready and preparation startup through the real helper/handler and registration owner. Hold registration, replace it before readiness, remove a logical listener while waiting, and destroy the document. Prove no stale-token dispatch, no premature boolean clearing, preserved flush order, and the existing empty-list loss behavior.
5. **IR-5 — Mutate the actual operation codecs.** C shall replace the standalone cursor control at `probes/revision3-wire.mjs:64` with mutations of the tested operation’s request or completion schema. Prove that loss of extras/order/negative zero, string-only invitation cursors, and dropped transcript fields fail the complete consumer-to-next-operation path.
6. **IR-6 — Qualify external adapters before activation.** O/M/H/X shall record and compare complete MCP exchanges, raw HTTP headers/status/body behavior, actual export-body races, SSE ordering/backpressure boundaries, and close-before-extension-cleanup behavior. H shall separately prove generated-client request bytes and both deadline branches. Injected Web handlers and schedule models remain preparation evidence; they cannot satisfy this activation requirement.