import { $DesktopId } from "@vidbee/identity/packages";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as S from "effect/Schema";
import { DeliveryError } from "../DocumentDelivery.errors.js";
import { Completion, Subscription, Token } from "../DocumentDelivery.model.js";
import { RpcArray, RpcOptional } from "../RpcField.model.js";
import { ObservedValue, RpcObserved } from "../RpcObservation.model.js";
import {
  CapabilityGroups,
  CreditNumberValue,
  Credits,
  History,
  HistoryCursor,
  McpStatus,
  Overview,
  Reservations,
  Snapshot,
} from "./Integration.model.js";

const $TransportId = $DesktopId.create("renderer/src/transport/census/Integration.rpc");

/**
 * Carries a capability-specific operation failure without confusing it with RPC transport failure.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { AccountOperationError } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(AccountOperationError)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class AccountOperationError extends S.TaggedError<AccountOperationError, { readonly brand: unique symbol }>()(
  "AccountOperationError",
  { operation: S.String, message: S.String },
  $TransportId.annoteError("AccountOperationError", {
    description: "Account Operation Error preserves the declared desktop failure fields.",
  })
) {}
/**
 * Carries a capability-specific operation failure without confusing it with RPC transport failure.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { McpOperationError } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(McpOperationError)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class McpOperationError extends S.TaggedError<McpOperationError, { readonly brand: unique symbol }>()(
  "McpOperationError",
  { operation: S.String, message: S.String },
  $TransportId.annoteError("McpOperationError", {
    description: "Mcp Operation Error preserves the declared desktop failure fields.",
  })
) {}
/**
 * Preserves an account service observation without rebuilding unknown native fields or normalizing exceptional values.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { AccountCredits } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(AccountCredits)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AccountCredits = RpcObserved(Credits).pipe(
  $TransportId.annoteSchema("AccountCredits", {
    description: "Account Credits boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link AccountCredits}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AccountCredits = typeof AccountCredits.Type;
/**
 * Preserves an account service observation without rebuilding unknown native fields or normalizing exceptional values.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { AccountReservations } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(AccountReservations)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AccountReservations = RpcObserved(Reservations).pipe(
  $TransportId.annoteSchema("AccountReservations", {
    description: "Account Reservations boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link AccountReservations}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AccountReservations = typeof AccountReservations.Type;
/**
 * Preserves an account service observation without rebuilding unknown native fields or normalizing exceptional values.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { AccountSnapshot } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(AccountSnapshot)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AccountSnapshot = RpcObserved(Snapshot).pipe(
  $TransportId.annoteSchema("AccountSnapshot", {
    description: "Account Snapshot boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link AccountSnapshot}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AccountSnapshot = typeof AccountSnapshot.Type;
/**
 * Preserves an account service observation without rebuilding unknown native fields or normalizing exceptional values.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { AccountHistory } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(AccountHistory)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AccountHistory = RpcObserved(History).pipe(
  $TransportId.annoteSchema("AccountHistory", {
    description: "Account History boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link AccountHistory}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AccountHistory = typeof AccountHistory.Type;
/**
 * Preserves an account service observation without rebuilding unknown native fields or normalizing exceptional values.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { AccountOverview } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(AccountOverview)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AccountOverview = RpcObserved(Overview).pipe(
  $TransportId.annoteSchema("AccountOverview", {
    description: "Account Overview boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link AccountOverview}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AccountOverview = typeof AccountOverview.Type;
/**
 * Preserves an account service observation without rebuilding unknown native fields or normalizing exceptional values.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { AccountPassthrough } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(AccountPassthrough)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AccountPassthrough = ObservedValue.pipe(
  $TransportId.annoteSchema("AccountPassthrough", {
    description: "Account Passthrough boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link AccountPassthrough}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AccountPassthrough = typeof AccountPassthrough.Type;
/**
 * Selects an account history page using the native cursor contract.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { HistoryInput } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(HistoryInput)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const HistoryInput = S.Struct({ cursor: HistoryCursor.pipe(RpcObserved, RpcOptional) }).pipe(
  $TransportId.annoteSchema("HistoryInput", {
    description: "History Input boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link HistoryInput}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type HistoryInput = typeof HistoryInput.Type;
/**
 * Selects an account history page using the native cursor contract.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { PageInput } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(PageInput)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PageInput = S.Struct({ cursor: RpcOptional(ObservedValue) }).pipe(
  $TransportId.annoteSchema("PageInput", { description: "Page Input boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link PageInput}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PageInput = typeof PageInput.Type;
/**
 * Binds an initial account read to the exact credit subscription required by its completion cut.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { InitialRead } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(InitialRead)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const InitialRead = S.Struct({ creditsToken: RpcOptional(Token) }).pipe(
  $TransportId.annoteSchema("InitialRead", { description: "Initial Read boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link InitialRead}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type InitialRead = typeof InitialRead.Type;
const account = <A extends S.Constraint>(success: A) => Completion({ success, error: AccountOperationError });
const mcp = <A extends S.Constraint>(success: A) => Completion({ success, error: McpOperationError });
/**
 * Declares the frozen RPC surface for MCP status and capability operations; share this group between handler layers and clients to keep payload, completion and stream contracts aligned.
 *
 * **Example** (Use McpRpcs with its owner)
 *
 * ```ts
 * import { McpRpcs } from "./Integration.rpc.js"
 * import * as RpcClient from "effect/rpc/RpcClient"
 * export const make = RpcClient.make(McpRpcs);
 * // Provide the document-owned RpcClient.Protocol and run make in the client scope.
 * // The resulting typed client exposes only this capability group's declared commands.
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const McpRpcs = RpcGroup.make(
  Rpc.make("Mcp.GetStatus", { success: mcp(McpStatus), error: DeliveryError }),
  Rpc.make("Mcp.GetCapabilities", { success: mcp(CapabilityGroups), error: DeliveryError }),
  Rpc.make("Mcp.SetEnabled", { payload: { enabled: S.Boolean }, success: mcp(McpStatus), error: DeliveryError }),
  Rpc.make("Mcp.RotateToken", { success: mcp(McpStatus), error: DeliveryError })
);
/**
 * Declares the frozen RPC surface for account credits, authentication and history; share this group between handler layers and clients to keep payload, completion and stream contracts aligned.
 *
 * **Example** (Use AccountRpcs with its owner)
 *
 * ```ts
 * import { AccountRpcs } from "./Integration.rpc.js"
 * import * as RpcClient from "effect/rpc/RpcClient"
 * export const make = RpcClient.make(AccountRpcs);
 * // Provide the document-owned RpcClient.Protocol and run make in the client scope.
 * // The resulting typed client exposes only this capability group's declared commands.
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AccountRpcs = RpcGroup.make(
  Rpc.make("Account.GetOverview", { payload: InitialRead, success: account(AccountOverview), error: DeliveryError }),
  Rpc.make("Account.GetAiCreditSnapshot", {
    payload: InitialRead,
    success: account(AccountSnapshot),
    error: DeliveryError,
  }),
  Rpc.make("Account.GetAiCreditHistory", {
    payload: HistoryInput,
    success: account(AccountHistory),
    error: DeliveryError,
  }),
  Rpc.make("Account.GetCacheStats", { success: account(AccountPassthrough), error: DeliveryError }),
  Rpc.make("Account.GetAiCredits", { payload: InitialRead, success: account(AccountCredits), error: DeliveryError }),
  Rpc.make("Account.GetAiReservations", { success: account(AccountReservations), error: DeliveryError }),
  Rpc.make("Account.CancelAiReservation", {
    payload: { requestId: S.String },
    success: account(ObservedValue),
    error: DeliveryError,
  }),
  Rpc.make("Account.GetInvitationOverview", { success: account(AccountPassthrough), error: DeliveryError }),
  Rpc.make("Account.GetInvitedUsers", {
    payload: PageInput,
    success: account(AccountPassthrough),
    error: DeliveryError,
  }),
  Rpc.make("Account.GetGiftedCreditRecords", {
    payload: PageInput,
    success: account(AccountPassthrough),
    error: DeliveryError,
  }),
  Rpc.make("Account.WatchCreditsUpdated", {
    success: Subscription(ObservedValue),
    error: S.Union([AccountOperationError, DeliveryError]),
    stream: true,
  }),
  Rpc.make("Account.WatchAuthContinue", {
    success: Subscription(ObservedValue),
    error: S.Union([AccountOperationError, DeliveryError]),
    stream: true,
  })
);
/**
 * Declares the credit and authentication subscription tokens installed before renderer-ready work begins.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { RendererReady } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(RendererReady)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const RendererReady = S.Struct({ creditsTokens: RpcArray(Token), authTokens: RpcArray(Token) }).pipe(
  $TransportId.annoteSchema("RendererReady", {
    description: "Renderer Ready boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link RendererReady}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RendererReady = typeof RendererReady.Type;
/**
 * Projects extracted transcript metadata, available tracks, selected track and segments.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { TranscriptExtractionView } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(TranscriptExtractionView)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const TranscriptExtractionView = RpcObserved(
  S.StructWithRest(
    S.Struct({
      title: S.String,
      author: S.String,
      duration: CreditNumberValue,
      tracks: RpcArray(S.Unknown),
      selectedTrackId: S.String,
      segments: RpcArray(S.Unknown),
    }),
    [S.Record(S.String, S.Unknown)]
  )
).pipe(
  $TransportId.annoteSchema("TranscriptExtractionView", {
    description: "Transcript Extraction View boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link TranscriptExtractionView}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type TranscriptExtractionView = typeof TranscriptExtractionView.Type;
/**
 * Preserves transcript extraction status, update time and any classified extraction failure.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { TranscriptSnapshot } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(TranscriptSnapshot)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const TranscriptSnapshot = RpcObserved(
  S.StructWithRest(
    S.Struct({
      status: S.Literals(["running", "completed", "error"]),
      error: S.NullOr(S.String),
      errorCode: S.NullOr(S.String),
      updatedAt: CreditNumberValue,
    }),
    [S.Record(S.String, S.Unknown)]
  )
).pipe(
  $TransportId.annoteSchema("TranscriptSnapshot", {
    description: "Transcript Snapshot boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link TranscriptSnapshot}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type TranscriptSnapshot = typeof TranscriptSnapshot.Type;
/**
 * Preserves a task observation with scheduling priority, group, parent and attempt limits.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ObservationTask } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ObservationTask)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ObservationTask = RpcObserved(
  S.StructWithRest(
    S.Struct({
      id: S.String,
      input: S.Unknown,
      status: S.String,
      priority: S.Unknown,
      groupKey: S.Unknown,
      parentId: S.Unknown,
      maxAttempts: S.Unknown,
    }),
    [S.Record(S.String, S.Unknown)]
  )
).pipe(
  $TransportId.annoteSchema("ObservationTask", {
    description: "Observation Task boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link ObservationTask}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ObservationTask = typeof ObservationTask.Type;
/**
 * Validates task input and scheduling metadata before admitting observed work.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ObservationAdmission } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ObservationAdmission)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ObservationAdmission = S.Struct({
  input: ObservedValue,
  priority: RpcOptional(ObservedValue),
  groupKey: RpcOptional(ObservedValue),
  parentId: RpcOptional(ObservedValue),
  maxAttempts: RpcOptional(ObservedValue),
}).pipe(
  $TransportId.annoteSchema("ObservationAdmission", {
    description: "Observation Admission boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link ObservationAdmission}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ObservationAdmission = typeof ObservationAdmission.Type;
