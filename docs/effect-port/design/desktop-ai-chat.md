# Design: desktop AI chat (phase 9.4)

Status: frozen on 2026-11-22 after three independent review rounds; the implementation requirements section binds every implementation lane. Text before the freeze: third draft for the architect. The architect owns its decisions. This revision incorporates the second review and the frozen foundation amendment. Production implementation, current-build characterization and phase acceptance remain open.

The governing contracts are PLAN A1/A2/A6, D9/D10/D21/D28, the approved desktop-foundation design, and its frozen amendment. The later model draft supplies no adopted architecture. Its independent review supplies application-semantic corrections and later-adoption obligations.

Source roots:

| Name | Root | Observed HEAD |
| --- | --- | --- |
| V | `~/YeeBois/workstation-apps/worktrees/VidBee/port-desktop-foundation` | `990ed4fe6be550aed68044e1eb64218ea64ffef2` |
| G | `~/YeeBois/workstation-apps/worktrees/VidBee/port-goldens-8` | `7c94ea05a537360da9a33d556b52e242658b3c7d` |
| Standards | `~/YeeBois/workstation-apps/worktrees/VidBee/port-standards-tooling/standards` | Repository-enforced editions |
| Permission correction | `main` commit `a3b3b382dc33efc7f04dd757ac92897a0d1d0331` | Required behavior baseline |

Already ported package contracts come from G. V alone is not the assembled characterization baseline: the permission correction must be included. The observed worktree heads differ from those recorded in the previous draft.

Paths are repository-relative. `M/` means `apps/desktop/src/main/`, `L/` means `M/lib/`, `S/` means `apps/desktop/src/shared/`, and `R/` means `apps/desktop/src/renderer/src/`. Existing-source citations refer to V unless marked G.

Drafting artifacts are `revised.ts`, `services.ts`, `complete-services.ts`, `wire.mjs`, `binding.mjs`, `rpc.mjs` and their receipts in the drafting directory. They are executable contract evidence, not production modules. All writes stayed in that directory. No repository was changed, application launched, network used, or additional agent or agent CLI session started.

## 1. What the capability is, and what makes it risky

Desktop AI chat provides persistent branching conversations, standalone workspace chat, video-scoped skills, transcript evidence, images, tools, approvals, durable workers, media artifacts and exports. Chat, transcript-side chat, history, provider settings, skill settings, native notification navigation, MCP and browser chat reach the same main-process state. The older one-shot prompt API retains its separate lifecycle.

Phase 9.4 moves schemas, application services, handlers, renderer atoms and AI callers together. Pi stays behind one driver service. The later event-sourced model moves behind these contracts in a later phase.

The load-bearing contracts are:

1. **Send acknowledges admission.** Validation, message/run insertion, active registration, synchronous persistence/publication and execution initiation precede return. Generation completes later (`L/agent-chat-runner.ts:375–520`).
2. **SQLite owns public sequence.** Thread and entity changes, appended session entries and a durable event header commit together. The live thread’s `seq` advances after transaction success (`L/agent-chat-store.ts:352–449`).
3. **Recovery supplies current state.** Durable events are headers, not historical snapshots or patches. Recovery combines those headers with an independently obtained current snapshot (`S/agent-thread-patch.ts:255–265`; `L/agent-chat-store.ts:465–488`).
4. **Successful stored observations are wider than authored inputs.** Projectors retain unknown keys, explicit nulls, own undefined properties and unusual nested values. The wire must preserve their successful output.
5. **Logical completion differs from disposal.** Settlement starts disposal without awaiting it. Execution completion releases active admission. Stop waits for execution and cleanup, bounded by ten seconds (`L/agent-chat-runner.ts:507–516,545–575,1191–1219`).
6. **Accepted asynchronous mutations survive renderer departure.** Image import, deletion, native save and asynchronous settings operations retain their complete continuation, publication and cleanup.
7. **Callbacks have synchronous effects.** A session or tool callback can update state and persist before returning. Replacing it with a stream consumer changes behavior.
8. **Notification-before-reply order is observable.** The new transport preserves it with operation-specific dependency cuts, including application failure after publication.
9. **The screen crosses capability boundaries.** Downloads, transcripts, capture, settings and account capabilities enter through their existing owners. Strict AI code cannot import their legacy implementations.
10. **Secrets cross several foreign boundaries.** Persisted provider keys, fresh CLIProxy credentials, unsaved dialog keys, Pi configuration, ambient process environment and diagnostics require explicit ownership.

The port preserves successful results, deliberate errors, partial outcomes, truthiness, property presence, callback order, synchronous prefixes and Promise settlement. Bugs are recorded in section 14.

Inventory corrections verified against source:

| Inventory implication | Source contract |
| --- | --- |
| Desktop attachment paths remain visible | Desktop uses the same path-scrubbing projectors (`S/agent-thread-patch.ts:139–199`). |
| Durable rows can reconstruct catalog changes | `durableAgentEvent` removes snapshot, patch and catalog (`:255–265`). |
| Model discovery has no renderer caller | `AiProviderDialog.tsx:193,225,293` calls catalog listing, remote listing and capability lookup. |
| There are 26 provider presets | `S/ai-types.ts:4–29` declares 25. |
| Permission tests are absent | The required permission correction adds `test/agent-skill-permissions.spec.ts`. |

## 2. Scope and file dispositions

Existing implementation filenames stay. New companions use the approved `Foo.model.ts`, `Foo.errors.ts`, `Foo.service.ts`, `Foo.layer.ts`, `Foo.driver.ts`, `Foo.rpc.ts` and `Foo.atoms.ts` grammar.

The lane identifiers are defined in section 13. Grouped filename cells enumerate a finite set. Every file has one writer.

**Companion ownership rule:** lane 1 owns every new model, error and service contract named below. The implementation tables assign only existing implementation files, new Layers, drivers and facades. Backend lanes consume the frozen contracts; they do not create or edit those companions independently.

### 2.1 Main implementations

| Files under `L/` | Disposition and target | Writer |
| --- | --- | --- |
| `agent-chat-store.ts`, `agent-directory.ts`, `agent-conversations.ts`, `agent-activity.ts`, `agent-run-event.ts` | Port in place. Preserve SQL, directory projection, save planning, sequence and catalog construction. `ChatStore.layer.ts` supplies the owner. | 2A |
| `agent-events.ts` | Port in place. Preserve synchronous legacy publication; add scoped migrated subscriptions through `AgentEvents.layer.ts`. | 2A |
| `agent-run-machine.ts` | Port in place as pure decisions at the current call sites. | 1 |
| `agent-chat-runner.ts` | Split Effect-native orchestration from positional compatibility exports in `legacy/agent-chat-runner.ts`. Add `Conversations.layer.ts`. | 3A |
| `agent-session.ts`, `agent-session-types.ts`, `agent-durable-session.ts`, `agent-durable-tools.ts`, `agent-durable-tasks.ts`, `agent-model-runtime.ts` | Split application orchestration from Pi adaptation. All Pi imports, augmentation, harness adaptation and TypeBox conversion move into `Pi.driver.ts`. | 2C |
| `agent-context.ts`, `agent-compaction.ts`, `agent-memory.ts`, `agent-budget.ts`, `agent-model-profile.ts`, `agent-cloud-budget.ts`, `agent-progress.ts`, `agent-output.ts`, `agent-usage.ts` | Port in place using application messages and injected time/model capabilities. | 3A |
| `agent-run-timers.ts` | Port in place; add `AgentRunTimers.layer.ts`. Preserve pause/rearm, remaining wall time, timer truthiness and timeout policy. | 3A |
| `agent-run-context.ts`, `agent-evidence.ts`, `agent-document.ts`, `agent-transcript.ts`, `agent-subtitles.ts` | Port in place over the transcript/source owner. | 3A |
| `agent-article.ts`, `agent-article-review.ts`, `agent-article-images.ts` | Port orchestration in place over Pi, source and media services. | 3A |
| `agent-tools.ts`, `agent-tool-loading.ts`, `agent-management-tools.ts`, `agent-capability-tools.ts`, `agent-ui-tool.ts` | Port application tool definitions/execution. Pi registration and TypeBox stay in `Pi.driver.ts`. | 3B |
| `agent-management-host.ts`, `agent-capability-host.ts` | Port over injected owners. Add `AgentManagement.layer.ts`, `AgentCapabilities.layer.ts`; retain exact positional facades under `legacy/`. | 3B |
| `agent-task-wait.ts` | Port in place. Own only its wait, subscription and timer. | 3B |
| `agent-tool-approval.ts`, `agent-ui-response.ts`, `agent-ui-tasks.ts` | Port in place. Inject realpath, source-file and queue projections. | 3B |
| `agent-permissions.ts`, `agent-plugin-runtime.ts`, `agent-extension-runtime.ts`, `agent-web-access.ts`, `agent-skill-runtime.ts` | Split application policy from the sole Pi/plugin/native-tool boundary. Carry the permission correction. | 2C |
| `agent-skill-document.ts`, `agent-skill-files.ts`, `agent-skill-install.ts`, `agent-skill-migration.ts`, `agent-skills.ts` | Port in place. Add `AgentSkills.layer.ts`, `SkillDocument.driver.ts`, `SkillArchive.driver.ts`, `SkillFilesHost.driver.ts`. | 2B |
| `ai-store.ts` | Split settings and skill operations over one store owner. Add `AiSettings.layer.ts`, `AiStore.driver.ts`; retain exact exports in `legacy/ai-store.ts`. | 2B |
| `ai-secrets.ts`, `cliproxy.ts` | Split format/precedence decisions from safeStorage, environment and file access. Add `AiSecrets.driver.ts`, `AiSecretHost.driver.ts`. | 2B |
| `agent-composer.ts`, `ai-model.ts` | Port existing call sites. Consume pure provider decisions; Pi catalog conversion goes through the sole driver. | 2B |
| `AiProviderDecision.ts` | New pure selection, truthiness and ordered deletion-fallback decisions. | 1 |
| `ai-prompt-runner.ts`, `ai-prompt-store.ts`, `ai-provider-test.ts`, `ai-remote-models.ts`, `ai-skill-auto-run.ts` | Port in place. Add `AiPromptRuns.layer.ts`, `PromptLanguageModel.layer.ts`; preserve exact legacy facades. | 3C |
| `agent-cloud-request.ts`, `agent-cloud-slots.ts`, `cloud-models.ts`, `cloud-capabilities.ts` | Port in place; add `AiCloud.layer.ts`. One cache and slot owner. | 3A |
| `agent-media.ts`, `agent-artifacts.ts`, `agent-image-attachments.ts` | Port orchestration in place. Add `AgentMedia.layer.ts`, `AgentArtifacts.driver.ts`. Reuse the package process owner. | 3B |
| `agent-notifications.ts` | Port in place; add `AgentNotifications.driver.ts`. Retain one native-handle map and one pending target. | 3B |
| `extension-chat-requests.ts` | Keep its synchronous facade; move admission to `Conversations`/`ChatStore` without moving the outer transaction boundary. | 3A |
| `extension-chat.ts`, `extension-chat-actions.ts`, `extension-chat-cards.ts`, `extension-chat-events.ts`, `extension-chat-source.ts` | Keep transport implementation for 9.5. This phase changes facade imports only. | 5 |

`Pi.driver.ts` is the sole desktop application file importing Pi packages or TypeBox. Its size is a boundary cost, not permission to move application decisions into it.

### 2.2 Contract files

All paths in this table belong exclusively to lane 1.

| Directory | Files |
| --- | --- |
| `S/` | `Ai.model.ts`, `Ai.errors.ts`, `Ai.rpc.ts`, `AgentChat.model.ts`, `AgentChat.errors.ts` |
| `L/` | `ChatStore.model.ts`, `ChatStore.errors.ts`, `ChatStore.service.ts`; `AgentEvents.model.ts`, `AgentEvents.service.ts`; `Conversations.errors.ts`, `Conversations.service.ts` |
| `L/` | `Pi.model.ts`, `Pi.errors.ts`, `Pi.service.ts`; `AgentTools.model.ts`, `AgentTools.service.ts`; `AgentRunTimers.service.ts` |
| `L/` | `AiSettings.model.ts`, `AiSettings.errors.ts`, `AiSettings.service.ts`; `AgentSkills.model.ts`, `AgentSkills.errors.ts`, `AgentSkills.service.ts`; `AiSecrets.service.ts` |
| `L/` | `AiStoreHost.service.ts`, `SkillFilesHost.service.ts`, `AiPathHost.service.ts`, `AiSecretHost.service.ts`, `AgentCallbackHost.service.ts` |
| `L/` | `AgentManagement.errors.ts`, `AgentManagement.service.ts`; `AgentCapabilities.errors.ts`, `AgentCapabilities.service.ts`; `AgentTaskWait.service.ts` |
| `L/` | `AiPromptRuns.model.ts`, `AiPromptRuns.errors.ts`, `AiPromptRuns.service.ts`; `AiCloud.model.ts`, `AiCloud.errors.ts`, `AiCloud.service.ts` |
| `L/` | `AgentMedia.service.ts`; `AgentArtifacts.model.ts`, `AgentArtifacts.errors.ts`, `AgentArtifacts.service.ts`; `AgentNotifications.service.ts`; `AiProviderDecision.model.ts` |

`AiPathHost` is implemented with the settings/skills primitive hosts by 2B. `AgentCallbackHost` is implemented at the shared runtime entrypoint by lane 5.

### 2.3 IPC, preload and composition

| File | Disposition | Writer |
| --- | --- | --- |
| `M/ipc/services/ai-service.ts` | Remove the decorated class. Keep a strict assembly/re-export at this path. Every decorator method maps to section 5. | 5 |
| `M/ipc/Ai.layer.ts` | New `AiRpcs.toLayer` handlers over application services. | 5 |
| `M/ipc/index.ts` | Remove `AiService` registration; merge the AI group and retain exact old-channel forwarders. | 5 |
| `src/preload/index.ts`, `src/preload/index.d.ts` | Retain the foundation bridge and real helper surface; remove AI’s decorator-derived typing. | 5 |
| `M/index.ts`, `L/app-quit.ts`, `L/transcript-host.ts` | Wire initialization, artifact protocol, shutdown and source deletion at their current positions. Domain ownership remains unchanged. | 5 |
| `M/mcp/ai-tools.ts`, `settings-tools.ts`, `task-tools.ts`, `subscription-tools.ts`, `transcript-tools.ts`, `export-tools.ts`; `M/local-api.ts` | Keep their implementation ownership for 9.5. Facade import changes only here. | 5 |
| `apps/desktop/package.json`, `electron.vite.config.ts`, desktop strict partial configs; root port-unit ownership/baseline manifests | Promote the exact resolved closure and package dependencies. | 5 |

The foundation owns the generic RPC composition modules, document registry, runtime entries and transport. Lane 5 supplies the AI registration change to that owner; it does not introduce another runtime.

### 2.4 Existing shared files

All AI-owned extensions in this table belong to lane 1.

| Files under `S/` | Disposition |
| --- | --- |
| `agent-chat.ts`, `agent-thread-patch.ts`, `agent-errors.ts` | Keep paths/helpers; consume or re-export schema companions. Preserve branch, projection, event/recovery logic and legacy `AgentUserError` identity. |
| `agent-history.ts`, `agent-export.ts`, `agent-markdown.ts`, `agent-progress.ts`, `agent-notifications.ts`, `agent-permissions.ts`, `agent-ui.ts` | Retain foundation forms and exported names. |
| `agent-settings.ts`, `agent-subtitles.ts`, `agent-task.ts` | Retain existing strict contracts; tool factories consume them. |
| `ai-presets.ts`, `ai-provider-groups.ts`, `ai-prompts.ts`, `ai-prompt-text.ts`, `ai-run.ts`, `ai-thinking.ts`, `ai-types.ts` | Preserve order and pure rules; separate authored values from tolerant observations. |
| `extension-chat.ts`, `extension-chat-state.ts`, `skill-install.ts` | Keep links, envelopes and browser-safe helpers. Adoption remains 9.5. |

### 2.5 Renderer

| Files/symbols under `R/` | Replacement/disposition | Writer |
| --- | --- | --- |
| `store/agent-chat-launch.ts`: `agentChatLaunchDraftAtom` | Effect Atom in `store/AgentChat.atoms.ts`, document lifetime. | 4 |
| `store/agent-tasks.ts`: `agentTaskMapAtom`, `agentApprovalPendingAtom`, `agentTasksByDownloadAtom`, `agentTaskAiSnapshotAtom` | Effect atoms in `store/AgentTasks.atoms.ts` and `store/AiSettings.atoms.ts`. | 4 |
| `pages/Chat.tsx`: `lastChatThreadIdAtom` | Effect Atom with existing document/navigation lifetime. | 4 |
| `hooks/use-agent-chat.ts`, `use-agent-task-events.ts`, `use-prompt-run.ts` | React adapters over the single strict AI client and state owner. | 4 |
| `components/agent/AgentChat.tsx`, `AgentUiCards.tsx`, `ChatSuggestions.tsx` | Port in place without visual change. | 4 |
| `components/transcript/TranscriptAgentMessageRow.tsx`, `AgentChatMessageView.tsx`, `AgentChatRunFeedback.tsx`, `AgentChatScrollState.tsx`, `AgentEventStream.tsx`, `AgentReasoningSelect.tsx`, `AgentThinkingContent.tsx`, `TranscriptPromptHistory.tsx`, `TranscriptPromptGuidance.tsx`, `TranscriptOverviewResult.tsx` | Port AI state/calls; retain markup, callback and scroll behavior. | 4 |
| `components/settings/AiProvidersPanel.tsx`, `AiProviderDialog.tsx`, `AiPromptsPanel.tsx`, `GitHubSkillDialog.tsx` | Move all AI operations, including unsaved-key discovery and delayed-result guards. | 4 |
| `components/transcript/TranscriptShareImageDialog.tsx` | Port dialog; inject foundation platform operations and 9.1 capture. | 4 |
| `components/transcript/AgentResponseContent.tsx`, `AgentResponseShareCard.tsx` | Keep 9.1 presentation ownership. Integration supplies AI artifact/state operations. | 5 |
| `components/transcript/TranscriptSidePanel.tsx`, `TranscriptPromptPane.tsx`, `TranscriptPromptThinking.tsx` | Keep transcript ownership. Integration supplies AI actions/state. | 5 |
| `components/download/DownloadTroubleshootButton.tsx`, `AgentTaskIndicator.tsx` | Keep 9.1 presentation ownership; inject AI admission/activity. | 5 |
| `app-layout.tsx`, `App.tsx`, `router.tsx`, `main.tsx`, `pages/Settings.tsx` | One integration writer mounts consumers/providers and supplies account capabilities. | 5 |
| `hooks/use-cloud-account.ts` | Keep 9.5 implementation. Its sanitized state/actions enter strict AI through composition. | 5 |
| `store/downloads.ts`, `download-live-patch.ts`, transcript/playlist stores and capture/export helpers | Keep their existing owners. AI consumes ports or already-strict exports. | 5 |

