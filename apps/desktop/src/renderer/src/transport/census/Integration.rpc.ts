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
 * Validates Account Operation Error at the desktop capability boundary before dispatch.
 *
 * **Example** (Use AccountOperationError at its owning boundary)
 *
 * ```ts
 * import { AccountOperationError } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(AccountOperationError);
 * const validated = decode({});
 * void validated;
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
 * Validates Mcp Operation Error at the desktop capability boundary before dispatch.
 *
 * **Example** (Use McpOperationError at its owning boundary)
 *
 * ```ts
 * import { McpOperationError } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(McpOperationError);
 * const validated = decode({});
 * void validated;
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
 * Validates Account Credits at the desktop capability boundary before dispatch.
 *
 * **Example** (Use AccountCredits at its owning boundary)
 *
 * ```ts
 * import { AccountCredits } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(AccountCredits);
 * const validated = decode({});
 * void validated;
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
 * Describes Account Credits ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AccountCredits = typeof AccountCredits.Type;
/**
 * Validates Account Reservations at the desktop capability boundary before dispatch.
 *
 * **Example** (Use AccountReservations at its owning boundary)
 *
 * ```ts
 * import { AccountReservations } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(AccountReservations);
 * const validated = decode({});
 * void validated;
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
 * Describes Account Reservations ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AccountReservations = typeof AccountReservations.Type;
/**
 * Validates Account Snapshot at the desktop capability boundary before dispatch.
 *
 * **Example** (Use AccountSnapshot at its owning boundary)
 *
 * ```ts
 * import { AccountSnapshot } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(AccountSnapshot);
 * const validated = decode({});
 * void validated;
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
 * Describes Account Snapshot ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AccountSnapshot = typeof AccountSnapshot.Type;
/**
 * Validates Account History at the desktop capability boundary before dispatch.
 *
 * **Example** (Use AccountHistory at its owning boundary)
 *
 * ```ts
 * import { AccountHistory } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(AccountHistory);
 * const validated = decode({});
 * void validated;
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
 * Describes Account History ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AccountHistory = typeof AccountHistory.Type;
/**
 * Validates Account Overview at the desktop capability boundary before dispatch.
 *
 * **Example** (Use AccountOverview at its owning boundary)
 *
 * ```ts
 * import { AccountOverview } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(AccountOverview);
 * const validated = decode({});
 * void validated;
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
 * Describes Account Overview ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AccountOverview = typeof AccountOverview.Type;
/**
 * Validates Account Passthrough at the desktop capability boundary before dispatch.
 *
 * **Example** (Use AccountPassthrough at its owning boundary)
 *
 * ```ts
 * import { AccountPassthrough } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(AccountPassthrough);
 * const validated = decode({});
 * void validated;
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
 * Describes Account Passthrough ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type AccountPassthrough = typeof AccountPassthrough.Type;
/**
 * Validates History Input at the desktop capability boundary before dispatch.
 *
 * **Example** (Use HistoryInput at its owning boundary)
 *
 * ```ts
 * import { HistoryInput } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(HistoryInput);
 * const validated = decode({});
 * void validated;
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
 * Describes History Input ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type HistoryInput = typeof HistoryInput.Type;
/**
 * Validates Page Input at the desktop capability boundary before dispatch.
 *
 * **Example** (Use PageInput at its owning boundary)
 *
 * ```ts
 * import { PageInput } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(PageInput);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PageInput = S.Struct({ cursor: RpcOptional(ObservedValue) }).pipe(
  $TransportId.annoteSchema("PageInput", { description: "Page Input boundary in the desktop transport contract." })
);
/**
 * Describes Page Input ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PageInput = typeof PageInput.Type;
/**
 * Validates Initial Read at the desktop capability boundary before dispatch.
 *
 * **Example** (Use InitialRead at its owning boundary)
 *
 * ```ts
 * import { InitialRead } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(InitialRead);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const InitialRead = S.Struct({ creditsToken: RpcOptional(Token) }).pipe(
  $TransportId.annoteSchema("InitialRead", { description: "Initial Read boundary in the desktop transport contract." })
);
/**
 * Describes Initial Read ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type InitialRead = typeof InitialRead.Type;
const account = <A extends S.Constraint>(success: A) => Completion({ success, error: AccountOperationError });
const mcp = <A extends S.Constraint>(success: A) => Completion({ success, error: McpOperationError });
/**
 * Validates Mcp Rpcs at the desktop capability boundary before dispatch.
 *
 * **Example** (Use McpRpcs at its owning boundary)
 *
 * ```ts
 * import { McpRpcs } from "./Integration.rpc.js"
 * import * as RpcClient from "effect/rpc/RpcClient"
 * const client = RpcClient.make(McpRpcs);
 * void client;
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
 * Validates Account Rpcs at the desktop capability boundary before dispatch.
 *
 * **Example** (Use AccountRpcs at its owning boundary)
 *
 * ```ts
 * import { AccountRpcs } from "./Integration.rpc.js"
 * import * as RpcClient from "effect/rpc/RpcClient"
 * const client = RpcClient.make(AccountRpcs);
 * void client;
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
 * Validates Renderer Ready at the desktop capability boundary before dispatch.
 *
 * **Example** (Use RendererReady at its owning boundary)
 *
 * ```ts
 * import { RendererReady } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(RendererReady);
 * const validated = decode({});
 * void validated;
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
 * Describes Renderer Ready ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RendererReady = typeof RendererReady.Type;
/**
 * Validates Transcript Extraction View at the desktop capability boundary before dispatch.
 *
 * **Example** (Use TranscriptExtractionView at its owning boundary)
 *
 * ```ts
 * import { TranscriptExtractionView } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(TranscriptExtractionView);
 * const validated = decode({});
 * void validated;
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
 * Describes Transcript Extraction View ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type TranscriptExtractionView = typeof TranscriptExtractionView.Type;
/**
 * Validates Transcript Snapshot at the desktop capability boundary before dispatch.
 *
 * **Example** (Use TranscriptSnapshot at its owning boundary)
 *
 * ```ts
 * import { TranscriptSnapshot } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(TranscriptSnapshot);
 * const validated = decode({});
 * void validated;
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
 * Describes Transcript Snapshot ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type TranscriptSnapshot = typeof TranscriptSnapshot.Type;
/**
 * Validates Observation Task at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ObservationTask at its owning boundary)
 *
 * ```ts
 * import { ObservationTask } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ObservationTask);
 * const validated = decode({});
 * void validated;
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
 * Describes Observation Task ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ObservationTask = typeof ObservationTask.Type;
/**
 * Validates Observation Admission at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ObservationAdmission at its owning boundary)
 *
 * ```ts
 * import { ObservationAdmission } from "./Integration.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ObservationAdmission);
 * const validated = decode({});
 * void validated;
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
 * Describes Observation Admission ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ObservationAdmission = typeof ObservationAdmission.Type;
