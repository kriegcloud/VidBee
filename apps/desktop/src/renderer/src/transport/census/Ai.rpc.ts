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
 * Restricts renderer-authored numeric input to finite values before native command dispatch.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { WireFinite } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(WireFinite)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const WireFinite = RpcObserved(S.Finite).pipe(
  $TransportId.annoteSchema("WireFinite", { description: "Wire Finite boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link WireFinite}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type WireFinite = typeof WireFinite.Type;
/**
 * Selects the requested AI reasoning level; providers decide which of these declared levels they support.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Thinking } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Thinking)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Thinking = LK.LiteralKit(["off", "minimal", "low", "medium", "high", "xhigh", "max"]).pipe(
  $TransportId.annoteSchema("Thinking", { description: "Thinking boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link Thinking}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Thinking = typeof Thinking.Type;
/**
 * Classifies an agent run lifecycle, including aborted and interrupted outcomes needed for recovery.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { RunStatus } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(RunStatus)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const RunStatus = LK.LiteralKit(["running", "completed", "aborted", "error", "interrupted"]).pipe(
  $TransportId.annoteSchema("RunStatus", { description: "Run Status boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link RunStatus}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RunStatus = typeof RunStatus.Type;
/**
 * Classifies tool execution and approval state so pending approval and denial remain distinct from runtime failure.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ToolStatus } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ToolStatus)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ToolStatus = LK.LiteralKit(["running", "completed", "error", "pending-approval", "denied"]).pipe(
  $TransportId.annoteSchema("ToolStatus", { description: "Tool Status boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link ToolStatus}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ToolStatus = typeof ToolStatus.Type;
/**
 * Preserves the declared AI failure category for renderer recovery and user messaging.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ErrorCode } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ErrorCode)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link ErrorCode}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ErrorCode = typeof ErrorCode.Type;
/**
 * Preserves prompt execution and authentication failure categories for the legacy prompt facade.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { PromptCode } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(PromptCode)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link PromptCode}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PromptCode = typeof PromptCode.Type;
/**
 * Restricts provider preset selection to the frozen supported provider identifiers.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { PresetId } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(PresetId)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link PresetId}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PresetId = typeof PresetId.Type;
/**
 * Carries a renderer response to a particular agent UI tool call, including its title and named values.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { UiResponse } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(UiResponse)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const UiResponse = S.Struct({ toolCallId: S.String, title: S.String, values: RpcArray(S.String) }).pipe(
  $TransportId.annoteSchema("UiResponse", { description: "Ui Response boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link UiResponse}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type UiResponse = typeof UiResponse.Type;
/**
 * Describes the agent UI root and element registry, retaining the declared element variants for renderer presentation.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { UiSpec } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(UiSpec)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link UiSpec}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type UiSpec = typeof UiSpec.Type;
/**
 * Describes a pending privileged agent action with its grant key, summary and risk classification.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Approval } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Approval)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Approval}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Approval = typeof Approval.Type;
/**
 * Describes an image attached to an agent conversation, including its native file path.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Image } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Image)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Image = RpcObserved(
  S.StructWithRest(S.Struct({ path: S.Literal("") }), [S.Record(S.String, S.Unknown)])
).pipe($TransportId.annoteSchema("Image", { description: "Image boundary in the desktop transport contract." }));
/**
 * Decoded representation validated by {@link Image}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Image = typeof Image.Type;
/**
 * Describes an agent-produced file artifact that the renderer can display or open.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Artifact } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Artifact)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Artifact = RpcObserved(
  S.StructWithRest(S.Struct({ path: S.Literal("") }), [S.Record(S.String, S.Unknown)])
).pipe($TransportId.annoteSchema("Artifact", { description: "Artifact boundary in the desktop transport contract." }));
/**
 * Decoded representation validated by {@link Artifact}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Artifact = typeof Artifact.Type;
/**
 * Preserves the observed agent message shape rather than rebuilding it from a reduced renderer projection.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Message } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Message)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Message = RpcObserved(S.Record(S.String, S.Unknown)).pipe(
  $TransportId.annoteSchema("Message", { description: "Message boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link Message}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Message = typeof Message.Type;
/**
 * Records thinking or commentary activity within an agent run, retaining its stable activity ID and text.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Activity } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Activity)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Activity}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Activity = typeof Activity.Type;
/**
 * Preserves observed tool execution state and data for conversation replay and recovery.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Tool } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Tool)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Tool = RpcObserved(S.Record(S.String, S.Unknown)).pipe(
  $TransportId.annoteSchema("Tool", { description: "Tool boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link Tool}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Tool = typeof Tool.Type;
/**
 * Preserves a run snapshot with raw messages, tool executions and visible activity.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Run } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Run)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Run}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Run = typeof Run.Type;
/**
 * Preserves a conversation snapshot with messages, runs, artifacts and images for rendering and persistence.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Thread } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Thread)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Thread}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Thread = typeof Thread.Type;
/**
 * Projects the conversation catalog row, including identity, update time, running status and selected model.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Summary } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Summary)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Summary}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Summary = typeof Summary.Type;
/**
 * Carries a partial conversation update without manufacturing omitted message, run or artifact fields.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Patch } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Patch)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Patch}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Patch = typeof Patch.Type;
/**
 * Describes a catalog update, retaining its kind, summary, revision and run status for ordered application.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Catalog } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Catalog)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Catalog}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Catalog = typeof Catalog.Type;
/**
 * Carries a sequenced agent event with conversation identity and optional snapshot, patch or catalog data.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Event } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Event)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Event}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Event = typeof Event.Type;
/**
 * Preserves persisted event-page observations used to recover an agent subscription after a gap.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { PersistedEventRead } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(PersistedEventRead)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link PersistedEventRead}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PersistedEventRead = typeof PersistedEventRead.Type;
/**
 * Pairs recovered agent events with the corresponding snapshot used to resume renderer state.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Recovery } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Recovery)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Recovery = RpcObserved(
  S.Struct({ events: RpcArray(PersistedEventRead), snapshot: S.NullOr(Thread) })
).pipe($TransportId.annoteSchema("Recovery", { description: "Recovery boundary in the desktop transport contract." }));
/**
 * Decoded representation validated by {@link Recovery}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Recovery = typeof Recovery.Type;
/**
 * Advertises available reasoning levels, their default and vision support for the selected model.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ThinkingOptions } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ThinkingOptions)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link ThinkingOptions}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ThinkingOptions = typeof ThinkingOptions.Type;
/**
 * Validates renderer-authored conversation input before sending text, images or a UI response to the agent.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { AuthoredSend } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(AuthoredSend)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link AuthoredSend}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AuthoredSend = typeof AuthoredSend.Type;
/**
 * Preserves the send-command observation while requiring the authored input fields defined by the AI contract.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Send } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Send)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Send}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Send = typeof Send.Type;
/**
 * Defines reusable optional provider settings fields for renderer reads and writes; exact optional codecs retain omission separately from explicit undefined.
 *
 * **Example** (Use ProviderFields with its owner)
 *
 * ```ts
 * import { ProviderFields } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const codec = S.Struct(ProviderFields);
 * export const decoded = S.decodeUnknownResult(codec)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Lists the provider projection keys in the frozen contract order; use this list when selecting provider settings without including unrelated native fields.
 *
 * **Example** (Use providerKeys with its owner)
 *
 * ```ts
 * import { providerKeys } from "./Ai.rpc.js"
 * export const providerFieldCount = providerKeys.length;
 * providerFieldCount > 0 // => true
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
 * Projects provider configuration for the renderer while exposing only whether an API key exists.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Provider } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Provider)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Provider}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Provider = typeof Provider.Type;
/**
 * Validates a provider configuration edit, including explicit API-key replacement or copying from another provider.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ProviderWrite } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ProviderWrite)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link ProviderWrite}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ProviderWrite = typeof ProviderWrite.Type;
/**
 * Describes a stored prompt with its content, preset flag, ordering and persistence timestamps.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Prompt } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Prompt)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Prompt}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Prompt = typeof Prompt.Type;
/**
 * Validates a prompt edit, retaining omission separately from explicit values for optional settings.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { PromptWrite } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(PromptWrite)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link PromptWrite}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PromptWrite = typeof PromptWrite.Type;
/**
 * Preserves the AI settings snapshot containing provider and prompt collections and the active model selection.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Settings } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Settings)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Settings}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Settings = typeof Settings.Type;
/**
 * Identifies a prompt result by download and prompt IDs, preventing cross-download result reuse.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { PromptKey } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(PromptKey)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PromptKey = S.Struct({ downloadId: S.String, promptId: S.String }).pipe(
  $TransportId.annoteSchema("PromptKey", { description: "Prompt Key boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link PromptKey}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PromptKey = typeof PromptKey.Type;
/**
 * Carries prompt source text and optional regeneration, language and source metadata.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { PromptInput } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(PromptInput)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link PromptInput}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PromptInput = typeof PromptInput.Type;
/**
 * Preserves prompt execution status, output, thinking duration and declared error information.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { PromptRun } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(PromptRun)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link PromptRun}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PromptRun = typeof PromptRun.Type;
/**
 * Describes the result of testing a provider connection, including output or the classified error.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ProviderTest } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ProviderTest)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link ProviderTest}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ProviderTest = typeof ProviderTest.Type;
/**
 * Pairs a user-visible model label with its selectable value.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { CatalogOption } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(CatalogOption)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link CatalogOption}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CatalogOption = typeof CatalogOption.Type;
/**
 * Describes model reasoning, vision and context limits used to configure the composer.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ModelCaps } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ModelCaps)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link ModelCaps}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ModelCaps = typeof ModelCaps.Type;
/**
 * Describes provider setup defaults and API-key and base-URL requirements.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Preset } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Preset)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Preset}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Preset = typeof Preset.Type;
/**
 * Validates credentials and endpoint selection for a remote provider lookup.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { RemoteInput } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(RemoteInput)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link RemoteInput}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RemoteInput = typeof RemoteInput.Type;
/**
 * Describes the available cloud models and the declared default model ID.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { CloudModels } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(CloudModels)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link CloudModels}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CloudModels = typeof CloudModels.Type;
/**
 * Preserves the composer model choices, current selection and reasoning settings.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Composer } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Composer)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Composer}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Composer = typeof Composer.Type;
/**
 * Describes a repository revision and the paths available for prompt import.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { GithubSource } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(GithubSource)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link GithubSource}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type GithubSource = typeof GithubSource.Type;
/**
 * Selects one prompt path at a repository revision for import.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { GithubInput } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(GithubInput)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const GithubInput = S.Struct({ repository: S.String, revision: S.String, path: S.String }).pipe(
  $TransportId.annoteSchema("GithubInput", { description: "Github Input boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link GithubInput}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type GithubInput = typeof GithubInput.Type;
/**
 * Identifies an agent conversation by thread, download and prompt context.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Target } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Target)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Target = S.Struct({ threadId: S.String, downloadId: S.String, promptId: S.String }).pipe(
  $TransportId.annoteSchema("Target", { description: "Target boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link Target}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Target = typeof Target.Type;
/**
 * Carries an AI operation failure separately from transport loss or subscription delivery failure.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { AiOperationError } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(AiOperationError)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Reports an agent stream whose bounded observation storage was exhausted and requires recovery.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { AiStreamOverflow } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(AiStreamOverflow)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Restricts a delivery token to its source family, preventing another subscription family from satisfying the dependency.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { AgentToken } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(AgentToken)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const AgentToken = Token.check(S.makeFilter((token) => token.family === "ai.agent")).pipe(
  $TransportId.annoteSchema("AgentToken", { description: "Agent Token boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link AgentToken}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AgentToken = typeof AgentToken.Type;
/**
 * Restricts a delivery token to its source family, preventing another subscription family from satisfying the dependency.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { SettingsToken } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(SettingsToken)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link SettingsToken}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type SettingsToken = typeof SettingsToken.Type;
/**
 * Restricts a delivery token to its source family, preventing another subscription family from satisfying the dependency.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { PromptToken } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(PromptToken)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const PromptToken = Token.check(S.makeFilter((token) => token.family === "ai.prompt")).pipe(
  $TransportId.annoteSchema("PromptToken", { description: "Prompt Token boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link PromptToken}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PromptToken = typeof PromptToken.Type;
/**
 * Restricts a delivery token to its source family, preventing another subscription family from satisfying the dependency.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ClickToken } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ClickToken)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const ClickToken = Token.check(S.makeFilter((token) => token.family === "ai.clicks")).pipe(
  $TransportId.annoteSchema("ClickToken", { description: "Click Token boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link ClickToken}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ClickToken = typeof ClickToken.Type;
/**
 * Binds an initial AI read to the exact active subscription token whose observations must precede its completion.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ReadAgent } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ReadAgent)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ReadAgent = S.Struct({ agent: AgentToken }).pipe(
  $TransportId.annoteSchema("ReadAgent", { description: "Read Agent boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link ReadAgent}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ReadAgent = typeof ReadAgent.Type;
/**
 * Binds an initial AI read to the exact active subscription token whose observations must precede its completion.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ReadSettings } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ReadSettings)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link ReadSettings}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ReadSettings = typeof ReadSettings.Type;
/**
 * Binds an initial AI read to the exact active subscription token whose observations must precede its completion.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ReadPrompt } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ReadPrompt)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ReadPrompt = S.Struct({ prompt: PromptToken }).pipe(
  $TransportId.annoteSchema("ReadPrompt", { description: "Read Prompt boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link ReadPrompt}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ReadPrompt = typeof ReadPrompt.Type;
/**
 * Binds an initial AI read to the exact active subscription token whose observations must precede its completion.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ReadClicks } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ReadClicks)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ReadClicks = S.Struct({ clicks: ClickToken }).pipe(
  $TransportId.annoteSchema("ReadClicks", { description: "Read Clicks boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link ReadClicks}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
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
 * Projects a task for agent UI selection, including progress and any visible download or error.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { UiTask } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(UiTask)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link UiTask}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type UiTask = typeof UiTask.Type;
/**
 * Declares the agent send command with its authored payload, conversation result and classified failure schema; both client and handler construction use this same declaration.
 *
 * **Example** (Use SendRpc with its owner)
 *
 * ```ts
 * import { SendRpc } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(SendRpc.payloadSchema)({});
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const SendRpc = r("Ai.SendAgentMessage", { payload: Send, success: Thread, error });
/**
 * Preserves a legacy conversation read observation, including values beyond the renderer projection.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ThreadRead } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ThreadRead)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ThreadRead = Thread.pipe(
  $TransportId.annoteSchema("ThreadRead", { description: "Thread Read boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link ThreadRead}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ThreadRead = typeof ThreadRead.Type;
/**
 * Preserves a legacy conversation read observation, including values beyond the renderer projection.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { PromptRead } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(PromptRead)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PromptRead = Prompt.pipe(
  $TransportId.annoteSchema("PromptRead", { description: "Prompt Read boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link PromptRead}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PromptRead = typeof PromptRead.Type;
/**
 * Preserves a legacy conversation read observation, including values beyond the renderer projection.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { SummaryRead } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(SummaryRead)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SummaryRead = Summary.pipe(
  $TransportId.annoteSchema("SummaryRead", { description: "Summary Read boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link SummaryRead}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type SummaryRead = typeof SummaryRead.Type;
/**
 * Preserves persisted event-page observations used to recover an agent subscription after a gap.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { EventRead } from "./Ai.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(EventRead)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const EventRead = Event.pipe(
  $TransportId.annoteSchema("EventRead", { description: "Event Read boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link EventRead}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
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
 * Declares the frozen RPC surface for agent conversations, prompts, providers, UI actions and recovery; share this group between handler layers and clients to keep payload, completion and stream contracts aligned.
 *
 * **Example** (Use AiRpcs with its owner)
 *
 * ```ts
 * import { AiRpcs } from "./Ai.rpc.js"
 * import * as RpcClient from "effect/rpc/RpcClient"
 * export const make = RpcClient.make(AiRpcs);
 * // Provide the document-owned RpcClient.Protocol and run make in the client scope.
 * // The resulting typed client exposes only this capability group's declared commands.
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