The compiler-resolved graph is the completeness check, including type-only imports and declarations. A newly discovered file receives an explicit writer before editing.

### 2.6 Tests and observers

| Files under `apps/desktop/`, unless stated otherwise | Writer |
| --- | --- |
| `test/cliproxy.test.ts`, `test/ai-settings.spec.ts`, `test/agent-skills.spec.ts` | 2B |
| `test/agent-skill-permissions.spec.ts`, `test/pi-driver.spec.ts` | 2C |
| `test/AgentChat.model.spec.ts`, `test/Ai.rpc.spec.ts`, contract/declaration fixtures | 1 |
| `test/agent-chat-store.spec.ts`, `test/agent-events.spec.ts` | 2A |
| `test/agent-chat-admission.spec.ts`, `test/agent-chat-run.spec.ts`, `test/ai-cloud.spec.ts` | 3A |
| `test/agent-tools.spec.ts`, `test/agent-media.spec.ts`, `test/agent-artifacts.spec.ts` | 3B |
| `test/ai-prompt-runs.spec.ts` | 3C |
| `test/agent-chat-renderer.spec.tsx`, `test/ai-provider-dialog.spec.tsx` | 4 |
| New `scripts/port/desktop-chat/` characterization observers and frozen fixtures; additions to existing golden cases | 0 |
| Golden transport/comparison wiring and integration report | 5 |

No source file is deleted merely because it currently has no external importer. Removing an unused export requires its symbol disposition in the contract census.

## 3. Schemas

### 3.1 Boundary rules

Schemas precede services and implementations.

| Boundary | Contract |
| --- | --- |
| SQL row | Decode selected columns only. Preserve the existing query and row order. |
| Stored JSON syntax | Use the foundation `JsonSyntax` compatibility primitive when original parser failure is observable; then decode unknown data and perform the existing interpretation. |
| Stored value | Preserve successful unknown keys, nulls, falsy scalars and nested retained values. Do not introduce whole-record repair or skipping. |
| Public observation | Apply the current projector first; transport its result losslessly. |
| Authored command | Preserve its current surface validation, order, defaults and errors. |
| Renderer | Interpret tolerant observations at current field-use points. Do not cast them into authored types. |
| Foreign driver | Decode application-facing messages/results; keep foreign handles and TypeBox inside the driver. |

`RpcObserved` and `RpcOptional` are imported from the foundation’s production `RpcObservation.model.ts` and `RpcField.model.ts`. They are not reimplemented by AI.

`RpcObserved(view)` validates the decoded application view while encoding the original retained graph. It preserves own undefined properties, missing keys, null, negative zero, non-finite retained numbers and supported retained nested values. Tagged transport values are decoded before application consumption. Dense-array, cycle, depth, object-kind and byte admission remain foundation obligations.

`RpcOptional(field)` preserves absence, own undefined and a present field value. `S.optional` is not used. `S.optionalKey` is used inside observation guards where the observation codec already preserves presence.

`S.Finite` alone does not preserve negative zero through ordinary JSON framing. Authored numeric values whose sign can survive the old structured-clone boundary use a lossless finite-number codec.

```ts
import * as S from "effect/Schema"
import * as LK from "@vidbee/schema"
import { RpcObserved } from "./RpcObservation.model.ts"
import { RpcOptional } from "./RpcField.model.ts"

export const WireFinite = RpcObserved(S.Finite)

export const Thinking = LK.LiteralKit([
  "off", "minimal", "low", "medium", "high", "xhigh", "max"
])

export const RunStatus = LK.LiteralKit([
  "running", "completed", "aborted", "error", "interrupted"
])

export const ToolStatus = LK.LiteralKit([
  "running", "completed", "error", "pending-approval", "denied"
])

export const ErrorCode = LK.LiteralKit([
  "TRANSPORT_LOST", "PROVIDER_UNAVAILABLE", "CONTEXT_OVERFLOW",
  "OUTPUT_TRUNCATED", "STREAM_INTERRUPTED", "RESUME_FAILED",
  "BILLING_REJECTED", "CONTENT_FILTERED", "PROVIDER_REJECTED",
  "CANCELLED", "STALLED", "PERSISTENCE_FAILED", "TIMEOUT", "INTERNAL"
])

export const PromptCode = LK.LiteralKit([
  "sign-in-required", "credits-exhausted", "no-provider",
  "missing-api-key", "missing-model", "unknown-prompt",
  "empty-transcript", "auth", "network", "empty-output", "unknown"
])

export const PresetId = LK.LiteralKit([
  "alibaba", "anthropic", "azure", "cliproxy", "custom", "deepseek",
  "fireworks", "google", "groq", "huggingface", "lmstudio", "minimax",
  "mistral", "moonshot", "novita", "ollama", "openai", "openrouter",
  "ppio", "siliconflow", "stepfun", "together", "volcengine", "xai", "zhipu"
])

export const UiResponse = S.Struct({
  toolCallId: S.String,
  title: S.String,
  values: S.Array(S.String)
})

export const AuthoredSend = S.Struct({
  downloadId: S.String,
  promptId: S.String,
  threadId: RpcOptional(S.String),
  transcriptText: RpcOptional(S.String),
  text: RpcOptional(S.String),
  imageIds: S.String.pipe(S.Array, RpcOptional),
  retryMessageId: RpcOptional(S.String),
  uiLanguage: RpcOptional(S.String),
  sourceTitle: RpcOptional(S.String),
  sourceDurationMs: RpcOptional(WireFinite),
  thinkingLevel: RpcOptional(Thinking),
  uiResponse: RpcOptional(UiResponse)
})

export const Send = S.Struct({
  downloadId: RpcObserved(S.Unknown),
  promptId: RpcObserved(S.Unknown),
  threadId: S.Unknown.pipe(RpcObserved, RpcOptional),
  transcriptText: S.Unknown.pipe(RpcObserved, RpcOptional),
  text: S.Unknown.pipe(RpcObserved, RpcOptional),
  imageIds: S.Unknown.pipe(RpcObserved, RpcOptional),
  retryMessageId: S.Unknown.pipe(RpcObserved, RpcOptional),
  uiLanguage: S.Unknown.pipe(RpcObserved, RpcOptional),
  sourceTitle: S.Unknown.pipe(RpcObserved, RpcOptional),
  sourceDurationMs: S.Unknown.pipe(RpcObserved, RpcOptional),
  thinkingLevel: S.Unknown.pipe(RpcObserved, RpcOptional),
  uiResponse: S.Unknown.pipe(RpcObserved, RpcOptional)
})

export const PromptKey = S.Struct({
  downloadId: S.String,
  promptId: S.String
})

export const PromptInput = S.Struct({
  ...PromptKey.fields,
  transcriptText: S.String,
  forceRegenerate: RpcOptional(S.Boolean),
  uiLanguage: RpcOptional(S.String),
  sourceUrl: RpcOptional(S.String),
  transcriptLanguage: RpcOptional(S.String),
  transcriptOrigin: RpcOptional(LK.LiteralKit(["ai", "human"]))
})
```

`AuthoredSend` describes UI-authored values; `Send` describes transport acceptance. Each ingress field retains its supplied value and presence through the foundation observation codec. Business validation remains at the source positions in section 9. No cast or eager normalization turns ingress into an authored command. The existing send validator first checks thinking, transcript, text and image IDs; truthy thread lookup and the empty automatic-start return follow (`L/agent-chat-runner.ts:375–405`). Thus null or scalar values in fields not consumed before that return, including `threadId: null`, `threadId: 0`, `uiResponse: null`, `uiResponse: 7`, and `sourceDurationMs: NaN`, remain successful on that path. Invalid thinking/text/image values reach `Invalid chat input` at the existing check. Constructing `Send` does not establish image ownership or authorize a card answer.

`SetAgentThinkingLevel.level` likewise uses `RpcObserved(S.Unknown)` at ingress. Its existing literal check produces `Invalid thinking level` before thread lookup (`L/agent-chat-runner.ts:752–755`). Deliberate validation failures become `Completion` application failures with their original text and applicable cuts, rather than client codec or engine diagnostics. Consumer interpretation and surface-specific validation stay at their current points.

### 3.2 Application field census

`?` means absence and explicit undefined remain distinguishable where supplied. Read fields copied from storage remain tolerant even when authored declarations are narrower.

| Model | Fields |
| --- | --- |
| Message | `id`, nullable `parentId`/`runId`, user/assistant `role`, `text`, `thinking`, `createdAt`; optional `uiResponse`, `imageIds`, `thinkingMs`, `legacy`; retained extras |
| Image upload | `{name, data: Uint8Array}` |
| Image attachment | `id`, `threadId`, `name`, `path`, PNG/JPEG `mimeType`, `createdAt`, `width`, `height`; retained extras |
| Artifact | `id`, `threadId`, `runId`, image/video `kind`, `name`, `path`, `start`; optional `sourceDownloadId`, `posterPath`, `end`, `width`, `height`; retained extras |
| Tool | `id`, `name`, `status`; optional `detail`, `taskId`, `approval`, `ui`, `skills`; retained extras |
| Approval | Optional `grantKey`; `action`, `summary`, destructive/config/network `risk` |
| Skill-read snapshot | `name`, `description`, `resource`, retained with the tool across edits, branches and reload |
| Run core | `id`, `messageId`, status, nullable `error`, `model`, `instruction`, timestamps, `rawMessages`, `tools` |
| Run metadata | `errorCode`, `sessionEntries`, `evidenceCoverage`, `evidenceSource`, `sourceDownloadId`, `taskIds`, `fullSourceReview`, `preloadedSourceLines`, `articleSections`, `articleReview`, `activity`, `lifecycle`, `usage`, `sourceOffset`, `contextSummary`, `contextCheckpoint`, `workingNotes`, `contextStatus`, `cloudResultId`; retained extras |
| Thread | `id`, `downloadId`, `promptId`, nullable `leafId`, `seq`, `messages`, `runs`, `artifacts`; optional `title`, `thinkingLevel`, `images`, `toolGrants`; retained extras |
| Summary | `id`, `downloadId`, `promptId`, `title`, `updatedAt`, `running`; optional `approvalPending`, `status`, `model` |
| Patch | Required `downloadId`, `promptId`, `threadId`; optional nullable `leafId`, title, grants and entity arrays |
| Event | `threadId`, nullable `runId`/`messageId`, `seq`, open string `type`, `createdAt`; optional snapshot, patch and catalog |
| Recovery | `{events, snapshot: ThreadRead | null}` |
| Catalog upsert | `{kind:"upsert", summary, history, runStatus, statusUpdatedAt, revision}` |
| Catalog removal | `{kind:"remove", id, downloadId, revision}` |
| UI task | `id`, kind/status, title, nullable progress, optional error, selectable, optional actual desktop download projection |
| Notification target | `{threadId, downloadId, promptId}` |
| Settings | Nullable active provider, optional nullable Cloud model, ordered providers and prompts |
| Public provider | Explicit whitelist below; no stored-key spread |
| Skill/prompt | `name`, `content`, `isPreset`, `sortOrder`, timestamps; optional directory name, description, skill error, workflow/auto-run/visibility/user-created fields |
| Prompt snapshot | IDs, status, text, thinking, thinking duration, timestamp, nullable error/code; optional provider category, Cloud result and recovery `{attempt,maxAttempts,error}` |
| Provider test | `{ok, text, error: string|null, errorCode: PromptCode|null}` |
| Composer | Ordered model options, selected value and thinking options |
| Cloud catalog | `{models:{id,name,multiplier}[], defaultModelId}` |
| GitHub source/install | `{repository,revision,paths}` / `{repository,revision,path}` |

Links remain strings unless that existing surface validates UUIDs. Stored identity links do not acquire new UUID constraints.

### 3.3 Projector-derived observations

The following declaration forms are in the checked corpus. Their broad retained fields are intentional.

```ts
export const RetainedObject = S.Record(S.String, S.Unknown)

export const MessageRead = RpcObserved(RetainedObject)
export const ToolRead = RpcObserved(RetainedObject)

export const ArtifactRead = RpcObserved(
  S.StructWithRest(
    S.Struct({ path: S.Literal("") }),
    [RetainedObject]
  )
)

export const ImageRead = RpcObserved(
  S.StructWithRest(
    S.Struct({ path: S.Literal("") }),
    [RetainedObject]
  )
)

export const RunRead = RpcObserved(
  S.StructWithRest(
    S.Struct({
      rawMessages: S.Array(S.Unknown),
      tools: S.Array(ToolRead),
      activity: S.Array(RetainedObject)
    }),
    [RetainedObject]
  )
)

export const ThreadRead = RpcObserved(
  S.StructWithRest(
    S.Struct({
      messages: S.Array(MessageRead),
      runs: S.Array(RunRead),
      artifacts: S.Array(ArtifactRead),
      images: S.optionalKey(S.Unknown)
    }),
    [RetainedObject]
  )
)

export const SummaryRead = RpcObserved(S.Struct({
  id: S.Unknown,
  downloadId: S.Unknown,
  promptId: S.Unknown,
  title: S.Unknown,
  updatedAt: S.Unknown,
  running: S.Boolean,
  approvalPending: S.optionalKey(S.Unknown),
  status: S.optionalKey(S.Unknown),
  model: S.optionalKey(S.Unknown)
}))

export const PatchRead = RpcObserved(S.Struct({
  downloadId: S.Unknown,
  promptId: S.Unknown,
  threadId: S.Unknown,
  leafId: S.optionalKey(S.Unknown),
  title: S.optionalKey(S.Unknown),
  toolGrants: S.optionalKey(S.Unknown),
  images: S.optionalKey(S.Unknown),
  messages: MessageRead.pipe(S.Array, S.optionalKey),
  runs: RunRead.pipe(S.Array, S.optionalKey),
  artifacts: ArtifactRead.pipe(S.Array, S.optionalKey)
}))
```

`projectAgentThread` spreads the thread and messages; `projectAgentRun` retains run fields after scrubbing; tools retain nested fields (`S/agent-thread-patch.ts:158–199`). The guards therefore do not reconstruct those objects into narrower authored records.

The provider projector is different. `toPublicProvider` explicitly constructs these fields (`L/ai-store.ts:126–144`):

`id`, `groupId`, `presetId`, `name`, `baseUrl`, `modelId`, `contextWindow`, `vision`, `tools`, `reasoning`, `thinkingOnly`, `allowDisableThinking`, `thinkingLevels`, `defaultThinkingLevel`, `maxTokens`, `hasApiKey`, `createdAt`, `updatedAt`.

Its observation codec accepts only that root whitelist and requires the produced `hasApiKey` boolean. Copied field values remain tolerant. It rejects accidental `apiKeySealed` inclusion rather than silently exposing or stripping it.

The remaining read declarations compose these observations:

```ts
export const CatalogRead = RpcObserved(S.Union([
  S.Struct({
    kind: S.Literal("upsert"),
    summary: SummaryRead,
    history: S.Boolean,
    runStatus: S.Unknown,
    statusUpdatedAt: S.Unknown,
    revision: WireFinite
  }),
  S.Struct({
    kind: S.Literal("remove"),
    id: S.Unknown,
    downloadId: S.Unknown,
    revision: WireFinite
  })
]))

export const EventRead = RpcObserved(S.Struct({
  threadId: S.Unknown,
  runId: S.Unknown,
  messageId: S.Unknown,
  seq: WireFinite,
  type: S.String,
  createdAt: WireFinite,
  snapshot: S.optionalKey(ThreadRead),
  patch: S.optionalKey(PatchRead),
  catalog: S.optionalKey(CatalogRead)
}))

// Persisted JSON.parse results are observations, not newly authored live events.
export const PersistedEventRead = RpcObserved(S.Unknown)

export const Recovery = RpcObserved(S.Struct({
  events: S.Array(PersistedEventRead),
  snapshot: S.NullOr(ThreadRead)
}))

export const PromptRead = RpcObserved(S.Struct({
  name: S.Unknown,
  content: S.Unknown,
  isPreset: S.Unknown,
  sortOrder: S.Unknown,
  createdAt: S.Unknown,
  updatedAt: S.Unknown
}))

export const Settings = RpcObserved(S.Struct({
  activeProviderId: S.NullOr(S.String),
  cloudModelId: S.String.pipe(S.NullOr, RpcOptional),
  providers: S.Array(ProviderRead),
  prompts: S.Array(PromptRead)
}))

export const PromptRun = RpcObserved(S.Struct({
  ...PromptKey.fields,
  status: LK.LiteralKit(["idle", "running", "completed", "aborted", "error"]),
  text: S.Unknown,
  thinking: S.Unknown,
  thinkingMs: S.Unknown,
  updatedAt: S.Unknown,
  error: S.Unknown,
  errorCode: S.Unknown
}))
```

