// Frozen helper record contracts from reviewed revision 8d3dddb4. Imported DTOs have their own frozen-source parity checks.
export namespace Input0 {
interface AgentConversationTitleInput {
  thread: import('./shared-port/agent-chat').AgentThread
  videoTitle: string
}
}
export namespace Input1 {
interface AgentHistoryDisplayTitleInput {
  item: import('./shared-port/agent-chat').AgentThreadSummary
  untitled: string
  promptLabel: string
}
}
export namespace Input2 {
interface ArtifactIdFromUrlInput {
  url: string
  artifacts?: import('../../../apps/desktop/src/shared/AgentAttachment.model').AgentArtifact[] | undefined
}
}
export namespace Input3 {
interface ClockFromImageInput {
  alt: string
  url: string
}
}
export namespace Input4 {
interface MatchArtifactByClockInput {
  artifacts: import('../../../apps/desktop/src/shared/AgentAttachment.model').AgentArtifact[]
  used: import('effect/HashSet').HashSet<string>
  time: number | null
  runId?: string | undefined
  returnedIds?: import('effect/HashSet').HashSet<string> | undefined
}
}
export namespace Input5 {
interface BindArticleImageArtifactsInput {
  text: string
  artifacts: import('../../../apps/desktop/src/shared/AgentAttachment.model').AgentArtifact[]
  runId: string
  returnedIds?: import('effect/HashSet').HashSet<string> | undefined
}
}
export namespace Input6 {
interface UnboundArticleImageTimesInput {
  text: string
  artifacts: import('../../../apps/desktop/src/shared/AgentAttachment.model').AgentArtifact[]
  runId?: string | undefined
  returnedIds?: import('effect/HashSet').HashSet<string> | undefined
}
}
export namespace Input7 {
interface CitedArtifactIdsInput {
  text: string
  artifacts?: import('../../../apps/desktop/src/shared/AgentAttachment.model').AgentArtifact[] | undefined
}
}
export namespace Input8 {
interface EmbedArtifactDataUrisInput {
  markdown: string
  dataUrisById: import('effect/HashMap').HashMap<string, string>
  artifacts?: import('../../../apps/desktop/src/shared/AgentAttachment.model').AgentArtifact[] | undefined
}
}
export namespace Input9 {
interface SplitAgentResponseMediaInput {
  text: string
  artifacts: import('../../../apps/desktop/src/shared/AgentAttachment.model').AgentArtifact[]
  ownRunId?: string | undefined
  includeUncited?: boolean | undefined
}
}
export namespace Input10 {
interface ObserveAgentSeqInput {
  recovery: import('../../../apps/desktop/src/shared/AgentPatch.model').AgentGapRecovery
  seq: number
}
}
export namespace Input11 {
interface RequestAgentRecoveryInput {
  recovery: import('../../../apps/desktop/src/shared/AgentPatch.model').AgentGapRecovery
  reason?: 'gap' | 'refresh' | undefined
}
}
export namespace Input12 {
interface SettleAgentRecoveryInput {
  recovery: import('../../../apps/desktop/src/shared/AgentPatch.model').AgentGapRecovery
  appliedSeq: number
}
}
export namespace Input13 {
interface ProjectAgentRunInput {
  run: import('./shared-port/agent-chat').AgentChatRun
  activity: import('./shared-port/agent-chat').AgentActivity[]
}
}
export namespace Input14 {
interface AgentEventMatchesInput {
  event: import('./shared-port/agent-chat').AgentRunEvent
  identity: import('../../../apps/desktop/src/shared/AgentPatch.model').AgentRouteIdentity
}
}
export namespace Input15 {
interface ApplyAgentThreadPatchInput {
  current: import('./shared-port/agent-chat').AgentThread
  patch: import('./shared-port/agent-chat').AgentThreadPatch
  seq: number
}
}
export namespace Input16 {
interface AcceptAgentThreadInput {
  current: import('./shared-port/agent-chat').AgentThread | null
  incoming: import('./shared-port/agent-chat').AgentThread
}
}
export namespace Input17 {
interface ApplyAgentRunEventInput {
  current: import('./shared-port/agent-chat').AgentThread | null
  event: import('./shared-port/agent-chat').AgentRunEvent
  identity: import('../../../apps/desktop/src/shared/AgentPatch.model').AgentRouteIdentity
}
}
export namespace Input18 {
interface RememberCatalogInput {
  memory: import('../../../apps/desktop/src/shared/AgentPatch.model').CatalogMemory
  notice: import('./shared-port/agent-chat').AgentCatalogNotice
}
}
export namespace Input19 {
interface MergeCatalogListInput {
  rows: readonly import('./shared-port/agent-chat').AgentThreadSummary[]
  memory: import('../../../apps/desktop/src/shared/AgentPatch.model').CatalogMemory
  requestedRevision: number
  options?:
    | {
        downloadId?: string
        historyOnly?: boolean
      }
    | undefined
}
}
export namespace Input20 {
interface ResolveAiProviderBaseUrlInput {
  presetId: import('./shared-port/ai-types').AiProviderPresetId
  userBaseUrl?: string | undefined
}
}
export namespace Input21 {
interface IsAiProviderModelBlockedInput {
  presetId: import('./shared-port/ai-types').AiProviderPresetId
  modelId: string
}
}
export namespace Input22 {
interface AgentChatPromptInput {
  now: number
  hasSource?: boolean | undefined
}
}
export namespace Input23 {
interface ResolveAiPromptContentInput {
  content: string
  languageCode: string
}
}
export namespace Input24 {
interface CanonicalizeAiPromptContentInput {
  promptId: string
  content: string
}
}
export namespace Input25 {
interface MergeDefaultAiPromptsInput {
  existing: import('./shared-port/ai-types').AiPrompt[]
  now: number
}
}
export namespace Input26 {
interface IdlePromptRunSnapshotInput {
  downloadId: string
  promptId: string
  now: number
}
}
export namespace Input27 {
interface PromptTabIndicatorInput {
  status: import('./shared-port/ai-types').AiPromptRunStatus
  viewed?: boolean | undefined
}
}
export namespace Input28 {
interface FormatAiPromptErrorInput {
  message: string
  viaCloud?: boolean | undefined
}
}
export namespace Input29 {
interface ClassifyAiPromptErrorInput {
  message: string | null | undefined
  emptyText?: boolean | undefined
}
}
export namespace Input30 {
interface ExtensionChatEventInput {
  readonly current: import('./shared-port/extension-chat').ExtensionChatState
  readonly incoming: import('./shared-port/extension-chat').ExtensionChatEvent
}
}
export namespace Input31 {
interface AppendCappedLogInput {
  current: string
  chunk: string
  cap: number
}
}
export namespace Input32 {
interface BuildMediaTransformArgsInput {
  input: import('./shared-port/media-transform').MediaTransformInput
  source: string
  output: string
}
}
export namespace Input33 {
interface OverviewPlayheadInput {
  chapters: readonly import('./shared-port/overview-result').OverviewChapter[]
  currentSeconds: number
  durationSeconds?: number | undefined
}
}
export namespace Input34 {
interface BuildExportUnitsInput {
  segments: import('./shared-port/transcript-export').TranscriptExportSegment[]
  grouping: import('./shared-port/transcript-export').TranscriptExportGrouping
}
}
export namespace Input35 {
interface BuildTranscriptExportFileNameInput {
  title: string
  format?: import('./shared-port/transcript-export').TranscriptExportFileExtension | undefined
  viaVidBee?: boolean | undefined
}
}
export namespace Input36 {
interface BuildVideoSubtitleExportFileNameInput {
  title: string
  mode: import('./shared-port/transcript-export').TranscriptVideoEncode
}
}
