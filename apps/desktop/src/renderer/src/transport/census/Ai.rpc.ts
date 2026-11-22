import { $DesktopId } from "@vidbee/identity/packages";
import * as LK from "@vidbee/schema";
import * as A from "effect/Array";
import * as R from "effect/Record";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as S from "effect/Schema";
import { DeliveryError } from "../DocumentDelivery.errors.js";
import { Completion, Subscription, Token } from "../DocumentDelivery.model.js";
import { RpcArray, RpcOptional } from "../RpcField.model.js";
import { RpcObserved } from "../RpcObservation.model.js";

const $TransportId = $DesktopId.create("renderer/src/transport/census/Ai.rpc");

/**
 * Validates Wire Finite at the desktop capability boundary before dispatch.
 *
 * **Example** (Use WireFinite at its owning boundary)
 *
 * ```ts
 * import { WireFinite } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(WireFinite);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const WireFinite = RpcObserved(S.Finite).pipe(
  $TransportId.annoteSchema("WireFinite", { description: "Wire Finite boundary in the desktop transport contract." })
);
/**
 * Describes Wire Finite ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type WireFinite = typeof WireFinite.Type;
/**
 * Validates Thinking at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Thinking at its owning boundary)
 *
 * ```ts
 * import { Thinking } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Thinking);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Thinking = LK.LiteralKit(["off", "minimal", "low", "medium", "high", "xhigh", "max"]).pipe(
  $TransportId.annoteSchema("Thinking", { description: "Thinking boundary in the desktop transport contract." })
);
/**
 * Describes Thinking ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Thinking = typeof Thinking.Type;
/**
 * Validates Run Status at the desktop capability boundary before dispatch.
 *
 * **Example** (Use RunStatus at its owning boundary)
 *
 * ```ts
 * import { RunStatus } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(RunStatus);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const RunStatus = LK.LiteralKit(["running", "completed", "aborted", "error", "interrupted"]).pipe(
  $TransportId.annoteSchema("RunStatus", { description: "Run Status boundary in the desktop transport contract." })
);
/**
 * Describes Run Status ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RunStatus = typeof RunStatus.Type;
/**
 * Validates Tool Status at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ToolStatus at its owning boundary)
 *
 * ```ts
 * import { ToolStatus } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ToolStatus);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ToolStatus = LK.LiteralKit(["running", "completed", "error", "pending-approval", "denied"]).pipe(
  $TransportId.annoteSchema("ToolStatus", { description: "Tool Status boundary in the desktop transport contract." })
);
/**
 * Describes Tool Status ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ToolStatus = typeof ToolStatus.Type;
/**
 * Validates Error Code at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ErrorCode at its owning boundary)
 *
 * ```ts
 * import { ErrorCode } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ErrorCode);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
]).pipe(
  $TransportId.annoteSchema("ErrorCode", { description: "Error Code boundary in the desktop transport contract." })
);
/**
 * Describes Error Code ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ErrorCode = typeof ErrorCode.Type;
/**
 * Validates Prompt Code at the desktop capability boundary before dispatch.
 *
 * **Example** (Use PromptCode at its owning boundary)
 *
 * ```ts
 * import { PromptCode } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(PromptCode);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
]).pipe(
  $TransportId.annoteSchema("PromptCode", { description: "Prompt Code boundary in the desktop transport contract." })
);
/**
 * Describes Prompt Code ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PromptCode = typeof PromptCode.Type;
/**
 * Validates Preset Id at the desktop capability boundary before dispatch.
 *
 * **Example** (Use PresetId at its owning boundary)
 *
 * ```ts
 * import { PresetId } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(PresetId);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
]).pipe(
  $TransportId.annoteSchema("PresetId", { description: "Preset Id boundary in the desktop transport contract." })
);
/**
 * Describes Preset Id ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PresetId = typeof PresetId.Type;
/**
 * Validates Ui Response at the desktop capability boundary before dispatch.
 *
 * **Example** (Use UiResponse at its owning boundary)
 *
 * ```ts
 * import { UiResponse } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(UiResponse);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const UiResponse = S.Struct({ toolCallId: S.String, title: S.String, values: RpcArray(S.String) }).pipe(
  $TransportId.annoteSchema("UiResponse", { description: "Ui Response boundary in the desktop transport contract." })
);
/**
 * Describes Ui Response ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type UiResponse = typeof UiResponse.Type;
/**
 * Validates Ui Spec at the desktop capability boundary before dispatch.
 *
 * **Example** (Use UiSpec at its owning boundary)
 *
 * ```ts
 * import { UiSpec } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(UiSpec);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
      children: RpcArray(S.String),
    })
  ),
}).pipe($TransportId.annoteSchema("UiSpec", { description: "Ui Spec boundary in the desktop transport contract." }));
/**
 * Describes Ui Spec ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type UiSpec = typeof UiSpec.Type;
/**
 * Validates Approval at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Approval at its owning boundary)
 *
 * ```ts
 * import { Approval } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Approval);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
}).pipe($TransportId.annoteSchema("Approval", { description: "Approval boundary in the desktop transport contract." }));
/**
 * Describes Approval ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Approval = typeof Approval.Type;
/**
 * Validates Image at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Image at its owning boundary)
 *
 * ```ts
 * import { Image } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Image);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Image = RpcObserved(
  S.StructWithRest(S.Struct({ path: S.Literal("") }), [S.Record(S.String, S.Unknown)])
).pipe($TransportId.annoteSchema("Image", { description: "Image boundary in the desktop transport contract." }));
/**
 * Describes Image ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Image = typeof Image.Type;
/**
 * Validates Artifact at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Artifact at its owning boundary)
 *
 * ```ts
 * import { Artifact } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Artifact);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Artifact = RpcObserved(
  S.StructWithRest(S.Struct({ path: S.Literal("") }), [S.Record(S.String, S.Unknown)])
).pipe($TransportId.annoteSchema("Artifact", { description: "Artifact boundary in the desktop transport contract." }));
/**
 * Describes Artifact ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Artifact = typeof Artifact.Type;
/**
 * Validates Message at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Message at its owning boundary)
 *
 * ```ts
 * import { Message } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Message);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Message = RpcObserved(S.Record(S.String, S.Unknown)).pipe(
  $TransportId.annoteSchema("Message", { description: "Message boundary in the desktop transport contract." })
);
/**
 * Describes Message ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Message = typeof Message.Type;
/**
 * Validates Activity at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Activity at its owning boundary)
 *
 * ```ts
 * import { Activity } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Activity);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
    artifactIds: RpcArray(S.String),
  }),
]).pipe($TransportId.annoteSchema("Activity", { description: "Activity boundary in the desktop transport contract." }));
/**
 * Describes Activity ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Activity = typeof Activity.Type;
/**
 * Validates Tool at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Tool at its owning boundary)
 *
 * ```ts
 * import { Tool } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Tool);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Tool = RpcObserved(S.Record(S.String, S.Unknown)).pipe(
  $TransportId.annoteSchema("Tool", { description: "Tool boundary in the desktop transport contract." })
);
/**
 * Describes Tool ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Tool = typeof Tool.Type;
/**
 * Validates Run at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Run at its owning boundary)
 *
 * ```ts
 * import { Run } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Run);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Run = RpcObserved(
  S.StructWithRest(
    S.Struct({
      rawMessages: RpcArray(S.Unknown),
      tools: RpcArray(Tool),
      activity: RpcArray(S.Record(S.String, S.Unknown)),
    }),
    [S.Record(S.String, S.Unknown)]
  )
).pipe($TransportId.annoteSchema("Run", { description: "Run boundary in the desktop transport contract." }));
/**
 * Describes Run ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Run = typeof Run.Type;
/**
 * Validates Thread at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Thread at its owning boundary)
 *
 * ```ts
 * import { Thread } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Thread);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Thread = RpcObserved(
  S.StructWithRest(
    S.Struct({
      messages: RpcArray(Message),
      runs: RpcArray(Run),
      artifacts: RpcArray(Artifact),
      images: S.optionalKey(S.Unknown),
    }),
    [S.Record(S.String, S.Unknown)]
  )
).pipe($TransportId.annoteSchema("Thread", { description: "Thread boundary in the desktop transport contract." }));
/**
 * Describes Thread ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Thread = typeof Thread.Type;
/**
 * Validates Summary at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Summary at its owning boundary)
 *
 * ```ts
 * import { Summary } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Summary);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
).pipe($TransportId.annoteSchema("Summary", { description: "Summary boundary in the desktop transport contract." }));
/**
 * Describes Summary ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Summary = typeof Summary.Type;
/**
 * Validates Patch at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Patch at its owning boundary)
 *
 * ```ts
 * import { Patch } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Patch);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
).pipe($TransportId.annoteSchema("Patch", { description: "Patch boundary in the desktop transport contract." }));
/**
 * Describes Patch ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Patch = typeof Patch.Type;
/**
 * Validates Catalog at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Catalog at its owning boundary)
 *
 * ```ts
 * import { Catalog } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Catalog);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
).pipe($TransportId.annoteSchema("Catalog", { description: "Catalog boundary in the desktop transport contract." }));
/**
 * Describes Catalog ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Catalog = typeof Catalog.Type;
/**
 * Validates Event at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Event at its owning boundary)
 *
 * ```ts
 * import { Event } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Event);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
).pipe($TransportId.annoteSchema("Event", { description: "Event boundary in the desktop transport contract." }));
/**
 * Describes Event ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Event = typeof Event.Type;
/**
 * Validates Persisted Event Read at the desktop capability boundary before dispatch.
 *
 * **Example** (Use PersistedEventRead at its owning boundary)
 *
 * ```ts
 * import { PersistedEventRead } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(PersistedEventRead);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PersistedEventRead = RpcObserved(S.Unknown).pipe(
  $TransportId.annoteSchema("PersistedEventRead", {
    description: "Persisted Event Read boundary in the desktop transport contract.",
  })
);
/**
 * Describes Persisted Event Read ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PersistedEventRead = typeof PersistedEventRead.Type;
/**
 * Validates Recovery at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Recovery at its owning boundary)
 *
 * ```ts
 * import { Recovery } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Recovery);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Recovery = RpcObserved(
  S.Struct({ events: RpcArray(PersistedEventRead), snapshot: S.NullOr(Thread) })
).pipe($TransportId.annoteSchema("Recovery", { description: "Recovery boundary in the desktop transport contract." }));
/**
 * Describes Recovery ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Recovery = typeof Recovery.Type;
/**
 * Validates Thinking Options at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ThinkingOptions at its owning boundary)
 *
 * ```ts
 * import { ThinkingOptions } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ThinkingOptions);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ThinkingOptions = S.Struct({ levels: RpcArray(Thinking), defaultLevel: Thinking, vision: S.Boolean }).pipe(
  $TransportId.annoteSchema("ThinkingOptions", {
    description: "Thinking Options boundary in the desktop transport contract.",
  })
);
/**
 * Describes Thinking Options ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ThinkingOptions = typeof ThinkingOptions.Type;
/**
 * Validates Authored Send at the desktop capability boundary before dispatch.
 *
 * **Example** (Use AuthoredSend at its owning boundary)
 *
 * ```ts
 * import { AuthoredSend } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(AuthoredSend);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
}).pipe(
  $TransportId.annoteSchema("AuthoredSend", {
    description: "Authored Send boundary in the desktop transport contract.",
  })
);
/**
 * Describes Authored Send ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AuthoredSend = typeof AuthoredSend.Type;
/**
 * Validates Send at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Send at its owning boundary)
 *
 * ```ts
 * import { Send } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Send);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
}).pipe($TransportId.annoteSchema("Send", { description: "Send boundary in the desktop transport contract." }));
/**
 * Describes Send ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Send = typeof Send.Type;
/**
 * Validates Provider Fields at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ProviderFields at its owning boundary)
 *
 * ```ts
 * import { ProviderFields } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const schema = S.Struct(ProviderFields);
 * void S.decodeEffect(schema)({});
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
/**
 * Constructs provider Keys with explicit lifetime and failure ownership.
 *
 * **Example** (Use providerKeys at its owning boundary)
 *
 * ```ts
 * import { providerKeys } from "./Ai.rpc.js"
 * const providerFieldCount = providerKeys.length;
 * void providerFieldCount;
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
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
/**
 * Constructs Provider with explicit lifetime and failure ownership.
 *
 * **Example** (Use Provider at its owning boundary)
 *
 * ```ts
 * import { Provider } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const validate = S.decodeUnknownEffect(Provider);
 * void validate({});
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const Provider = RpcObserved(
  S.Record(S.String, S.Unknown).check(
    S.makeFilter(
      (value) =>
        A.every(R.keys(value), (key) => A.contains(providerKeys, key)) &&
        S.is(S.Struct({ hasApiKey: S.Boolean }))(value)
    )
  )
).pipe($TransportId.annoteSchema("Provider", { description: "Provider boundary in the desktop transport contract." }));
/**
 * Describes Provider ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Provider = typeof Provider.Type;
/**
 * Validates Provider Write at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ProviderWrite at its owning boundary)
 *
 * ```ts
 * import { ProviderWrite } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ProviderWrite);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ProviderWrite = S.Struct({
  ...ProviderFields,
  id: RpcOptional(S.String),
  presetId: PresetId,
  name: RpcOptional(S.String),
  baseUrl: RpcOptional(S.String),
  modelId: S.String,
  apiKey: RpcOptional(S.String),
  copyApiKeyFromId: RpcOptional(S.String),
}).pipe(
  $TransportId.annoteSchema("ProviderWrite", {
    description: "Provider Write boundary in the desktop transport contract.",
  })
);
/**
 * Describes Provider Write ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ProviderWrite = typeof ProviderWrite.Type;
/**
 * Validates Prompt at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Prompt at its owning boundary)
 *
 * ```ts
 * import { Prompt } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Prompt);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Prompt = RpcObserved(
  S.Struct({
    name: S.Unknown,
    content: S.Unknown,
    isPreset: S.Unknown,
    sortOrder: S.Unknown,
    createdAt: S.Unknown,
    updatedAt: S.Unknown,
  })
).pipe($TransportId.annoteSchema("Prompt", { description: "Prompt boundary in the desktop transport contract." }));
/**
 * Describes Prompt ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Prompt = typeof Prompt.Type;
/**
 * Validates Prompt Write at the desktop capability boundary before dispatch.
 *
 * **Example** (Use PromptWrite at its owning boundary)
 *
 * ```ts
 * import { PromptWrite } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(PromptWrite);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PromptWrite = S.Struct({
  name: S.String,
  content: S.String,
  previousName: RpcOptional(S.String),
  description: RpcOptional(S.String),
  enabled: RpcOptional(S.Boolean),
  autoRun: RpcOptional(S.Boolean),
  showInTranscript: RpcOptional(S.Boolean),
  frontmatter: RpcObserved(S.Record(S.String, S.Unknown)).pipe(RpcOptional),
}).pipe(
  $TransportId.annoteSchema("PromptWrite", { description: "Prompt Write boundary in the desktop transport contract." })
);
/**
 * Describes Prompt Write ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PromptWrite = typeof PromptWrite.Type;
/**
 * Validates Settings at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Settings at its owning boundary)
 *
 * ```ts
 * import { Settings } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Settings);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Settings = RpcObserved(
  S.Struct({
    activeProviderId: S.NullOr(S.String),
    cloudModelId: S.String.pipe(S.NullOr, RpcOptional),
    providers: RpcArray(Provider),
    prompts: RpcArray(Prompt),
  })
).pipe($TransportId.annoteSchema("Settings", { description: "Settings boundary in the desktop transport contract." }));
/**
 * Describes Settings ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Settings = typeof Settings.Type;
/**
 * Validates Prompt Key at the desktop capability boundary before dispatch.
 *
 * **Example** (Use PromptKey at its owning boundary)
 *
 * ```ts
 * import { PromptKey } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(PromptKey);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PromptKey = S.Struct({ downloadId: S.String, promptId: S.String }).pipe(
  $TransportId.annoteSchema("PromptKey", { description: "Prompt Key boundary in the desktop transport contract." })
);
/**
 * Describes Prompt Key ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PromptKey = typeof PromptKey.Type;
/**
 * Validates Prompt Input at the desktop capability boundary before dispatch.
 *
 * **Example** (Use PromptInput at its owning boundary)
 *
 * ```ts
 * import { PromptInput } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(PromptInput);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PromptInput = S.Struct({
  ...PromptKey.fields,
  transcriptText: S.String,
  forceRegenerate: RpcOptional(S.Boolean),
  uiLanguage: RpcOptional(S.String),
  sourceUrl: RpcOptional(S.String),
  transcriptLanguage: RpcOptional(S.String),
  transcriptOrigin: RpcOptional(LK.LiteralKit(["ai", "human"])),
}).pipe(
  $TransportId.annoteSchema("PromptInput", { description: "Prompt Input boundary in the desktop transport contract." })
);
/**
 * Describes Prompt Input ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PromptInput = typeof PromptInput.Type;
/**
 * Validates Prompt Run at the desktop capability boundary before dispatch.
 *
 * **Example** (Use PromptRun at its owning boundary)
 *
 * ```ts
 * import { PromptRun } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(PromptRun);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
).pipe(
  $TransportId.annoteSchema("PromptRun", { description: "Prompt Run boundary in the desktop transport contract." })
);
/**
 * Describes Prompt Run ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PromptRun = typeof PromptRun.Type;
/**
 * Validates Provider Test at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ProviderTest at its owning boundary)
 *
 * ```ts
 * import { ProviderTest } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ProviderTest);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ProviderTest = S.Struct({
  ok: S.Boolean,
  text: S.String,
  error: S.NullOr(S.String),
  errorCode: S.NullOr(PromptCode),
}).pipe(
  $TransportId.annoteSchema("ProviderTest", {
    description: "Provider Test boundary in the desktop transport contract.",
  })
);
/**
 * Describes Provider Test ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ProviderTest = typeof ProviderTest.Type;
/**
 * Validates Catalog Option at the desktop capability boundary before dispatch.
 *
 * **Example** (Use CatalogOption at its owning boundary)
 *
 * ```ts
 * import { CatalogOption } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(CatalogOption);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const CatalogOption = S.Struct({ label: S.String, value: S.String }).pipe(
  $TransportId.annoteSchema("CatalogOption", {
    description: "Catalog Option boundary in the desktop transport contract.",
  })
);
/**
 * Describes Catalog Option ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CatalogOption = typeof CatalogOption.Type;
/**
 * Validates Model Caps at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ModelCaps at its owning boundary)
 *
 * ```ts
 * import { ModelCaps } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ModelCaps);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ModelCaps = S.Struct({
  allowDisableThinking: S.Boolean,
  contextWindow: WireFinite,
  id: S.String,
  maxTokens: RpcOptional(WireFinite),
  name: S.String,
  reasoning: S.Boolean,
  thinkingLevels: RpcArray(Thinking),
  thinkingOnly: S.Boolean,
  vision: S.Boolean,
}).pipe(
  $TransportId.annoteSchema("ModelCaps", { description: "Model Caps boundary in the desktop transport contract." })
);
/**
 * Describes Model Caps ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ModelCaps = typeof ModelCaps.Type;
/**
 * Validates Preset at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Preset at its owning boundary)
 *
 * ```ts
 * import { Preset } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Preset);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Preset = S.Struct({
  id: PresetId,
  defaultModel: S.String,
  needsApiKey: S.Boolean,
  requiresBaseUrl: S.Boolean,
  baseUrl: RpcOptional(S.String),
  website: RpcOptional(S.String),
}).pipe($TransportId.annoteSchema("Preset", { description: "Preset boundary in the desktop transport contract." }));
/**
 * Describes Preset ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Preset = typeof Preset.Type;
/**
 * Validates Remote Input at the desktop capability boundary before dispatch.
 *
 * **Example** (Use RemoteInput at its owning boundary)
 *
 * ```ts
 * import { RemoteInput } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(RemoteInput);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const RemoteInput = S.Struct({
  presetId: PresetId,
  id: RpcOptional(S.String),
  apiKey: RpcOptional(S.String),
  baseUrl: RpcOptional(S.String),
}).pipe(
  $TransportId.annoteSchema("RemoteInput", { description: "Remote Input boundary in the desktop transport contract." })
);
/**
 * Describes Remote Input ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RemoteInput = typeof RemoteInput.Type;
/**
 * Validates Cloud Models at the desktop capability boundary before dispatch.
 *
 * **Example** (Use CloudModels at its owning boundary)
 *
 * ```ts
 * import { CloudModels } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(CloudModels);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const CloudModels = S.Struct({
  models: RpcArray(S.Struct({ id: S.String, name: S.String, multiplier: WireFinite })),
  defaultModelId: S.String,
}).pipe(
  $TransportId.annoteSchema("CloudModels", { description: "Cloud Models boundary in the desktop transport contract." })
);
/**
 * Describes Cloud Models ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CloudModels = typeof CloudModels.Type;
/**
 * Validates Composer at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Composer at its owning boundary)
 *
 * ```ts
 * import { Composer } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Composer);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Composer = RpcObserved(
  S.Struct({
    models: RpcArray(
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
).pipe($TransportId.annoteSchema("Composer", { description: "Composer boundary in the desktop transport contract." }));
/**
 * Describes Composer ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Composer = typeof Composer.Type;
/**
 * Validates Github Source at the desktop capability boundary before dispatch.
 *
 * **Example** (Use GithubSource at its owning boundary)
 *
 * ```ts
 * import { GithubSource } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(GithubSource);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const GithubSource = S.Struct({ repository: S.String, revision: S.String, paths: RpcArray(S.String) }).pipe(
  $TransportId.annoteSchema("GithubSource", {
    description: "Github Source boundary in the desktop transport contract.",
  })
);
/**
 * Describes Github Source ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type GithubSource = typeof GithubSource.Type;
/**
 * Validates Github Input at the desktop capability boundary before dispatch.
 *
 * **Example** (Use GithubInput at its owning boundary)
 *
 * ```ts
 * import { GithubInput } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(GithubInput);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const GithubInput = S.Struct({ repository: S.String, revision: S.String, path: S.String }).pipe(
  $TransportId.annoteSchema("GithubInput", { description: "Github Input boundary in the desktop transport contract." })
);
/**
 * Describes Github Input ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type GithubInput = typeof GithubInput.Type;
/**
 * Validates Target at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Target at its owning boundary)
 *
 * ```ts
 * import { Target } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Target);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Target = S.Struct({ threadId: S.String, downloadId: S.String, promptId: S.String }).pipe(
  $TransportId.annoteSchema("Target", { description: "Target boundary in the desktop transport contract." })
);
/**
 * Describes Target ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Target = typeof Target.Type;
/**
 * Validates Ai Operation Error at the desktop capability boundary before dispatch.
 *
 * **Example** (Use AiOperationError at its owning boundary)
 *
 * ```ts
 * import { AiOperationError } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(AiOperationError);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class AiOperationError extends S.TaggedError<AiOperationError, { readonly brand: unique symbol }>()(
  "AiOperationError",
  { operation: S.String, message: S.String },
  $TransportId.annoteError("AiOperationError", {
    description: "Ai Operation Error preserves the declared desktop failure fields.",
  })
) {}
/**
 * Validates Ai Stream Overflow at the desktop capability boundary before dispatch.
 *
 * **Example** (Use AiStreamOverflow at its owning boundary)
 *
 * ```ts
 * import { AiStreamOverflow } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(AiStreamOverflow);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class AiStreamOverflow extends S.TaggedError<AiStreamOverflow, { readonly brand: unique symbol }>()(
  "AiStreamOverflow",
  { stream: S.String, message: S.String },
  $TransportId.annoteError("AiStreamOverflow", {
    description: "Ai Stream Overflow preserves the declared desktop failure fields.",
  })
) {}
const error = AiOperationError.pipe(
  $TransportId.annoteSchema("error", { description: "error boundary in the desktop transport contract." })
);
/**
 * Constructs Agent Token with explicit lifetime and failure ownership.
 *
 * **Example** (Use AgentToken at its owning boundary)
 *
 * ```ts
 * import { AgentToken } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const validate = S.decodeUnknownEffect(AgentToken);
 * void validate({});
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const AgentToken = Token.check(S.makeFilter((token) => token.family === "ai.agent")).pipe(
  $TransportId.annoteSchema("AgentToken", { description: "Agent Token boundary in the desktop transport contract." })
);
/**
 * Describes Agent Token ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AgentToken = typeof AgentToken.Type;
/**
 * Constructs Settings Token with explicit lifetime and failure ownership.
 *
 * **Example** (Use SettingsToken at its owning boundary)
 *
 * ```ts
 * import { SettingsToken } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const validate = S.decodeUnknownEffect(SettingsToken);
 * void validate({});
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const SettingsToken = Token.check(S.makeFilter((token) => token.family === "ai.settings")).pipe(
  $TransportId.annoteSchema("SettingsToken", {
    description: "Settings Token boundary in the desktop transport contract.",
  })
);
/**
 * Describes Settings Token ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type SettingsToken = typeof SettingsToken.Type;
/**
 * Constructs Prompt Token with explicit lifetime and failure ownership.
 *
 * **Example** (Use PromptToken at its owning boundary)
 *
 * ```ts
 * import { PromptToken } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const validate = S.decodeUnknownEffect(PromptToken);
 * void validate({});
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const PromptToken = Token.check(S.makeFilter((token) => token.family === "ai.prompt")).pipe(
  $TransportId.annoteSchema("PromptToken", { description: "Prompt Token boundary in the desktop transport contract." })
);
/**
 * Describes Prompt Token ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PromptToken = typeof PromptToken.Type;
/**
 * Constructs Click Token with explicit lifetime and failure ownership.
 *
 * **Example** (Use ClickToken at its owning boundary)
 *
 * ```ts
 * import { ClickToken } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const validate = S.decodeUnknownEffect(ClickToken);
 * void validate({});
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const ClickToken = Token.check(S.makeFilter((token) => token.family === "ai.clicks")).pipe(
  $TransportId.annoteSchema("ClickToken", { description: "Click Token boundary in the desktop transport contract." })
);
/**
 * Describes Click Token ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ClickToken = typeof ClickToken.Type;
/**
 * Validates Read Agent at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ReadAgent at its owning boundary)
 *
 * ```ts
 * import { ReadAgent } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ReadAgent);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ReadAgent = S.Struct({ agent: AgentToken }).pipe(
  $TransportId.annoteSchema("ReadAgent", { description: "Read Agent boundary in the desktop transport contract." })
);
/**
 * Describes Read Agent ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ReadAgent = typeof ReadAgent.Type;
/**
 * Validates Read Settings at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ReadSettings at its owning boundary)
 *
 * ```ts
 * import { ReadSettings } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ReadSettings);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ReadSettings = S.Struct({ settings: SettingsToken }).pipe(
  $TransportId.annoteSchema("ReadSettings", {
    description: "Read Settings boundary in the desktop transport contract.",
  })
);
/**
 * Describes Read Settings ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ReadSettings = typeof ReadSettings.Type;
/**
 * Validates Read Prompt at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ReadPrompt at its owning boundary)
 *
 * ```ts
 * import { ReadPrompt } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ReadPrompt);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ReadPrompt = S.Struct({ prompt: PromptToken }).pipe(
  $TransportId.annoteSchema("ReadPrompt", { description: "Read Prompt boundary in the desktop transport contract." })
);
/**
 * Describes Read Prompt ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ReadPrompt = typeof ReadPrompt.Type;
/**
 * Validates Read Clicks at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ReadClicks at its owning boundary)
 *
 * ```ts
 * import { ReadClicks } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ReadClicks);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ReadClicks = S.Struct({ clicks: ClickToken }).pipe(
  $TransportId.annoteSchema("ReadClicks", { description: "Read Clicks boundary in the desktop transport contract." })
);
/**
 * Describes Read Clicks ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ReadClicks = typeof ReadClicks.Type;
const r = <const Tag extends string, P extends S.Struct.Fields | S.Top = S.Void, A extends S.Top = S.Void>(
  tag: Tag,
  options: { readonly payload?: P; readonly success: A; readonly error: S.Top }
) =>
  Rpc.make(tag, {
    ...options,
    success: Completion({ success: options.success, error: AiOperationError }),
    error: DeliveryError,
  });
/**
 * Validates Ui Task at the desktop capability boundary before dispatch.
 *
 * **Example** (Use UiTask at its owning boundary)
 *
 * ```ts
 * import { UiTask } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(UiTask);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
).pipe($TransportId.annoteSchema("UiTask", { description: "Ui Task boundary in the desktop transport contract." }));
/**
 * Describes Ui Task ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type UiTask = typeof UiTask.Type;
/**
 * Constructs Send Rpc with explicit lifetime and failure ownership.
 *
 * **Example** (Use SendRpc at its owning boundary)
 *
 * ```ts
 * import { SendRpc } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const validatePayload = S.decodeUnknownEffect(SendRpc.payloadSchema);
 * void validatePayload({});
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const SendRpc = r("Ai.SendAgentMessage", { payload: Send, success: Thread, error });
/**
 * Validates Thread Read at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ThreadRead at its owning boundary)
 *
 * ```ts
 * import { ThreadRead } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ThreadRead);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ThreadRead = Thread.pipe(
  $TransportId.annoteSchema("ThreadRead", { description: "Thread Read boundary in the desktop transport contract." })
);
/**
 * Describes Thread Read ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ThreadRead = typeof ThreadRead.Type;
/**
 * Validates Prompt Read at the desktop capability boundary before dispatch.
 *
 * **Example** (Use PromptRead at its owning boundary)
 *
 * ```ts
 * import { PromptRead } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(PromptRead);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PromptRead = Prompt.pipe(
  $TransportId.annoteSchema("PromptRead", { description: "Prompt Read boundary in the desktop transport contract." })
);
/**
 * Describes Prompt Read ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PromptRead = typeof PromptRead.Type;
/**
 * Validates Summary Read at the desktop capability boundary before dispatch.
 *
 * **Example** (Use SummaryRead at its owning boundary)
 *
 * ```ts
 * import { SummaryRead } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(SummaryRead);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SummaryRead = Summary.pipe(
  $TransportId.annoteSchema("SummaryRead", { description: "Summary Read boundary in the desktop transport contract." })
);
/**
 * Describes Summary Read ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type SummaryRead = typeof SummaryRead.Type;
/**
 * Validates Event Read at the desktop capability boundary before dispatch.
 *
 * **Example** (Use EventRead at its owning boundary)
 *
 * ```ts
 * import { EventRead } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(EventRead);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const EventRead = Event.pipe(
  $TransportId.annoteSchema("EventRead", { description: "Event Read boundary in the desktop transport contract." })
);
/**
 * Describes Event Read ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type EventRead = typeof EventRead.Type;
const unary = <const Tag extends string, P extends S.Struct.Fields | S.Top = S.Void, A extends S.Top = S.Void>(
  tag: Tag,
  options: {
    readonly payload?: P;
    readonly success: A;
    readonly error: S.Top;
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
const threadId = S.Struct({ threadId: S.String }).pipe(
  $TransportId.annoteSchema("threadId", { description: "thread Id boundary in the desktop transport contract." })
);
/**
 * Validates Ai Rpcs at the desktop capability boundary before dispatch.
 *
 * **Example** (Use AiRpcs at its owning boundary)
 *
 * ```ts
 * import { AiRpcs } from "./Ai.rpc.js"
 * import * as RpcClient from "effect/rpc/RpcClient"
 * const client = RpcClient.make(AiRpcs);
 * void client;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AiRpcs = RpcGroup.make(
  unary("Ai.GetAgentUiTasks", {
    payload: { ids: RpcArray(S.String) },
    success: RpcArray(UiTask),
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
    success: RpcArray(SummaryRead),
    error,
  }),
  unary("Ai.ListAgentThreads", {
    payload: { downloadId: S.String, ...ReadAgent.fields },
    success: RpcArray(SummaryRead),
    error,
  }),
  unary("Ai.RenameAgentThread", {
    payload: { threadId: S.String, title: S.String },
    success: RpcArray(SummaryRead),
    error,
  }),
  unary("Ai.DeleteAgentThread", {
    payload: threadId,
    success: RpcArray(SummaryRead),
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
  unary("Ai.ListPresets", { success: RpcArray(Preset), error }),
  unary("Ai.LookupCatalogModel", {
    payload: { presetId: PresetId, modelId: S.String },
    success: S.NullOr(ModelCaps),
    error,
  }),
  unary("Ai.ListCatalogModels", {
    payload: { presetId: PresetId },
    success: RpcArray(CatalogOption),
    error,
  }),
  unary("Ai.ListRemoteModels", {
    payload: RemoteInput,
    success: RpcArray(CatalogOption),
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