`PersistedEventRead` is a distinct lossless recovery observation. The store returns `JSON.parse(row.data)` without event-semantic validation (`L/agent-chat-store.ts:464–475`); recovery therefore retains those parsed values, including a header with `createdAt: null`, independently of the `EventRead` guard for freshly constructed live events. It does not reconstruct or repair stored headers. Consumer interpretation remains at its existing point.

The observation wrapper preserves additional fields produced or retained by these projectors. It does not authorize constructing arbitrary application output. Projector construction remains the authority for the root field set.

### 3.4 Authored provider and skill values

```ts
export const ProviderFields = {
  groupId: RpcOptional(S.String),
  contextWindow: RpcOptional(WireFinite),
  maxTokens: RpcOptional(WireFinite),
  vision: RpcOptional(S.Boolean),
  tools: RpcOptional(S.Boolean),
  reasoning: RpcOptional(S.Boolean),
  thinkingOnly: RpcOptional(S.Boolean),
  allowDisableThinking: RpcOptional(S.Boolean),
  thinkingLevels: Thinking.pipe(S.Array, RpcOptional),
  defaultThinkingLevel: RpcOptional(
    LK.LiteralKit(["auto", "off", "minimal", "low", "medium", "high", "xhigh", "max"])
  )
}

export const ProviderWrite = S.Struct({
  ...ProviderFields,
  id: RpcOptional(S.String),
  presetId: PresetId,
  name: RpcOptional(S.String),
  baseUrl: RpcOptional(S.String),
  modelId: S.String,
  apiKey: RpcOptional(S.String),
  copyApiKeyFromId: RpcOptional(S.String)
})

export const PromptWrite = S.Struct({
  name: S.String,
  content: S.String,
  previousName: RpcOptional(S.String),
  description: RpcOptional(S.String),
  enabled: RpcOptional(S.Boolean),
  autoRun: RpcOptional(S.Boolean),
  showInTranscript: RpcOptional(S.Boolean),
  frontmatter: RpcObserved(RetainedObject).pipe(RpcOptional)
})

export const RemoteInput = S.Struct({
  presetId: PresetId,
  id: RpcOptional(S.String),
  apiKey: RpcOptional(S.String),
  baseUrl: RpcOptional(S.String)
})
```

The ignored legacy `enabled` field remains accepted. Open frontmatter remains open.

Produced catalog, thinking, target, GitHub and provider-test records use their field census above, exact LiteralKits, `WireFinite`, `RpcOptional`, and `S.Uint8ArrayFromBase64` for binary inputs. They do not pass retained unknown values through ordinary unencoded JSON holes.

Composer options copy provider `id`, `modelId`, `name` and `presetId` without imposing authored provider constraints (`L/agent-composer.ts:22–28`; `ai-store.ts:126–144,284–300`). The lossless observation admits unrecognized stored presets, null descriptions and scalar labels. It retains current truthiness and description omission/undefined behavior:

```ts
export const Composer = RpcObserved(S.Struct({
  models: S.Array(S.Struct({
    value: S.Unknown,
    label: S.Unknown,
    description: S.optionalKey(S.Unknown),
    presetId: S.optionalKey(S.Unknown),
    modelId: S.optionalKey(S.Unknown)
  })),
  selected: S.String,
  thinking: ThinkingOptions
}))
```

The UI authoring schema must be the port of G’s actual `packages/ui/src/lib/agent-ui.ts` decoder: seven component kinds, ChoiceCard compatibility, connected-tree checks, depth four, 1–16 elements, 32,768 UTF-8 bytes, one progress card, one interactive question and at most 24 distinct tasks. A structural `props` record is not that semantic validation. Its package remediation lands before native AI tool activation.

### 3.5 Scrubbing and presence

The public run projector produces `rawMessages: []`, derives activity, and creates own undefined properties for:

`workingNotes`, `sessionEntries`, `evidenceCoverage`, `evidenceSource`, `fullSourceReview`, `articleSections`, `contextCheckpoint`, `contextSummary`.

Artifacts receive `path: ""` and own `posterPath: undefined`. Images receive `path: ""`. A blank thread receives own `images: undefined` (`S/agent-thread-patch.ts:139–199`).

The revised wire preserves those properties. It does not turn undefined into omission or null. Explicit null remains null. The renderer receives the decoded application graph.

Legacy channels retain their structured-clone behavior and bypass RPC JSON. Legacy mutable declarations remain separate from tolerant read observations; `mutableKey` and mutable arrays preserve actual assignment sites.

Every production schema has its deterministic identity, required annotations, same-name schema-derived type and documented examples. The local probes establish API and wire behavior; they are not a receipt for the complete textual standards gate.

### 3.6 Mutable internal stored/live state

`L/ChatStore.model.ts` owns the complete internal model. It retains private artifact/image paths, raw messages, session entries, all run metadata and mutable entity arrays. It is separate from public observations. These declarations describe interpreted writable state; they do not add whole-record validation, stripping or repair to permissive stored reads. Retained values are decoded and interpreted at today's field-use points. Pi-specific conversion stays inside the sole driver; internal raw-message and session-entry subgraphs remain application values.

The checked declaration is:

```ts
import * as S from 'effect/Schema'
import { Thinking, RunStatus, ToolStatus, ErrorCode, Approval, UiResponse, UiSpec } from "../../shared/AgentChat.model.ts"

const optional = <F extends S.Constraint>(field: F) => S.optionalKey(S.UndefinedOr(field))
const array = <F extends S.Constraint>(field: F) => S.mutable(S.Array(field))
const internal = <F extends S.Struct.Fields>(fields: F) => S.StructWithRest(
  S.Struct(fields), [S.Record(S.String, S.mutableKey(S.Unknown))]
)
export const StoredMessage = internal({
  id:S.mutableKey(S.String),parentId:S.String.pipe(S.NullOr,S.mutableKey),runId:S.String.pipe(S.NullOr,S.mutableKey),
  role:S.mutableKey(S.Literals(['user','assistant'])),text:S.mutableKey(S.String),thinking:S.mutableKey(S.String),createdAt:S.mutableKey(S.Finite),
  uiResponse:UiResponse.pipe(optional,S.mutableKey),imageIds:S.mutableKey(S.String.pipe(array,optional)),
  thinkingMs:S.Finite.pipe(optional,S.mutableKey),legacy:S.Boolean.pipe(optional,S.mutableKey)})
export const StoredArtifact = internal({
  id:S.mutableKey(S.String),threadId:S.mutableKey(S.String),runId:S.mutableKey(S.String),sourceDownloadId:S.String.pipe(optional,S.mutableKey),
  kind:S.mutableKey(S.Literals(['image','video'])),name:S.mutableKey(S.String),path:S.mutableKey(S.String),posterPath:S.String.pipe(optional,S.mutableKey),
  start:S.mutableKey(S.Finite),end:S.Finite.pipe(optional,S.mutableKey),width:S.Finite.pipe(optional,S.mutableKey),height:S.Finite.pipe(optional,S.mutableKey)})
export const StoredImage = internal({
  id:S.mutableKey(S.String),threadId:S.mutableKey(S.String),name:S.mutableKey(S.String),path:S.mutableKey(S.String),
  mimeType:S.mutableKey(S.Literals(['image/png','image/jpeg'])),createdAt:S.mutableKey(S.Finite),width:S.mutableKey(S.Finite),height:S.mutableKey(S.Finite
)})
export const StoredTool = internal({
  id:S.mutableKey(S.String),name:S.mutableKey(S.String),status:S.mutableKey(ToolStatus),detail:S.String.pipe(optional,S.mutableKey),taskId:S.String.pipe(optional,S.mutableKey),
  approval:Approval.pipe(optional,S.mutableKey),ui:UiSpec.pipe(optional,S.mutableKey),
  skills:S.mutableKey(internal({name:S.mutableKey(S.String),description:S.mutableKey(S.String),resource:S.mutableKey(S.String)}).pipe(array,optional)
)})
export const StoredActivity = S.Union([
  internal({id:S.mutableKey(S.String),kind:S.mutableKey(S.Literals(['thinking','commentary'])),text:S.mutableKey(S.String)}),
  internal({id:S.mutableKey(S.String),kind:S.mutableKey(S.Literal('status')),status:S.mutableKey(S.Literals(['retrying','compacting','recovering']))}),
  internal({id:S.mutableKey(S.String),kind:S.mutableKey(S.Literal('tool')),toolId:S.mutableKey(S.String),name:S.mutableKey(S.String),count:S.Finite.pipe(optional,S.mutableKey),artifactIds:S.String.pipe(array,S.mutableKey)})
])
export const StoredRun = internal({
  id:S.mutableKey(S.String),messageId:S.mutableKey(S.String),status:S.mutableKey(RunStatus),error:S.String.pipe(S.NullOr,S.mutableKey),errorCode:ErrorCode.pipe(optional,S.mutableKey),
  model:S.mutableKey(S.String),instruction:S.mutableKey(S.String),createdAt:S.mutableKey(S.Finite),updatedAt:S.mutableKey(S.Finite),
  rawMessages:S.Unknown.pipe(array,S.mutableKey),sessionEntries:S.mutableKey(S.Unknown.pipe(array,optional)),
  evidenceCoverage:S.mutableKey(S.Record(S.String,S.Tuple([S.Finite,S.Finite]).pipe(S.mutable,array,S.mutableKey)).pipe(optional)),
  evidenceSource:S.String.pipe(optional,S.mutableKey),sourceDownloadId:S.String.pipe(optional,S.mutableKey),taskIds:S.mutableKey(S.String.pipe(array,optional)),
  fullSourceReview:S.Boolean.pipe(optional,S.mutableKey),preloadedSourceLines:S.Finite.pipe(optional,S.mutableKey),articleSections:S.mutableKey(S.Unknown.pipe(array,optional)),
  articleReview:internal({status:S.Literals(['passed','issues','unavailable']).pipe(optional,S.mutableKey),checkedSections:S.mutableKey(S.Finite),issues:S.mutableKey(S.Finite),passed:S.mutableKey(S.Boolean)}).pipe(optional,S.mutableKey),
  activity:S.mutableKey(StoredActivity.pipe(array,optional)),
  lifecycle:S.mutableKey(internal({id:S.mutableKey(S.String),messageCount:S.mutableKey(S.Finite),status:S.mutableKey(S.Literals(['retrying','compacting','recovering']))}).pipe(array,optional)),
  tools:StoredTool.pipe(array,S.mutableKey),
  usage:internal({input:S.mutableKey(S.Finite),output:S.mutableKey(S.Finite),totalTokens:S.mutableKey(S.Finite),cacheRead:S.Finite.pipe(optional,S.mutableKey),cacheWrite:S.Finite.pipe(optional,S.mutableKey),reasoning:S.Finite.pipe(optional,S.mutableKey)}).pipe(optional,S.mutableKey),
  sourceOffset:S.Finite.pipe(optional,S.mutableKey),contextSummary:internal({digest:S.mutableKey(S.String),text:S.mutableKey(S.String)}).pipe(optional,S.mutableKey),
  contextCheckpoint:internal({coveredCount:S.mutableKey(S.Finite),digest:S.mutableKey(S.String),text:S.mutableKey(S.String)}).pipe(optional,S.mutableKey),
  workingNotes:S.String.pipe(optional,S.mutableKey),contextStatus:S.Literals(['compacting','recovering','reviewing','writing']).pipe(optional,S.mutableKey),cloudResultId:S.String.pipe(optional,S.mutableKey)})
export const StoredThread = internal({
  id:S.mutableKey(S.String),downloadId:S.mutableKey(S.String),promptId:S.mutableKey(S.String),leafId:S.String.pipe(S.NullOr,S.mutableKey),seq:S.mutableKey(S.Finite),
  title:S.String.pipe(optional,S.mutableKey),thinkingLevel:Thinking.pipe(optional,S.mutableKey),messages:StoredMessage.pipe(array,S.mutableKey),
  runs:StoredRun.pipe(array,S.mutableKey),artifacts:StoredArtifact.pipe(array,S.mutableKey),images:S.mutableKey(StoredImage.pipe(array,optional)),toolGrants:S.mutableKey(S.String.pipe(array,optional)
)})
export type StoredThread = typeof StoredThread.Type
```

## 4. Errors

### 4.1 Error carriers and mapping

```ts
export class AiOperationError extends
  S.TaggedError<AiOperationError, { readonly brand: unique symbol }>()(
    "AiOperationError",
    {
      operation: S.String,
      message: S.String
    }
  ) {}

export class AiStreamOverflow extends
  S.TaggedError<AiStreamOverflow, { readonly brand: unique symbol }>()(
    "AiStreamOverflow",
    {
      stream: S.String,
      message: S.String
    }
  ) {}
```

`AiStreamOverflow` is the capability’s source-retention failure. It has no global thread cursor. Its public message is `StreamOverflow`; `stream` is the family name. Foundation `DeliveryError` remains separate.

Main services retain the actual original failure in the recognized foundation `OriginalFailure` carrier. They preserve original `Error`, `AgentUserError`, `CloudAgentProfileError`, `AgentSummaryUnavailableError`, SQL/Drizzle wrappers and non-Error thrown values where current compatibility exposes them.

| Boundary | Mapping |
| --- | --- |
| Foreign primitive → strict main | Capture original value, name and existing text |
| Package → AI | Preserve package text, including `legacyMessage`, and recognized original carrier |
| AI → old invoke/facade | Unwrap recognized original at the old boundary |
| AI → RPC | Map once into `AiOperationError`; retain cuts on success and application failure |
| Renderer | Await cuts, then expose populated `.message` |
| MCP/HTTP | Retain surface-specific prefixes, result envelopes and status mapping |

No arbitrary object is unwrapped because it contains `cause` or `original`. No raw cause, document, credential or native handle crosses RPC. A failure after logical completion is reported without replacing the already completed application result.

### 4.2 Application text catalog

Repeated literals are grouped by producer. Parameterized values remain the current expression’s value; they are not replaced with generic copy.

