# Design: desktop transcription (phase 9.3)

Status: frozen on 2026-11-22 after three independent review rounds; the implementation requirements section binds every implementation lane. Text before the freeze: third revision for architect review. The architect owns this document and its decisions. The declaration and local mechanism evidence in section 12 does not establish implementation acceptance.

This design follows `PLAN.md` A2 and A6, `PORT-GUIDE.md`, the approved desktop-foundation design and its frozen amendment. The amendment owns presence encoding, retained observations, registration, reply cuts, invocation ownership, accepted operations, original failures and syntax-preserving JSON parsing. This capability supplies schemas, dependency declarations, publisher policies and consumer behavior. It implements none of those foundation mechanisms again.

Source references distinguish these trees:

| Name | Tree and revision |
| --- | --- |
| **V** | `~/YeeBois/workstation-apps/worktrees/VidBee/port-desktop-foundation`, `990ed4fe6be550aed68044e1eb64218ea64ffef2` |
| **G** | `~/YeeBois/workstation-apps/worktrees/VidBee/port-goldens-8`, `7c94ea05a537360da9a33d556b52e242658b3c7d` |
| **T** | `~/YeeBois/workstation-apps/worktrees/VidBee/port-standards-tooling`, repository editions of the enforced standards |

V’s application source, package source and foundation design have no diff from the previous draft’s `b74de0ad0578b0a251344299d8c4d36efc324507` within those paths. Desktop references below identify V. Ported package references identify G.

