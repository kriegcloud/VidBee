import * as LK from "@vidbee/schema";
import * as A from "effect/Array";
import * as R from "effect/Record";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as S from "effect/Schema";
import { DeliveryError } from "../DocumentDelivery.errors.js";
import { Completion, Subscription, Token } from "../DocumentDelivery.model.js";
import { RpcOptional } from "../RpcField.model.js";
import { RpcObserved } from "../RpcObservation.model.js";
export const WireFinite = RpcObserved(S.Finite);
export const Thinking = LK.LiteralKit(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
export const RunStatus = LK.LiteralKit(["running", "completed", "aborted", "error", "interrupted"]);
export const ToolStatus = LK.LiteralKit(["running", "completed", "error", "pending-approval", "denied"]);
export const ErrorCode = LK.LiteralKit([
  "TRANSPORT_LOST",
  "PROVIDER_UNAVAILABLE",
  "CONTEXT_OVERFLOW",
  "OUTPUT_TRUNCATED",
  "STREAM_INTERRUPTED",
  "RESUME_FAILED",
  "BILLING_REJECTED",
  "CONTENT_FILTERED",
  "PROVIDER_REJECTED",
  "CANCELLED",
  "STALLED",
  "PERSISTENCE_FAILED",
  "TIMEOUT",
  "INTERNAL",
]);
export const PromptCode = LK.LiteralKit([
  "sign-in-required",
  "credits-exhausted",
  "no-provider",
  "missing-api-key",
  "missing-model",
  "unknown-prompt",
  "empty-transcript",
  "auth",
  "network",
  "empty-output",
  "unknown",
]);
export const PresetId = LK.LiteralKit([
  "alibaba",
  "anthropic",
  "azure",
  "cliproxy",
  "custom",
  "deepseek",
  "fireworks",
  "google",
  "groq",
  "huggingface",
  "lmstudio",
  "minimax",
  "mistral",
  "moonshot",
  "novita",
  "ollama",
  "openai",
  "openrouter",
  "ppio",
  "siliconflow",
  "stepfun",
  "together",
  "volcengine",
  "xai",
  "zhipu",
]);
export const UiResponse = S.Struct({ toolCallId: S.String, title: S.String, values: S.Array(S.String) });
export const UiSpec = S.Struct({
  root: S.String,
  elements: S.Record(
    S.String,
    S.Struct({
      type: LK.LiteralKit([
        "Stack",
        "AgentProgress",
        "TaskCard",
        "TaskPicker",
        "ChoiceCard",
        "MediaSettings",
        "InfoCard",
      ]),
      props: RpcObserved(S.Record(S.String, S.Unknown)),
      children: S.Array(S.String),
    })
  ),
});
export const Approval = S.Struct({
  grantKey: RpcOptional(S.String),
  action: LK.LiteralKit([
    "task.create",
    "task.cancel",
    "task.remove",
    "task.rename",
    "task.rename_file",
    "subscription.add",
    "subscription.update",
    "subscription.remove",
    "settings.proxy",
    "settings.config_path",
    "settings.download_path",
    "settings.update",
    "ai.delete_provider",
    "ai.delete_prompt",
    "asr.delete",
    "ytdlp.update",
    "shell.execute",
    "tool.execute",
  ]),
  summary: S.String,
  risk: LK.LiteralKit(["destructive", "config", "network"]),
});
export const Image = RpcObserved(S.StructWithRest(S.Struct({ path: S.Literal("") }), [S.Record(S.String, S.Unknown)]));
export const Artifact = RpcObserved(
  S.StructWithRest(S.Struct({ path: S.Literal("") }), [S.Record(S.String, S.Unknown)])
);
export const Message = RpcObserved(S.Record(S.String, S.Unknown));
export const Activity = S.Union([
  S.Struct({ id: S.String, kind: LK.LiteralKit(["thinking", "commentary"]), text: S.String }),
  S.Struct({
    id: S.String,
    kind: S.Literal("status"),
    status: LK.LiteralKit(["retrying", "compacting", "recovering"]),
  }),
  S.Struct({
    id: S.String,
    kind: S.Literal("tool"),
    toolId: S.String,
    name: S.String,
    count: RpcOptional(WireFinite),
    artifactIds: S.Array(S.String),
  }),
]);
export const Tool = RpcObserved(S.Record(S.String, S.Unknown));
export const Run = RpcObserved(
  S.StructWithRest(
    S.Struct({
      rawMessages: S.Array(S.Unknown),
      tools: S.Array(Tool),
      activity: S.Array(S.Record(S.String, S.Unknown)),
    }),
    [S.Record(S.String, S.Unknown)]
  )
);
export const Thread = RpcObserved(
  S.StructWithRest(
    S.Struct({
      messages: S.Array(Message),
      runs: S.Array(Run),
      artifacts: S.Array(Artifact),
      images: S.optionalKey(S.Unknown),
    }),
    [S.Record(S.String, S.Unknown)]
  )
);
export const Summary = RpcObserved(
  S.Struct({
    id: S.Unknown,
    downloadId: S.Unknown,
    promptId: S.Unknown,
    title: S.Unknown,
    updatedAt: S.Unknown,
    running: S.Boolean,
    approvalPending: S.optionalKey(S.Unknown),
    status: S.optionalKey(S.Unknown),
    model: S.optionalKey(S.Unknown),
  })
);
export const Patch = RpcObserved(
  S.Struct({
    downloadId: S.Unknown,
    promptId: S.Unknown,
    threadId: S.Unknown,
    leafId: S.optionalKey(S.Unknown),
    title: S.optionalKey(S.Unknown),
    toolGrants: S.optionalKey(S.Unknown),
    images: S.optionalKey(S.Unknown),
    messages: Message.pipe(S.Array, S.optionalKey),
    runs: Run.pipe(S.Array, S.optionalKey),
    artifacts: Artifact.pipe(S.Array, S.optionalKey),
  })
);
export const Catalog = RpcObserved(
  S.Union([
    S.Struct({
      kind: S.Literal("upsert"),
      summary: Summary,
      history: S.Boolean,
      runStatus: S.Unknown,
      statusUpdatedAt: S.Unknown,
      revision: WireFinite,
    }),
    S.Struct({ kind: S.Literal("remove"), id: S.Unknown, downloadId: S.Unknown, revision: WireFinite }),
  ])
);
export const Event = RpcObserved(
  S.Struct({
    threadId: S.Unknown,
    runId: S.Unknown,
    messageId: S.Unknown,
    seq: WireFinite,
    type: S.String,
    createdAt: WireFinite,
    snapshot: S.optionalKey(Thread),
    patch: S.optionalKey(Patch),
    catalog: S.optionalKey(Catalog),
  })
);
export const PersistedEventRead = RpcObserved(S.Unknown);
export const Recovery = RpcObserved(S.Struct({ events: S.Array(PersistedEventRead), snapshot: S.NullOr(Thread) }));
export const ThinkingOptions = S.Struct({ levels: S.Array(Thinking), defaultLevel: Thinking, vision: S.Boolean });
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
  uiResponse: RpcOptional(UiResponse),
});
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
  uiResponse: S.Unknown.pipe(RpcObserved, RpcOptional),
});
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
  defaultThinkingLevel: RpcOptional(LK.LiteralKit(["auto", "off", "minimal", "low", "medium", "high", "xhigh", "max"])),
};
export const providerKeys = [
  "id",
  "groupId",
  "presetId",
  "name",
  "baseUrl",
  "modelId",
  "contextWindow",
  "vision",
  "tools",
  "reasoning",
  "thinkingOnly",
  "allowDisableThinking",
  "thinkingLevels",
  "defaultThinkingLevel",
  "maxTokens",
  "hasApiKey",
  "createdAt",
  "updatedAt",
];
export const Provider = RpcObserved(
  S.Record(S.String, S.Unknown).check(
    S.makeFilter(
      (value) =>
        A.every(R.keys(value), (key) => A.contains(providerKeys, key)) &&
        S.is(S.Struct({ hasApiKey: S.Boolean }))(value)
    )
  )
);
export const ProviderWrite = S.Struct({
  ...ProviderFields,
  id: RpcOptional(S.String),
  presetId: PresetId,
  name: RpcOptional(S.String),
  baseUrl: RpcOptional(S.String),
  modelId: S.String,
  apiKey: RpcOptional(S.String),
  copyApiKeyFromId: RpcOptional(S.String),
});
export const Prompt = RpcObserved(
  S.Struct({
    name: S.Unknown,
    content: S.Unknown,
    isPreset: S.Unknown,
    sortOrder: S.Unknown,
    createdAt: S.Unknown,
    updatedAt: S.Unknown,
  })
);
export const PromptWrite = S.Struct({
  name: S.String,
  content: S.String,
  previousName: RpcOptional(S.String),
  description: RpcOptional(S.String),
  enabled: RpcOptional(S.Boolean),
  autoRun: RpcOptional(S.Boolean),
  showInTranscript: RpcOptional(S.Boolean),
  frontmatter: RpcObserved(S.Record(S.String, S.Unknown)).pipe(RpcOptional),
});
export const Settings = RpcObserved(
  S.Struct({
    activeProviderId: S.NullOr(S.String),
    cloudModelId: S.String.pipe(S.NullOr, RpcOptional),
    providers: S.Array(Provider),
    prompts: S.Array(Prompt),
  })
);
export const PromptKey = S.Struct({ downloadId: S.String, promptId: S.String });
export const PromptInput = S.Struct({
  ...PromptKey.fields,
  transcriptText: S.String,
  forceRegenerate: RpcOptional(S.Boolean),
  uiLanguage: RpcOptional(S.String),
  sourceUrl: RpcOptional(S.String),
  transcriptLanguage: RpcOptional(S.String),
  transcriptOrigin: RpcOptional(LK.LiteralKit(["ai", "human"])),
});
export const PromptRun = RpcObserved(
  S.Struct({
    downloadId: S.String,
    promptId: S.String,
    status: LK.LiteralKit(["idle", "running", "completed", "aborted", "error"]),
    text: S.Unknown,
    thinking: S.Unknown,
    thinkingMs: S.Unknown,
    updatedAt: S.Unknown,
    error: S.Unknown,
    errorCode: S.Unknown,
  })
);
export const ProviderTest = S.Struct({
  ok: S.Boolean,
  text: S.String,
  error: S.NullOr(S.String),
  errorCode: S.NullOr(PromptCode),
});
export const CatalogOption = S.Struct({ label: S.String, value: S.String });
export const ModelCaps = S.Struct({
  allowDisableThinking: S.Boolean,
  contextWindow: WireFinite,
  id: S.String,
  maxTokens: RpcOptional(WireFinite),
  name: S.String,
  reasoning: S.Boolean,
  thinkingLevels: S.Array(Thinking),
  thinkingOnly: S.Boolean,
  vision: S.Boolean,
});
export const Preset = S.Struct({
  id: PresetId,
  defaultModel: S.String,
  needsApiKey: S.Boolean,
  requiresBaseUrl: S.Boolean,
  baseUrl: RpcOptional(S.String),
  website: RpcOptional(S.String),
});
export const RemoteInput = S.Struct({
  presetId: PresetId,
  id: RpcOptional(S.String),
  apiKey: RpcOptional(S.String),
  baseUrl: RpcOptional(S.String),
});
export const CloudModels = S.Struct({
  models: S.Array(S.Struct({ id: S.String, name: S.String, multiplier: WireFinite })),
  defaultModelId: S.String,
});
export const Composer = RpcObserved(
  S.Struct({
    models: S.Array(
      S.Struct({
        value: S.Unknown,
        label: S.Unknown,
        description: S.optionalKey(S.Unknown),
        presetId: S.optionalKey(S.Unknown),
        modelId: S.optionalKey(S.Unknown),
      })
    ),
    selected: S.String,
    thinking: ThinkingOptions,
  })
);
export const GithubSource = S.Struct({ repository: S.String, revision: S.String, paths: S.Array(S.String) });
export const GithubInput = S.Struct({ repository: S.String, revision: S.String, path: S.String });
export const Target = S.Struct({ threadId: S.String, downloadId: S.String, promptId: S.String });
export class AiOperationError extends S.TaggedError<AiOperationError, { readonly brand: unique symbol }>()(
  "AiOperationError",
  { operation: S.String, message: S.String }
) {}
export class AiStreamOverflow extends S.TaggedError<AiStreamOverflow, { readonly brand: unique symbol }>()(
  "AiStreamOverflow",
  { stream: S.String, message: S.String }
) {}
const error = AiOperationError;
export const AgentToken = Token.check(S.makeFilter((token) => token.family === "ai.agent"));
export const SettingsToken = Token.check(S.makeFilter((token) => token.family === "ai.settings"));
export const PromptToken = Token.check(S.makeFilter((token) => token.family === "ai.prompt"));
export const ClickToken = Token.check(S.makeFilter((token) => token.family === "ai.clicks"));
export const ReadAgent = S.Struct({ agent: AgentToken });
export const ReadSettings = S.Struct({ settings: SettingsToken });
export const ReadPrompt = S.Struct({ prompt: PromptToken });
export const ReadClicks = S.Struct({ clicks: ClickToken });
const r = <const Tag extends string, P extends S.Struct.Fields | S.Top = S.Void, A extends S.Top = S.Void>(
  tag: Tag,
  options: { readonly payload?: P; readonly success: A; readonly error: typeof AiOperationError }
) =>
  Rpc.make(tag, {
    ...options,
    success: Completion({ success: options.success, error: AiOperationError }),
    error: DeliveryError,
  });