| Producer | Exact literals/templates |
| --- | --- |
| `agent-chat-store.ts:175,185,243,539,543` | `Invalid thread identity`; `Agent thread is missing`; `Unknown conversation`; `Title is empty` |
| `agent-chat-runner.ts:316–505` | `Unknown agent`; current `prompt.skillError`; `Standalone conversations must use the chat agent`; `Unknown conversation`; `Invalid thread identity`; `Video no longer exists`; `Invalid event cursor`; `Invalid chat input`; `Image does not belong to this conversation`; `This agent is already responding`; `Reply does not belong to this thread`; `Message is empty`; `Could not save this message. Your draft has been preserved.` |
| Runner commands `:603–815,1099` | `Stop the current response before switching versions`; `Unknown reply`; `Invalid conversation`; `Too many images selected`; `Image selection could not be saved`; `Invalid thinking level`; `Unknown image attachment`; `This image is already part of a message`; `Title is empty`; `Conversation title could not be saved`; `Unknown approval` |
| Runner execution `:893,1280,1552–1599,1681,1783` | `The selected thinking level is not supported by this Cloud model. Choose an available level in the Composer.`; `Select a completed local media task; use wait_for_task if it is still running`; `The UI presentation must belong to the active tool call`; `The progress update could not be saved`; `Include task steps when creating AgentProgress so they can be reviewed after the run finishes`; `At most 3 UI presentations are allowed per reply`; `Ask one interactive question per reply, then wait for the user`; `The UI presentation could not be saved`; `Working notes could not be saved`; `Missing agent session`; `Missing agent reply record` |
| Persistence/restart/settlement | `Could not persist the agent conversation.` (`runner:288`); `Execution interrupted by application restart.` (`store:157`); `The agent hit an internal error. Your progress is saved.`; `The agent run was cancelled` |
| `agent-ui-response.ts:17–59`, `agent-ui-tool.ts:17` | `This card is no longer accepting answers`; `Invalid card selection`; `Invalid choice`; `Invalid file selection`; `The selected file is no longer available`; `Invalid media settings`; `Interactive cards are not available in this conversation` |
| `ai-store.ts:94–118,312–461` | `Invalid thinking levels`; `Invalid default thinking level`; `Invalid Cloud model id`; `Unknown AI provider`; `Model id is required`; `Base URL is required`; `API key is required`; `Context window must be between 4096 and 2000000 tokens`; `Invalid image input capability`; `Invalid tool calling capability`; `Invalid thinking capability`; `Invalid thinking-only capability`; `Invalid allow-disable-thinking capability`; `Output tokens must be between 256 and the context window` |
| `S/ai-presets.ts:268` | `Claude models are not available through CLIProxyAPI. Use the Anthropic provider with an API key.` |
| Skill settings `ai-store.ts:506–660` | `Skill instructions are required`; `Unknown skill`; `A skill with this name already exists`; `Unknown skill or invalid transcript auto-run preference`; `Unknown skill or invalid transcript visibility preference`; `The installed skill could not be registered` |
| IPC `ai-service.ts:335–421` | `Unknown built-in skill`; `A skill with this name already exists`; `Built-in skills are read-only; create a custom copy first`; nonempty `shell.openPath` result verbatim |
| `agent-skill-document.ts:23–67` | `Skill names must be nonempty directory names without path separators or control characters`; `A skill description is required (up to 1024 characters)`; `Skill instructions are required and must fit within 128 KB`; `SKILL.md must fit within 128 KB`; `SKILL.md requires YAML frontmatter with name and description`; `Skill frontmatter must be a YAML mapping` |
| `agent-skill-files.ts:43–233` | `Bundled skill directory is unavailable`; `Skill directories cannot be symbolic links`; `Skill resources must stay inside their skill directory`; `Skill resources must be text files within 128 KB`; `Only text skill resources are supported`; `Built-in skills are read-only; create a custom copy first`; `A skill with this name already exists`; `Personal skills cannot use a built-in skill name`; `Built-in skills are read-only; hide their transcript shortcut instead` |
| `agent-skill-install.ts:46–136` | `Skill resources must use relative paths inside the skill directory`; `A skill must contain between 1 and 256 files`; `Skill files cannot contain duplicate paths`; `Skill resources must fit within 5 MB per file and 25 MB in total`; `The skill must contain a valid SKILL.md document`; `Personal skills cannot use a built-in skill name`; `A skill with this name already exists`; `Skill uploads must fit within 10 MB`; `Upload a SKILL.md document or a ZIP containing one skill`; `A skill ZIP contains too many entries`; `Skill ZIPs cannot contain links, encrypted files or oversized resources`; `Upload a ZIP containing exactly one SKILL.md` |
| GitHub install `:158–326` | `GitHub returned ${response.status}. Check the public repository URL or try again later.`; `GitHub returned an empty response`; `The GitHub response is too large to import`; `Invalid GitHub repository or revision`; `This repository is too large. Upload the skill as a ZIP instead.`; `Enter an HTTPS github.com repository or skill directory URL`; `Enter a GitHub repository, directory or SKILL.md URL`; `The selected file must be SKILL.md`; `Invalid GitHub skill path`; `The GitHub branch or revision could not be found`; `No skills found, or too many skills. Use a link to a specific skill directory.`; `Select a SKILL.md document`; `The selected skill was not found`; `A skill cannot contain more than 256 files`; `The skill contains links, submodules or oversized resources`; `Skill resources exceed 25 MB` |
| `cliproxy.ts:19–46` | `Empty token` is internal to the token-file branch; outward text is `Unable to read the CLIProxyAPI client token file`; `Unable to read CLIProxyAPI client configuration`; `CLIProxyAPI client configuration has no client token` |
| Cloud/catalog/test | `Sign in required` (`cloud-capabilities.ts:96`); `Cloud models are unavailable` (`:99`); `Invalid Cloud model catalog` (`cloud-models.ts:32`); `Cloud model is unavailable` (`agent-composer.ts:45`, IPC `:318`); `The request timed out` and `Prompt failed` (`ai-provider-test.ts:186,193`); `VidBee Cloud cancellation failed with HTTP ${response.status}` (`ai-prompt-runner.ts:385`) |
| Prompt transport/results | `Could not reach VidBee Cloud (${url}): ${detail}` or `Could not reach VidBee Cloud (${url}).` (`prompt-runner:430–435`); `Could not reach VidBee Cloud.` (`:609`); `The model returned no answer text.` (`:481`) |
| `agent-model-profile.ts:60–165` | `Invalid Cloud agent model profile: ${reason}`; nonempty server `body.error`, otherwise `This Cloud model profile needs a newer VidBeep Desktop. Please update the app.`; `Invalid Cloud agent thinking capabilities`; `Invalid Cloud agent resource controls` |
| Permissions/web | `Permission service did not start`; `Permission service is unavailable`; `VidBeep web-search.json must contain a JSON object`; `Web content requires an HTTP or HTTPS URL` |
| Durable workers/tools | `Nested tools require an active Durable invocation`; `Invalid agent task ID`; `Unknown skill: ${name}`; `Tool is unavailable to isolated tasks: ${name}`; `Unknown agent task`; `Select the task's original source context before resuming it: ${saved.contextKey}`; `Select the task's original model before resuming it: ${agent.model?.provider}/${agent.model?.modelId}`; `The tool did not complete: ${outcome.status === 'failed' ? outcome.error.message : outcome.status}`; `The tool returned no result` |
| Source/document | `This conversation has no source video`; `Transcript source is unavailable for this video`; `The selected model does not support image input`; `textOffset exceeds this line length`; `The document page cannot fit in the available context. Do not retry with a smaller range or limit; continue from firstUnread or answer with evidence already read.` |
| Compaction `agent-compaction.ts:80–125` | `The summary request cannot fit the configured context window. Original history and previous memory were preserved.`; `The summary source requires smaller chunks.`; `Summary generation is temporarily unavailable. Original evidence remains recoverable.`; `Context compaction failed (${result.stopReason}). Original history and previous memory were preserved. ${result.errorMessage ?? ''}`; `Context compaction could not produce a complete bounded summary after two attempts. Original history and previous memory were preserved.` |
| Session/article | `The assistant was stopped after repeating the same action without new progress. Your progress is saved.`; `The source section returned no result`; returned result error or `The source review did not finish`; `A source section returned no article text`; `The source review found unresolved material details. Your draft is saved.` |
| Article review | `The source review did not check every supplied section`; `Invalid source review issue`; `The source review cited text outside its source section`; `The source review cited text outside the article`; `A source review section exceeds the input budget` |
| Artifact/image | `Attachment does not belong to this conversation`; `Attachment path is outside its owner directory`; `Invalid image selection`; `Image must be no larger than 20 MB`; `Cannot read this image`; `Image is too large to attach`; `Too many images selected`; `Image does not belong to this conversation` |
| Media `agent-media.ts:32–497` | `Invalid media owner`; `Video no longer exists`; `This source is audio-only; no video frames are available. Write a text-only answer and do not retry capture_frames or create_clip.`; `No downloadable video source is available`; `Agent download budget reached (1 GB per run)`; `Missing media output template`; `No video was downloaded; the source may exceed the size limit`; `Invalid or out-of-range media timestamps`; `Clip poster path is missing`; `Media output is empty`; `Agent media exceeded the 1 GB limit`; `Attachment is unavailable` |
| Media completion/timers `:116–183` | `Media operation cancelled`; `Media operation timed out`; `Media operation made no progress before its deadline`; `Cannot inspect media budget`; `Media process failed (${code}): ${errorOutput.slice(-800)}` |
| Tools `agent-tools.ts:204–834` | `Select a completed video with select_video before using source tools`; `The selected source is audio-only and has no video frames`; `History message is unavailable in the selected conversation`; `Notes exceed 8192 UTF-8 bytes; condense and write again. Existing notes were preserved.`; `Working notes are unavailable for this run`; `Complete coverage requires the unfiltered edited source. Omit source, start and end.`; `Image artifact is unavailable in this conversation`; `Title is empty` |
| Management `agent-management-host.ts:33–265` | `Provide an HTTP(S) URL without embedded credentials`; `Task not found: ${id}`; `Wait for the parent media task to complete`; `Media tasks require a URL and video/audio kind`; `Choose a completed media task with a file`; `Provide a filename, not a path`; `Task output must be a regular file`; `Task cannot be paused in its current state`; `Only paused tasks can be resumed`; `Only failed or cancelled tasks can be retried; scheduled retries already run automatically`; `name is required`; `Unsupported task action` |
| Subscription management `:375–438` | `id is required`; `itemId is required`; `Unsupported subscription action`; `downloadDirectory must be an absolute path`; `downloadDirectory must stay inside the library folder unless the user approved this path.`; `url is required` |
| Capability host `agent-capability-host.ts:67–438` | `modelId is required to prepare a TTS model`; `modelId is required to select a default TTS model`; `${key} must be an absolute path`; `${key} must be a regular file`; `Provide a valid proxy URL, not a redacted value`; `downloadPath must stay inside the library folder unless the user approved this path.`; `ASR model is not ready. Create a model-download task with asrTier, wait for completion, then update settings. No settings were applied.`; `Choose a completed task with an existing local media file`; `Audio output does not support height`; `Unknown engine action`; `Provide an HTTP(S) URL without credentials`; `Unknown ASR action`; `Cloud model is unavailable`; `Provider not found`; `id is required; null selects Cloud`; `presetId and modelId are required for a new provider`; `Use an HTTP(S) provider URL without embedded credentials or query parameters`; `Credential source provider not found`; `Skill name and instructions are required`; `Prompt not found`; `Unknown AI settings action` |
| Subtitle authoring `agent-subtitles.ts:21–101` | `Subtitle batch exceeds 100000 bytes; send smaller batches with append=true`; `Provide a known subtitle language such as en, zh, or ja`; `The current video is unavailable`; `This subtitle source already exists; use list_transcripts and select_transcript to read it`; `This subtitle source already exists as a local subtitle file`; `Every subtitle must end after it starts with at least one millisecond duration`; `A different subtitle already occupies this time range; existing subtitles were preserved`; `Send subtitles in chronological order, appending after the last saved cue`; `Agent subtitles already exist; set append=true to add later cues without replacing them`; `Subtitle track exceeds 50000 cues or 2000000 characters`; `No usable subtitles were provided` |
| Queue wait `agent-task-wait.ts:59` | Supplied abort reason, otherwise `Task wait cancelled`; task error projection uses sanitized `lastError.rawMessage` truncated to 1,000 characters |
| MCP/HTTP | Existing validator diagnostics and action errors, including `Agent thread not found: ${id}`, `Message not found`, `Media task not found`; HTTP preserves `{error}`, status and non-Error fallback `Desktop chat failed` |

Provider/SDK text, filesystem errors, SQL errors, YAML/ZIP failures, abort reasons, translated prompt guidance and engine diagnostics are open foreign text families. Their contract is their original producing boundary and existing formatter, not a finite invented literal domain. The error characterization observer records those surfaces and their prefix position.

`AgentErrorCode` retains its 14 literals, `[VB:CODE]` parsing and existing retry/code precedence. Persisted prompt-code filtering remains unchanged.

## 5. RpcGroups, initial reads and streams

### 5.1 Foundation binding

The following production modules belong to 9.0:

- `RpcField.model.ts`, `RpcObservation.model.ts`.
- `DocumentDelivery.model.ts`: `Completion`, `Subscription`, `Registered`, `Cut`, `Token`.
- `DocumentDelivery.errors.ts`: `DeliveryError`.
- `DocumentSubscriptions`, `DocumentDelivery`, `ApplicationOperations`, `StreamRecovery`.
- `RendererInvocation.entry.ts`, optional `Invocation.atoms.ts`.
- `DesktopNotifications`, `OriginalFailure`, `JsonSyntax`.

AI imports them. The frozen amendment’s outstanding implementation findings remain transport-lane gates, including ordinary observation envelopes, terminal arbitration, retained registration obligations, complete cleanup traversal, synchronous cleanup on immediate exits, live listener traversal and reporting defects after logical completion.

Every unary RPC has:

```ts
success: Completion({ success: ApplicationSuccess, error: AiOperationError })
error: DeliveryError
```

Both application exits carry cuts. Application failure never escapes through the outer delivery channel. Renderer adapters await the cuts before returning the value or exposing the application error.

Every stream has:

```ts
success: Subscription(Value)
error: S.Union([AiOperationError, AiStreamOverflow, DeliveryError])
stream: true
```

The installed RPC representation places a stream’s typed termination in its stream error schema. The codec probe exercises that schema, rather than trying to encode a value through the outer `Never` schema.

### 5.2 Families, tokens and application prefixes

| Symbol | Family | Stream | Synchronous renderer application prefix |
| --- | --- | --- | --- |
| A | `ai.agent` | `WatchAgentEvents` | Route/sequence decision; update accepted refs; apply thread/catalog/task/status reducers and touched-ID memory; publish the atom changes |
| S | `ai.settings` | `WatchSettings` | Record invalidation and synchronously initiate each existing refresh continuation in listener order |
| P | `ai.prompt` | `WatchPromptRuns` | Accept the generation/identity snapshot into prompt-run state and publish its atom |
| N | `ai.clicks` | `WatchNotificationClicks` | Record the click invalidation and initiate the existing target-consumption continuation |

A prefix does not wait for React commit, network discovery or a recursively initiated read. Settings’ watermark advances after the existing synchronous callback prefix has initiated refresh work. Waiting for that refresh to finish would add a new barrier and can deadlock the read producing the invalidation.

Tokens are main-issued and bound to the authenticated document, client, generation, family and registration serial. The schema guards the expected family; main also validates current active registration and transport identity.

```ts
export const AgentToken = Token.check(
  S.makeFilter(token => token.family === "ai.agent")
)
export const SettingsToken = Token.check(
  S.makeFilter(token => token.family === "ai.settings")
)
export const PromptToken = Token.check(
  S.makeFilter(token => token.family === "ai.prompt")
)
export const ClickToken = Token.check(
  S.makeFilter(token => token.family === "ai.clicks")
)

export const ReadAgent = S.Struct({ agent: AgentToken })
export const ReadSettings = S.Struct({ settings: SettingsToken })
export const ReadPrompt = S.Struct({ prompt: PromptToken })
export const ReadClicks = S.Struct({ clicks: ClickToken })
```

Initial reads requiring those tokens are explicit in the operation table. They cannot dispatch a tokenless snapshot after `Registered`.

Other operations capture applicable active registrations from the invocation’s authenticated client. Absence of an optional registration means there is no corresponding old consumer to order before completion. It does not fabricate a registration.

Replacement or closure during an operation cannot erase an already incurred obligation. The foundation retains the old token watermark/termination record through completion retirement. An unsatisfied cut fails with delivery failure; it is not silently redirected to the replacement token.

### 5.3 Complete operation census and dependency ledger

Payloads below are the decoded application shape. Binary transport uses `S.Uint8ArrayFromBase64`. All successes are inner application successes.

`Required` names payload tokens. Families listed in `Cuts` are applicable active registration families, including the required initial-read barrier. Conditional publication captures the actual through-position; declaring a family does not fabricate an event. A pure initial read can require A for subscribe-before-snapshot without itself publishing.

The source column is `M/ipc/services/ai-service.ts` unless another file is named.

| Procedure suffix | Payload | Inner success | Completion boundary / source | Cuts; required |
| --- | --- | --- | --- | --- |
| `GetAgentUiTasks` | `{ids}` | UI task array | Synchronous validation/projection, `:71`; `agent-ui-tasks.ts:9–44` | None: borrowed queue/file reads publish nothing |
| `TakeAgentNotificationTarget` | `{clicks}` | Target or null | Synchronous consume, `:77`; notifications `:17–21` | N initial barrier; required N |
| `GetAgentComposerOptions` | `{settings}` | Composer | Joined model/thinking lookup and settings reads, `:83`; composer `:7–32` | S; required S |
| `SelectAgentComposerModel` | `{value}` | Void | Catalog validation, selection write, `:89`; composer `:35–51` | S |
| `SetAgentThinkingLevel` | `{threadId,level}` | Thread | Save/publication, `:95`; runner `:750–774` | A |
| `GetAgentThinkingOptions` | `{settings}` | Thinking options | Model/profile lookup, `:105`; runner `:865` | S; required S |
| `GetAgentThread` | `{downloadId,promptId,threadId?,agent}` | Thread | Open/import/create, `:111`; runner `:325–345` | A; required A |
| `CreateAgentThread` | `{downloadId}` | Thread | Create/catalog publication, `:121`; runner `:349–359` | A |
| `SendAgentMessage` | Chat input | Thread | Admission and execution prefix, `:127`; runner `:375–520` | A,S |
| `DecideAgentTool` | `{threadId,toolCallId,approved,remember}` | Void | Resolve then persistence attempt, `:133`; runner `:1085–1119` | A |
| `SelectAgentImages` | `{threadId,files?}` | Thread | Import, reread, commit/publication or cleanup, `:143`; runner `:698–748` | A |
| `RemoveAgentImage` | `{threadId,imageId}` | Thread | Save/publication then file removal, `:153`; runner `:776–803` | A |
| `StopAgentRun` | `{threadId}` | Thread or null | Abort/save then bounded wait, `:162`; runner `:545–598` | A |
| `SelectAgentBranch` | `{threadId,messageId}` | Thread | Synchronous selection/save/publication, `:168`; runner `:601–624` | A |
| `GetAgentEvents` | `{threadId,after,agent}` | Recovery | Current-state repair, `:178`; store `:465–488` | A initial barrier; required A |
| `ListAgentHistory` | `{agent}` | Summary array | Directory read, `:184` | A initial barrier; required A |
| `ListAgentThreads` | `{downloadId,agent}` | Summary array | Per-download directory read, `:190` | A initial barrier; required A |
| `RenameAgentThread` | `{threadId,title}` | Summary array | Rename/publication then list, `:196`; runner `:805–840` | A |
| `DeleteAgentThread` | `{threadId}` | Summary array | Stop, files, SQL, catalog, then list, `:206`; runner `:632–695` | A |
| `SaveAgentArtifact` | `{threadId,artifactId}` | Boolean | Dialog/copy; cancel is false, `:213`; artifacts `:48–65` | None: no AI observation publication |
| `GetSnapshot` | `{settings}` | Settings | Skill synchronization and projection, `:224`; store `:263–331` | S; required S |
| `ListPresets` | None | Preset array | Ordered shallow copy, `:232` | None: static catalog |
| `LookupCatalogModel` | `{presetId,modelId}` | Capabilities or null | Synchronous catalog lookup, `:243` | None: no settings write/publication |
| `ListCatalogModels` | `{presetId}` | Model options | Ordered catalog, `:256` | None: no publication |
| `ListRemoteModels` | Remote input | Model options | Credential acquisition then network/catch policy, `:267`; remote models `:52–65` | S when saved-provider lookup synchronizes settings |
| `UpsertProvider` | Provider write | Settings | Write then snapshot, `:280`; store `:337–439` | S |
| `DeleteProvider` | `{id}` | Settings | Ordered deletion/fallback then snapshot, `:291`; store `:443–453` | S |
| `SetActiveProvider` | `{id:string|null}` | Settings | Selection write/snapshot, `:302`; store `:458–467` | S |
| `GetCloudModels` | None | Cloud catalog | Discovery, `:308` | None: cache/discovery does not publish AI settings |
| `SetCloudModel` | `{id}` | Settings | Catalog validation then synchronous write/snapshot, `:314` | S |
| `UpsertPrompt` | Prompt write | Prompt | File/preference sequence, `:329`; store `:506–574` | S |
| `CustomizeSkill` | `{name}` | Prompt | Read, resource copy and registration, `:335` | S |
| `ImportSkillDocument` | `{document}` | Prompt | Parse, conflict read, register, `:351` | S |
| `ImportSkillUpload` | `{name,bytes}` | Prompt | Synchronous validate/install/register, `:367` | S |
| `InspectGitHubSkills` | `{url}` | GitHub source | Remote inspection, `:373` | None: inspection does not install or publish |
| `ImportGitHubSkill` | GitHub install | Prompt | Fixed-revision read, install/register, `:379` | S |
| `SetSkillAutoRun` | `{name,autoRun}` | Settings | Preference write/snapshot, `:385` | S |
| `SetSkillTranscriptVisibility` | `{name,showInTranscript}` | Settings | Preference write/snapshot, `:395` | S |
| `ExportSkillDocument` | `{id}` | String | Synchronous document read/format, `:405`; store `:649` | S when `getPrompt` synchronizes |
| `OpenSkillDirectory` | `{id?}` | Void | Registered-path read, shell result checked, `:411`; store `:658` | S when `getPrompt` synchronizes |
| `DeletePrompt` | `{id}` | Settings | Current deletion sequence/snapshot, `:425` | S |
| `RestoreDefaultPrompts` | None | Settings | Restore/snapshot, `:433` | S |
| `DislikePrompt` | `{resultId}` | Void | Feedback request, `:443` | None: no local AI publication |
| `StartPrompt` | Prompt input | Prompt snapshot | Synchronous admission/execution prefix, language fallback, `:448`; prompt runner `:626–739` | P,S |
| `StopPrompt` | Prompt key | Prompt snapshot | Synchronous abort/save/broadcast, `:462`; prompt runner `:494–519` | P |
| `GetPromptRun` | `{downloadId,promptId,prompt}` | Prompt snapshot | Live/persisted/idle interpretation, `:475`; prompt runner `:466–491` | P initial barrier; required P |
| `TestProvider` | Provider write | Provider-test result | Ping completion; ordinary failure stays a result, `:480`; provider test `:79–139` | S when saved-key lookup synchronizes |