Paths are repository-relative. **M/** means `apps/desktop/src/main/`; **R/** means `apps/desktop/src/renderer/src/`; **S/** means `apps/desktop/src/shared/`; **P/** means `packages/transcription/src/`; **C/** means `packages/transcription-legacy/src/`.

The drafting inputs include `INVENTORY.md`, `DESIGN-PREV.md`, `REVIEW.md`, `REVIEW-1.md`, `AMENDMENT.md`, the supplied model draft and model review, the available 9.1 and 9.2 designs, package designs and their review corrections, current source, and installed Effect 4.1.4. The inventory is a discovery aid; source takes precedence. Section 12 records its material corrections.

All revision writes were confined to local probes. Repositories remained read-only. No network, application, additional agent or agent CLI session was used.

## 1. What this capability is, and what makes it risky

Desktop transcription imports captions, admits local or cloud recognition, manages ASR package tasks, selects transcript sources, projects status and detail, edits captions, supplies playback cues and exports text or subtitled video. The Transcript screen combines these operations with the existing player and conversation interface.

`@vidbee/transcription` is ported. Desktop still constructs stateful compatibility owners from its sibling and passes them into execution (`M/lib/transcript-host.ts:38–56,223–246`; `M/lib/task-queue-host.ts:253–278`). Native activation therefore requires explicit attachment and package-remediation gates.

The following properties govern the port.

1. Opening is a command. `getForDownload` starts the queue, can import sidecars or embedded captions, can admit a speaker overlay and can publish. `getDetail` scans sidecars without importing. The status map scans neither folders nor transcript bodies (`M/ipc/services/transcript-service.ts:61–84`; `M/lib/transcript-host.ts:360–508,582–615`).

2. Stored activation, remembered viewing and active recognition differ. `viewingKeys` is process-local. Selecting captions can import or activate a language while ASR continues. Selecting ASR can display an empty ASR view without starting recognition (`transcript-host.ts:142–219,518–552`).

3. Detail, status, updates, cues and partials are distinct DTOs. In particular, an updated event has compact record metadata plus sources, and stored source cues retain fields absent from sidecar cues (`transcript-host.ts:420–501,1164–1171`).

4. Existing owners provide consistency. Transcript replacement, activation, append and edits retain their transactions. Caption files and source selection retain their owners. Validated files determine model readiness. Cloud checkpoints determine paid-result recovery.

5. Completion differs by operation. Start acknowledges admission. Ensure-tier waits for a package task. Upgrade changes defaults before validating the parent. Export cancellation requests abort without waiting for process exit.

6. Publication and reply order are observable. A transcript broadcast flushes partials, runs the automatic-skill hook and publishes the compact update. Main returns an invocation-correlated completion immediately; the renderer exposes it only after its declared cuts are applied.

7. Native resource policies differ by site. Remote-caption extraction waits for error/close after timeout and retains a two-extraction admission count through directory cleanup. Embedded-caption capture has a different timeout contract. Export uses TERM-only cancellation. These policies are not interchangeable.

8. Renderer races are behavior. Detail and cue reads have guards. Partial restoration does not. Concurrent edits and model actions independently complete. A shared mutation atom or query cache must not alter those policies.

A2 and A6 cover results, deliberately constructed errors, synchronous prefixes, Promise adoption and settlement turns, callback order, truthiness, null versus omission, argument presence and surface-specific validation. Bugs are listed, not repaired. Promise orchestration wrapped in Effect is not a completed port.

The later event-sourced model does not enter in this phase.

## 2. Scope and file dispositions

Existing logic keeps its filename. New companions use the approved model, error, service, layer, driver, RPC, atom and entrypoint conventions. Pure decisions remain in existing pure modules or are colocated with the appropriate new model module.

Every row below has one writer. Braces enumerate exact files, not a directory exemption. External owners are **F** for foundation/shared composition, **E91**, **E92**, **E94** and **E95**. They are prerequisites and integration owners, not additional 9.3 lanes.

### Main and shared files

| File or exact set | Disposition and target | Writer |
| --- | --- | --- |
| `M/ipc/services/transcript-service.ts` | Port in place. Replace the decorated class with application operations. Preserve the nine queue-start awaits and all field-forwarding positions. | H |
| `M/lib/DesktopTranscript.{service,layer,errors}.ts` | New application service, composition and original-failure boundary. | K |
| `M/lib/transcript-host.ts` | Port orchestration in place. Move runtime-executing compatibility exports to `M/lib/legacy/transcript-host.ts`. | H |
| `M/lib/legacy/transcript-host.ts` | New warmed synchronous/Promise facade over acquired owners. | H |
| `M/lib/TranscriptHost.{model,service,layer,driver}.ts` | New host contracts, pure decisions and host-observation boundary. | H |
| `M/lib/{transcript-list-snapshot,transcript-queue-index,transcript-stage-history}.ts` | Port in place; preserve source order, stable ties, compact projections and stage fallback. | H |
| `M/lib/transcription-worker-path.ts` | Split pure candidate calculation from host access. | H |
| `M/lib/TranscriptionWorkerPath.{service,layer,driver}.ts` | New synchronous-capable bundle lookup. | H |
| `M/lib/{asr-model-task,asr-model-executor}.ts` | Port admission, waiting and executor operations in place. | M |
| `M/lib/AsrModelTasks.{model,errors,service,layer}.ts` | New package-task contracts and pure decisions. | M |
| `M/lib/legacy/asr-model-executor.ts` | New callback attachment over acquired strict services. | M |
| `M/lib/cloud-transcription.ts` | Port account capture, HTTP orchestration and credit-publication order in place. | C |
| `M/lib/DesktopCloudTranscription.{model,errors,service,layer,driver}.ts` | New cloud boundary and drivers. | C |
| `M/lib/cloud-subtitle-evidence.ts` | Split acquisition from pure interpretation; retain its synchronous compatibility surface in `M/lib/legacy/cloud-subtitle-evidence.ts`. | C |
| `M/lib/CloudSubtitleEvidence.model.ts` | New schema and pure evidence decisions. | C |
| `M/lib/{export-video-subtitles,export-video-subtitles-args}.ts` | Port orchestration and exact argv/progress calculations in place. | X |
| `M/lib/VideoSubtitleExport.{model,errors,service,layer,driver}.ts` | New export service and dialog/process/file boundary. | X |
| `M/lib/legacy/export-video-subtitles.ts` | New facade preserving both interactive and explicit-output call forms, global cancel and result/error timing. | X |
| `M/lib/remote-captions.ts` | Port extraction in place, including its application-global admission count. | S |
| `M/lib/RemoteCaptions.{model,errors,service,layer,driver}.ts` | New remote extractor contract and raw process boundary. | S |
| `M/lib/{subtitle-download,subtitle-download-executor}.ts` | Port validation, publication and executor operations in place. | S |
| `M/lib/SubtitleDownload.{model,errors,service,layer}.ts` | New strict subtitle capability. | S |
| `M/lib/library-export.ts` | Port directory creation and unique path allocation in place. | S |
| `M/lib/LibraryExport.{model,service,layer}.ts` | New path-allocation contract; no reservation or overwrite guarantee is added. | S |
| `M/lib/legacy/{remote-captions,subtitle-download,subtitle-download-executor,library-export}.ts` | New exact Promise/callback/zod compatibility surfaces. | S |
| `M/ipc/TranscriptDelivery.{service,layer}.ts` | New family policy over foundation delivery services. Owns no transport state. | I |
| `S/Transcript.{model,errors,rpc}.ts` | New browser-safe DTOs, public error and complete RpcGroup. | K |
| `S/TranscriptView.model.ts` | New renderer state/freshness models. | R |
| `S/TranscriptComposition.model.ts` | New browser-safe player, import and conversation ports. | K |
| `S/{subtitle-export,transcript-export}.ts` | Keep foundation-owned strict serializers and exact grouping/text behavior. | F |
| `S/{extension-transcript,agent-subtitles,video-localization}.ts` | Keep their existing shared ownership. Reuse; do not copy. | F |
| `S/types/ipc.ts` | Keep the 26 positional legacy declarations through phase 10. | F |
| `apps/desktop/src/preload/{index.ts,index.d.ts}` | Keep foundation ownership; use `window.vidbeeRpc`; add no transcript bridge. | F |

No existing capability file is deleted in 9.3. The decorated transcript class and its registration disappear from the new implementation; old channel forwarders remain until phase 10.

### Package prerequisite files

These files have one package writer, **P**. No desktop lane edits them.

| Files | Disposition |
| --- | --- |
| `P/CloudRun.model.ts`, `P/CloudTranscription.{service,layer}.ts` | Add honest fresh-response and observed-pipeline boundaries; retain replay interpretation and checkpoint publication. |
| `P/Store.model.ts`, `P/TranscriptStore.{service,layer}.ts` | Add a cloud-observed commit path using the existing transaction and SQL binding behavior. |
| `P/TranscriptionExecutor.{model,service,layer}.ts` | Carry the honest cloud execution result through `ExecutorHooks.cloud`, `ExecutionResult` and `ExecutorCommit`; select the corresponding commit path without a cast. |
| `P/{index,cloud-runner}.ts` | Export remediation contracts through the existing entries. |
| `C/{model-manager,transcript-store,partial-buffer,cloud-runner,executor,index}.ts` | Add attachment factories; retain original constructors and declarations for independent compatibility users. |
| `packages/transcription{,-legacy}/package.json` | Add only required exports; preserve existing entries. |
| `P/{TranscriptionProcess.layer,TranscriptionTime.layer,ModelFiles.layer,Sherpa.driver,WorkerOutput.layer,WorkerAttempt.layer,WorkerRuntime.layer,CaptionProcessOwner.layer}.ts` | Resolve the exact native activation obligations in section 6. |
| `packages/transcription/test/native/{cloud-transcription.effect,executor.effect,host-files,worker-boundaries,sherpa,caption-process-owner.effect,caption-process-node.effect,model-lifetime.effect}.test.ts` | Preserve existing assertions and add the corresponding discriminators. |
| `packages/transcription/test/native/{desktop-attachments,cloud-observed-commit}.effect.test.ts` | New full attachment and runner-to-store composition tests. |

A newly discovered transitive source edit returns to the ownership ledger before work begins. “Executor implementation modules” is not an open file fence.

### Renderer files

| File or exact set under R | Disposition and target | Writer |
| --- | --- | --- |
| `pages/Transcript.tsx` | Port in place with unchanged opening, actions, freshness, markup and player handoff. | U |
| `store/transcripts.ts` | Split; new `store/Transcript.atoms.ts` owns state/actions; retained Jotai exports project that registry. | R |
| `store/transcript-models.ts` | Split to `store/TranscriptModels.atoms.ts`; preserve hook shape, provisional state and live-event-wins. | R |
| `store/transcript-reading.ts` | Split to `store/TranscriptReading.atoms.ts`. | R |
| `store/transcript-prompt-tab.ts` | Split to `store/TranscriptPromptTab.atoms.ts`. | R |
| `store/TranscriptCues.atoms.ts` | New fetching/revision orchestration supplied to the 9.1 cue view. | R |
| `hooks/{use-streaming-transcript,use-bilingual-captions}.ts` | Port in place with existing timing and guards. | U |
| `lib/{transcript-bilingual,transcript-caption-selection,transcript-detail-merge,transcript-follow,transcript-index,transcript-karaoke,transcript-library,transcript-search,transcript-speakers,transcript-stream,transcript-tab-scroll,transcript-tab-search,transcript-view-transition,transcript-virtual,transcript-vtt}.ts` | Port in place; preserve algorithms, units, ties, presence and order. | R |
| `components/transcript/{TranscriptCaptionsPane,TranscriptSpeakersPane,TranscriptInfoPane,TranscriptSourceSwitch,SpeakerCountDialog,AsrUpgradeDialog,TranscriptExportDialog,TranscriptModelsBanner,TranscriptProgressThinking,SpeakerAvatar,TranscriptAudioStage}.tsx` | Port over strict data/actions; no visual change. | U |
| `components/transcript/TranscriptSidePanel.tsx` | Port the tab/caption/speaker shell; inject conversation content/actions. | U |
| `components/settings/{AsrModelPicker,CloudTranscriptionSettings,asr-family-icon,asr-model-row}.tsx`, `components/settings/asr-model-shared.ts` | Port transcription data/actions; account operations remain injected. | U |
| `composition/TranscriptRoute.tsx` | New route assembly supplying player and conversation ports. | I |
| `components/transcript/transcript-player.css` | Keep unchanged. | E91 |

The following files stay with their existing capability owner:

| Owner | Exact files or services |
| --- | --- |
| E91 | `store/{transcript-playback,transcript-playlist,transcript-playback-cues}.ts` and their strict replacements; one player, playlist, resume store and cue-view state |
| E91 | `hooks/{use-transcript-media-player,use-transcript-playback-position,use-import-local-media}.ts` |
| E91 | `lib/{transcript-playback-position,transcript-playback-source,transcript-playback,transcript-player-frame,transcript-playlist-fly,transcript-playlist}.ts` |
| E91 | `components/transcript/{TranscriptPlaybackHost,TranscriptVideoJsPlayer,TranscriptPlaybackBar,TranscriptPlaybackBarView,TranscriptPlaybackStandby,TranscriptPlaybackSlot,TranscriptPlayerNotice,TranscriptAudioEqualizer,TranscriptPlaylistPopover}.tsx` |
| E91 | `components/transcript/{TranscriptCaptionShareCard,TranscriptShareCardChrome,TranscriptPromptShareCard,AgentResponseShareCard,AgentResponseContent}.tsx`, `share-card-logo.ts`; capture presentation |
| E94 | `components/transcript/{TranscriptPromptPane,TranscriptPromptGuidance,TranscriptPromptThinking,TranscriptPromptHistory,AgentChatMessageView,AgentReasoningSelect,TranscriptAgentMessageRow,AgentChatRunFeedback,AgentEventStream,AgentThinkingContent,TranscriptOverviewResult,TranscriptShareImageDialog,AgentChatScrollState,PromptClockText,TabUnderline}.tsx` |
| E94 | Conversation hooks/components, AI state and artifact operations; the share dialog receives foundation platform operations and 9.1 capture |
| F | Shared UI adapters, settings clients, logging, language and renderer runtime; strict reached dependencies must satisfy their existing gates |

### State and event replacements

| Existing symbol or channel | Replacement |
| --- | --- |
| All 26 `TranscriptService` methods | Corresponding `Transcript.*` unary procedures in section 5 |
| `transcript:updated` | `WatchChanges` observation `{kind:"updated", value:Updated}` |
| `transcript:partial` | `WatchChanges` observation `{kind:"partial", value:Partial}` |
| `transcript:models` | `WatchModels` observation |
| `transcript:export-progress` | `WatchExportProgress` observation |
| `account:credits-updated` | Existing foundation notification sink, with all-live-window recipients |
| `transcriptMapAtom`, `upsertTranscriptAtom`, `loadTranscriptMapAtom` | `Transcript.atoms.ts` |
| `transcriptModelPrepAtom` | `TranscriptModels.atoms.ts` |
| `transcriptBilingualPreferencesAtom` | `TranscriptReading.atoms.ts` |
| `pendingPromptTabAtom` | `TranscriptPromptTab.atoms.ts` |
| Cue fetch/request/revision actions | `TranscriptCues.atoms.ts`, injected into E91’s view |
| Player/session/clock/playlist/resume/DOM-slot atoms and actions | E91; no duplicate state |
| Page, caption editor, dialogs and model controls | Same components consuming strict actions and registry state |

Jotai projections forward to the strict registry. They do not retain independently writable copies.

### Shared prerequisites and forwarding ownership

9.3 does not modify 9.1 or 9.2 files. Their owners must supply the following before dependent activation:

| Owner | Files/services assumed | Required contract |
| --- | --- | --- |
| E91 | `M/lib/{task-queue-host,queue-ref,task-queue-migrate}.ts`; `DesktopQueueHost` | One queue, lazy readiness/start/stop, executor registration and compatibility attachment |
| E91 | `M/lib/{download-facade,history-manager,projection}.ts` | Task/history reads and the actual desktop history projector |
| E91 | `M/lib/{import-local-media,source-file,social-media-file}.ts`; `SourceFiles` | Serial import, source resolution, history DTO and in-loop transcription hook |
| E91 | `M/lib/{ffmpeg-manager,playable-media,player-host}.ts` | Binary readiness, probing, staging and player lifecycle |
| E91 | `M/lib/ipc-coalescer.ts` | Existing keyed coalescer and interval behavior |
| E91 | `M/lib/social-profile-manager.ts`, cookie/binary/kernel services | Existing profile/session and native capabilities |
| E92 | Subscription host, admission, models, atoms and screen | No transcript state; invoke supplied capabilities where needed |
| E94 | `agent-capability-host`, `agent-management-host`, automatic-skill and prompt/conversation ports | Synchronous hooks, existing detached continuations and shared content access |
| E95 | MCP, HTTP, extension, account and localization implementations | Existing validation, envelopes and surface-specific source selection |
| F | SQL context, settings, logger, transport, runtimes and notification sink | Borrowed owners and frozen foundation contracts |

The 9.1 serial importer retains transcription admission after each parent import/reuse and before that item’s history projection (`M/lib/import-local-media.ts:158–251`). A batch import followed by a second transcription pass is not equivalent.

The shared composition writer **F** owns forwarding-only changes in:

- `M/index.ts`, `M/ipc/index.ts`, main runtime/RpcGroup composition, renderer entry/router/layout, manifests, configurations and `port-units{,.baseline}.json`.
- `M/mcp/{transcript-tools,export-tools,ai-tools,task-tools}.ts`.
- `M/lib/{video-localization,video-dubbing,extension-transcript,extension-chat-source,agent-capability-host,agent-management-host,agent-subtitles,agent-run-context,ai-skill-auto-run,settings-host}.ts`.

These edits route retained callers to explicit facades. They land with the relevant cutover, not in a later 9.5 change. E91 applies its own forwarding changes to queue/history/import consumers. H, M, C, X and S update imports inside their owned files.

### Tests, scripts and report

| File or exact set | Disposition | Writer |
| --- | --- | --- |
| `apps/desktop/test/transcription-lifecycle.test.ts` | Keep assertions; add strict composition coverage. | H |
| `apps/desktop/test/transcription/Transcript.model.test.ts` | New complete codec census. | K |
| `…/{TranscriptHost,TranscriptContent}.test.ts` | New host/transaction/selection tests. | H |
| `…/AsrModelTasks.test.ts` | New admission/wait/reentry tests. | M |
| `…/DesktopCloudTranscription.test.ts` | New HTTP/checkpoint/credit tests. | C |
| `…/VideoSubtitleExport.test.ts` | New export lifecycle/precedence tests. | X |
| `…/{RemoteCaptions,SubtitleDownload}.test.ts` | New shared admission and subtitle publication tests. | S |
| `…/{TranscriptRenderer,TranscriptFreshness}.test.tsx` | New registry and real consumer tests. | R |
| `…/TranscriptScreen.test.tsx` | New screen/action/visual tests. | U |
| `…/{TranscriptStreams,TranscriptComposition,TranscriptCompatibility}.test.ts` | New delivery, shared-owner and facade tests. | I |
| `apps/desktop/scripts/port/transcription/{source-oracle,renderer-oracle,record-current,compare-candidate,mutations,packaged}.mjs` and their fixture/receipt files | New characterization and candidate probes under D7. | B |
| Existing public golden JSON and `scripts/port/golden/*` | Keep recordings immutable; additions go through the harness owner. | B |
| `docs/effect-port/reports/9.3.md` | New acceptance report. | A |

## 3. Schemas

Application DTOs follow current projectors and consumers. Produced-result schemas are not substituted for permissive stored reads or observations.

### Boundary distinctions

| Value | Contract |
| --- | --- |
| Stored `resultKind` | String, including unknown stored strings |
| Stored `asrTier` | String or null |
| Application selected tier | `AsrTierId` or null |
| Stored source kind | Existing row interpretation; non-caption values are interpreted as ASR by the store |
| Snapshot links | `downloadTaskId`; nullable `transcriptionTaskId` and `transcriptId` |
| Import link | `downloadId`, not `taskId` |
| Missing detail record | `record:null` |
| Missing playback source | Unary success `null` |
| Unknown source cue key | `[]` |
| `creation` | Omitted, own undefined, or metadata with the existing conversation link |
| Words | Required on stored segments; optional on partials; absent from playback cues |
| Sources | Required on detail and updates; absent from status-map values |
| Observed stage | String or null, including restored future strings |
| Stage history | Retained stage objects, including unknown metadata |
| Domain numbers | Existing finite fields; no added positive/integer/time-order/confidence refinement |
| Retained numbers | Preserve negative zero and unchecked non-finite metadata through observation encoding |
| Internal absence | May use `Option`; public null and property-presence distinctions remain unchanged |

Use the foundation’s `RpcOptional`, `RpcValue` and `RpcUndefined` for transparent presence. Use `RpcObserved` around retained observations. A closed struct, `S.Unknown` rest field or ordinary JSON encoding alone does not preserve every retained value.

`RpcObserved(view)` checks the view’s consumed-field guarantees without rebuilding its object. Its encoded representation preserves retained own-property presence, nested values and key order. Dense-array admission and unsupported-object failures remain the foundation’s new-surface policy.

### Transcript declarations

The following declarations are the application views. Section 5 places the observation codec around complete application results and subscription values.

```ts
import { $DesktopId } from "@vidbee/identity/packages"
import { LiteralKit } from "@vidbee/schema/LiteralKit"
import * as Q from "@vidbee/task-queue/Task.model"
import * as B from "@vidbee/transcription/Model.model"
import * as L from "@vidbee/transcription/Literal.model"
import * as P from "@vidbee/transcription/Pipeline.model"
import * as T from "@vidbee/transcription/Transcript.model"
import { PersistedStage } from "@vidbee/transcription/Checkpoint.model"
import * as S from "effect/Schema"
import { RpcOptional } from "./RpcField.model.js"

const $I = $DesktopId.create("shared/Transcript.model")

export const ListState = LiteralKit([
  "none", "queued", "running", "completed", "no-speech",
  "failed", "cancelled", "retry-scheduled"
]).pipe($I.annoteSchema("ListState", {
  description: "Library lifecycle interpreted from selected content and task."
}))
export type ListState = typeof ListState.Type

export const ListRecord = S.Struct({
  asrTier: S.NullOr(S.String),
  createdAt: S.Finite,
  id: S.String,
  language: S.NullOr(S.String),
  modelVersion: S.String,
  resultKind: S.String,
  sourceKind: L.TranscriptSourceKind,
  updatedAt: S.Finite
}).pipe($I.annoteSchema("ListRecord", {
  description: "Selected stored metadata without caption bodies."
}))
export type ListRecord = typeof ListRecord.Type

const Creation = S.Struct({
  ...Q.TaskCreationMetadata.fields,
  agentConversation: RpcOptional(S.Struct({
    downloadId: S.String,
    threadId: S.String,
    promptId: S.String
  }))
})

export const PartialSegment = S.Struct({
  ...P.PipelineSegment.fields,
  words: T.TranscriptWord.pipe(S.Array, S.mutable, RpcOptional)
})
export type PartialSegment = typeof PartialSegment.Type

const common = {
  asrTier: S.NullOr(L.AsrTierId),
  creation: RpcOptional(Creation),
  downloadTaskId: S.String,
  error: S.NullOr(S.String),
  listState: ListState,
  rediarize: S.Boolean,
  sourceFilePath: S.NullOr(S.String),
  sourceKind: S.NullOr(L.TranscriptSourceKind),
  speakerCount: L.SpeakerCount,
  stage: S.NullOr(S.String),
  stageHistory: S.Array(PersistedStage),
  title: S.NullOr(S.String),
  transcriptId: S.NullOr(S.String),
  transcriptionTaskId: S.NullOr(S.String),
  updatedAt: S.Finite
}

export class Status extends S.Opaque<
  Status, { readonly brand: unique symbol }
>()(
  S.Struct({ ...common, record: S.NullOr(ListRecord) }).pipe(
    $I.annoteSchema("Status", {
      description: "Compact library snapshot without body hydration."
    })
  )
) {}

export class Detail extends S.Opaque<
  Detail, { readonly brand: unique symbol }
>()(
  S.Struct({
    ...common,
    record: S.NullOr(T.StoredTranscriptRecord),
    sources: S.Array(T.TranscriptSourceOption)
  }).pipe($I.annoteSchema("Detail", {
    description: "Hydrated selected transcript and available source choices."
  }))
) {}

export class Updated extends S.Opaque<
  Updated, { readonly brand: unique symbol }
>()(
  S.Struct({
    ...Status.fields,
    sources: S.Array(T.TranscriptSourceOption)
  }).pipe($I.annoteSchema("Updated", {
    description: "Compact live update with sources and no segment bodies."
  }))
) {}

export class Partial extends S.Opaque<
  Partial, { readonly brand: unique symbol }
>()(
  S.Struct({
    downloadTaskId: S.String,
    taskId: S.String,
    segments: S.Array(PartialSegment)
  }).pipe($I.annoteSchema("Partial", {
    description: "Whole partial list with its possibly empty task identity."
  }))
) {}

export class Cues extends S.Opaque<
  Cues, { readonly brand: unique symbol }
>()(
  S.Struct({
    language: S.NullOr(S.String),
    segments: S.Array(T.TranscriptPlaybackCue),
    sourceKind: L.TranscriptSourceKind,
    snapshotSourceKind: S.NullOr(L.TranscriptSourceKind),
    transcriptId: S.String,
    updatedAt: S.Finite
  }).pipe($I.annoteSchema("Cues", {
    description: "Selected playback captions without word timestamps."
  }))
) {}

export const SourceCue = S.Struct({
  startMs: S.Finite,
  endMs: S.Finite,
  text: S.String
}).pipe($I.annoteSchema("SourceCue", {
  description: "Unactivated sidecar caption times and text."
}))
export type SourceCue = typeof SourceCue.Type

export const SourceCues = S.Array(
  S.Union([T.TranscriptPlaybackCue, SourceCue])
).pipe($I.annoteSchema("SourceCues", {
  description: "Stored metadata-bearing cues or sidecar times and text."
}))
export type SourceCues = typeof SourceCues.Type

export const Patch = S.Struct({
  downloadId: S.String,
  segmentId: S.String,
  endMs: RpcOptional(S.Finite),
  speakerId: S.String.pipe(S.NullOr, RpcOptional),
  startMs: RpcOptional(S.Finite),
  text: RpcOptional(S.String)
}).pipe($I.annoteSchema("Patch", {
  description: "Patch the transcript selected when the operation executes."
}))
export type Patch = typeof Patch.Type

export const Insert = S.Struct({
  downloadId: S.String,
  afterId: S.String.pipe(S.NullOr, RpcOptional),
  beforeId: S.String.pipe(S.NullOr, RpcOptional),
  atMs: RpcOptional(S.Finite),
  speakerId: S.String.pipe(S.NullOr, RpcOptional),
  text: RpcOptional(S.String)
}).pipe($I.annoteSchema("Insert", {
  description: "Desktop insertion fields without explicit start and end times."
}))
export type Insert = typeof Insert.Type

export const Changes = S.Union([
  S.Struct({ kind: S.tag("updated"), value: Updated }),
  S.Struct({ kind: S.tag("partial"), value: Partial })
]).pipe(
  S.toTaggedUnion("kind"),
  $I.annoteSchema("Changes", {
    description: "Ordered transcript observations without transport handshake."
  })
)
export type Changes = typeof Changes.Type
```

`Registered` is not a member of `Changes`. `Subscription(Changes)` supplies the only registration alternative, using `_tag`. This prevents both the construction failure and duplicate handshake in the previous draft.

`SourceCues` lists the stored member first. More importantly, the outer observation codec retains the original object after checking it; a smaller union member must not strip stored cue IDs, speaker, confidence or sort index (`transcript-host.ts:475–501`).

The reused package models contain:

| Model | Concrete fields |
| --- | --- |
| Stored record | `id`, `downloadTaskId`, `transcriptionTaskId`, string `resultKind`, `modelVersion`, nullable `asrTier/language/sourceFilePath`, `sourceKind`, nullable `supersededAt`, `createdAt`, `updatedAt`, speakers, segments |
| Speaker | `id`, `speakerKey`, `displayName`, `sortIndex` |
| Stored segment | `id`, nullable `speakerId`, `startMs`, `endMs`, `text`, words, nullable confidence, `sortIndex` |
| Word | `startMs`, `endMs`, `text` |
| Source option | `auto`, `key`, `kind`, nullable `language/languageCode`, `selected` |
| Persisted stage | String `stage`, finite `startedAt`, retained extra fields |
| Partial segment | Nullable speaker key, times, text, optional words, nullable confidence |
| Playback cue | ID, nullable speaker/confidence, times, text, sort index; no words |

Live command stages retain `L.TranscriptionStage`. Observed snapshots use string/null because `Partials.restoreFromManifest` restores the last persisted string and the host prefers it over the task stage (`P/Partials.layer.ts:97`; `M/lib/transcript-host.ts:424`). `transcriptStageHistory` can return the original retained history unchanged (`M/lib/transcript-stage-history.ts:10–17`).

### Model DTOs

```ts
export const ModelTransfer = S.Struct({
  ...B.ModelDownloadProgress.fields,
  tier: RpcOptional(L.AsrTierId)
})
export type ModelTransfer = typeof ModelTransfer.Type

export const ModelStatus = S.Struct({
  ...B.ModelStatus.fields,
  pendingTiers: L.AsrTierId.pipe(S.Array, S.mutable, RpcOptional),
  downloading: S.NullOr(ModelTransfer),
  downloads: S.Array(ModelTransfer).pipe(S.mutable),
  machine: RpcOptional(B.MachineProfileStatus),
  recommended: L.AsrTierId.pipe(S.Array, S.mutable, RpcOptional),
  language: RpcOptional(S.String)
})
export type ModelStatus = typeof ModelStatus.Type
```

| Member | Shape |
| --- | --- |
| Prep | `{ready, downloading, percent}` |
| Status | `ready`, `version`, `bytes`, files, tiers, nullable downloading, downloads; optional pending tiers, machine, recommendations and language |
| File | `{id,present,path,bytes}` |
| Tier | `{id,family,ready,bytes,qualityRank}` |
| Transfer | `{url,received,total:number|null,tier?}` |
| Machine | `{arch,class,cpuCount,gpu,gpuName:string|null,os,ramBytes}` |

No bounded-percent refinement is added. The renderer keeps existing rounding/clamping. Status captures manager state before awaiting the cached GPU probe, then computes prep/pending/language/recommendations (`transcript-host.ts:809–836`).

### Cloud boundaries

```ts
export const CloudModel = S.StructWithRest(
  S.Struct({
    id: S.String,
    name: S.String,
    creditsPerSecond: S.Finite
  }),
  [S.Record(S.String, S.Unknown)]
)
export type CloudModel = typeof CloudModel.Type

export const CloudCatalog = S.StructWithRest(
  S.Struct({
    defaultModelId: S.String,
    models: S.Array(CloudModel)
  }),
  [S.Record(S.String, S.Unknown)]
)
export type CloudCatalog = typeof CloudCatalog.Type

export const CloudAccepted = S.StructWithRest(
  S.Struct({
    requestId: S.String,
    modelId: S.String,
    text: S.String,
    credits: S.Finite
  }),
  [S.Record(S.String, S.Unknown)]
)
export type CloudAccepted = typeof CloudAccepted.Type

export const CloudObservedPipeline = S.Struct({
  ...P.PipelineResult.fields,
  language: S.Unknown
})
export type CloudObservedPipeline = typeof CloudObservedPipeline.Type
```

The catalog operation retains its current checks: 1–50 models, string IDs/names, positive safe-integer prices and default membership. It leaves audio limits and extra metadata unchecked (`cloud-transcription.ts:23–37`). `GetCloudModels` wraps the complete retained result in `RpcObserved`; this includes unchecked `Infinity`, negative zero, nested own undefined and key order.

HTTP acceptance, checkpoint serialization and RPC representation remain separate:

| Path | Contract |
| --- | --- |
| Fresh HTTP result | Validate consumed fields and matching request/model IDs; require nonnegative safe-integer credits; return the original parsed object |
| Missing `audioSeconds` or `language` | Do not fabricate fields |
| Unusual fresh `language` | Retain through checkpoint save and the existing consumption/binding point |
| Replay | Use existing `CloudSavedResult` interpretation, which can reject an unusual saved language |
| Invalid consumed fields | Existing deliberate invalid-response error before successful credit publication |
| Non-OK response | Parse JSON first, then construct the existing status/code/retry error |
| RPC observation | Use the foundation retained-value codec; do not change HTTP acceptance or disk bytes |

P must carry this honest shape through the real runner, `ExecutorHooks.cloud`, `ExecutionResult`, `ExecutorCommit` and store. An isolated replacement interface is not composition proof.

### Import DTO

Production reuses E91’s `DownloadHistoryItem` and import result model. The probe contains a local declaration of the current projector census because that proposed production module is not yet available.

`ImportResult` is:

| Member | Shape |
| --- | --- |
| `imported` | Ordered `{path,downloadId,created,reused,historyItem}[]` |
| `rejected` | Ordered `{path,reason:"missing"|"not-media"}[]` |

History requires `id`, `url`, `title`, video/audio type, status and `downloadedAt`. Its optional fields are:

| Family | Fields |
| --- | --- |
| Provenance/media | `sourceMediaKind`, `collectionSummary`, `cookieSources`, `configuredCookieSources`, `origin`, `agentConversation`, `parentId`, `taskKind`, `subscriptionId` |
| Output/display | `thumbnail`, `downloadPath`, `savedFileName`, `filePath`, `resolvedFormatId`, `subtitleStatus`, `subtitleLanguages`, `fileSize`, `duration`, `error`, `ytDlpCommand`, `ytDlpLog`, `description`, `channel`, `uploader`, `viewCount`, `tags`, `selectedFormat` |
| Dates | `createdAt`, `startedAt`, `completedAt` |
| Grouping | `playlistId`, `playlistTitle`, `playlistIndex`, `playlistSize`, `mediaKind`, `batchId`, `batchKind`, `batchTitle`, `batchCategory`, `batchOrder`, `batchSourceCount`, `batchAssetCount` |
| Collection output | `outputDirectory`, `fileCount`, `downloadedCount`, `skippedCount`, `failedCount`, `totalSize` |

E91’s projector owns permissive stored observations and presence. 9.3 does not replace it with core `DownloadTask` or downloader metadata decoding.

### Export DTOs

```ts
export const Mode = LiteralKit(["soft", "hard"])
export type Mode = typeof Mode.Type

export class ExportInput extends S.Opaque<
  ExportInput, { readonly brand: unique symbol }
>()(
  S.Struct({
    defaultFileName: S.String,
    mode: Mode,
    sourcePath: S.String,
    subtitleText: S.String
  }).pipe($I.annoteSchema("ExportInput", {
    description: "Video export consumes subtitle bytes supplied by its caller."
  }))
) {}

export const ExportResult = S.Union([
  S.Struct({ status: S.tag("saved"), path: S.String }),
  S.Struct({ status: S.tag("canceled") }),
  S.Struct({
    status: S.tag("unavailable"),
    reason: LiteralKit(["missing-source", "audio-only"])
  }),
  S.Struct({ status: S.tag("failed"), message: S.String })
]).pipe(S.toTaggedUnion("status"))
export type ExportResult = typeof ExportResult.Type

export const ExportProgress = S.Struct({
  percent: S.NullOr(S.Finite)
})
export type ExportProgress = typeof ExportProgress.Type
```

Desktop text formats remain `txt/md/srt`; styles remain `transcript/subtitles/segments/whisper/video`; grouping remains `none/words/sentences`. MCP retains its additional `vtt/json` formats and inline/paginated/saved envelopes.

Production schemas, including small helper schemas, receive identity annotations and the repository-required JSDoc lead, titled Example, category and `@since 0.0.0`. The declaration probes do not establish that textual/documentation gate.

## 4. Errors

Main failures retain the original thrown value. RPC maps public fields once.

```ts
export class MainFailure extends S.TaggedError<
  MainFailure, { readonly brand: unique symbol }
>()(
  "MainFailure",
  { original: S.Defect() },
  $DesktopId.create("main/lib/DesktopTranscript.errors")
    .annote("MainFailure", {
      description: "Original main-process failure retained for legacy callers."
    })
) {}

export class TranscriptOperationError extends S.TaggedError<
  TranscriptOperationError, { readonly brand: unique symbol }
>()(
  "TranscriptOperationError",
  {
    operation: S.String,
    legacyName: S.String,
    message: S.String,
    code: RpcOptional(S.String)
  },
  $DesktopId.create("shared/Transcript.errors")
    .annote("TranscriptOperationError", {
      description: "Public transcript operation failure."
    })
) {}
```

Production may use the foundation `OriginalFailure` carrier directly or a recognized capability adapter over it. There is one original-failure mapping policy. Arbitrary objects containing `cause` or `original` are not unwrapped.

| Producer | Exact text or construction | Existing boundary |
| --- | --- | --- |
| Host start/rediarize, `transcript-host.ts:651–656,949–954` | `download not found: ${downloadTaskId}`; `source file missing` | Async rejection |
| Package enqueue, `P/Enqueue.layer.ts:49–54` | `source file missing: ${sourceFilePath}` | Admission failure |
| Host edit selection, `:1077,1100,1123` | `Transcript is not ready to edit` | Synchronous throw |
| Host update/delete/insert, `:1083,1106,1129` | `Caption could not be updated`; `Captions could not be deleted`; `Caption could not be added` | Synchronous throw |
| Model admission, `asr-model-task.ts:26–70` | `Unknown ASR tier`; `ASR download task was not persisted` | Rejected admission |
| Model waiter, `:75–99` | Task `rawMessage`, else `ASR model download failed` | Rejected wait |
| Waiter/selection | `ASR model download cancelled or paused`, name `AbortError` | Rejected wait/selection |
| Host delete, `transcript-host.ts:895–905` | `cannot delete the active ASR model`; then `Cancel the queued ASR download before deleting its model` | Rejection in that order |
| ASR executor, `asr-model-executor.ts:74–78` | `ASR package is not ready after download`, code `ASR_OUTPUT_MISSING` | Queue output-missing finish data |
| Catalog/session, `cloud-transcription.ts:18–37,57–60` | `Sign in to use Cloud transcription`; `Cloud transcription models are unavailable`; `Invalid Cloud transcription catalog` | Rejection |
| Cloud response, `:94–110` | `body.error ?? "Cloud transcription failed"`; `Invalid Cloud transcription response` | Error carries code/status/`Number(Retry-After)*1000` |
| Queue reference, `queue-ref.ts:9` | `desktop task queue is not initialized` | Original synchronous failure |
| Worker path, `transcription-worker-path.ts:5–12` | `${name} bundle not found in ${moduleDir}; rebuild the desktop app` | Original synchronous failure |
| Remote admission, `remote-captions.ts:186–195` | `Too many caption downloads are running. Wait for one to finish.` | Pre-protected-body rejection |
| Remote timeout, `:107–119` | `Caption extract timed out` | Process Promise rejection, then existing outer classification |
| Remote nonzero result, `:219–225` | Last trimmed stderr line, else `Caption extract failed` | Error snapshot |
| Remote no track, `:242–249` | `No captions available`, code `noCaptions` | Error snapshot |
| Remote caught non-Error, `:266–272` | `Caption extract failed` | Error snapshot unless abort wins |
| Subtitle result, `subtitle-download.ts:44–47` | `${snapshot.errorCode}: ${snapshot.error}`, with code | Rejection; `noCaptions` remains nonretryable |
| Subtitle validation, `:10–19` | Existing trim/max/regex validation; `Provide one subtitle language tag`; default format `srt` | Existing strict and retained zod presentations |
| Export preflight, `export-video-subtitles.ts:58–99` | `subtitle track is empty`; `ffmpeg is not available`; `output path matches the source video`; `Another video export is already running`; `Output file already exists` | Failed result |
| Export output, `:132–151` | `ffmpeg produced an empty file`; caught Error message or `String(error)` | Failed result unless cleanup rejects |
| Export process, `:259–270` | `export cancelled`; trimmed retained stderr; else signal/code message | Internal rejection interpreted by export |
| Source/video availability | `missing-source`; `audio-only` | Unavailable reason |
| Dialog/aborted export | `canceled` | Result discriminant |
| Files, SQL, dialogs, account and callbacks | Original thrown value, class, message and code at current catch boundary | Propagation or existing classification |

Package error bytes and precedence remain those of the reviewed transcription design and G’s error implementations: model integrity/lock/cancellation, PCM/WAV, account/source/checkpoint mismatches, worker/result, embedded-caption deadlines and store failures. A store miss remains null until the host deliberately constructs an application error.

External surfaces retain their existing messages:

| Surface | Texts |
| --- | --- |
| MCP | `All media paths must be absolute`; `speakerCount is required`; `key is required`; `tier is required`; `Unknown transcription action`; `A local source video is required`; `No transcript is available. Start transcription and wait for completion, or select an available caption source.` |
| Localization | `Subtitle source is unavailable; inspect list_transcripts first`; `Subtitle source has no usable cues`; `A local video is required for subtitle muxing or burning`; `Video subtitle export did not complete`; `Generated media is empty` |
| Dubbing overrides | `Duplicate speech override for cue ${n}`; `Speech override cue ${n} is outside the selected media`; `Speech override cue ${n} does not match the saved subtitle; read the source again` |

Sources: `M/mcp/transcript-tools.ts:60–65,155,185–207,287–329`; `M/lib/video-localization.ts:26–137`; `M/lib/dubbing-text.ts:16–28`.

Legacy invokes preserve the installed registrar’s `Error in IPC method ${channel}:` logging and rethrow of the caught value. Synchronous facades use the warmed synchronous runner. Promise facades settle from exit observers and retain named old adoption turns. `FiberFailure` does not escape those surfaces.

JSON parsing that must preserve native syntax diagnostics uses foundation `JsonSyntax`. Tolerant readers retain their existing recovery. A generic schema syntax issue does not replace an original parser exception.

## 5. RpcGroups and streams

### Envelope and payload declarations

Import the foundation implementations by their production names:

- `S/RpcField.model.ts`
- `S/RpcObservation.model.ts`
- `S/DocumentDelivery.model.ts`
- `S/DocumentDelivery.errors.ts`

The following declaration form is typechecked against installed Effect 4.1.4. Application results remain separate from transport metadata.

```ts
import * as Rpc from "effect/rpc/Rpc"
import * as RpcGroup from "effect/rpc/RpcGroup"
import * as S from "effect/Schema"
import * as B from "@vidbee/transcription/Model.model"
import * as L from "@vidbee/transcription/Literal.model"
import * as M from "./Transcript.model.js"
import { RpcOptional } from "./RpcField.model.js"
import { RpcObserved } from "./RpcObservation.model.js"
import {
  Completion, Subscription, Token
} from "./DocumentDelivery.model.js"
import { DeliveryError } from "./DocumentDelivery.errors.js"
import { TranscriptOperationError } from "./Transcript.errors.js"

export const Dependencies = S.Struct({
  changes: RpcOptional(Token),
  models: RpcOptional(Token),
  downloads: RpcOptional(Token),
  settings: RpcOptional(Token),
  account: RpcOptional(Token),
  agent: RpcOptional(Token),
  exportProgress: RpcOptional(Token)
})
export type Dependencies = typeof Dependencies.Type

const done = <A, I, RD, RE>(success: S.Codec<A, I, RD, RE>) =>
  Completion({
    success: RpcObserved(success),
    error: TranscriptOperationError
  })
```

The request envelope uses `RpcObserved` over its typed struct as well. This preserves explicitly supplied negative zero and presence while checking the declared payload. It grants no additional semantic acceptance beyond that view. Main strips `token` and `dependencies` before application delegation.

```ts
export const TranscriptRpcs = RpcGroup.make(
  Rpc.make("Transcript.GetCloudModels", {
    payload: S.Struct({ dependencies: Dependencies }).pipe(RpcObserved),
    success: done(M.CloudCatalog), error: DeliveryError
  }),
  Rpc.make("Transcript.GetForDownload", {
    payload: S.Struct({
      token: Token, dependencies: Dependencies, downloadId: S.String
    }).pipe(RpcObserved),
    success: done(M.Detail), error: DeliveryError
  }),
  Rpc.make("Transcript.GetDetail", {
    payload: S.Struct({
      token: Token, dependencies: Dependencies, downloadId: S.String
    }).pipe(RpcObserved),
    success: done(M.Detail), error: DeliveryError
  }),
  Rpc.make("Transcript.GetPlaybackCues", {
    payload: S.Struct({
      token: Token, dependencies: Dependencies, downloadId: S.String
    }).pipe(RpcObserved),
    success: M.Cues.pipe(S.NullOr, done), error: DeliveryError
  }),
  Rpc.make("Transcript.GetSourceCues", {
    payload: S.Struct({
      token: Token, dependencies: Dependencies,
      downloadId: S.String, key: S.String
    }).pipe(RpcObserved),
    success: done(M.SourceCues), error: DeliveryError
  }),
  Rpc.make("Transcript.GetStatusMap", {
    payload: S.Struct({
      token: Token, dependencies: Dependencies
    }).pipe(RpcObserved),
    success: done(S.Record(S.String, M.Status)), error: DeliveryError
  }),
  Rpc.make("Transcript.ImportLocal", {
    payload: S.Struct({
      dependencies: Dependencies, paths: S.Array(S.String)
    }).pipe(RpcObserved),
    success: done(M.ImportResult), error: DeliveryError
  }),
  Rpc.make("Transcript.Start", {
    payload: S.Struct({
      dependencies: Dependencies, downloadId: S.String,
      force: RpcOptional(S.Boolean),
      speakerCount: RpcOptional(L.SpeakerCount)
    }).pipe(RpcObserved),
    success: done(M.Detail), error: DeliveryError
  }),
  Rpc.make("Transcript.Rediarize", {
    payload: S.Struct({
      dependencies: Dependencies,
      downloadId: S.String, speakerCount: L.SpeakerCount
    }).pipe(RpcObserved),
    success: done(M.Detail), error: DeliveryError
  }),
  Rpc.make("Transcript.SelectSource", {
    payload: S.Struct({
      dependencies: Dependencies, downloadId: S.String, key: S.String
    }).pipe(RpcObserved),
    success: done(M.Detail), error: DeliveryError
  }),
  Rpc.make("Transcript.Retry", {
    payload: S.Struct({
      dependencies: Dependencies, downloadId: S.String
    }).pipe(RpcObserved),
    success: done(M.Detail), error: DeliveryError
  }),
  Rpc.make("Transcript.Cancel", {
    payload: S.Struct({
      dependencies: Dependencies, downloadId: S.String
    }).pipe(RpcObserved),
    success: done(M.Detail), error: DeliveryError
  }),
  Rpc.make("Transcript.GetModelStatus", {
    payload: S.Struct({ dependencies: Dependencies }).pipe(RpcObserved),
    success: done(M.ModelStatus), error: DeliveryError
  }),
  Rpc.make("Transcript.GetModelPrepStatus", {
    payload: S.Struct({
      token: Token, dependencies: Dependencies
    }).pipe(RpcObserved),
    success: done(B.ModelPrepStatus), error: DeliveryError
  }),
  Rpc.make("Transcript.RedownloadModels", {
    payload: S.Struct({ dependencies: Dependencies }).pipe(RpcObserved),
    success: done(M.ModelStatus), error: DeliveryError
  }),
  Rpc.make("Transcript.GetPartials", {
    payload: S.Struct({
      token: Token, dependencies: Dependencies, downloadId: S.String
    }).pipe(RpcObserved),
    success: M.PartialSegment.pipe(S.Array, done), error: DeliveryError
  }),
  Rpc.make("Transcript.EnsureTier", {
    payload: S.Struct({
      dependencies: Dependencies, tier: L.AsrTierId
    }).pipe(RpcObserved),
    success: done(M.ModelStatus), error: DeliveryError
  }),
  Rpc.make("Transcript.SetTier", {
    payload: S.Struct({
      dependencies: Dependencies, tier: L.AsrTierId
    }).pipe(RpcObserved),
    success: done(M.ModelStatus), error: DeliveryError
  }),
  Rpc.make("Transcript.DeleteTier", {
    payload: S.Struct({
      dependencies: Dependencies, tier: L.AsrTierId
    }).pipe(RpcObserved),
    success: done(M.ModelStatus), error: DeliveryError
  }),
  Rpc.make("Transcript.CancelTier", {
    payload: S.Struct({
      dependencies: Dependencies, tier: L.AsrTierId
    }).pipe(RpcObserved),
    success: done(M.ModelStatus), error: DeliveryError
  }),
  Rpc.make("Transcript.Upgrade", {
    payload: S.Struct({
      dependencies: Dependencies, downloadId: S.String, tier: L.AsrTierId
    }).pipe(RpcObserved),
    success: done(M.Detail), error: DeliveryError
  }),
  Rpc.make("Transcript.UpdateSegment", {
    payload: S.Struct({
      ...M.Patch.fields, dependencies: Dependencies
    }).pipe(RpcObserved),
    success: done(M.Detail), error: DeliveryError
  }),
  Rpc.make("Transcript.DeleteSegments", {
    payload: S.Struct({
      dependencies: Dependencies,
      downloadId: S.String, segmentIds: S.Array(S.String)
    }).pipe(RpcObserved),
    success: done(M.Detail), error: DeliveryError
  }),
  Rpc.make("Transcript.InsertSegment", {
    payload: S.Struct({
      ...M.Insert.fields, dependencies: Dependencies
    }).pipe(RpcObserved),
    success: done(S.Struct({
      segmentId: S.String, snapshot: M.Detail
    })),
    error: DeliveryError
  }),
  Rpc.make("Transcript.ExportVideo", {
    payload: S.Struct({
      ...M.ExportInput.fields, dependencies: Dependencies
    }).pipe(RpcObserved),
    success: done(M.ExportResult), error: DeliveryError
  }),
  Rpc.make("Transcript.CancelVideoExport", {
    payload: S.Struct({ dependencies: Dependencies }).pipe(RpcObserved),
    success: done(S.Void), error: DeliveryError
  }),
  Rpc.make("Transcript.WatchChanges", {
    success: M.Changes.pipe(RpcObserved, Subscription),
    error: S.Union([TranscriptOperationError, DeliveryError]),
    stream: true
  }),
  Rpc.make("Transcript.WatchModels", {
    success: B.ModelPrepStatus.pipe(RpcObserved, Subscription),
    error: S.Union([TranscriptOperationError, DeliveryError]),
    stream: true
  }),
  Rpc.make("Transcript.WatchExportProgress", {
    success: M.ExportProgress.pipe(RpcObserved, Subscription),
    error: S.Union([TranscriptOperationError, DeliveryError]),
    stream: true
  })
)
```

All unary application failures are inside `Completion.exit`. Outer `DeliveryError` covers registration/delivery failure. Both successful and failed application exits carry cuts. No main handler waits for Ack or renderer application.

### Registration and dependency families

Capability policy names are:

| Key | Observation family | Owner/publication source |
| --- | --- | --- |
| C | Transcript changes | Partial flush and updated send, `transcript-host.ts:1144–1171`; queue observer `:1190–1208` |
| M | Transcript model prep | `transcript-host.ts:1005–1040`; model progress subscription |
| D | Downloads | E91’s coalesced renderer publications, `M/index.ts:735–818` |
| E | Transcript export progress | `export-video-subtitles.ts:124–140,279–286` |
| A | Agent observations reached by synchronous transcript hooks | E94; hook call at `transcript-host.ts:1167`, automatic-skill work at `ai-skill-auto-run.ts:9–48` |
| S | Settings | Foundation settings publication family |
| B | Account credits | Foundation notification family; `cloud-transcription.ts:43–49,111,118–120` |

The production family identifiers for D, A, S and B are imported from their owners. C, M and E bind the three transcript watchers. Dependency keys are local payload names, not a second identity system. F owns one acquired, composed logical RPC client covering transcript operations and every dependency stream whose token they carry. Capability services expose typed views of that client; they do not independently acquire clients or duplicate family subscriptions. All supplied tokens belong to that composed client.

Every provided token is checked against authenticated document/client ownership and its declared family. Unknown, foreign, old-generation, closed or replaced tokens fail before application dispatch. The handler does not wait for an unidentified future registration.

The renderer drains a watcher until `Registered {token,epoch}` before making a required initial read. A stream query that has not been pulled is not registered. The installer registers each release before its next fallible step; synchronous publication followed by installation failure exposes no `Registered`.

The following ledger is exhaustive for the 26 unary procedures. **Required** identifies the token field. **Dependencies** identifies optional active families whose current published sequences are captured at either application exit. An absent optional registration contributes no cut. A required registration cannot disappear and thereby waive its obligation.

| Procedure | Required token | Dependencies and source of pre-reply observations |
| --- | --- | --- |
| GetCloudModels | None | None. Catalog loading publishes no account-credit or transcript event (`cloud-transcription.ts:12–38`). |
| GetForDownload | C | C, D, M, A. Queue start and possible overlay admission precede the reply; explicit broadcast precedes changed-branch return (`transcript-service.ts:61–84`; host `:172–203,1164–1171`). |
| GetDetail | C | C. Snapshot application must follow previously admitted transcript observations; the read itself publishes none (`host:445–449`; page `:582–617`). |
| GetPlaybackCues | C | C. Cue application follows the current transcript family; no publication is added by the read (`host:456–471`; cue store `:276–337`). |
| GetSourceCues | C | C. Bilingual refresh is driven by transcript updates; the read itself has no publication (`host:475–501`; bilingual hook `:28–57`). |
| GetStatusMap | C | C, D. Queue start precedes the read; earlier compact/download publications retain their order (`service:109–113`; host `:582–615`). |
| ImportLocal | None | C, D, M, A. Serial parent import/admission and per-result transcript broadcasts precede return (`host:620–635`; importer `:158–251`). |
| Start | None | C, D, M, A; B on the force branch. Caption shortcut or enqueue and broadcast precede reply (`host:642–683`). Forced admission can cancel an old cloud run whose credit finalizer publishes before this exit. Accepted recognition is not joined. |
| Rediarize | None | C, D, M, A, B. Activation, forced admission and broadcast precede reply (`host:943–994`); cancellation of an old cloud run can admit its credit-finalizer publication before this exit. |
| SelectSource | None | C, D, M, A. Unknown-key branch publishes none; known-source branches broadcast, and caption overlay may admit queue/model work (`host:518–552`). |
| Retry | None | C, D, M, A; B on any path reaching forced admission. Manual retry or delegated start, followed by snapshot/broadcast (`host:687–706`); the model-mismatch branch delegates to forced start. |
| Cancel | None | C, D, M, A, B. Queue cancellation can publish before its awaited cancellation continuation; cloud cancellation may complete its existing credit-finalizer publication before the host reply (`host:709–717`; cloud `:118–120`). No new cloud join is added. |
| GetModelStatus | None | M. Model/status application follows prior prep observations; status is captured before GPU await (`host:809–836`). |
| GetModelPrepStatus | M | M. Listener-before-read hydration and live-event-wins (`R/store/transcript-models.ts:48–78`; host `:999–1002`). |
| RedownloadModels | None | M. Manager progress callbacks occur during its awaited operation (`host:839–840,1033–1040`). |
| GetPartials | C | C. Restoration must not overtake earlier partial/update observations; no publication is added (`host:911–920`; page `:630–637`). |
| EnsureTier | None | C, D, M, A. Package-task admission/resume/wait can publish queue, transcript and model observations before status return (`host:865–875`; `asr-model-task.ts:45–99`; queue observer `host:1190–1208`). |
| SetTier | None | C, D, M, A. Ensure sequence, settings writes, then explicit prep publication (`host:853–861`). Direct settings writes do not themselves call `broadcastSettingsChanged`. |
| DeleteTier | None | M. Guards precede removal; explicit prep publication precedes status read (`host:895–908`). No queue mutation occurs on success. |
| CancelTier | None | C, D, M, A. Sequential queue cancellations and manager cancellation precede enriched status (`host:881–889`). |
| Upgrade | None | C, D, M, A, B. Direct settings writes precede delegated forced start; cancellation of an old cloud run can admit its credit-finalizer publication before this exit. No settings notification is invented (`host:927–934`). |
| UpdateSegment | None | C, A. Store mutation, readback and broadcast precede synchronous return (`host:1072–1087`). |
| DeleteSegments | None | C, A. Same synchronous content/readback/broadcast boundary (`host:1096–1110`). |
| InsertSegment | None | C, A. Insert, snapshot and broadcast precede return (`host:1119–1133`). |
| ExportVideo | E when the dialog’s progress consumer is mounted, supplied in `dependencies.exportProgress` | E. Existing progress publications precede logical return or cleanup failure (`export-video-subtitles.ts:124–159`). Headless/in-process explicit-output callers use no renderer token. |
| CancelVideoExport | None | None. It requests abort and returns; it neither publishes progress nor waits for child completion (`export-video-subtitles.ts:44–51`). |

C/D/M/A dependencies cover publications actually admitted before the application exit, including synchronous callbacks and interleavings during existing awaits. They do not flush an unsent coalescer, wait for future worker output or join automatic skills. S is deliberately absent from these operation cuts: the direct tier/provider writes do not broadcast settings. B covers active account-credit observations on branches capable of force-cancelling an old cloud run: Start(force), Rediarize, Upgrade and Retry paths reaching forced admission. Both success and failure exits capture only account publications already admitted before that exit. This adds no cloud join, notification or future-work wait; later recognition alone does not justify a cut (`host:666,687–706,927–934,962–973`; `P/Enqueue.layer.ts:59`; `cloud-transcription.ts:118–120`).

Required token reads continue carrying the token on subsequent fresh invocations. Transport metadata is removed before calling application methods. Legacy facades and main-only callers acquire no renderer registration requirement.

Replacement during an operation cannot erase an old ordering obligation. Production `DocumentDelivery` retains the participating registration identity/history through completion capture and retirement. The supplied amendment module’s weaker replacement behavior is not accepted as production behavior.

### Stream policies

| Stream | Initial behavior | Order/coalescing | Capacity, cancellation and replay |
| --- | --- | --- | --- |
| WatchChanges | Sole `Registered`, then live observations; no fabricated transcript snapshot | Partial and updated observations share source order. Existing 250 ms per-download whole-partial coalescing remains before publication. Updated observations never coalesce. | Initially 1,024 pending observations, excluding in-flight chunk; foundation byte limits also apply. Unsubscribe destroys this queue. No replay. |
| WatchModels | Sole `Registered`; caller then issues token-bearing GetModelPrepStatus | Latest-value prep slot; retain source progress throttle and live-event-wins initial hydration | One replaceable value plus accounted bytes. Resubscription performs a new explicit prep read. |
| WatchExportProgress | Sole `Registered`; no progress snapshot | Source order; no added coalescing | Initially 256 pending values plus bytes. Mount with the dialog’s existing listener lifetime. No absent-listener backlog or replay. |

Model registration does not fabricate a live event that would suppress the explicit initial read. Values published by the existing model source during acquisition remain live events.

A per-stream overflow terminates that subscription with the foundation typed terminal path, including while Ack is withheld. Aggregate client/document exhaustion terminates the offending logical client. Physical failure retains connection-wide cleanup. New codec/admission failure cannot suppress later legacy recipients.

At each recipient’s old send point, preserve legacy delivery and its exception boundary, then independently admit the migrated observation. The transcript publisher retains:

```text
pending partial flush
→ automatic-skill hook
→ compact updated publication
```

If the hook throws, no updated publication follows. Earlier partial delivery remains delivered. Application watermarks advance after the existing synchronous consumer prefix; detached continuation completion is not part of that watermark.

## 6. Services, drivers, Layers and resources

### Application contract

Application types are derived from the complete group’s inner success, not its completion envelope.

```ts
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type * as Rpc from "effect/rpc/Rpc"
import type * as RpcGroup from "effect/rpc/RpcGroup"

type Rpcs = RpcGroup.Rpcs<typeof TranscriptRpcs>
type UnaryTag = Exclude<Rpc.Tag<Rpcs>, `Transcript.Watch${string}`>

type CompletionValue<C> =
  C extends { readonly exit: infer X }
    ? Extract<X, { readonly _tag: "Success" }> extends {
        readonly value: infer A
      } ? A : never
    : never

export type Application = {
  readonly [K in UnaryTag]: (
    input: Omit<
      Rpc.Payload<Rpc.ExtractTag<Rpcs, K>>,
      "token" | "dependencies"
    >
  ) => Effect.Effect<
    CompletionValue<Rpc.Success<Rpc.ExtractTag<Rpcs, K>>>,
    MainFailure
  >
}

export class DesktopTranscript extends Context.Service<
  DesktopTranscript, Application
>()(
  $DesktopId.create("main/lib/DesktopTranscript.service")
    `DesktopTranscript`
) {}
```

`Application` remains the renderer-facing adapter. The main-only `TranscriptHost`, `AsrModelTasks`, `VideoSubtitleExport` and `DesktopCloudTranscription` Context.Service contracts are supersets of the native and legacy operations they own, not Pick/Omit partitions of `Application`. Their complete declarations and actual consumer composition are K’s implementation requirement B2. They add no renderer wire permissions.

The named native operations retain the existing export names. Native implementations return Effects with original failures; facades preserve the synchronous or Promise forms shown below, including optional/default-bearing arguments and adoption turns. Read and edit inputs use the native package contracts, including the existing `TranscriptSegmentPatch` and `InsertTranscriptSegmentInput`, rather than the narrower renderer payloads.

| Main-only contract | Named native operations and retained inputs/results | Source |
| --- | --- | --- |
| TranscriptHost start | `startTranscriptionForDownload(downloadTaskId, force = false, asrTier?, speakerCount?, creation?)` → Detail. `asrTier` pins the tier; `creation` retains TaskCreationMetadata, including agent/conversation provenance. Facade returns Promise. | `M/lib/transcript-host.ts:642–683`; MCP `:169–171`; `agent-management-host.ts:124–130` |
| TranscriptHost reads/content | `readTranscriptDetail(downloadTaskId)`, `getTranscriptSnapshot(downloadTaskId)` → Detail; `readTranscriptPlaybackCues(downloadTaskId)` → Cues or null; `readTranscriptSourceCues(downloadTaskId,key)` → SourceCues; `getTranscriptStatusMap()` → status map; `getTranscriptPartials(downloadTaskId)` → partial segments; `emptyTranscriptSnapshot(downloadTaskId)` → Detail. Facades are synchronous. | Host `:445–508,582–615,725–740,911–920` |
| TranscriptHost actions | `overlayCaptionSpeakersIfNeeded(downloadTaskId)` and `importCaptionsForFinishedDownload(downloadTaskId,sourceFilePath)` → boolean; `selectTranscriptSource(downloadTaskId,key)`, `retryTranscription(downloadTaskId)`, `cancelTranscription(downloadTaskId)`, `upgradeAndRetranscribe(downloadTaskId,tier)`, `rediarizeTranscription(downloadTaskId,speakerCount)` → Detail; `importLocalMediaForTranscription(paths)` → ImportResult. Facades return Promises. | Host `:172–203,293–305,518–552,620–635,687–717,927–994` |
| TranscriptHost edits/deletion | `updateTranscriptSegment(downloadTaskId,segmentId,patch)` and `deleteTranscriptSegments(downloadTaskId,segmentIds)` → Detail; `insertTranscriptSegment(downloadTaskId,input)` → `{segmentId,snapshot}`; `deleteTranscriptsForDownload(downloadTaskId)` → void. Facades are synchronous. | Host `:750–759,1072–1133` |
| TranscriptHost borrowed handles/resolution | `getTranscriptStore()` and `getModelManager()` → attached handles over the acquired owners; `resolveTranscriptionWorkerScript()` → string; `resolveTranscriptionBackend()` → sherpa/fake; `preferredCaptionLanguages(language = readUiLanguage())` → string array; `readActiveAsrTier()` → tier; `readUiLanguage()` → string. Facades are synchronous. | Host `:223–262,842–850` |
| TranscriptHost lifecycle | `startAutoTranscription()`, `stopAutoTranscription()`, `startHostGpuProbe()`, `flushDeferredAutoTranscriptions()`, `startIdleMinimalModelFill()` → void, synchronous facades; `resolveTranscriptionGpuKinds()` → readonly GPU kinds, Promise facade. These reach the existing coordinator/model/GPU owners. | Host `:307–340,796–807,1031–1052` |
| TranscriptHost publications | `broadcastTranscriptPartials(downloadTaskId,segments)`, `broadcastTranscript(snapshot)`, `broadcastTranscriptForDownload(downloadTaskId)`, `subscribeTranscriptBroadcasts()` → void, synchronous facades. | Host `:1152–1208` |
| AsrModelTasks | `getTranscriptionModelStatus()`, `redownloadTranscriptionModels()`, `ensureAsrTier(tier)`, `setActiveAsrTier(tier)`, `deleteAsrTier(tier)`, `cancelAsrTier(tier)` → ModelStatus, Promise facades; `readTranscriptionModelPrep()` → prep, synchronous facade. `listAsrModelTasks(tier?)` → ordered readonly task values, synchronous facade; `enqueueAsrModelDownload(tier:string,creation = {origin:"manual"})` → `{created,task}` and `waitForAsrModelTask(id)` → void, Promise facades. | Host `:809–908,999–1002`; `M/lib/asr-model-task.ts:7–99` |
| VideoSubtitleExport | `exportVideoWithSubtitles(input, options?)` → ExportResult, Promise facade. Input is the existing VideoSubtitleExportInput; options is the existing optional `{outputPath:string,signal:AbortSignal}`. Renderer export supplies no options. Explicit output retains no-dialog arbitration and caller cancellation. `cancelVideoSubtitleExport()` → void, synchronous facade. | `M/lib/export-video-subtitles.ts:49–60,79–107`; MCP `:295–306` |
| DesktopCloudTranscription | `loadCloudTranscriptionModels()` → retained CloudCatalog; `runDesktopCloudTranscription(input,sink)` implements P’s remediated `ExecutorHooks.cloud`: task ID, source path, model ID and caller signal, partial/progress sink, and the honest execution result/cleanup carried through ExecutionResult → ExecutorCommit → store. The retained runner facade preserves the original `TranscriptionExecutorOptions["runCloud"]` call form and callbacks. | `M/lib/cloud-transcription.ts:12–38,52–121`; `P/TranscriptionExecutor.service.ts:19–31`; section 3 cloud boundary and P gate |

Legacy facades delegate to these named internal operations, including main-only lifecycle/content methods. The application adapter supplies renderer arguments to these broader contracts; it does not discard pinned tier, creation metadata, native edit fields or export options from retained callers. The shared attachment and cloud declarations must satisfy B2 and B4 before activation.

Each production service uses its own package/file identity composer. `TranscriptEvents` exposes application `Stream<Changes,MainFailure>`, model-prep and export-progress streams. Foundation delivery supplies registration/observation envelopes and transport errors.

`TranscriptContent` delegates to the real `TranscriptStore` service. Its Layer receives the existing store and forwards reads/edits; it acquires no connection or second store. This delegation is typechecked in `probes/Content.layer.ts`.

`TranscriptRpcs.toLayer` validates metadata, delegates, maps `MainFailure` once, captures cuts on either application exit and returns `Completion`. Original failures remain available to old invoke/facade routes.

### Owners and call graph

| Owner | Responsibility |
| --- | --- |
| DesktopTranscript | Desktop queue-start awaits and exact field forwarding |
| TranscriptHost | Viewing keys, selection resolution, projections, broadcasts and host actions |
| TranscriptStore | Rows, heads, replacement, activation, append and edits |
| Partials | One live/restored buffer shared with execution |
| Enqueue | Source checks, reuse, force cancellation, retry and task construction |
| Coordinator | Future-completion subscription and process-local pending IDs |
| AsrModelTasks | Same-tier admission and subscribe-before-check waiting |
| Models | Validated files, controllers, locks, readiness and progress |
| DesktopCloudTranscription | Captured account/session, HTTP, notifications and runner integration |
| RemoteCaptions | Shared remote extraction admission and lifecycle |
| SubtitleDownload | Caption serialization, exclusive file publication and executor integration |
| LibraryExport | Existing directory creation and unique name calculation |
| VideoSubtitleExport | Global export arbitration and export resources |
| E91 | Queue, import/history/source, binaries/probing/staging and player |
| E94 | Automatic skills, prompt/conversation state and detached cleanup |
| Foundation | SQL context, settings, logging, delivery, invocations and accepted-operation ownership |

```text
renderer invocation
  → Electron RPC
  → token validation / DesktopTranscript
  → host, models, cloud or export service
       → one TranscriptStore / Partials / Models graph
       → one borrowed TaskQueue
       → caption files, worker, cloud checkpoints or export resources
  → Completion with application exit and family cuts
  → renderer applies cuts
  → invocation callback/error

legacy invoke / MCP / HTTP / other main caller
  → explicit facade attachment
  → the same application and package owners
  → original result/error and existing settlement boundary
```

### Attachment prerequisite

The current constructors acquire state (`C/model-manager.ts:84–108`; `C/transcript-store.ts:43–50`; `C/partial-buffer.ts:20–25`). Calling those constructors beside native Layers would duplicate ownership.

P adds these factories:

| Factory | Inputs | Result and restrictions |
| --- | --- | --- |
| `attachModelManager` | Acquired `Models`, synchronous/Promise/sink runners | Full existing API, including `subscribe` and `modelsDir`; no controller/runtime/Layer acquisition |
| `attachTranscriptStore` | Acquired `TranscriptStore`, borrowed SQL context and synchronous runner | Full old store API over that owner |
| `attachTranscriptionPartials` | Acquired `Partials`, synchronous runner | Existing singleton-shaped API |
| Executor/coordinator attachments | Acquired services, queue/context and approved runners | Existing callback/Promise forms over those owners |

Attachments perform no constructor call, directory creation, schema application, runtime creation or resource disposal registration. Callback-identity adapter bookkeeping is permitted. Model controllers, partial buffers, store state and admission state are not duplicated.

The owner handle supplies acquired values, a Layer exposing those same values, approved runners and one disposal operation. Attachments borrow it. Only the owner disposes.

Lazy initialization remains at the existing first-use points. Importing contracts does not open the database, apply schema, create model directories or start work. Store schema application occurs once. Model acquisition occurs once. Synchronous facade paths use synchronous capabilities and the same contextual SQL handle.

Before activation, P proves full legacy assignability in its actual compiler partition, mutable nested fields, optional/default-bearing calls, callbacks and receiver behavior. It proves writes/readback in both directions, one controller/cancellation owner, one partial buffer, one initialization, borrowed savepoints, synchronous reentry and owner-only disposal. `modelsLayerFor` wrapping the old Promise manager is not this composition.

### Transactions and files

The database remains the foundation’s borrowed handle and contextual `SqlClient`. This phase opens no connection and imports no node-SQLite value driver into desktop.

Transcript transactions retain `BEGIN IMMEDIATE`. They retain pre-transaction reads, clock/ID positions, segment replacement, activation and post-transaction readback (`P/TranscriptStore.layer.ts:224` onward; transcription design section 6). No transaction sleeps, performs file/network I/O or holds a permit across a yielding callback.

The cloud-observed commit path uses that same transaction and original value-binding behavior. It does not normalize unchecked language through a local pipeline decoder.

Caption discovery retains directory order, per-file catches, preferred language rules, serial embedded extraction and partial commits. No generic atomic writer changes direct writes, fixed `.tmp` paths, rename residue, flags, fsync policy or inode permissions.

### Cloud protocol

| Step | Contract |
| --- | --- |
| Catalog | Captured Cookie, capabilities GET, 10-second timeout; 401/non-OK handling before success validation |
| Session | Dynamic account access and session check before entering the protected body |
| Run capture | Account ID, cookie and base URL captured once |
| Binary | ffmpeg readiness inside the protected body |
| Upload | WAV POST; query insertion order requestId then modelId; caller abort combined with 105 seconds |
| Response | JSON before status interpretation; original syntax failure retained |
| Successful clip | Consumed-field validation, all-live-window credit notification, original object returned |
| Abort | Pre-check; one-shot listener; detached best-effort cancel POST `{requestId}` with 10 seconds; swallow its failure |
| Clip cleanup | Remove abort listener at the existing finally boundary |
| Outer cleanup | Second credit notification after protected-body success or failure |
| Early session failure | No newly acquired outer-finalizer notification |

Checkpoints retain source fingerprint, account/model/work-key identity, PCM/clip checks, request ID before upload, result save before consumption, same ID across ambiguous failure, existing reservation rotation and bounded 409 restart, fixed temporary path, write/rename order, close precedence and post-commit cleanup. No notification replay, checkpoint repair or guaranteed retry is added.

### Remote-caption extraction

The result view is:

```ts
import * as P from "effect/Predicate"

const RawNumber = S.declare(P.isNumber)

export const RemoteCaptionSnapshot = S.Struct({
  author: S.String,
  duration: RawNumber,
  error: S.NullOr(S.String),
  errorCode: S.NullOr(S.String),
  segments: S.Array(S.Struct({
    end: RawNumber,
    start: RawNumber,
    text: S.String
  })),
  selectedTrackId: S.String,
  status: LiteralKit(["running", "completed", "error", "cancelled"]),
  title: S.String,
  tracks: S.Array(S.Struct({
    auto: S.Boolean,
    id: S.String,
    label: S.String,
    language: S.String
  })),
  updatedAt: S.Finite,
  cookieSources: S.Array(Q.DownloadCookieSource).pipe(S.optional)
})
export type RemoteCaptionSnapshot = typeof RemoteCaptionSnapshot.Type
```

`RawNumber` names an observed host arithmetic result, including unchecked non-finite duration. It is not used to weaken finite domain fields. The declaration passes the unchanged diagnostic matrix.

```ts
export interface CaptionExtractOptions {
  readonly language?: string
  readonly languages?: ReadonlyArray<string>
  readonly signal?: AbortSignal
  readonly onProcess?: (
    child: { readonly pid?: number; readonly kill: () => void }
  ) => void
}

export class RemoteCaptions extends Context.Service<
  RemoteCaptions,
  {
    readonly extract: (
      url: string,
      options: CaptionExtractOptions
    ) => Effect.Effect<RemoteCaptionSnapshot, MainFailure>
  }
>()($RemoteId`RemoteCaptions`) {}
```

| Boundary | Current behavior retained |
| --- | --- |
| Admission | Pre-abort first; reject immediately at two active extracts; increment synchronously before first await (`remote-captions.ts:186–198`) |
| Shared scope | Extension and subtitle queue callers use the same application owner and counter |
| Busy policy | Rejection, not a waiting semaphore |
| Temporary directory | Acquired after admission; count retained through recursive removal |
| Timer | Referenced 90-second timeout; sets timedOut and requests TERM |
| Escalation | First kill schedules a referenced two-second KILL timer; later kill requests do not schedule another |
| Timeout settlement | Timer does not settle extraction; error/close does |
| Process error | Cleanup listeners/timers, reject original error |
| Close precedence | Abort reason first, timeout error second, otherwise code/stderr |
| `onProcess` | Called after listener/timer installation; callback exception retains its existing Promise rejection position |
| Callback failure resource gap | A throwing callback can reject before child close; outer error handling and directory cleanup can complete while child timers/listeners remain. Preserve logical settlement and separately retain native ownership. |
| Outer catch | Abort reason wins; otherwise construct error snapshot with existing classifier |
| Outer cleanup | Directory removal can override result/failure; nested finalization decrements count even if removal fails |
| Missing track | Error snapshot with `No captions available`/`noCaptions` |
| Track result | Existing language alias preference, cue filtering, units and cookie provenance |

Embedded-caption capture remains separately governed by `CaptionProcessOwner`: its caller may return at timeout while an owner retains reaping. Remote extraction must not adopt that caller-return policy.

### Export resources and precedence

| Resource | Scope and behavior |
| --- | --- |
| Controller | Application-global; clear only at the existing identity-guarded point |
| Interactive preflight/dialog | Complete before replacing active export |
| Explicit-output call | Reject existing output or active export; no dialog |
| Signals | Existing global/caller combination; request departure does not call global cancel |
| Subtitle file | Written before protected body; retain existing cleanup gap on write failure |
| Duration probe | No added timeout/cancellation |
| Child | Existing detached/priority/pipes behavior and TERM-only abort |
| Progress | Chunk-local regex; no line carry buffer |
| Stderr | First 64 KiB retained, decoded/trimmed at existing failure construction |
| Publication | Size probe without new `isFile`; rename then copy/remove fallback; 100% after publication |

Cleanup failure precedence is explicit:

1. Body failure enters staging removal; removal can replace it.
2. Final subtitle removal precedes final staging removal.
3. Either final cleanup failure replaces the preceding result/failure.
4. Failure before controller clearing prevents clearing.
5. Identity guarding prevents an older export from clearing a newer controller.

Use captured `Exit` values and Effect finalization to implement that replacement precedence. A sequential combined Cause mapped to the earlier body error is not equivalent. No JavaScript `try/finally` surrounds `yield*`.

### Lifetimes and native activation gates

| State/resource | Lifetime |
| --- | --- |
| Store, models, viewing keys, GPU cache, fill flag | Application; lazy at current points |
| Queue and SQL | Borrowed |
| Coordinator/pending IDs | Start/stop; no restart backfill |
| Minimal fill | Application one-shot; stop does not cancel in-flight ensure or suppress success callback |
| Broadcast subscription | Existing boot lifetime and explicit registration multiplicity |
| Partial coalescer | Application; per-download pending timer/value |
| Model waiter | Caller scope; subscribe before immediate check |
| Tier admission | Application; internal lifecycle record installed before work can synchronously finish |
| Worker | Attempt through output drain, termination and reaping |
| Remote extractor | Logical extraction plus separately retained actual child cleanup |
| Cloud | Existing run/checkpoint/audio ownership |
| Dialog/export | Actual native completion, surviving request departure as required |
| Renderer | Existing component/document lifetimes |

Register lifecycle state before a fiber can complete synchronously. Preserve the old point at which deduplication becomes visible to reentrant callbacks; exposing it earlier can make a callback await itself.

| Native obligation | Selected owner | Required discriminator |
| --- | --- | --- |
| Blocking worker output versus awaited output | WorkerOutput | Packaged output stress/watchdog/throughput and suspension trace |
| Referenced/unreferenced timers | TranscriptionTime and remote extractor driver | Natural-exit/handle tests for each timer |
| Raw acquisition/killed/close/stdin/unread pipes | Shared process capability adapter | Real child acquisition, EOF, unread pressure, signal-target, close/reap and descendant tests |
| Embedded timeout | CaptionProcessOwner | TERM-ignoring child; caller returns while cleanup remains owned |
| Remote timeout | RemoteCaptions | No timeout settlement before close; TERM/KILL and cleanup/count trace |
| Fractional timestamps | ModelFiles/fingerprint boundary | Fractional-millisecond source oracle and cache/work-key comparison |
| Preparation rejection | Explicit preparation handle | Rejection before extraction settles; original observation/adoption window |
| Sherpa | One lazy driver | ABI/raw result/repair predicate and decode-only 0.95-threshold timing |
| Shared graph | Attachment factories | Bidirectional state/identity, lazy initialization, reentry and disposal |

Unavailable strict primitives block activation. A driver filename or compatibility-only pass is not an exemption.

## 7. Renderer

All capability views use the foundation Protocol, `desktopAtomRuntimeFactory` and document registry over one acquired, composed logical RPC client. F composes TranscriptRpcs with the Downloads, Agent, Account and other dependency groups whose stream tokens transcript operations carry, and acquires that client once. `TranscriptClient` is a typed capability view of that acquired client, for example through AtomRpc.Service’s `makeEffect`; it must not independently call RpcClient.make. The dependency stream views use the same acquired client. Sharing only a Protocol or runtime does not share logical-client identity (`effect/src/reactivity/AtomRpc.ts:181`; `effect/src/rpc/RpcClient.ts:659`).

All supplied tokens belong to that composed client. The frozen foreign-client rejection rule remains in force. No duplicate family subscriptions are added to work around identity. F owns production composition; K/F/I prove actual cross-capability registration and cuts under B1 before dependent renderer work starts.

The checked atom declarations include document map/prep/handoff state and the earlier standalone AtomRpc client declaration. That declaration is not the corrected production acquisition recipe. The production runtime/provider and composed acquisition remain foundation-owned and subject to B1.

### Invocations and state

Every action executes a direct client Effect under `RendererInvocation.entry.ts`. A shared `TranscriptClient.mutation(tag)` is not a completion owner. Optional result atoms are fresh per invocation and use the document owner.

| Action family | Completion policy |
| --- | --- |
| Edit/delete/insert | Independent pending calls; each reply/error reaches its own callback/catch |
| Source/start/retry/cancel/upgrade | Independent completion; preserve current `applyLoaded` order |
| Model actions | Independent callers; deduplication/arbitration remains in package owners |
| Polling/catalog | Preserve existing overlap and component active guards |
| Export | Independent requests reach global export arbitration |
| Reads | Explicit invocations with their existing path-specific guards |

The foundation start gate installs cancellation, fiber and observer before application execution. Document teardown settles callers and interrupts delivery fibers before registry disposal. StrictMode component detach is not document destruction. Accepted main/native work retains its separate owner.

| State | Lifetime/default |
| --- | --- |
| Compact map | Document, initially `{}`; strips sources/bodies/detail flags |
| Detail | Route/component; reset on download change |
| Prep | Document; ready=true, downloading=false, percent=100 |
| Cue fetching | One orchestration port over E91’s cue-view state |
| Player/playlist/resume | E91’s single owners |
| Bilingual preferences | Per-download document memory |
| Prompt handoff | Memory until consumed |

Opening, detail refresh, cue planning, bilingual refresh and partial restoration issue fresh requests. Correctness does not depend on `AtomRpc.query` expiry or rereading a mounted atom.

### Freshness and edits

| Path | Existing acceptance retained |
| --- | --- |
| Compact update without record | Clear body/detail-only flags |
| Full reply | Mark body loaded, set body revision, invalidate older detail request token |
| Same identity update | Keep loaded body; changed revision marks stale without advancing body revision |
| Changed identity | Drop old body |
| Detail reply | Match request token, expected identity/revision and current displayed record |
| Cue reply | Match request token, transcript ID, record source kind, snapshot source kind, language and revision |
| Paused player | Retain same-session cues; clock ticks do not fetch |
| Seeded cues | Loaded non-stale detail only; discard words; do not overwrite another download |
| Bilingual | Existing effect cancellation/key guard; matching updates cause fresh attempts |
| Partial event | Match download ID and segments; replace whole list |
| Partial restoration | Preserve unguarded late setter; no new route/task/revision guard |
| Edit/delete/insert reply | Apply full snapshot and invalidate older detail fetches |
| Editing UI | Clear editing state at the existing pre-completion point; no added optimistic content transaction or rollback |

Body identity remains record ID, record source kind, language and snapshot source kind joined with NUL (`R/lib/transcript-detail-merge.ts:15–29`). A task ID, model receipt or timestamp alone is insufficient.

Sources: page `:480–637`; merge module `:111–199`; cue store `:115–337`; bilingual hook `:8–61`; caption pane `:1020–1068,1128–1137`.

The delivery watermark precedes these merge rules. It does not replace them with a new global revision policy.

Initial refresh errors remain swallowed; detail errors retain displayed body; prep failures remain logged; bilingual failure remains local. Quiet model cancellation and existing toast behavior remain.

Markup, classes, order, keys, focus, virtualization, typewriter/reduced motion, selection, scrolling, drag/drop, previews and conversation mount positions remain unchanged. E91 retains its clock, playlist, resume and panel-layout constants.

## 8. Other consumers and legacy facades

Old consumers use direct facades, not desktop JSON RPC.

| Consumer | Transitional route and preserved distinction |
| --- | --- |
| Old transcript channels | Same application operations, positional signatures, original failures and installed invoke wrapping |
| MCP transcript tools | Existing strict tool validation → host facade; existing filtering, pagination, words option and envelopes |
| Agent task creation | Existing admission wrapper → same queue/transcript/model owners |
| Embedded transcript read/select/search | Existing run-local source selection; does not alter desktop viewing keys |
| Agent subtitle append | Same transaction and sidecar owner |
| HTTP/CLI | Existing automation routes/client, status/body/output and sequencing |
| Extension | Existing independent caption jobs, origin/token checks, polling and cancellation race |
| Localization/dubbing | Same source reads and explicit-output export facade |
| History removal | Same synchronous transcript deletion; queue descendants remain queue-owned |

MCP retains nonempty/bounded IDs, pagination, nonnegative times, bounded text/list sizes, absolute imports, action-specific required fields and tool metadata. Desktop RPC does not acquire those validations.

The host facade covers store/model getters, worker/backend resolution, caption import/overlay, coordinator/fill/GPU lifecycle, snapshots/detail/cues/status, import/start/retry/cancel/select/rediarize/upgrade, model operations, partials/broadcasts, edits/deletion and broadcast registration.

The export facade preserves `exportVideoWithSubtitles`, `cancelVideoSubtitleExport`, exported input/result types and the explicit-output overload. The path facade preserves `libraryExportPath(title, extension, directory?)` as a Promise of string.

These are required now because:

- `M/mcp/transcript-tools.ts:263,295` awaits path/export helpers.
- `M/mcp/export-tools.ts:125,235,291` awaits path allocation.
- `M/lib/video-localization.ts:89` uses path allocation and explicit-output export.
- Subtitle download and dubbing also import those helpers.

Awaiting an Effect instead of a Promise is not compatibility. Runtime execution stays in explicit facades.

Legacy optional/default-bearing forms remain plain forwarding functions. Native fixed-arity dual functions are not directly reexported as old signatures. Tests cover both valid native forms and omitted/explicitly undefined old arguments, plus actual nested mutations.

Facades, old channels/events and the sibling remain through phase 10 and final harness migration.

## 9. Semantics table

The dependency ledger in section 5 applies to both exits of every unary row below.

| Operation | Current behavior and source | Producer after port |
| --- | --- | --- |
| Open | Queue start; importing snapshot; non-none/missing-source branch still attempts overlay; otherwise import then overlay; publish changed branches only (`service:61–84`) | Desktop application branch/await ledger |
| Detail | Sidecar scan, no import/start, selected body hydration (`host:445–449`) | Host/store |
| Playback cues | Scan without import; null without selected head; cue-only query (`:456–471`) | Selection/store |
| Source cues | Unknown → []; stored metadata-bearing cues or matching sidecar language, no activation (`:475–501`) | Caption/store |
| Importing snapshot | Import sidecars only if no latest head and source exists; reread heads (`:385–392,504–508`) | Caption owner |
| Status map | Heads grouped once; paged queue pass; task order first, remaining current heads afterward; no folder/body scan (`:582–615`; index `:37–67`) | Ordered projector/index |
| Import local | Serial parent import/reuse then transcription admission before history projection; afterward broadcast each imported item (`:620–635`; importer `:158–251`) | E91 importer plus supplied hook |
| Start | Parent/source validation before caption shortcut; nonforce captions return/broadcast; otherwise enqueue, remember ASR, snapshot/broadcast (`:642–683`) | Host/Enqueue |
| Enqueue | Source check; active reuse; force awaits cancellation; reread; matching failed/cancelled retry; completed non-no-speech reuse; otherwise existing maxAttempts/priority/group (`P/Enqueue.layer.ts:49–106`) | Existing package |
| Retry | Compare latest failed/cancelled tier/provider/cloud model; mismatch forces start; match awaits manual retry; otherwise normal start (`:687–706`) | Pure decision at same call site |
| Cancel | Await active cancellation, conditionally clear live ASR view, importing snapshot and broadcast (`:709–717`) | Host/queue |
| Active queue cancel | Persist/emit cancelled before awaiting executor cancellation; no general finish-Deferred wait (`G TaskQueue.layer.ts:653–685`) | Queue owner |
| Unknown source | Initial importing snapshot, no remembered-key change or broadcast (`:522–526`) | Host |
| ASR source | Remember, activate first matching stored ASR transcript if present, no recognition, publish before reply (`:527–537`) | Selection/store |
| Caption source | Switch/import language if source exists, await overlay, publish; ASR continues (`:539–552`) | Caption/host |
| Overlay | Cloud/active/no-need/no-source → false; remember caption view before force-rediarize admission (`:172–203`) | Host/Enqueue |
| Rediarize | Validate; activate viewed record before enqueue; prefer previous ASR tier; force; remember view after admission (`:943–994`) | Same owners/order |
| Upgrade | Persist tier/local provider before validation; force pinned tier; no readiness wait (`:927–934`) | Settings/host |
| Model status | Capture manager status before GPU await; compute later fields afterward (`:809–836`) | Models/GPU/pure policy |
| Ensure tier | Ready result retains async settlement; otherwise admit/resume/wait; final ASR-only status (`:865–875`) | Tasks/Models |
| Set tier | Await ensure; ready check; tier/provider writes; prep broadcast; manager status (`:853–861`) | Same sequence |
| Cancel tier | Serial matching nonterminal cancellations, manager cancellation, enriched status (`:881–889`) | Queue/Models |
| Delete tier | Active-tier guard before queued-task guard; remove, prep broadcast, status (`:895–908`) | Same sequence |
| Redownload | Direct manager operation, bypasses model-task admission (`:839–840`) | Models |
| Prep | Cloud ready/100/not-downloading; otherwise minimal groups plus selected tier (`:999–1002`) | Existing projection |
| Partials | Download buffer first, then active child, otherwise [] (`:911–920`) | Shared Partials |
| Update | Resolve viewed ID through importing snapshot; mutate; null error; reread; synchronous broadcast (`:1072–1087`) | Store/host |
| Delete segments | Same selection; unknown IDs can retain record; delete-all preserves result kind (`:1096–1110`) | Existing edit/store rules |
| Insert | Selected record at execution; existing placement/speaker rules; ID/full snapshot (`:1119–1133`) | Existing edit/store rules |
| Broadcast | Partial flush, automatic-skill hook, compact updated plus sources (`:1164–1171`) | Synchronous sink and recipient publisher |
| Queue observer | Transition/snapshot-changed; reread task; transcription maps to parent; other snapshot changes ignored; no sidecar scan (`:1190–1208`) | Same callback |
| Automatic work | Future completed transitions only; caption import before enabled/model guards; post-await rechecks; stop clears pending (`P/Coordinator.layer.ts:35–119`) | Coordinator |
| Minimal fill | Subscribe progress; cloud return; one-shot flag; existing delays and success flush callback (`:1018–1052`) | Models/fill |
| Delete transcript | Detached conversation deletion starts first; clear partial/view; delete store; stop/delete prompts; empty broadcast (`:750–759`) | Same separate owners |
| Cloud | Session before protected body; captured auth/base; ffmpeg inside; JSON before status; clip plus final credit notifications (`cloud:52–121`) | Cloud service/remediated runner |
| Cloud recovery | Request ID before upload; fresh result before consumption; ambiguous failure retains ID; existing rotation only (`P/CloudTranscription.layer.ts:89–180`) | Checkpoint owner |
| Remote admission | Pre-abort, immediate two-active rejection, synchronous increment (`remote:186–198`) | Shared RemoteCaptions |
| Remote timeout | 90-second TERM, two-second KILL; settle on error/close, not timer (`remote:75–132`) | Remote process driver |
| Remote cleanup | Abort precedence; error-as-data catch; directory cleanup can override; decrement always (`remote:264–279`) | Explicit Exit precedence |
| Subtitle publication | Extract, convert, allocate, exclusive open, write/close, post-write abort; failure removes file (`subtitle:30–84`) | SubtitleDownload |
| Subtitle executor | Journal spawn, optional rename, abort check, caption commit, finish; failure removes file/classifies; cancel waits done (`executor:29–123`) | Strict executor |
| Library path | Await mkdir; exact basename/control-character/trailing-dot/80-character policy; fallback `VidBeep`; UUID; no file reservation (`library-export:7–23`) | LibraryExport |
| Interactive export | Validate/probe/dialog before replacing controller (`export:56–107`) | Export owner |
| Explicit export | No dialog; reject existing output/active controller; combine signals (`:79–107`) | Same owner |
| Export progress/process | Chunk-local regex, first 64 KiB stderr, TERM-only abort, existing completion (`:225–270`) | Process driver |
| Export cleanup | Pre-body write; cleanup can override result and prevent controller clearing (`:110–159`) | Captured Exit/finalization |
| Publication | Size without isFile, rename/copy/remove, then 100% (`:132–140,289–321`) | File primitives |
| Partial restoration | No route/task/revision guard (`R/pages/Transcript.tsx:630–637`) | Independent invocation/same setter |
| Concurrent edits | Editing state clears early; speaker action independently updates (`CaptionsPane:1020–1068,1128–1137`) | Invocation-owned results |
| Extension cancel | Immediate cancelled snapshot; extraction can later overwrite it (`extension-transcript:199–206`) | Unchanged E95 owner |

B records microtask traces before replacement. No row authorizes an added await, mutex, retry, detached join or stronger acknowledgement.

## 10. Obligations for the later model

The model enters behind these contracts. This phase approves no aggregate layout, event log, authority marker, durable intent or migration from the supplied model draft.

| Boundary | Obligation |
| --- | --- |
| Replies | Admission snapshots, task waits, abort acknowledgements and original timing retain their meanings |
| Content | Existing complete transcript transaction remains authoritative, with immediate committed reads |
| Selection/sidecars | Existing owner wins; delayed observations cannot change the view or overwrite committed content |
| Files | Validated files and committed selection determine package readiness |
| Cloud | Existing account/source/model identity, request-ID save and paid-result replay remain authoritative |
| Live work | Viewing keys, coordinator pending IDs, fill, progress and export controllers acquire no restart replay |
| Notifications | Durable commit followed by crash does not authorize replaying a live notification |
| Derived history | Any promised recovery requires immutable outcome, owner order/generation, applied watermark, deletion/incarnation rules and a concrete file-publication protocol |
| Committed outcomes | Recording cannot re-adjudicate or reject an already committed service fact as a new business request |
| Adoption proof | Actual model-backed handlers pass the same DTO, facade, timing, delivery, renderer and recovery suites |

Sharing SQLite does not provide a cross-owner transaction. Model position does not replace content revision or renderer request identity. Missing model observations do not authorize cloud reupload or package readiness.

Pure decisions move now at their existing call sites:

| Decision | Pure owner |
| --- | --- |
| List lifecycle, rediarize visibility, compact record/stage projection | `transcript-list-snapshot.ts` |
| Child ordering/active precedence | Pure portion of `transcript-queue-index.ts` |
| Title fallback, retry comparison, tier fallback, live-ASR-view removal | `TranscriptHost.model.ts` |
| Model guards/prep interpretation | `AsrModelTasks.model.ts` and host model |
| Subtitle evidence/private/edited/track interpretation | `CloudSubtitleEvidence.model.ts` |
| Export argv/escaping/progress/result interpretation | Existing args module and export model |
| Detail/cue acceptance/library compaction | Existing renderer pure modules |

Inputs include captured time, randomness, paths and observations where needed. Moving these functions adds no read, wait, transaction or recovery step. Decision tests independently derive new results from identical inputs; they do not feed old computed results into the candidate.

## 11. Deliberate changes

No application behavior change is selected.

The frozen foundation’s new-surface policies apply: typed payload validation, finite admission/accounting, dense-array admission, visible terminal overflow, scoped subscription cleanup and retained observation encoding.

Reply cuts preserve the old observation-before-reply relationship. They do not delay main application completion or alter old-channel settlement.

No stronger cloud validation, partial guard, settings notification, export concurrency repair, timeout-policy substitution, progress buffering, historical stage narrowing or automatic recovery is authorized.

## 12. Verification owed and evidence obtained

### Executed local probes

The revision ran:

```sh
node node_modules/tsrs/bin/tsrs -p probes/tsconfig.json
bun probes/corpus.mjs
bun probes/delivery.mjs
python probes/verify-v3.py
```

`probes/tsconfig.json` extends the local configuration that extends V’s actual `tsconfig.base.json`. It preserves diagnostic severities and strict options. Bundled-module/test overrides are ESNext/Bundler, DOM plus ESNext, no emit, and disabled declaration/incremental/composite output. Identity paths point to T. Real package imports resolve through G’s installed workspace packages.

`probes/verification-v3.json` records exit 0 for the strict check, corpus and delivery probe. Three altered-copy runs exit 1 as expected; originals are restored and the baseline corpus/typecheck pass again.

| Probe | What it checks | Limit |
| --- | --- | --- |
| `probes/Transcript.model.ts`, `Transcript.rpc.ts`, `Transcript.errors.ts` under the strict check | Actual model/error/RpcGroup declarations construct and typecheck | Does not establish production JSDoc/textual gates |
| `probes/contracts.entry.ts`, `HostContracts.service.ts`, `RemoteCaptions.service.ts`, `Content.layer.ts` | Context.Service contracts, result extraction and real store delegation | Does not implement the full application |
| `probes/Renderer.atoms.ts` | AtomRpc client and atom declarations | No React mount/provider proof |
| `probes/corpus.mjs` | All 26 unary and three stream declarations through real `RpcSerialization.json.codecFor`; installed RpcServer/RpcClient pair; payloads, successes, application failures, delivery errors and registration/observation envelopes | Handler fixtures are controlled; not production orchestration |
| `probes/corpus.mjs` restoration path | Real native `Partials.restoreFromManifest`, actual stage-history function, actual list projector and source-extracted host `finishTranscriptSnapshot`, then complete unary/stream codecs | Manifest acquisition and selected-record lookup are injected; not a physical disk/SQL restoration exercise |
| `probes/corpus.mjs` retained-value cases | Nulls, omissions, own undefined, future result/tier/stage values, retained stage metadata, stored cue metadata, missing partial words, cloud `Infinity`, negative zero, nested metadata and key order | Representative corpus, not exhaustive external input generation |
| `probes/corpus.mjs` original failures | Original Error/object/null identity in the main-only carrier | Actual installed old registrar remains owed |
| `probes/delivery.mjs` | Active/replaced/closed token checks; pending success cut; unrelated empty-cut progress; terminal failure of unsatisfied cut | Uses supplied amendment mechanisms |
| `probes/delivery.mjs` exact RPC path | Server immediately returns ExportVideo Completion; renderer cut remains pending; CancelVideoExport progresses; application Failure completion waits for its cut | Does not establish production cut capture or all operation dependencies |
| `probes/delivery.mjs` invocation path | Actual supplied invocation entry with ManagedRuntime/AtomRegistry; reverse completion, immediate completion and document teardown | No React StrictMode/HMR integration |
| `probes/verify-v3.py` construction mutation | Adds Registered to the kind-tagged Changes union; construction fails | Negative proof of the tested declaration |
| Same runner, stage mutation | Narrows observed stage to live stage kit; restoration/corpus fails | Negative proof of top-level stage preservation |
| Same runner, retained-wire mutation | Removes RpcObserved from the actual unary completion success path; corpus fails | Negative proof of the declared wire path |
| `probes/corpus.mjs` JSON-loss control | Ordinary JSON loses retained values/order/presence and fails comparison | Comparator control |

The corpus compares primitives with `Object.is`, own keys/order, nested values and array identity. It does not generate candidate semantic decisions from old outputs. Passing projector values through a codec establishes representation preservation only.

The strict check covers TypeScript probe modules. The JavaScript harnesses run but are not included in that TypeScript graph. These probes are not a complete standards gate.

The freezing pass reran the first three commands above unchanged; each exited 0. The strict check produced no output. The corpus reported:

```json
{
  "schemas": 23,
  "rpcs": 29,
  "unary": 26,
  "streams": 3,
  "checks": [
    "construction",
    "real-json-codecs",
    "RpcServer-RpcClient",
    "source-finish-projector",
    "native-partial-restoration",
    "future-stage",
    "retained-history",
    "Infinity",
    "negative-zero",
    "presence",
    "key-order",
    "failure-cuts",
    "negative-json-loss"
  ]
}
```

The delivery probe printed:

```text
PASS active/replaced/closed token checks; pending success cut; unrelated empty cut; terminal failed cut; actual invocation entry reverse completion/immediate/document teardown with AtomRegistry
PASS exact Transcript RPC: immediate server Completion; pending renderer cut; unrelated reply progresses; application Failure carries and waits for cut
```

A1–A3 are text-only corrections in the final review. No declaration or probe was corrected in this freezing pass. These unchanged probes do not prove the composed logical client, complete native service supersets or forced-replacement account cuts. The earlier Pick/Omit service declarations in `probes/HostContracts.service.ts` are not the corrected native contracts. B1–B3 require actual declarations, composition and discriminating execution; B4–B6 remain mandatory implementation gates.

The supplied amendment modules are evidence scaffolding. The amendment’s frozen final implementation requirements remain binding: ordinary observation envelopes, terminal arbitration, bounded failure bookkeeping, replacement-history retention, all-release teardown, immediate cleanup, original listener traversal, constructible declarations and post-completion defect reporting. Transcript must rerun against production modules when available.

### Existing recordings and inventory corrections

Existing recordings remain immutable. Their presence is not a fresh pass.

| Family | Existing cases |
| --- | --- |
| Model | `transcription/model-ready`, `model-installed-ensure` |
| Recognition/export | `local-complete`, `local-export` |
| Speaker/force | `rediarize-1`, `rediarize-2`, `force` |
| Real-ASR branch | `cancel-active`, `missing-source`, `retry` |
| Exploration-only branch | `two-clips`, `two-clips-rediarize-2` |
| Automatic/captions | `auto-no-speech`, `auto-caption`, caption-source cases, `caption-rediarize-1/2` |
| Persistence | `physical-persistence`, `restart-speech`, `restart-download-${i}` |
| MCP | Existing list/get/edit/insert/delete, formats/styles/grouping/pagination/invalid cases |
| Extension | Existing preflight, invalid input/token and unknown-session cases |

`cancel-active` and `missing-source` are outside the `explore` block. They occur after the real-ASR gate (`G apps/desktop/scripts/port/golden/transcription-cases.mjs:147–197`). Contract-only runs do not establish them.

Material inventory corrections are: G contains native transcription services/tests; desktop stateful imports use the sibling; stored source cues retain metadata; cloud acceptance is narrower in consumed fields than its nominal type; restored stages are open observations; route smoke does not establish freshness/edit/player behavior; explicit lifecycle recordings exist.

### Record on the current build before source changes

The following are **owed** probes, not executed claims. B freezes source/build revisions, lockfile, interpreter, fixture bytes, model manifest and provider evidence before recording.

| Probe to implement | Current-build characterization |
| --- | --- |
| `source-oracle.mjs:invoke-census` | All 26 methods: arguments/presence, synchronous prefix, original errors, actual registrar wrapping and complete success/failure settlement turns |
| `source-oracle.mjs:read-projectors` | Scan/import/admission distinctions; compact/detail/cue/partial shapes; stored future values and retained history |
| `source-oracle.mjs:selection-lifecycle` | Unknown/empty ASR/caption language, active recognition, overlay failure, activation before admission failure, retry/force/model mismatch/cancel |
| `source-oracle.mjs:model-tasks` | Ready/missing/paused/removed/failed, same-tier sharing, reentry, immediate completion, concurrent selection and settings failure |
| `source-oracle.mjs:auto-fill` | No backfill; completion during/after start; stop/remove during import; pending order and fill callback behavior |
| `source-oracle.mjs:cloud` | Syntax identity, JSON-before-status, unchecked fields, notifications, checkpoint bytes, ambiguity, replay, 409 and abort |
| `source-oracle.mjs:remote-captions` | Shared extension/queue admission, callback exceptions, timer references, TERM/KILL, close/error/abort precedence, directory failure and count release |
| `source-oracle.mjs:subtitle-publication` | Validation, journal, exclusive creation, rename, abort, file/store/task partial completion and cleanup failure |
| `source-oracle.mjs:export` | Every result/error branch, dialog parenting, preflight races, replacement, explicit output, progress chunks, publication and cleanup precedence |
| `renderer-oracle.mjs:transcript` | Actual page/hooks/actions: reverse edits/model actions, reopen, same-download detail refresh, bilingual invalidation, guarded cues/detail, unguarded partial restoration |
| `renderer-oracle.mjs:player` | E91 page/bar transfer, cue state, playlist/resume/reload/storage failure |
| `record-current.mjs:external` | Existing MCP/HTTP/CLI/extension validation, envelopes and timing |
| `record-current.mjs:event-reply-trace` | Old publication/callback/reply order; no new-protocol Ack/overflow assertion |

The unchanged build has no new Completion/cut/Ack mechanism. Those tests belong to the candidate suite.

### Candidate tests and mutations

| Sections | Permanent test/probe | Required mutation or discriminator |
| --- | --- | --- |
| 2 | Ownership manifest and compiler-resolved graph checks | Duplicate writer; alias/type-only/declaration path into legacy implementation |
| 3 | `Transcript.model.test.ts` | Null→omission, own undefined loss, narrowed stored kind/stage, stripped cue/history/cloud metadata, negative-zero loss |
| 4 | `TranscriptCompatibility.test.ts` | Reconstructed original error; early wire mapping; wrong cleanup/parser precedence |
| 5 | `TranscriptStreams.test.ts` | Missing token, stale/replaced token, missing failed-exit cut, reply overtakes observation, Ack treated as applied, lost replacement obligation |
| 5 | Same test with production Protocol | Full RpcClient queue; stalled Ack overflow; terminal arbitration; Eof; unrelated same/other-client replies progress |
| 6 | `TranscriptComposition.test.ts` and package attachment tests | Second store/model/partial/queue, extra initialization, wrong SQL context, state registered after immediate fork |
| 6 | Native package tests and `RemoteCaptions.test.ts` | Waiting admission instead of rejection; timeout settles early; callback failure loses ownership; cleanup/count precedence changes |
| 7 | `TranscriptRenderer/Freshness/Screen` tests | Shared mutation result, cached read, added partial guard/cancellation, changed edit callback routing |
| 8 | Compatibility/external candidate comparison | Awaited Effect leaks to filesystem, missing explicit-output overload, stricter desktop validation |
| 9 | `compare-candidate.mjs` | Independent old/new traces under controlled interleavings |
| 10 | Pure decision differential tests | Candidate receives old computed result; model dependency enters renderer graph |

`mutations.mjs` operates on fresh scratch copies after baseline passes and restores between cases. Required additional mutations move local-import transcription outside the loop, clear export ownership after failed cleanup, buffer split progress lines and derive public order from HashMap/HashSet traversal.

### Packaged gate and proof limits

`packaged.mjs` must exercise new RPC and retained channels together; real speech/silence/captions; source switching/overlay; partials/edits/retry/force/cancel/restart; default segmentation/embedding/punctuation; soft mux/hard burn verified by inspection/playback; reload/disconnect during streams, model waits, dialogs and exports; unchanged screen/bilingual/player/export appearance; and absence of main/legacy/later-model code from strict renderer bundles.

Baseline and candidate use the same complete model manifest and assert the actual provider. Missing models mean missing local-ASR acceptance. Fake workers and loopback cloud establish contracts, not speech or billing.

The phase gate runs strict source/test partitions, standards/schema/identity/JSDoc/resolved graphs, `port:check`, whole-repo checks/tests/dependency checks, Linux packaging, CLI/extension distribution checks and unchanged goldens, followed by independent review and fix verification.

Linux cannot prove macOS/Windows packaged providers, native UI integration or platform process-tree behavior. Offline probes cannot prove authenticated cloud billing/cancellation/replay, live-site captions, remote model availability or throughput. No such proof was run in this revision.

## 13. Implementation lanes

Future worktrees use `~/YeeBois/workstation-apps/worktrees/VidBee/<lane>`. At most three implementation lanes run concurrently. No implementation lane was started for this revision.

| Order/lane | Work | Gate |
| --- | --- | --- |
| 0 — B | Current-build characterization and immutable recordings | Old-source observations repeat; provenance frozen; mutations discriminate |
| 1 — K | Models/errors/RPCs/service contracts/composition ports | Complete construction/runtime codec census, strict declarations and standards; architect review |
| 2 — P | Package fresh-cloud, attachment and native remediation | Full runner/hooks/commit/store composition; legacy declaration/mutation/callback compatibility; one-owner/lazy/SQL/native proofs |
| Prerequisite — F | Production frozen amendment adoption and shared runtime composition | All final amendment regressions pass; transcript probes rerun against production modules; K/F agree on one acquired composed logical client and typed capability views under B1 before dependent renderer work |
| Prerequisite — E91 | Queue attachment, import/history/source/coalescer/media ports | Exact required services implemented and gated; in-loop hook available; no 9.3 edits |
| 3A — H | Host/content/projection/legacy host | Selection, transaction, read/broadcast and timing oracles |
| 3B — M | Model tasks/executor | Admission/reentry/immediate completion/file-state parity |
| 3C — C | Desktop cloud/evidence | HTTP/checkpoint/metadata/credit/cancel matrix |
| 4A — X | Video export and export facade | Native/file/dialog/publication/cleanup precedence |
| 4B — S | Remote captions/subtitle/path service and facades | Shared admission, process lifecycle, publication and external call compatibility |
| 4C — R | Registry state/pure freshness/cue orchestration | Actual actions, caches, overlap and late-result tests |
| 5 — U | Screen/hooks/components/settings panels | Real hook/DOM action proof and unchanged appearance |
| 6 — I | Delivery policy, route composition and coexistence tests | Per-operation cuts, original errors, shared owners, all forwarding prerequisites landed |
| 7 — A | Report and acceptance | Full phase gate, packaged required paths and independent review |

H/M/C and X/S/R require P, production F and the exact E91 ports they consume. They do not begin native activation merely because `reports/9.0.md` exists; that report characterizes unchanged application source.

F serializes shared-root and forwarding-only edits. E91/E92 files remain outside 9.3’s write scope. Contract changes return to K; package changes return to P. Section 2 assigns each listed file exactly one writer.

## 14. Behavior kept as it is

These are owner review candidates, not fixes.

| Behavior | Source |
| --- | --- |
| Read-like open/snapshot can import or admit work | Service `:61–84`; host `:385–392,504–508` |
| Remembered viewing differs from stored activation/task | Host `:142–219,518–552` |
| Unknown source returns without broadcast | `:522–526` |
| Failed/cancelled rediarization can remain completed/no-speech | List projector `:71–134` |
| Upgrade changes defaults before validation | Host `:927–934` |
| Model status mixes pre-await and later observations | `:809–836` |
| Cloud prep reports ready without local models | `:999–1002` |
| Redownload bypasses package-task admission | `:839–840` |
| Broadcast registration lacks idempotence guard | `:1190–1208` |
| Automatic caption import precedes enabled/model guards; no backfill | Coordinator `:35–119` |
| Fill stop does not cancel in-flight ensure/success callback | Package fill contract |
| Transcript deletion starts detached cleanup and can partially complete | Host `:750–759` |
| Same text clears words; time edits do not shift them; delete-all preserves kind | Package edit/store rules |
| Full action replies apply in completion order | Caption actions/page applyLoaded |
| Partial restoration can settle into later route/state | Page `:630–637` |
| Fresh unusual cloud metadata can save yet fail replay | Cloud fresh/replay boundaries |
| Remote admission rejects instead of waiting | Remote `:186–195` |
| Remote callback failure can settle before child cleanup | Remote `:75–132,264–279` |
| Remote cleanup failure overrides result but count still decrements | Remote `:273–279` |
| Export size probe does not check regular-file kind | Export `:289–295` |
| Empty trimmed source normalizes before validation | `:58` |
| Interactive export replaces work; explicit output rejects it | `:92–107` |
| Global cancel has no ownership ID | `:44–51` |
| Duration probe lacks timeout/cancel; codec failure becomes audio-only | `:72–76,190–219` |
| Progress is chunk-local | Args `:28–42` |
| Cleanup can override result and leave controller uncleared | Export `:144–159` |
| Credit notifications occur per clip and outer finally | Cloud `:111,118–120` |
| Local scratch cleanup precedes commit; cloud cleanup follows it | Package executor |
| Subtitle file/store/task operations can partially complete | Subtitle executor |
| Extension cancellation can be overwritten | Extension `:199–206` |

Preserve truthiness: `Boolean`, `??`, `||`, null and undefined checks are not interchangeable. Preserve explicit array/key/listener order; Effect collection traversal is not a replacement for source order or stable ties.

## 15. Open questions

No unresolved product behavior choice is delegated to implementation lanes.

| Item | Options if proof fails | Recommendation |
| --- | --- | --- |
| Finite budgets | Raise measured finite constants; reduce retention without changing results; visible refusal | Measure full frames, decoded values and retained copies; no sliding loss for changes/export |
| Exact strict native primitive unavailable | Supply narrow qualified primitive; retain path unactivated; seek exact deliberate change | Preserve the old path and report blocker; do not claim phase completion |
| Full attachment mismatch | Repair actual compatibility boundary; weaken settings; hide source | Repair declarations/attachments and prove calls/mutability/timing; no weakened settings or shim |
| Production amendment not ready | Use probe implementation; delay dependent activation | Delay activation until the frozen implementation regressions pass |
| Borrowed family/port naming changes | Parallel local replacements; coordinated owner contract update | Update the shared contract before lanes start; retain one owner |
| Authenticated cloud proof unavailable | Obtain authorized proof later; substitute loopback | Report hosted evidence absent; keep local proof separately labelled |

A newly demonstrated behavior conflict requires an exact source reference, old/new trace, options and architect decision. No behavior change is pre-authorized.

## 16. Review disposition

The design was frozen after its final review with A1–A3 corrected and B1–B6 carried as mandatory implementation requirements.

“Addressed” below means corrected in this design and the named evidence. It does not mean the production phase gate has passed.

| REVIEW-FINAL.md finding | Disposition | Evidence and remaining gate |
| --- | --- | --- |
| 1 / A1 — Shared logical client | Corrected in sections 5, 7 and 13 | One acquired composed client owns transcript actions and dependency streams; capability views do not reacquire; foreign-client rejection retained. Actual composition proof is requirement B1. |
| 2 / A2 — Native services are broader than RPC adapters | Corrected in section 6; evidence scope clarified in section 12 | Renderer Application retained; native Pick/Omit-only definitions replaced by complete main-only operation contracts, including provenance/pinned tier, explicit-output/signal, cloud execution and lifecycle/content exports. Declarations and retained consumer proof are requirements B2/B4. |
| 3 / A3 — Forced-cancellation credit cuts | Corrected in section 5 | B added to forced Start, Rediarize, Upgrade and forced Retry branches on either exit for already-admitted publications; no future join. Ordering proof is requirement B3. |
| B1 — Cross-capability registration composition | Carried as requirement B1 in section 17 | K/F/I must prove actual composed clients, pending cuts, foreign rejection and retained replacement obligations. |
| B2 — Complete native contract for retained callers | Carried as requirement B2 in section 17 | K/H/M/C/X/S/I must prove original calls, provenance, options, defaults and timing, including negative mutations. |
| B3 — Forced-replacement account ordering | Carried as requirement B3 in section 17 | I/C must prove pre-exit account finalizer cuts on success/failure and a missing-B mutation. |
| B4 — Real attachment/cloud composition | Carried as requirement B4 in section 17 | P’s runner/hooks/result/commit/store, identity, SQL, lifecycle and disposal gate remains blocking. |
| B5 — Timing/resource behavior | Carried as requirement B5 in section 17 | B and owning lanes must record all 26 boundaries and shared remote/export resource behavior before replacement. |
| B6 — Actual renderer/production transport | Carried as requirement B6 in section 17 | R/U/I must prove real consumers and production foundation corpus; packaged/native gates remain separate. |


| REVIEW.md finding | Disposition | Evidence and remaining gate |
| --- | --- | --- |
| 1 — Changes construction blocker | Addressed | Section 3 removes Registered from Changes; section 5 supplies the sole outer Subscription handshake. `probes/corpus.mjs` constructs and exercises exact declarations; `verify-v3.py` construction mutation fails. |
| 2 — Missing tokens/incomplete dependency ledger | Addressed in contract and local mechanism evidence | Section 5 declares every unary’s required token, optional families, source and both-exit cuts. `Transcript.rpc.ts` contains token-bearing reads. `delivery.mjs` checks active/replaced/closed tokens and success/failure gates. Production capture, foreign identities, replacement-during-operation and complete census tests remain I/F gates. |
| 3 — Restored stages/history narrowed | Addressed | String/null observed stage, PersistedStage history and whole-result observation codec. `corpus.mjs` runs native partial restoration → actual stage/list/host finish projection → complete unary/stream codecs. Stage mutation fails. Physical disk/SQL restoration remains owed. |
| 4 — Cloud JSON rejection/value loss | Addressed | Complete GetCloudModels success uses RpcObserved. `corpus.mjs` checks Infinity, negative zero, nested metadata, own undefined and key order through actual JSON codecs and RpcServer/RpcClient. Removing the tested retained-wire wrapper fails. |
| 5 — Probes predate amendment | Replaced and claims narrowed | Strict declarations now contain Completion/DeliveryError/Subscription and no ready event. `corpus.mjs` exercises all 29 procedures. `delivery.mjs` checks immediate server completion, pending renderer cut, unrelated progress, failure cuts and actual invocation entry teardown. Production Protocol/final amendment defects, React and native acceptance remain explicit gates. |
| 6 — Export facade ledger and prerequisites missing | Addressed | Section 2 assigns explicit export and path facades, forwarding-only consumers and one writer. Sections 8/13 require them with cutover and gate foundation/E91/P before activation. Production overload/settlement/consumer tests remain X/S/I gates. |
| 7 — Remote-caption lifecycle absent | Addressed in contract | Sections 4/6/9 distinguish immediate admission rejection, timer references, TERM/KILL, error/close settlement, callback failure, abort and cleanup/count precedence. Remote service declaration typechecks and its result codec runs in `corpus.mjs`. Shared extension-plus-queue lifecycle characterization remains `source-oracle.mjs:remote-captions` and S’s production gate. |

| REVIEW-1.md item still requiring production proof | Disposition |
| --- | --- |
| 1 — Stream/reply order | Frozen foundation per-invocation cuts; local exact-RPC gate evidence in `delivery.mjs`; full Electron/stalled-Ack/source-selection/edit/deletion matrix remains owed |
| 2 — Concurrent mutation acknowledgements | Direct invocation-owned Effects; actual supplied invocation entry reverse/immediate/teardown evidence in `delivery.mjs`; React/component proof remains owed |
| 3 — Real cloud runner/store type composition | P prerequisite explicitly includes actual runner, hooks, execution result, commit and store; current probes establish boundary/representation only |
| 4 — Original failure/old registrar timing | Main-only originals and RPC-only mapping; identity checked by `corpus.mjs`; installed registrar/settlement oracle remains owed |
| 5 — Full owner attachment | Complete API includes subscribe, lazy initialization, mutability, borrowed SQL and disposal; full native/legacy composition remains P’s blocking gate |
| 6 — 9.1 ownership | Adopted player/import/capture split; 9.3 owns subtitle execution; no 9.1/9.2 edits; exact prerequisites in sections 2/13 |
| 7 — Cached reads and partial race | Explicit fresh invocations and preserved unguarded restoration; actual consumer probes remain R/U gates |
| 8 — Schema-derived aliases | Published aliases and strict declarations pass; production annotation/JSDoc gate remains owed |
| 9 — Golden inventory | Corrected: cancel-active/missing-source are real-ASR, non-exploration cases; immutable recordings retained; no fresh packaged pass claimed |

## 17. Implementation requirements

Implementation lanes are bound by every requirement below and must prove each one before acceptance; the existing requirements and gates elsewhere in this document remain in force.

1. **B1 — Prove cross-capability registration composition.** K/F/I must exercise the actual Transcript, Downloads, Agent, and Account client composition. A transcript action carrying active dependency tokens must dispatch successfully and wait for their unapplied cuts. A token from a genuinely different client/document/generation must fail. Replacing or closing a registration must not erase an existing obligation.
2. **B2 — Prove every retained caller reaches the complete native contract.** K/H/M/C/X/S/I must typecheck actual legacy consumers without casts and run their original call forms. Assert preserved agent/conversation provenance, pinned-tier behavior, no-dialog explicit export, caller cancellation, optional/default argument handling, and synchronous versus Promise behavior. A mutation dropping creation or export options must fail.
3. **B3 — Prove forced-replacement account ordering.** I/C must control an old cloud run’s cancellation so its finalizer publishes before forced-start/rediarize/upgrade success and before a subsequent admission failure. Hold account observation application: main completion must proceed, but the affected renderer result/error must wait. Removing B must fail the test.
4. **B4 — Complete P’s real attachment and cloud composition gate.** Compile and execute the actual runner → hooks → execution result → commit → store path, including missing `audioSeconds` and unusual fresh language. Prove save-before-consume, original binding/failure behavior, full model subscription API, shared partial/model/store identities, one initialization, borrowed SQL/savepoints, reentry, and owner-only disposal.
5. **B5 — Record and preserve timing/resource behavior before replacement.** B and the owning lanes must record all 26 invocation boundaries, including original registrar errors and Promise adoption turns. Remote tests must combine extension and queue callers, third-call rejection, pre-abort precedence, callback throws, referenced timers, timeout without early settlement, cleanup failure, and count release. Export tests must prove cleanup replacement precedence and identity-guarded controller clearing.
6. **B6 — Exercise actual renderer consumers and production transport.** R/U/I must test reverse action completion, fresh repeated reads, detail/cue rejection, bilingual invalidation, unguarded late partial restoration, and document teardown. Rerun the codec/delivery corpus against production foundation modules, including stalled-Ack failure, unrelated reply progress, and replacement history. Complete the packaged/native gates separately; scaffolding passes do not satisfy them.