export const UiTask = RpcObserved(
  S.Struct({
    id: S.String,
    kind: S.String,
    title: S.Unknown,
    status: S.String,
    progress: S.Unknown,
    selectable: S.Boolean,
    download: S.optionalKey(S.Unknown),
    error: S.optionalKey(S.Unknown),
  })
);
export const SendRpc = r("Ai.SendAgentMessage", { payload: Send, success: Thread, error });
export const ThreadRead = Thread;
export const PromptRead = Prompt;
export const SummaryRead = Summary;
export const EventRead = Event;
const unary = <const Tag extends string, P extends S.Struct.Fields | S.Top = S.Void, A extends S.Top = S.Void>(
  tag: Tag,
  options: {
    readonly payload?: P;
    readonly success: A;
    readonly error: typeof AiOperationError;
  }
) =>
  Rpc.make(tag, {
    ...options,
    success: Completion({
      success: options.success,
      error: AiOperationError,
    }),
    error: DeliveryError,
  });
const threadId = S.Struct({ threadId: S.String });
export const AiRpcs = RpcGroup.make(
  unary("Ai.GetAgentUiTasks", {
    payload: { ids: S.Array(S.String) },
    success: S.Array(UiTask),
    error,
  }),
  unary("Ai.GetAgentThread", {
    payload: {
      ...PromptKey.fields,
      threadId: RpcOptional(S.String),
      ...ReadAgent.fields,
    },
    success: ThreadRead,
    error,
  }),
  unary("Ai.CreateAgentThread", {
    payload: { downloadId: S.String },
    success: ThreadRead,
    error,
  }),
  unary("Ai.SendAgentMessage", { payload: Send, success: ThreadRead, error }),
  unary("Ai.DecideAgentTool", {
    payload: {
      threadId: S.String,
      toolCallId: S.String,
      approved: S.Boolean,
      remember: S.Boolean,
    },
    success: S.Void,
    error,
  }),
  unary("Ai.SelectAgentImages", {
    payload: {
      threadId: S.String,
      files: S.Struct({
        name: S.String,
        data: S.Uint8ArrayFromBase64,
      }).pipe(S.Array, RpcOptional),
    },
    success: ThreadRead,
    error,
  }),
  unary("Ai.RemoveAgentImage", {
    payload: { threadId: S.String, imageId: S.String },
    success: ThreadRead,
    error,
  }),
  unary("Ai.StopAgentRun", {
    payload: threadId,
    success: S.NullOr(ThreadRead),
    error,
  }),
  unary("Ai.SelectAgentBranch", {
    payload: { threadId: S.String, messageId: S.String },
    success: ThreadRead,
    error,
  }),
  unary("Ai.SetAgentThinkingLevel", {
    payload: { threadId: S.String, level: RpcObserved(S.Unknown) },
    success: ThreadRead,
    error,
  }),
  unary("Ai.GetAgentEvents", {
    payload: { threadId: S.String, after: WireFinite, ...ReadAgent.fields },
    success: Recovery,
    error,
  }),
  unary("Ai.ListAgentHistory", {
    payload: ReadAgent,
    success: S.Array(SummaryRead),
    error,
  }),
  unary("Ai.ListAgentThreads", {
    payload: { downloadId: S.String, ...ReadAgent.fields },
    success: S.Array(SummaryRead),
    error,
  }),
  unary("Ai.RenameAgentThread", {
    payload: { threadId: S.String, title: S.String },
    success: S.Array(SummaryRead),
    error,
  }),
  unary("Ai.DeleteAgentThread", {
    payload: threadId,
    success: S.Array(SummaryRead),
    error,
  }),
  unary("Ai.SaveAgentArtifact", {
    payload: { threadId: S.String, artifactId: S.String },
    success: S.Boolean,
    error,
  }),
  unary("Ai.TakeAgentNotificationTarget", {
    payload: ReadClicks,
    success: S.NullOr(Target),
    error,
  }),
  unary("Ai.GetAgentThinkingOptions", {
    payload: ReadSettings,
    success: ThinkingOptions,
    error,
  }),
  unary("Ai.GetAgentComposerOptions", {
    payload: ReadSettings,
    success: Composer,
    error,
  }),
  unary("Ai.SelectAgentComposerModel", {
    payload: { value: S.String },
    success: S.Void,
    error,
  }),
  unary("Ai.GetSnapshot", {
    payload: ReadSettings,
    success: Settings,
    error,
  }),
  unary("Ai.ListPresets", { success: S.Array(Preset), error }),
  unary("Ai.LookupCatalogModel", {
    payload: { presetId: PresetId, modelId: S.String },
    success: S.NullOr(ModelCaps),
    error,
  }),
  unary("Ai.ListCatalogModels", {
    payload: { presetId: PresetId },
    success: S.Array(CatalogOption),
    error,
  }),
  unary("Ai.ListRemoteModels", {
    payload: RemoteInput,
    success: S.Array(CatalogOption),
    error,
  }),
  unary("Ai.UpsertProvider", {
    payload: ProviderWrite,
    success: Settings,
    error,
  }),
  unary("Ai.DeleteProvider", {
    payload: { id: S.String },
    success: Settings,
    error,
  }),
  unary("Ai.SetActiveProvider", {
    payload: { id: S.NullOr(S.String) },
    success: Settings,
    error,
  }),
  unary("Ai.GetCloudModels", { success: CloudModels, error }),
  unary("Ai.SetCloudModel", {
    payload: { id: S.String },
    success: Settings,
    error,
  }),
  unary("Ai.UpsertPrompt", {
    payload: PromptWrite,
    success: PromptRead,
    error,
  }),
  unary("Ai.CustomizeSkill", {
    payload: { name: S.String },
    success: PromptRead,
    error,
  }),
  unary("Ai.ImportSkillDocument", {
    payload: { document: S.String },
    success: PromptRead,
    error,
  }),
  unary("Ai.ImportSkillUpload", {
    payload: { name: S.String, bytes: S.Uint8ArrayFromBase64 },
    success: PromptRead,
    error,
  }),
  unary("Ai.InspectGitHubSkills", {
    payload: { url: S.String },
    success: GithubSource,
    error,
  }),
  unary("Ai.ImportGitHubSkill", {
    payload: GithubInput,
    success: PromptRead,
    error,
  }),
  unary("Ai.SetSkillAutoRun", {
    payload: { name: S.String, autoRun: S.Boolean },
    success: Settings,
    error,
  }),
  unary("Ai.SetSkillTranscriptVisibility", {
    payload: { name: S.String, showInTranscript: S.Boolean },
    success: Settings,
    error,
  }),
  unary("Ai.ExportSkillDocument", {
    payload: { id: S.String },
    success: S.String,
    error,
  }),
  unary("Ai.OpenSkillDirectory", {
    payload: { id: RpcOptional(S.String) },
    success: S.Void,
    error,
  }),
  unary("Ai.DeletePrompt", {
    payload: { id: S.String },
    success: Settings,
    error,
  }),
  unary("Ai.RestoreDefaultPrompts", { success: Settings, error }),
  unary("Ai.DislikePrompt", {
    payload: { resultId: S.String },
    success: S.Void,
    error,
  }),
  unary("Ai.StartPrompt", {
    payload: PromptInput,
    success: PromptRun,
    error,
  }),
  unary("Ai.StopPrompt", {
    payload: PromptKey,
    success: PromptRun,
    error,
  }),
  unary("Ai.GetPromptRun", {
    payload: { ...PromptKey.fields, ...ReadPrompt.fields },
    success: PromptRun,
    error,
  }),
  unary("Ai.TestProvider", {
    payload: ProviderWrite,
    success: ProviderTest,
    error,
  }),
  Rpc.make("Ai.WatchAgentEvents", {
    success: Subscription(
      S.Struct({
        kind: S.Literal("event"),
        event: EventRead,
      })
    ),
    error: S.Union([AiOperationError, AiStreamOverflow, DeliveryError]),
    stream: true,
  }),
  Rpc.make("Ai.WatchSettings", {
    success: Subscription(S.Struct({ kind: S.Literal("changed") })),
    error: S.Union([AiOperationError, AiStreamOverflow, DeliveryError]),
    stream: true,
  }),
  Rpc.make("Ai.WatchPromptRuns", {
    success: Subscription(
      S.Struct({
        kind: S.Literal("snapshot"),
        snapshot: PromptRun,
      })
    ),
    error: S.Union([AiOperationError, AiStreamOverflow, DeliveryError]),
    stream: true,
  }),
  Rpc.make("Ai.WatchNotificationClicks", {
    success: Subscription(S.Struct({ kind: S.Literal("changed") })),
    error: S.Union([AiOperationError, AiStreamOverflow, DeliveryError]),
    stream: true,
  })
);