Open and create depend on A only. `openAgentThread` performs store lookup/open and projection (`L/agent-chat-runner.ts:325–342`); `createAgentThread` validates the source, creates and publishes a catalog event (`:346–355`). Store open imports a persisted prompt result without `aiStore.getPrompt` (`L/agent-chat-store.ts:173–232`). `GetAgentThread` retains its required A token. Send and actual settings-reading operations retain A,S or S as listed because their prompt/provider lookup reaches `AiStore.readState`/`getPrompt`, which can call `synchronizePrompts` and `savePrompts` (`ai-store.ts:263–299,592–594`). Implementation must show that blocked S delivery does not block open/create. Method names do not determine purity.

Settings publication is windows-before-listeners (`ai-store.ts:185–201`). Chat publication is listeners-before-windows (`agent-events.ts:11–15`; runner `:198–204`). Prompt publication is at `ai-prompt-runner.ts:315–321` and the producer’s current throttled/forced positions.

Tool operations are application services, not additional `Ai.*` procedures. Their calls to downloads, subscriptions, transcription or general settings preserve those owners’ operation-specific cuts. AI does not rename their families or add an all-capability fence. The direct AI procedures above do not acquire a dependency on unrelated background tool output merely because it occurs during their lifetime.

### 5.4 RpcGroup declaration

The checked corpus declares all 47 unary procedures and four streams. The following is the declaration form; model names refer to section 3.

```ts
import * as Rpc from "effect/rpc/Rpc"
import * as RpcGroup from "effect/rpc/RpcGroup"
import {
  Completion, Subscription, Token
} from "./DocumentDelivery.model.ts"
import { DeliveryError } from "./DocumentDelivery.errors.ts"

const unary = <
  const Tag extends string,
  P extends S.Struct.Fields | S.Top = S.Void,
  A extends S.Top = S.Void
>(
  tag: Tag,
  options: {
    readonly payload?: P
    readonly success: A
    readonly error: typeof AiOperationError
  }
) => Rpc.make(tag, {
  ...options,
  success: Completion({
    success: options.success,
    error: AiOperationError
  }),
  error: DeliveryError
})

const error = AiOperationError
const threadId = S.Struct({ threadId: S.String })

export const AiRpcs = RpcGroup.make(
  unary("Ai.GetAgentUiTasks", {
    payload: { ids: S.Array(S.String) }, success: S.Array(UiTask), error
  }),
  unary("Ai.GetAgentThread", {
    payload: {
      ...PromptKey.fields, threadId: RpcOptional(S.String), ...ReadAgent.fields
    },
    success: ThreadRead, error
  }),
  unary("Ai.CreateAgentThread", {
    payload: { downloadId: S.String }, success: ThreadRead, error
  }),
  unary("Ai.SendAgentMessage", { payload: Send, success: ThreadRead, error }),
  unary("Ai.DecideAgentTool", {
    payload: {
      threadId: S.String, toolCallId: S.String,
      approved: S.Boolean, remember: S.Boolean
    },
    success: S.Void, error
  }),
  unary("Ai.SelectAgentImages", {
    payload: {
      threadId: S.String,
      files: S.Struct({
        name: S.String, data: S.Uint8ArrayFromBase64
      }).pipe(S.Array, RpcOptional)
    },
    success: ThreadRead, error
  }),
  unary("Ai.RemoveAgentImage", {
    payload: { threadId: S.String, imageId: S.String },
    success: ThreadRead, error
  }),
  unary("Ai.StopAgentRun", {
    payload: threadId, success: S.NullOr(ThreadRead), error
  }),
  unary("Ai.SelectAgentBranch", {
    payload: { threadId: S.String, messageId: S.String },
    success: ThreadRead, error
  }),
  unary("Ai.SetAgentThinkingLevel", {
    payload: { threadId: S.String, level: RpcObserved(S.Unknown) },
    success: ThreadRead, error
  }),
  unary("Ai.GetAgentEvents", {
    payload: { threadId: S.String, after: WireFinite, ...ReadAgent.fields },
    success: Recovery, error
  }),
  unary("Ai.ListAgentHistory", {
    payload: ReadAgent, success: S.Array(SummaryRead), error
  }),
  unary("Ai.ListAgentThreads", {
    payload: { downloadId: S.String, ...ReadAgent.fields },
    success: S.Array(SummaryRead), error
  }),
  unary("Ai.RenameAgentThread", {
    payload: { threadId: S.String, title: S.String },
    success: S.Array(SummaryRead), error
  }),
  unary("Ai.DeleteAgentThread", {
    payload: threadId, success: S.Array(SummaryRead), error
  }),
  unary("Ai.SaveAgentArtifact", {
    payload: { threadId: S.String, artifactId: S.String },
    success: S.Boolean, error
  }),
  unary("Ai.TakeAgentNotificationTarget", {
    payload: ReadClicks, success: S.NullOr(Target), error
  }),
  unary("Ai.GetAgentThinkingOptions", {
    payload: ReadSettings, success: ThinkingOptions, error
  }),
  unary("Ai.GetAgentComposerOptions", {
    payload: ReadSettings, success: Composer, error
  }),
  unary("Ai.SelectAgentComposerModel", {
    payload: { value: S.String }, success: S.Void, error
  }),
  unary("Ai.GetSnapshot", {
    payload: ReadSettings, success: Settings, error
  }),
  unary("Ai.ListPresets", { success: S.Array(Preset), error }),
  unary("Ai.LookupCatalogModel", {
    payload: { presetId: PresetId, modelId: S.String },
    success: S.NullOr(ModelCaps), error
  }),
  unary("Ai.ListCatalogModels", {
    payload: { presetId: PresetId }, success: S.Array(CatalogOption), error
  }),
  unary("Ai.ListRemoteModels", {
    payload: RemoteInput, success: S.Array(CatalogOption), error
  }),
  unary("Ai.UpsertProvider", {
    payload: ProviderWrite, success: Settings, error
  }),
  unary("Ai.DeleteProvider", {
    payload: { id: S.String }, success: Settings, error
  }),
  unary("Ai.SetActiveProvider", {
    payload: { id: S.NullOr(S.String) }, success: Settings, error
  }),
  unary("Ai.GetCloudModels", { success: CloudModels, error }),
  unary("Ai.SetCloudModel", {
    payload: { id: S.String }, success: Settings, error
  }),
  unary("Ai.UpsertPrompt", {
    payload: PromptWrite, success: PromptRead, error
  }),
  unary("Ai.CustomizeSkill", {
    payload: { name: S.String }, success: PromptRead, error
  }),
  unary("Ai.ImportSkillDocument", {
    payload: { document: S.String }, success: PromptRead, error
  }),
  unary("Ai.ImportSkillUpload", {
    payload: { name: S.String, bytes: S.Uint8ArrayFromBase64 },
    success: PromptRead, error
  }),
  unary("Ai.InspectGitHubSkills", {
    payload: { url: S.String }, success: GithubSource, error
  }),
  unary("Ai.ImportGitHubSkill", {
    payload: GithubInput, success: PromptRead, error
  }),
  unary("Ai.SetSkillAutoRun", {
    payload: { name: S.String, autoRun: S.Boolean },
    success: Settings, error
  }),
  unary("Ai.SetSkillTranscriptVisibility", {
    payload: { name: S.String, showInTranscript: S.Boolean },
    success: Settings, error
  }),
  unary("Ai.ExportSkillDocument", {
    payload: { id: S.String }, success: S.String, error
  }),
  unary("Ai.OpenSkillDirectory", {
    payload: { id: RpcOptional(S.String) }, success: S.Void, error
  }),
  unary("Ai.DeletePrompt", {
    payload: { id: S.String }, success: Settings, error
  }),
  unary("Ai.RestoreDefaultPrompts", { success: Settings, error }),
  unary("Ai.DislikePrompt", {
    payload: { resultId: S.String }, success: S.Void, error
  }),
  unary("Ai.StartPrompt", {
    payload: PromptInput, success: PromptRun, error
  }),
  unary("Ai.StopPrompt", {
    payload: PromptKey, success: PromptRun, error
  }),
  unary("Ai.GetPromptRun", {
    payload: { ...PromptKey.fields, ...ReadPrompt.fields },
    success: PromptRun, error
  }),
  unary("Ai.TestProvider", {
    payload: ProviderWrite, success: ProviderTest, error
  }),
  Rpc.make("Ai.WatchAgentEvents", {
    success: Subscription(S.Struct({
      kind: S.Literal("event"), event: EventRead
    })),
    error: S.Union([AiOperationError, AiStreamOverflow, DeliveryError]),
    stream: true
  }),
  Rpc.make("Ai.WatchSettings", {
    success: Subscription(S.Struct({ kind: S.Literal("changed") })),
    error: S.Union([AiOperationError, AiStreamOverflow, DeliveryError]),
    stream: true
  }),
  Rpc.make("Ai.WatchPromptRuns", {
    success: Subscription(S.Struct({
      kind: S.Literal("snapshot"), snapshot: PromptRun
    })),
    error: S.Union([AiOperationError, AiStreamOverflow, DeliveryError]),
    stream: true
  }),
  Rpc.make("Ai.WatchNotificationClicks", {
    success: Subscription(S.Struct({ kind: S.Literal("changed") })),
    error: S.Union([AiOperationError, AiStreamOverflow, DeliveryError]),
    stream: true
  })
)
```

Handlers use `AiRpcs.toLayer`. The group merges into `DesktopRpcs`. `IpcContext` and caller identity are not payload data.

### 5.5 Registration and stream semantics

Each subscription emits exactly one `Registered {token,epoch}`, followed by `Observation {token,epoch,sequence,value}`. Subscription sequence is distinct from thread `seq`, catalog revision and Pi journal position.

Acquisition order is:

```text
reserve registration/queue/byte accounting
→ establish scope and incremental release ownership
→ install source listener
→ complete acquisition
→ emit Registered
→ drain retained observations
```

Each installer calls `ownRelease` before its next fallible step. Synchronous publication during installation is retained. Installation failure removes all acquired resources even if publication already occurred.

The renderer accepts `Registered` only for its current document, logical client and acquisition attempt. It stores the token before dispatching initial reads. A closed, replaced, wrong-family, wrong-client or old-generation token fails visibly.

| Stream | Producer policy | Replay/recovery |
| --- | --- | --- |
| Agent events | Ordered, loss-sensitive, no transport coalescing | No live replay; resubscribe, then repair thread and catalogs |
| Settings | One pending coalescing invalidation; retain the publication range represented by it | Re-read settings/composer after registration |
| Prompt runs | Preserve existing 50 ms producer throttle and forced message-end/terminal publication | Read requested prompt keys after registration |
| Notification clicks | Invalidation of the existing single pending target | Consume that target; no new click backlog |

Closing immediately after `Registered`, without another pull, removes the listener and retained charges. Merely concatenating a ready value before a lazy source does not satisfy this contract.

### 5.6 Publication, capacity and recovery

Chat retains live synchronous listener traversal before window enumeration. Settings retains windows before listeners. Listener addition/removal and exception behavior remain those of the source owner; a snapshot array is not a substitute for the old live traversal.

At each original legacy send point:

1. Perform the old send at its original exception boundary.
2. Independently snapshot, encode and admit that recipient’s migrated route.
3. Contain new-path encoding/admission failure to its declared subscription/client scope.

No encoder runs for a legacy-only recipient. Earlier deliveries remain delivered if a later legacy recipient throws. Migrated admission retains an immutable graph/frame at that boundary; later lifecycle, usage or tool mutation cannot alter it.

Provisional capability ceilings are 1,024 retained loss-sensitive envelopes and 32 MiB encoded retained content per subscription, including in-flight content awaiting acknowledgement. They remain subordinate to foundation document/window/application ceilings and require measurement before cutover. Decoded retention and physical copies are separately charged.

Source overflow produces `AiStreamOverflow` for that subscription. Aggregate retention exhaustion follows the foundation’s client/document failure policy. Neither condition drops terminal events, slides a queue, blocks a native callback or stops generation. Correlated terminal delivery must work while ordinary Ack is held.

Recovery owners are independent:

| View | Recovery |
| --- | --- |
| Selected thread | Resubscribe, receive `Registered`, call token-bearing `GetAgentEvents` with accepted thread sequence |
| Global history | Token-bearing list hydration with event-touched IDs |
| Per-download thread lists | Rehydrate every mounted list with its existing revision/touched guard |
| Task activity and approval indicator | Rehydrate history into the task map, removing stale untouched entries |
| Prompt-derived statuses | Rehydrate relevant Agent summaries; prompt-run state is not a substitute |
| Settings/composer | Re-read after settings registration |
| Notification navigation | Consume the one pending target |

Catalog comparisons are `(epoch,revision)`. An epoch change resets prior revision comparisons. Queued events during hydration participate in touched-ID reconciliation. Transport repairs use opaque replacement identities. Ordinary overlapping consumer reads retain their existing acceptance policy.

Thread gap recovery remains one request plus at most one follow-up per episode, with the current focus/online reset rules. It does not become an unlimited retry loop.

No live events are retained for absent subscribers. Durable events retain the current 1,000-header pruning window, 500-header recovery page and MCP’s 50-header page.

### 5.7 Cancellation

Pure reads may be interrupted before or during cancellable work, subject to existing shared-cache ownership. Synchronous mutations finish their existing synchronous region once started.

Accepted asynchronous mutations transfer to `ApplicationOperations` before the first foreign action. Identity, completion observation and retention charges are installed before work that can complete synchronously starts. Request cancellation detaches delivery; it does not cancel the old continuation.

Image ownership transfers only after successful conversation save **and publication**. Until then, imported files remain operation-owned and the existing failure/race cleanup applies. Thread/video deletion retains every sequential removal, SQL deletion and catalog publication after disconnect.

Run generation belongs to an application attempt scope. Subscription cancellation never means stop generation. Native slots and bytes remain charged through actual completion and cleanup.

## 6. Services, drivers and Layers

### 6.1 State owners and call graph

| Owner | State |
| --- | --- |
| `Conversations` | Active attempts, sole live writable threads, admission and commands |
| `ChatStore` | Chat SQL, sequence transaction, entries, directory/restart interpretation |
| `AgentEvents` | Subscription retention and delivery binding; no conversation authority |
| `AiSettings` | Provider records and selections over one AI store |
| `AgentSkills` | Skill roots/files, migration, watcher and preference interpretation |
| `AiSecrets` | Secret format and fresh credential acquisition |
| `PiDriver` | Pi handles, harnesses, plugins, permissions, workers and journals |
| `AiPromptRuns` | Separate one-shot run map, replacement/discard and terminal prompt store |
| `AiCloud` | Capability cache, request recovery and stream slots |
| `AgentMedia` | Polling lock, per-run budgets and process attempts |
| `AgentArtifacts` | Ownership/path checks, imported files and save operations |
| `AgentNotifications` | Native handles and one pending target |
| `AgentManagement`, `AgentCapabilities` | Stateless adapters over existing capability owners |
| `AgentTaskWait` | Wait subscriptions, pending IDs and timers |

```text
Ai RPC / exact old channels / positional facades
 ├─ Conversations
 │   ├─ ChatStore → borrowed SqlClient
 │   ├─ pure run/provider decisions
 │   ├─ AgentEvents / AgentNotifications
 │   ├─ AgentArtifacts / AgentMedia → DownloadProcess
 │   ├─ AgentManagement / AgentCapabilities → existing capability owners
 │   ├─ AiCloud
 │   └─ PiDriver → pi/plugins/journals/workers
 ├─ AiSettings / AgentSkills → one settings owner / primitive hosts / AiSecrets
 └─ AiPromptRuns → PromptLanguageModel → sole PiDriver
```

Application services return ordinary application results and main failures. They do not return `Completion`, tokens or cuts. Those belong to RPC entrypoints.

The complete checked application operation map derives the inner success and strips only the new token fields:

```ts
import type * as Effect from "effect/Effect"
import type * as Rpc from "effect/rpc/Rpc"
import type * as RpcGroup from "effect/rpc/RpcGroup"

export type MainFailure = AiOperationError | OriginalFailure

export type Unary = Exclude<
  RpcGroup.Rpcs<typeof AiRpcs>,
  {
    readonly _tag:
      | "Ai.WatchAgentEvents"
      | "Ai.WatchSettings"
      | "Ai.WatchPromptRuns"
      | "Ai.WatchNotificationClicks"
  }
>

export type Inner<A> =
  A extends { readonly exit: infer X }
    ? Extract<X, { readonly _tag: "Success" }> extends {
        readonly value: infer V
      } ? V : never
    : never

export type ApplicationApi = {
  readonly [R in Unary as R["_tag"]]: (
    input: Omit<Rpc.Payload<R>, "agent" | "settings" | "prompt" | "clicks">
  ) => Effect.Effect<Inner<Rpc.Success<R>>, MainFailure>
}
```

The checked `Context.Service` declarations partition all 47 operations:

| Contract | Operations |
| --- | --- |
| Conversation commands, implemented by `Conversations` | Get/create/send/decide/images/remove/stop/branch/thinking/events/history/thread-list/rename/delete |
| Settings commands, implemented by `AiSettings` with composer/catalog adapters | Thinking/composer reads and selection; snapshot/presets/catalog/remote/provider/Cloud operations |
| Skill commands, implemented by `AgentSkills` | Prompt write/customize/import/inspect/preferences/export/open/delete/restore |
| Prompt commands, implemented by `AiPromptRuns` | Start/stop/get/dislike/test |
| Presentation commands | UI-task projection, artifact save and notification-target consume |

The partition is an interface grouping, not another state owner. `complete-services.ts` checks every member against the actual group.

### 6.2 Store and callback contracts

```ts
export class ChatStore extends Context.Service<ChatStore, {
  readonly get: (
    id: string,
    options?: { readonly sessionEntries?: boolean | undefined }
  ) => Effect.Effect<StoredThread | null, MainFailure>

  readonly commit: (input: {
    readonly thread: StoredThread
    readonly type: string
    readonly runId?: string | null | undefined
    readonly scope?: SaveScope | undefined
    readonly delivery?: "snapshot" | "patch" | undefined
  }) => Effect.Effect<EventRead, MainFailure>

  readonly recover: (
    id: string,
    after: number,
    live?: StoredThread | null
  ) => Effect.Effect<Recovery, MainFailure>

  readonly prune: (
    id: string,
    seq: number
  ) => Effect.Effect<void, MainFailure>

  readonly delete: (
    id: string
  ) => Effect.Effect<void, MainFailure>
}>()("@vidbee/desktop/main/lib/ChatStore.service/ChatStore") {}
```

`get` and `commit` use the complete mutable internal `StoredThread` from section 3.6. A public scrubbed observation is not used to reconstruct private state. `get(id, {sessionEntries:false})` skips entry loading; omitted options retain the existing full load (`L/agent-chat-store.ts:305–340`). Recovery accepts the optional eligible live thread, preferring it only when its ID matches and its sequence is at least the stored sequence (`:465–488`). Public projection stays at the existing output boundary.

`SaveScope` carries optional `thread`, `messageIds`, `runIds`, `artifactIds`. Omitted scope means write all message, run and artifact rows; `{}` means write none of those entity rows. Both still write the thread header and event and advance sequence after commit (`L/agent-chat-store.ts:352–449`). Partial scopes select only their listed entity IDs. Omitted `runId` defaults to null and omitted delivery defaults to snapshot. Restart interruption (`:146–167`) and rename (`:536–547`) preserve their omitted-scope full saves. Commit preserves current SQL statement order and synchronous transaction execution. It returns only after the existing transaction boundary; publication remains at its current coordinator call site.

`AgentCallbackHost` enters the captured receiving runtime synchronously, with `PreventSchedulerYield`, and preserves the callback receiver. Runtime execution occurs only in that entrypoint/facades. A returned callback does not mean an asynchronously forked save is acceptable.

### 6.3 Synchronous primitive hosts

The host contracts are qualified primitives, not Promise wrappers around old orchestration.

| Host | Exact primitive surface |
| --- | --- |
| `AiStoreHost` | `get(key)`, `set(ordered values)`, synchronous change-subscription registration/release |
| `SkillFilesHost` | Read text/bytes; ordered directory entries; stat/lstat with file/directory/symlink/size/mode; realpath; mkdir with creation mode; direct write; rename; copy; unlink/recursive removal |
| `AiPathHost` | Target-platform join/resolve/basename/relative/separator and explicit roots |
| `AiSecretHost` | Encryption availability; seal/open bytes; fresh proxy credential acquisition |
| Borrowed SQL owner | Current statements, explicit begin mode and savepoint re-entry without suspension |
| `AgentCallbackHost` | Captured-context synchronous entry and original-failure mapping |
| Native/process/timer owners | Explicit signal, liveness, callback and actual-completion capabilities |

These methods are Effects, but their synchronous compatibility Layers must complete without suspension. Fallible primitives retain original values in `OriginalFailure`.

The foundation synchronous entry reserves finite quarantine/cleanup capacity before evaluating the operation factory, revokes ordinary host authority before interruption, and gives cleanup only captured release authority. It reports suspension and retains unresolved work rather than silently continuing a synchronous method asynchronously.

`getSnapshot`, skill upload/install, chat admission and browser nested admission must pass through the actual warmed runtime with these hosts before activation. A synthetic host probe cannot prove Electron safeStorage, real filesystem installation or actual database re-entry.

### 6.4 Pi contract

`PiDriver.open` receives resolved application session options, not chat input:

| Field group | Contract |
| --- | --- |
| Model/credentials | Resolved application model; credential Effect, unwrapped only for foreign invocation |
| History | Ordered application entries, system prompt and task |
| Tools | Active/deferred schema-backed tools |
| Context | Skills, cwd, storage/task directories, run ID and context identity |
| Policy | Thinking level, retry policy, permissions, web configuration and harness tuning |
| Live reads | Memory, output-token budget, calibration, stop predicate |
| Hooks | Fallible finish-turn Effect; synchronous summary-usage and pre-stream-estimate sinks |

The application handle has the complete used surface:

```ts
export interface PiSession {
  readonly prompt: (
    text: string,
    options: {
      readonly images?: ReadonlyArray<unknown>
      readonly expandPromptTemplates?: boolean
    }
  ) => Effect.Effect<void, MainFailure>

  readonly sendCustomMessage: (input: {
    readonly customType: string
    readonly content: unknown
    readonly display: boolean
    readonly details?: unknown
    readonly triggerTurn?: boolean
  }) => Effect.Effect<void, MainFailure>

  readonly subscribeSession: (sink: (event: PiEvent) => void) => () => void
  readonly subscribeAgent: (sink: (event: PiEvent) => void) => () => void
  readonly branch: () => ReadonlyArray<SessionEntry>
  readonly entries: () => ReadonlyArray<SessionEntry>
  readonly id: string
  readonly cwd: string
  readonly skills: () => ReadonlyArray<unknown>
  readonly activeTools: () => ReadonlyArray<AgentTool>
  readonly allTools: () => ReadonlyArray<AgentTool>
  readonly setThinkingLevel: (level: string) => void
  readonly abortCompaction: () => void
  readonly abort: Effect.Effect<void, MainFailure>
  readonly beginDispose: Effect.Effect<{
    readonly disposed: Effect.Effect<void, MainFailure>
  }, MainFailure>
}

export class PiDriver extends Context.Service<PiDriver, {
  readonly open: (
    options: SessionOptions
  ) => Effect.Effect<PiSession, MainFailure, Scope.Scope>
}>()("@vidbee/desktop/main/lib/Pi.service/PiDriver") {}
```

Session events cover entry append, compaction start/end, retry start, message update/end, tool start/end/update, turn start/end and agent start/end. They retain every field consumed by `subscribeRunSession` (`agent-chat-runner.ts:1683–1766`): message, usage, reason/result/error, call identity, arguments and parent call identity. Driver decoders produce those application events; opaque retained subgraphs use observation-compatible models.

Tool execution receives call ID, decoded parameters, cancellation, incremental update sink and application extension context. Pi owns conversion and dispatch, while application Effects remain in the tool owner.

Synchronous sinks execute before the foreign emitter returns. Awaited hooks remain Effects. Registration and release retain current order.

### 6.5 Completion and resources

| Signal | Meaning |
| --- | --- |
| Active registration | Admission exclusion and authoritative live copy |
| Logical execution completion | Existing execution chain settled; active entry may be removed |
| Disposal completion | Harness/plugin/event cleanup actually ended |
| Stop completion | Existing execution-plus-cleanup wait completed or ten-second bound elapsed |

Settlement captures branch state and starts disposal, then clears context/timers/tools, prunes and persists terminal state. It does not await disposal before logical completion.

Cleanup records outlive active admission. A new run can coexist with old cleanup. Late cleanup uses attempt identity and cannot remove a newer active entry. Cleanup rejection preserves warning-and-swallow behavior and does not replace a persisted terminal result.

| Resource | Scope/release |
| --- | --- |
| AI store/skill watcher | Application; retain eager initialization and 150 ms debounce/quit cleanup |
| SQL handle | Borrowed; never open, close, checkpoint or reconfigure another handle |
| SQL transaction | Current synchronous region, explicit default/deferred mode, nested savepoints on the same handle |
| Generation | Application attempt scope |
| Disposal | Separate application cleanup record |
| Durable worker/journal | Sole Pi owner; current deterministic identities, context/model checks, fsync and recovery |
| Permission files | Current temporary/rename sequence; directories 0700, files 0600 |
| Cloud discovery | Shared owner; five-minute TTL, at most eight cache keys, ten-second timeout |
| Cloud slot | FIFO, default two/profile range 1–8, held through body end/cancel/abort |
| Media process | Attempt through output drain and actual close; signal acknowledgement is not reaping |
| Media lock | Existing cancellable 100 ms polling |
| Picker/save | Native lease plus complete owned mutation; charge through cleanup |
| Queue wait | Wait scope only; cancelling it leaves the task |
| Notification | Current thread/run lifecycle; pending target remains one slot |

Cleanup uses finalizers, `acquireRelease`, `ensuring` or `onExit`. JavaScript `try/finally` around `yield*` is prohibited.

### 6.6 Permissions and secrets

The required permission baseline is `a3b3b382`:

- Reviewer policy uses `autoMode.soft_deny` and `autoMode.hard_deny`.
- The obsolete `additionalPolicy` field is absent.
- `before_agent_start` includes active skill context.
- Reviewer compatibility supplies `calculateContextTokens`.
- Ask/auto/full behavior, reviewer timeout, policy hashes, realpath approval and fail-closed startup remain.
- Remembered grants remain exact `permission-v1:` grants.
- Decision resolution precedes persistence.
- `test/agent-skill-permissions.spec.ts` exercises the real plugin lifecycle.

Secret flow:

| Location/boundary | Existing behavior to preserve |
| --- | --- |
| AI settings file | Electron-store document named `ai`; providers retain `apiKeySealed` (`ai-store.ts:44–45,164–171`) |
| Sealing | Trim; empty becomes `""`; `enc:` with safeStorage when available; `plain:` fallback otherwise (`ai-secrets.ts:18–29`) |
| Opening | Read `plain:`, legacy unprefixed text, or decrypt `enc:`; corrupt encrypted input becomes empty (`:35–51`) |
| Active provider | Main reads/unseals, or obtains fresh CLIProxy credentials (`ai-store.ts:470–495`) |
| CLIProxy precedence | Trimmed `VIDBEE_PROXY_API_KEY`; selected/default token file; eligible ENOENT fallback to selected/default YAML’s first nonblank string key (`cliproxy.ts:7–46`) |
| CLIProxy diagnostics | YAML parser details never propagate because they may include credential text |
| Renderer settings/menu | Public whitelist and `hasApiKey`; no sealed/plain key |
| Unsaved provider dialog | Typed key is sent only to current save/test/discovery operations |
| Pi | Main-only credential reaches Pi/model registry/provider fetch (`agent-model-runtime.ts:15–51`) |
| Logs | Current provider-save logs IDs/preset only; preserve existing formatter boundaries and avoid serializing credential-bearing input |
| Child processes | Media uses `input.env`; other native/plugin execution can inherit ambient environment. No new provider-key injection or environment filtering is selected (`agent-media.ts:83–88`; durable session `:573`) |

Redacted application values prevent accidental diagnostic rendering; they do not authorize substituting a sentinel for the real key. Existing ambient-environment exposure and plaintext fallback are owner-review candidates, not fixes in this phase.

### 6.7 One-shot execution

D28 requires `effect/ai` for one-shot prompts. `PromptLanguageModel.layer.ts` supplies a `LanguageModel.make` adapter over the sole Pi driver.

The adapter preserves text, thinking, usage, stop/error classification, abort, recovery and callback/settlement behavior. It adds no second retry loop, provider registry, tool loop or settings owner. The installed `LanguageModel.make` API exists; constructor compatibility is not behavioral qualification.

Lane 3C cannot activate until the actual adapter passes its source and timing oracles. A measured incompatibility returns to the architect as a concrete amendment request.

## 7. Renderer

`AiClient` is an `AtomRpc.Service` over `AiRpcs`, the foundation Electron protocol and `desktopAtomRuntimeFactory`. It uses the existing document registry.

```ts
export class AiClient extends AtomRpc.Service<AiClient>()(
  "@vidbee/desktop/renderer/src/store/Ai.atoms/AiClient",
  {
    group: AiRpcs,
    protocol: ElectronRpcClientLive,
    runtime: desktopAtomRuntimeFactory
  }
) {}

export const lastChatThreadIdAtom =
  Atom.make<string | null>(null).pipe(Atom.keepAlive)

export const agentChatLaunchDraftAtom =
  Atom.make<string | null>(null).pipe(Atom.keepAlive)

export const threadViewAtom = Atom.family((key: string) =>
  Atom.make<{
    readonly key: string
    readonly thread: ThreadRead | null
  }>({ key, thread: null })
)
```

Production launch-draft data retains its existing full draft model. The checked atom declarations establish the installed APIs and lifetime form.

Streaming query atoms are pull atoms. Mounted consumers explicitly drain them.

| State | Lifetime/behavior |
| --- | --- |
| Last workspace thread/launch draft | Document lifetime across navigation; capture/clear launch draft once |
| Task map/AI snapshot | Document lifetime; provisional settings null; event-touched hydration |
| Approval/tasks-by-download | Derived; current running-first/timestamp order |
| Conversation view | Mounted route identity; current reset of thread/error/hydrated/sending/attaching |
| Recovery | Per identity/episode; accepted refs change before React publication |
| Draft/images | Existing local state and rejected-admission restoration |
| Armed skills | Existing module lifetime/reset |
| First Cloud success | Existing localStorage marker |
| Model/dialog requests | Existing generation guards and failure fallback |

Direct invocation-owned Effects are the default. Each call has its own completion, cancellation and cut wait. Concurrent mutations do not share a “latest result” atom or serialize behind one another.

If a component adapter needs result atoms, it uses the foundation’s document invocation owner. Document teardown settles callers and cancels execution before disposing the registry. Component unmount retains the existing callback policy.

`useAgentChat` retains matching/pinned routing, workspace suppression before identity exists, stale/equal sequence handling, gap coalescing, old-tab rejection, focus/online repair and boolean send-admission results.

Optimistic state does not become conversation authority. Sending indicators and draft restoration remain local; committed return/stream observations supply contents and sequence.

All AI callers move at the visible cutover, including `AiProviderDialog`’s three discovery paths. A delayed response for an older preset/model cannot overwrite the current form.

`AiProvidersPanel` receives sanitized account state and existing auth/credit actions from composition. It does not import legacy `use-cloud-account` into the strict graph.

Markup, styling, dimensions, scroll behavior, labels, cards, share images and navigation remain unchanged. Renderer smoke alone is insufficient.

## 8. Other consumers and legacy facades

| Consumer | Transitional route |
| --- | --- |
| Old Electron `ai.*` | Exact forwarders → warmed runtime/application services |
| MCP AI tools | Existing names, zod metadata, defaults and envelopes → positional facades |
| MCP task/settings/subscription/transcript tools | Existing host signatures → `AgentManagement`/`AgentCapabilities` |
| MCP export | Same selected-reply/store projection and formatting |
| Browser HTTP/SSE | Existing validation/session/status/envelopes → common application services |
| Extension overview | Existing prompt/chat facade reads |
| CLI | No dedicated direct chat import/command found; existing automation/MCP reachability remains |
| Transcript completion | Current eligibility and synchronous `runAutoSkillsForTranscript` admission |
| Source deletion/quit | Current explicit stop/delete ordering |
| Artifact protocol | Current owner/path validation and range behavior |

Facades call services directly, not JSON RPC. They retain original positional signatures, mutability, synchronous throws, original errors and Promise adoption/settlement.

MCP retains text truncation/pagination, thinking omission, branch selection, `{submitted:true}` approval, immediate send status, 50-header event pages and prompt start/stop omission.

HTTP retains origin/session/token checks, request limits, refreshed-state envelopes and SSE behavior. Its heartbeat/filtering and 32,000,000-byte pending-write policy remain until 9.5.

`admitExtensionChatRequest` stays a synchronous outer transaction containing digest lookup, nested admission and association insert (`extension-chat-requests.ts:17–34`). Same identity/digest reuses the thread; changed digest fails. Cascade deletion removes the association. No permanent receipt changes later reuse.

Package obligations remain:

- Borrow the single SQL handle; no mixed-driver connection.
- Preserve task-queue synchronous callbacks, timing and live listener rules.
- Reuse `DownloadProcess`/`DownloadFiles`, including per-site signalling, pipe and completion policies.
- Preserve transcription’s tolerant stored values and separate immediate timeout versus eventual reaping.
- Preserve subscription original wrappers/`legacyMessage`, cancellation and forced-pass behavior.
- Keep CLI/extension surface-specific validation and declared earlier-phase changes.

Required package/host remediation lands before native activation depending on it.

## 9. Semantics table

Section 5 specifies every public operation’s payload, result, completion and dependencies. This table specifies the internal behavior producing those results.

| Operation | Today/source | After the port |
| --- | --- | --- |
| Initialization | Lazy store migration; persisted running runs become interrupted; save changed threads, no ordinary model resume (`store:133–170`) | Same first-use `ChatStore` path |
| Open by prompt | First ascending rowid; import/create only if absent (`store:173–236`; directory `:86`) | Same query/interpretation |
| Explicit open | Truthy ID lookup, download check, live-copy preference; supplied prompt need not equal stored prompt (`runner:325–345`) | Same branch order |
| Create | Source required except workspace; blank chat and catalog (`:349–359`) | Synchronous command |
| Empty automatic send | Existing messages and no retry/text/images return before active guard (`:402–413`) | Same pure decision position |
| Send | Validate/read → empty-start branch → active guard → prompt/source/retry/card → message/run/leaf → active registration → save/publish → execution prefix → return (`:375–520`) | One synchronous admission region |
| Failed admission | False persistence removes active entry; SQL may already be committed after publication failure (`:501–508`) | Same partial outcome |
| Browser admission | Nested save/publication/execution can precede outer association commit (`extension-chat-requests:17–34`) | Same handle/savepoint/callback |
| Retry | Original user parent/images/text or root/instruction fallback; old branch retained (`runner:419–451`) | Pure selection at current call site |
| Streaming save | Dirty-ID merge, latest pending type, one 100 ms timer; immediate save flushes accumulated state (`:234–306`) | Same persistence coordinator |
| SQL save | Header/entities/entry append/event header atomic; live seq after success (`store:352–449`) | Same transaction |
| Chat publication | Live listeners before windows; throw may become post-commit persistence failure (`runner:198,278`; events `:11`) | Original publisher plus contained per-recipient migrated admission |
| Settings publication | Windows before listeners (`ai-store:185–201`) | Same owner/order |
| Native notifications | Saved event publication precedes synchronization (`runner:283–285`) | Same call site |
| Recovery | At most 500 ascending headers; snapshot only if stored seq exceeds cursor; eligible live copy preferred (`store:465–488`) | Same read plus required token |
| Prune | `seq <= thread.seq - 1000`, before terminal persistence (`store:454`; runner `:1207`) | Same order |
| Stop | Abort controller/agent/compaction; mark aborted/CANCELLED; deny approvals/update tools; persist before wait (`runner:578–596`) | Same synchronous prefix |
| Stop wait | Execution then cleanup raced against ten seconds; forced settlement if needed (`:545–575`) | Distinct completion signals |
| Inactive stop | Stored public thread or null; no creation (`:595–598`) | Same read |
| Settlement | Guard once; capture branch/start cleanup; clear timers/tools/context; prune; terminal save with one retry; detached result save (`:1175–1233`) | Same attempt coordinator |
| Active release | Execution finalizer removes active admission independently of disposal (`:507–516`) | Attempt-guarded release |
| Branch | Active guard; requested message; repeated last-child traversal in source order with cycle guard; save (`:601–624`) | Same traversal/command |
| Attach | Capacity before async selection; reread live/stored thread afterward; remove imports on race/failure (`:717–748`) | Complete owned mutation |
| Remove image | Reject references from any branch; save/publication before file removal (`:776–803`) | Same partial-failure order |
| Thinking/title | Mutate sole live copy; current local rollback and persistence-abort side effects (`:750–840`) | Same owner |
| Delete | Stop; sequential media/task/session directory removal; SQL; catalog; partial completion possible (`:632–695`) | Complete owned mutation |
| Approval | Remove resolver; path/grant/timer changes; resolve; persist (`:1085–1119`) | Same synchronous owner |
| Provider upsert | Current trimming/block/base/key/capability checks; replace in place/append; nullish active selection (`ai-store:337–439`) | Settings plus pure decisions |
| Provider delete | Ordered filter; first remaining fallback only when deleting stored active ID (`:443–453`) | Pure decision at same write |
| Provider select | Truthy unknown fails; falsy behavior retained; snapshot separately normalizes dangling selection (`:318–331,458–467`) | Same pure validation/write |
| Composer | Cloud prefix/catalog versus provider selection; joined reads and ordered fallback (`composer:7–51`) | Same orchestration |
| Remote models | Credentials before network catch; credential failure may reject where network failure gives empty list (`remote:52–65`) | Same boundary |
| Settings/skills | Reads synchronize files/references; upload install is synchronous (`store:263`; install `:51–97`) | Qualified synchronous hosts |
| Prompt get/stop | Live→persisted→idle; current thinking repair; synchronous stop/save/broadcast (`prompt:466–519`) | Separate prompt owner |
| Prompt replacement | Discard/unsubscribe/abort old generation; deletion prevents late resurrection (`:524–559,626`) | Same generation identity |
| Prompt events | 50 ms throttle; forced message-end/terminal; no invented trailing flush (`:665`) | Same producer |
| Cloud | Current bounded replay/revoke/replacement; slot through body, not headers (`cloud-request:43`; slots `:79`) | `AiCloud` |
| Queue wait | Event-driven, at most one progress update/sec, 24-hour bound; cancel leaves task (`task-wait:34–141`) | Wait owner |
| Media | Polling lock, stdout-only idle refresh, chunk-local parsing/tails and current signal policy (`media:38,83–190`) | Shared process service with AI policy |
| Renderer | Identity guards, accepted refs, stale ignore, bounded repair and touched catalogs (`use-agent-chat:49–207`; tasks `:91`) | Same reducers with token/cut binding |

Management adapters retain the model review’s corrections: active cancellation persists/emits cancelled before awaiting executor cancellation; pause can be ignored during synchronous acquisition; panic fallback precedence remains; completed social-media retry can call add and return true; information patch remains a logging no-op separate from rename. Forced subscription refresh-all does not acquire the scheduler’s pending-pass gate.

Timing characterization records every old await/adoption through final success and failure settlement. Required traces include:

- Send entry, active registration, SQL commit, legacy publication, execution prefix, return and detached finalizers.
- Approval resolver removal/resolution, persistence, return and resumed tool.
- Stop abort/save, execution completion, disposal completion, timeout and settlement.
- Each attachment/deletion await, cleanup and refreshed result.
- Discovery invocation/rejection adoption, synchronous settings write/notification and return.
- Session callback entry, archive mutation, save/publication and callback return.
- Prompt replacement/start/stop and terminal publication.

The draft does not invent numeric turn counts. `chat-timing.mjs` must freeze complete expected traces on the assembled current baseline before implementation.

## 10. Obligations for the later model

The later model enters behind these contracts. This phase adds no aggregate host, durable receipt, scheduler or authority migration.

| Obligation | Required invariant |
| --- | --- |
| Replies | Thread, void, boolean and prompt snapshot remain application results; no receipt/version substitution |
| Atomicity | Chat header/entities/entries/public sequence remain one transaction; browser association retains outer admission transaction |
| Authority | Already committed service facts win; model recording cannot reject or reorder them |
| Immediate reads | Recorder lag cannot expose stale state after acknowledged mutation |
| Sequence | Public thread sequence remains distinct from model position, catalog revision and journal position |
| Recovery | Durable headers remain headers; repair supplies current state |
| Notifications | Model replay/import never replays compatibility notifications or starts work |
| Outcome recording | Any promised complete history needs mandatory recoverable immutable capture, owner/incarnation, transaction identity, order, command identity and applied watermark |
| Files | File-backed owner publication and recovery are specified separately from SQL |
| Deletion/reuse | Cascade and deletion win over stale facts; retained receipts cannot revive deleted associations or forbid permitted reuse |
| Process state | Restart does not resume ordinary runs, approvals, queue waits or automatic skills; Pi workers retain their own protocol |
| Adoption proof | Real replacement handlers pass the same codec, transaction, timing, mutation and packaged tests |

Pure decisions move now:

| Decision | Module/current call site |
| --- | --- |
| Run phase/recovery ladder | `agent-run-machine.ts:34`, unchanged phase-loop positions |
| Active-provider truthiness/validation | `AiProviderDecision.ts`, invoked at `ai-store.ts:458` |
| Composer selection interpretation | Same pure module at `agent-composer.ts:35–51` |
| Ordered provider deletion fallback | Same pure module at `ai-store.ts:443` |

These functions receive explicit state and return decisions. They add no read, wait, transaction, clock or persistence. Credential acquisition and publication remain services.

The supplied model draft is not approved by satisfying this checklist. Its actual later handlers must establish these properties.

## 11. Deliberate changes

No application behavior change is selected.

The new transport introduces explicit registration, lossless presence encoding, typed delivery failure, finite visible overflow, per-invocation completion cuts and document-scoped cleanup. These are foundation mechanisms. They do not authorize changing old facade validation, property presence, errors or settlement.

No change is authorized to permissions, storage format, public sequence, provider fallback, retry budgets, timers, task cancellation, publication order, screenshots or restart behavior.

A demonstrated incompatibility in the one-shot adapter, native primitive qualification or finite capacity returns to the architect before activation.

## 12. Verification owed

Evidence names below distinguish executed drafting probes from required implementation probes. No listed future probe is claimed to have run.

### 12.1 Executed drafting evidence

| Claim | Probe | Observed scope |
| --- | --- | --- |
| Installed declarations compile | `tsconfig.revised.json` over `revised.ts`, `services.ts`, `complete-services.ts` | V base compiler settings; real Effect and schema package; zero diagnostics |
| Complete wire declarations construct and round-trip | `wire.mjs` | 55 named schemas, all 51 procedures, 267 round trips |
| Actual projector output survives complete RPC JSON encoding | `wire.mjs` | Actual thread/patch/header projectors; source-extracted pure provider projector; synthetic retained store-shaped fixtures |
| Presence/unusual values survive | `wire.mjs` | Missing/own undefined/null, nested extras, scrubbed run/artifact fields, blank-thread images, negative zero, retained NaN/infinity/bigint |
| Provider key is excluded | `wire.mjs` | Actual whitelist projection; accidental secret-bearing output rejected |
| Exported subscription binding is exercised | `binding.mjs` | Registered/Observation, acquisition-time publication, immediate close, installer failure cleanup, closed token and bounded overflow |
| Cut wait is used for both application exits | `rpc.mjs` | Actual AI declarations through installed `RpcClient`/`RpcServer`, serializer and amendment Protocol pair |
| Held Ack cannot hide source terminal | `rpc.mjs` | Capability overflow after Registered with Ack held; stream and dependent cut fail |
| Publisher snapshot is at tested path | `binding.mjs` | Amendment publisher retains earlier recipient snapshot through later mutation/legacy throw |
| Concurrent invocation ownership/document close | `binding.mjs` | Separate invocations, immediate second completion, pending first invocation, registry teardown |
| Codec regression is detected | `wire-mutant.mjs` | Removing the actual thread observation wrapper fails |
| Handler regression is detected | `binding-mutant.mjs` | Moving the exported handler’s handshake ahead of acquisition fails |

The harnesses use real `RpcSerialization.json.codecFor` **and** its parser. Schema-only encode/decode is not the claimed proof.

These probes do not load the real Electron settings store, execute SQL admission, run a real Pi session, mount React or exercise a packaged build. The provider projector extraction is a pure source oracle, not a store integration test. The amendment probe implementations still have the frozen production obligations listed in section 5.

### 12.2 Current-build baseline

Before any source change, `chat-baseline.mjs` records one reproducible assembled tree/build containing current integration and `a3b3b382`, lock/dependency identity, dirty patch if any, fixture identity and packaged manifest hashes.

Missing observations are recorded against that immutable old build. They are not recorded from a candidate or normalized to hide text, sequence, callback or timing changes.

### 12.3 Required implementation probes

| Sections | Named probe/test | Required observations |
| --- | --- | --- |
| 2 | `chat-ownership.mjs` | Every file/export/test assignment; complete strict node/web/test graphs, including forbidden aliases/type-only/declaration edges |
| 3 | `chat-codecs.mjs`, `AgentChat.model.spec.ts` | Actual load→interpret→project→RPC; all declared schema corpus; mutable legacy assignments |
| 4 | `chat-errors.mjs` | Literal/template/returned-failure census; original identity; SQL/Drizzle/foreign wrappers; original syntax errors; MCP/HTTP prefix position |
| 5 | `Ai.rpc.spec.ts` | Every operation through its real service adapter, both application exits, correct dependency families and tokens |
| 5 | `chat-registration.mjs` | Closed/replaced/wrong-family/old-generation tokens; publication then installer failure; close immediately after Registered |
| 5 | `chat-delivery.mjs` | Successful/failed cuts, registration replacement during invocation, terminal independent of Ack, one oversized frame, queued/in-flight accounting |
| 5 | `chat-publication.mjs` | Live listener add/remove/reentry/throw; per-recipient legacy/new failure containment; delayed encoding after nested mutation |
| 5/7 | `chat-recovery.mjs` | Unselected-thread deletion/approval during overflow; every affected catalog rehydrates without another focus event; epoch reset and opaque repair identity |
| 5/6 | `chat-mutation-ownership.mjs` | Disconnect in picker/import/delete stages; eventual SQL/files/events; transfer only after save/publication; retained cleanup charges |
| 6 | `chat-sync-hosts.mjs` | Real settings synchronization, upload install, admission and nested browser transaction through warmed runtime |
| 6 | `pi-driver.spec.ts` | Immediate callbacks, subscriptions, entries/custom messages, tool updates, permissions, worker journals, real plugin startup |
| 6 | `chat-disposal.mjs` | Held disposal, new admitted run, late cleanup, cleanup rejection, stop timeout and shutdown |
| 6 | `prompt-language-model.mjs` | Actual D28 adapter text/thinking/usage/error/abort/recovery and settlement; no duplicate retry |
| 6 | `chat-resources.mjs` | Cloud body/cancel lifetime, shared waiter cancellation, process close/drain/signals, watcher/timer/native retention |
| 6 | `chat-secrets.mjs` | Synthetic seal/open/legacy/plain/corrupt cases, fresh proxy precedence, public whitelist, diagnostic and child-argument/environment observations |
| 7 | `agent-chat-renderer.spec.tsx`, `ai-provider-dialog.spec.tsx` | Draft/branch/retry/image/identity races; initial tokens; concurrent completion; stale discovery; account injection; registry/provider/HMR lifecycle |
| 7 | `chat-renderer-probe.mjs` | Existing screenshots, scroll, cards, share dialog, menus and navigation |
| 8 | `chat-surfaces.mjs` | Successful MCP and HTTP send/approve/stop/branch/prompt/images/export/feedback/media; SSE evolution; unchanged CLI reachability |
| 9/10 | `chat-transactions.mjs` | Rollback at every SQL statement, nested outer failure, restart interruption, cascade/reuse and immediate reads |
| 9 | `chat-timing.mjs` | Full old/new synchronous and settlement traces under pinned Node |
| 13 | `chat-packaged.mjs` | Exact packaged provenance and full isolated offline exercise |

Existing goldens cover saved reads, some create/rename/delete, basic extension lifecycle and renderer smoke. Successful streaming, approvals, stop/branch, prompt start/stop, provider/skill writes, images/export/feedback/media, recovery, workers, Cloud and media tools require new old-build observations.

### 12.4 Mutation proofs

The named implementation suite must fail when a disposable candidate:

| Mutation | Detecting probe |
| --- | --- |
| Strips nested extras, changes undefined/null, loses negative zero | `chat-codecs.mjs` |
| Emits Registered before acquisition or accepts stale token | `chat-registration.mjs` |
| Omits failure cuts or erases replaced-token obligation | `chat-delivery.mjs` |
| Repairs only selected thread after catalog overflow | `chat-recovery.mjs` |
| Retains shallow publication then encodes after mutation | `chat-publication.mjs` |
| Awaits disposal before releasing active admission | `chat-disposal.mjs` |
| Cancels accepted image/deletion work on document loss | `chat-mutation-ownership.mjs` |
| Advances sequence before commit or publishes before save | `chat-transactions.mjs` |
| Registers active work after starting a synchronously completing fiber | `chat-timing.mjs` |
| Resolves approval after persistence | `chat-timing.mjs` |
| Changes provider truthiness/order/fallback | `chat-sync-hosts.mjs` |
| Releases Cloud slot at headers | `chat-resources.mjs` |
| Accepts old-identity UI results or unlimited repair | Renderer tests / `chat-recovery.mjs` |
| Restores `additionalPolicy` | `agent-skill-permissions.spec.ts` |
| Uses a synthetic credential sentinel or exposes a key | `chat-secrets.mjs` |
| Makes the nested transaction callback asynchronous | `chat-sync-hosts.mjs` |

Old and candidate decisions receive the same independently generated inputs. Feeding the old result into the new code and comparing the copied result is prohibited.

### 12.5 Acceptance

`chat-packaged.mjs` follows strict source/tests, standards/schema/identity/JSDoc/docgen checks, `port:check`, whole-repository check/test, dependency checks, Linux packaging and unchanged goldens.

The isolated offline profile exercises workspace/video chat, streaming, approval/deny/remember/stop, branch/retry/history, images/artifact save, skills/provider selection, reload/reconnect/overflow repair, MCP/browser access to the same conversation, restart interruption and coexistence.

Synthetic providers establish orchestration only. Live provider/Cloud proof is separate authorized network work. Headed native dialogs, clipboard, notification clicks and window-manager behavior need actual observations. Linux does not prove Windows process-tree behavior, macOS integration or cross-platform safeStorage.

## 13. Implementation lanes

Future worktrees use `~/YeeBois/workstation-apps/worktrees/VidBee/<lane>`. No lane was started for this draft.

| Order/lane | Exclusive work | Gate |
| --- | --- | --- |
| 0 `port-chat-characterize` | Section 2 observers and baseline fixtures | `chat-baseline.mjs`; old-build observations; independent oracles |
| 1 `port-chat-contracts` | All section 2 contract companions/shared files, pure decisions and declaration tests | Full codec corpus, error census, callback/resource contracts and ownership freeze |
| K package remediation | Required package/host capabilities through their existing owners | Real native/synchronous/shared-owner qualification before dependent activation |
| 2A `port-chat-store` | Store/directory/activity/events implementations and tests | Transactions, restart, immutable publication and subscription binding |
| 2B `port-chat-settings` | Settings/secrets/skills/composer consumers, primitive drivers and tests | Real synchronous hosts; key/file/mode/fallback/migration/watcher parity |
| 2C `port-chat-pi` | Pi/session/durable/plugin/permission boundary and tests | Sole Pi/TypeBox boundary; callback, disposal, journal and real permission lifecycle |
| 3A `port-chat-runs` | Run/source/article/Cloud orchestration and browser admission | Admission/timing, mutation continuation, terminal/cleanup separation |
| 3B `port-chat-tools` | Tools/hosts/media/artifacts/notifications/waits | Tool/errors/results and process/native/file lifetimes |
| 3C `port-chat-prompts` | Prompt lifecycle/store/discovery/test/auto-run and D28 adapter | Actual adapter and complete prompt timing parity |
| 4 `port-chat-renderer` | AI-owned atoms/hooks/screens/dialogs and tests | Single AI client/path, strict closure, recovery and visual parity |
| 5 `port-desktop-ai` | Composition/registries/preload/shared-shell/facade imports/configs/manifests | Complete old/new surface proof, packaged exercise and phase gate |

2A/2B/2C may proceed independently after contracts and required package remediation. Renderer preparation can use frozen fixtures/contracts. The visible screen switches once in lane 5; it does not run half its operations through old IPC and half through the new AI client.

Contract changes return to lane 1. Shared files have one integration writer.

Shared ownership assumptions:

| File/service | Owner; AI dependency |
| --- | --- |
| `download-facade.ts`, `task-queue-host.ts`, `projection.ts`, `source-file.ts`; `DownloadProjection`, `SourceFiles`, `DesktopDownloads`, `DesktopFiles` | 9.1; task projection/admission/existence/source/file/export |
| `social-profile-manager.ts`, `import-local-media.ts` | 9.1; no AI ownership of their serial orchestration |
| `queue-ref.ts` | Existing composition reference to the same queue |
| `subscriptions-host.ts`, `profile-subscriptions.ts`, `subscription-enqueue.ts`; `DesktopSubscriptions`, `SubscriptionHosts` | 9.2; preserve desktop `downloadId` versus core `taskId` |
| Download/history/subscription atoms | Respective 9.1/9.2 owners |
| Transcript host/source/store/status/detail and side-panel orchestration | 9.3; inject actual contracts without inventing a settled service name |
| Player/capture/share/export presentation, `AgentResponseContent`, `AgentResponseShareCard` | 9.1 |
| `TranscriptShareImageDialog` | 9.4 dialog; foundation platform and 9.1 capture |
| Account/auth/`use-cloud-account`, Cloud session/feedback/device transport | 9.5; injected existing owner |
| MCP/local API/extension sessions/HTTP/SSE | 9.5 |
| Generic notifications, document delivery/registration, runtime, logger, transport/admission | 9.0 |
| Database handle/migrations | Existing database owner |
| `DownloadProcess`, process-control extensions, `DownloadFiles` | Existing package owners |
| Shared UI authoring/cards/share primitives | UI package owner |

Adjacent naming follows the available 9.1/9.2 drafts and the amendment’s canonical ownership table. Draft names are not claimed as current exports.

## 14. Behavior kept as it is

| Owner-review candidate | Consequence retained |
| --- | --- |
| Publication failure after SQL commit | Admission may report draft-preserved failure despite committed content |
| Nested browser effects before outer commit | Outer failure does not undo external observations |
| Approval resolves before persistence | Tool continuation can proceed despite save failure |
| Logical completion before disposal | New run can coexist with old cleanup |
| Bounded stop | Cleanup/native work can survive acknowledgement |
| Empty automatic start before active guard | Can return current state while responding |
| First-rowid prompt lookup | “Newest” wording does not change selection |
| Partial entry migration/table rebuild | No new encompassing transaction |
| Separate prompt terminal/Cloud-result writes | Partial persistence remains |
| SQL and Pi JSONL owners | No invented cross-file transaction |
| Retry sleeps | Abort observation can remain delayed |
| Polling media lock | No FIFO redesign |
| Stdout-only idle refresh/chunk-local parsing | Existing stderr/split-chunk consequences |
| Reads synchronize skills/references | Reads may write |
| Plaintext fallback/ambient environment | No new security policy |
| Prompt error-code whitelist omits declared codes | Nonempty unlisted codes reload as `unknown`; falsy codes reload as `null` |
| Corrupt links/cycles | Existing truncated traversal |
| File/SQL/queue mutation stages | Existing partial outcomes |
| Task-card download extras | No implicit AI privacy scrub |
| Unknown compatible models | Existing defaults |
| Existing renderer overlap races | No broad optimistic/stale-state redesign |

`ai-prompt-store.ts:68–73` returns `unknown` for every nonempty value outside its retained whitelist; only falsy values return null. A permanent characterization must retain `sign-in-required → unknown`, `credits-exhausted → unknown`, `"" → null` and `null → null`.

Truthiness remains explicit for IDs, empty text, zero caps, keys, paths, image arrays and menu fallback. Observable array order never depends on HashMap/HashSet iteration.

## 15. Open questions

The review’s wire, registration, ownership and completion questions are resolved as contracts above. The following decisions remain evidence-dependent:

| Question | Options | Recommendation |
| --- | --- | --- |
| Exact characterization baseline | V alone; G alone; reproducible assembled integration plus permission correction | Freeze the assembled tree/build before recording |
| D28 adapter incompatibility, if measured | Qualify mapping; amend D28; hold activation | Qualify first; present exact counterexample before any amendment |
| Capacity measurements exceed provisional bounds | Adjust finite bounds/accounting; change delivery semantics; hold cutover | Preserve ordered delivery and adjust finite bounds with measured evidence |
| Required synchronous/native primitive fails strict qualification | Equivalent strict primitive; explicit standards-boundary amendment; behavior change; hold | Qualify narrowly, otherwise hold and present exact diagnostic/trace |
| Newly demonstrated successful value is outside codec admission | Extend lossless contract; retain compatibility caller; reject as product change | Preserve caller/value while extending the contract |

These are not permission to normalize observations, weaken diagnostics, wrap old orchestration in `tryPromise`, or activate against mocks.

## 16. Executed evidence and review disposition

The design was frozen after its final review with the list-A corrections and list-B implementation requirements below.

Commands run in the drafting directory:

```sh
node node_modules/tsrs/bin/tsrs -p tsconfig.revised.json
bun wire.mjs
bun binding.mjs
bun rpc.mjs
bun wire-mutant.mjs
bun binding-mutant.mjs
```

The no-emit check extends V’s actual `tsconfig.base.json`; it changes module resolution/output settings needed for the local probe and supplies the real G schema alias. It does not lower diagnostic severities or add suppressions. It checks `revised.ts`, `services.ts`, `complete-services.ts` and their imported amendment modules.

The four positive commands completed successfully. `wire.mjs` reported **55 schemas, 51 procedures and 267 round trips**. Both negative controls exited nonzero as expected. Receipts are `typecheck.raw.txt`, `wire.raw.txt`, `binding.raw.txt`, `rpc.raw.txt`, `mutation.raw.txt` and `binding-mutation.raw.txt`.

The runtime harness used Bun 1.4.5. It does not establish Node/Electron Promise-turn or process behavior. Those remain `chat-timing.mjs`, `chat-resources.mjs` and packaged gates.

| REVIEW.md finding | Disposition | Evidence and remaining implementation boundary |
| --- | --- | --- |
| 1. Blocker: normal projector output fails RPC JSON | Revised operation successes use foundation observation/presence codecs. Own undefined is preserved; `S.optional` is removed. | `wire.mjs` exercises actual projectors and complete request/completion/subscription schemas through real serialization/parser. `wire-mutant.mjs` detects removing the thread wrapper. Actual SQL-load integration remains `chat-codecs.mjs`. |
| 2. Major: no dependency ledger or token-bearing reads | Section 5 assigns every operation families or an explicit none reason, required token payloads and synchronous consumer prefixes. One capability overflow error is selected. | `wire.mjs` checks concrete declarations; `binding.mjs` checks tokens/cuts; `rpc.mjs` checks both exits and held-Ack termination. Full real-handler family coverage remains `Ai.rpc.spec.ts`/`chat-delivery.mjs`. |
| 3. Major: artifacts do not exercise revised contracts | Superseded contracts are excluded from the revised check. The exported binding emits concrete envelopes and is invoked by the tests. Complete application operation partitions and expanded Pi/host contracts compile. | `tsconfig.revised.json`, `binding.mjs`, `rpc.mjs`; handler negative control calls the mutated export and fails. Real native hosts, Pi implementation, React lifecycle and all operation adapters remain named production gates. |
| 4. Major: conflicting contract/file ownership | All model/error/service companions belong to lane 1; implementations have one later writer; share dialog belongs to lane 4; host paths and integration ownership are explicit. | Section 2/13 ledger. `chat-ownership.mjs` is the implementation graph gate. No competing lane was started. |

Remaining first-review items:

| REVIEW-1 item | Disposition |
| --- | --- |
| 1. Tolerant nested output | Section 3; `wire.mjs`; actual load-path proof remains `chat-codecs.mjs`. |
| 2. Readiness before acquisition | Section 5; exported binding tested by `binding.mjs`; negative handler control fails. |
| 3. Catalog recovery | Independent history/per-download/task/status repair with token/epoch/touched-ID rules; `chat-recovery.mjs` remains owed. |
| 4. Immutable publication | Per-recipient boundary retained; `binding.mjs` tests the amendment publisher; real owner traversal remains `chat-publication.mjs` and the frozen transport obligation. |
| 5. Completion versus disposal | Section 6 separates signals and ownership; real held-disposal proof remains `chat-disposal.mjs`. |
| 6. Complete disconnect ownership | Section 5 retains entire accepted mutation; save-and-publication transfer is explicit; `chat-mutation-ownership.mjs` remains owed. |
| 7. Synchronous native capabilities | Exact host paths/surfaces, authority and warmed-runtime qualification are specified; actual native proof remains `chat-sync-hosts.mjs`. |
| 8. Renderer/account omissions | `AiProviderDialog`, account injection and share dialog are assigned; actual strict graph/React proof remains renderer gates. |
| 9. Pi/tool/host contracts and lane conflict | Complete application partition and expanded Pi/host declarations compile; one-writer assignment is explicit; foreign behavior remains driver qualification. |
| 10. Settings order | Windows-before-listeners retained separately from chat’s listeners-before-windows; `chat-publication.mjs` pins the real owners. |

This revision supplies local declaration, complete wire-corpus, exported-binding, invocation and in-memory RPC evidence. Phase completion still requires the assembled old baseline, real implementation adapters, native qualification, renderer exercise, packaged Linux proof and unchanged surface goldens.

### Freeze-pass evidence

The corrected declarations are `revised.ts`, `services.ts`, `StoredThread.model.ts` and `freeze-contract.spec.ts`. The latter compiles mutations of sequence, run status, session entries, private paths and message arrays plus omitted/empty/partial commit scopes, metadata-only loading and optional live recovery against the checked service. The tsrs command still extends V's real base settings without suppressions or diagnostic changes.

```sh
node node_modules/tsrs/bin/tsrs -p tsconfig.revised.json
bun freeze.mjs
bun wire.mjs
bun binding.mjs
bun rpc.mjs
```

All five commands exited 0. The typecheck emitted no diagnostics. `freeze.mjs` reported:

```text
A1 composer: 3 actual-source outputs survive complete-operation JSON (unknown preset; null description; scalar label)
A1 recovery: actual parsed header createdAt:null survives GetAgentEvents completion; fresh Event guard still rejects it
A2 ingress: 4 successful null/scalar/NaN cases and 4 deliberate send failures match source; invalid thinking level remains application failure; original texts and cuts round-trip
A3 scope omitted: message/run/artifact upserts 1/1/1; seq 2
A3 scope {}: message/run/artifact upserts 0/0/0; seq 2
A3 scope {"runIds":["r"]}: message/run/artifact upserts 0/1/0; seq 2
A3 store: metadata skips entries; full get retains private entries/paths; eligible live recovery wins and stale live recovery falls back
```

`wire.mjs` again reported:

```text
{"schemas":55,"rpcs":51,"roundTrips":267}
```

`binding.mjs` and `rpc.mjs` again reported:

```text
binding: envelopes, cuts both exits, close, acquisition failure, overflow, publisher, AtomRegistry teardown passed
rpc: real client/server; Registered/Observation; both application exits wait for same cut; closed token rejected
rpc: capability source overflow terminates stream and dependent cut with Registered Ack held
```

`freeze.mjs` extracts the actual composer, send validation/early-return, thinking validation and store get/save/events methods with injected in-memory dependencies. Complete-operation request/completion codecs use the installed RPC JSON serializer and parser. Old and transported source calls receive independently constructed identical inputs; the old result is not fed into candidate code. Store SQL observations use a statement-recording handle, not real SQL. These are corrected contract/source-oracle probes, not production-adapter, warmed-runtime, native, settlement or packaged evidence. Persisted recovery observations and freshly authored live events are exercised separately. Receipts are `freeze-typecheck.raw.txt`, `freeze.raw.txt` and `freeze-wire.raw.txt`; the exact per-item changes are recorded in `CHANGES.md`. The existing negative controls still exit 1 with `Expected JSON value` at `images` and `RegistrationClosed`, respectively.

The earlier claim that expanded contracts compile applies to abbreviated primitive/Pi declarations. It does not establish that the complete production boundaries are expressible. Requirement 1 below must be proved before dependent backend lanes branch.

| REVIEW-FINAL.md finding | Disposition | Evidence and remaining implementation boundary |
| --- | --- | --- |
| 1. Output census narrows successful retained values | Corrected in sections 3.3–3.4 and 16 evidence: tolerant composer observations and distinct lossless persisted recovery observations. | `freeze.mjs` exercises actual-source composer outputs and parsed recovery through complete-operation codecs; production value-domain proof is requirement 2. |
| 2. Structural request validation changes successful calls and deliberate errors | Corrected in sections 3.1 and 5.4: authored UI types are separate from field-preserving ingress; invalid thinking remains an application error with text and cuts. | `freeze.mjs` differentially exercises null/scalar/NaN successes and deliberate failures; real operation adapters remain requirement 2. |
| 3. Store contract loses full/scoped saves and uses public state | Corrected in sections 3.6 and 6.2: complete mutable internal state, optional scope/loading/live recovery. | Strict declaration and mutation/call proof plus actual-source in-memory omitted/empty/partial save, get and recovery probes; actual persistence is requirement 3. |
| 4. Open/create have unsupported settings dependency | Corrected in section 5.3: A only; `GetAgentThread` retains required A token. | Runner `:325–355`, store `:173–232`; blocked-unrelated-S production test is requirement 2. |
| 5. Host/Pi probes omit bytes, cancellation and original failures | Carried as implementation requirement 1 before backend branching. | Compile actual consumers and prove binary/mode/collision/cancellation/original identity; abbreviated probes do not discharge it. |
| 6. Prompt-code reload behavior is wrong | Corrected in section 14: nonempty unlisted → `unknown`; falsy → null. | `L/ai-prompt-store.ts:68–73`; permanent four-case characterization remains required. |

## 17. Implementation requirements

Implementation lanes are bound by every numbered requirement below and must prove each one; existing requirements and gates elsewhere in this document remain in force.

1. **Complete and freeze primitive/Pi contracts before backend branching.** Include binary writes, exclusive-create and creation modes, recursive directory behavior, tool invocation cancellation and recognized original failures. **Proof:** compile actual consumers; import a binary/executable skill fixture byte-for-byte; verify modes and collision behavior; cancel a tool invocation; assert original failure identity through the legacy facade.
2. **Exercise every real operation adapter and its actual value domain.** **Proof:** complete request/completion/subscription serialization over source-derived inputs and outputs, including findings 1–2; successful and failed application exits; invalid/replaced tokens; and blocked relevant versus unrelated families. Negative controls must mutate the tested production path.
3. **Preserve synchronous persistence and full save semantics.** **Proof:** omitted/empty/partial scopes, restart interruption, private artifact/session data, eligible live recovery, and nested browser admission run through the actual warmed runtime and borrowed handle. Inject failure at each SQL stage and assert statement, sequence and publication order.
4. **Qualify timing, callbacks and native resource ownership on the production paths.** **Proof:** pinned-Node old/new success and failure settlement traces; synchronous callback persistence; held disposal with a newly admitted run; bounded stop; disconnect during image import/deletion; original cleanup precedence; and actual completion/accounting release.
5. **Bind to the foundation’s production modules and test AI consumer recovery.** **Proof:** immediate close after `Registered`, partial acquisition failure, held-Ack terminal delivery, replaced-token obligations, immutable per-recipient publication, live listener mutation/throw behavior, and repair of unselected-thread catalogs, tasks and statuses without another focus event.
6. **Keep baseline and acceptance evidence separate.** **Proof:** record missing observations on the immutable assembled old build before replacement; preserve unchanged goldens; qualify the real D28 adapter, strict graphs/standards and renderer lifecycle; then complete the isolated packaged Linux exercise. Report live-provider and other-platform proof separately.