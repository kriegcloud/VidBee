import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as S from "effect/Schema";
import { DeliveryError } from "../DocumentDelivery.errors.js";
import { Completion, Subscription, Token } from "../DocumentDelivery.model.js";
import { RpcOptional } from "../RpcField.model.js";
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
export class AccountOperationError extends S.TaggedError<AccountOperationError, { readonly brand: unique symbol }>()(
  "AccountOperationError",
  { operation: S.String, message: S.String }
) {}
export class McpOperationError extends S.TaggedError<McpOperationError, { readonly brand: unique symbol }>()(
  "McpOperationError",
  { operation: S.String, message: S.String }
) {}
export const AccountCredits = RpcObserved(Credits);
export const AccountReservations = RpcObserved(Reservations);
export const AccountSnapshot = RpcObserved(Snapshot);
export const AccountHistory = RpcObserved(History);
export const AccountOverview = RpcObserved(Overview);
export const AccountPassthrough = ObservedValue;
export const HistoryInput = S.Struct({ cursor: HistoryCursor.pipe(RpcObserved, RpcOptional) });
export const PageInput = S.Struct({ cursor: RpcOptional(ObservedValue) });
export const InitialRead = S.Struct({ creditsToken: RpcOptional(Token) });
const account = <A extends S.Constraint>(success: A) => Completion({ success, error: AccountOperationError });
const mcp = <A extends S.Constraint>(success: A) => Completion({ success, error: McpOperationError });
export const McpRpcs = RpcGroup.make(
  Rpc.make("Mcp.GetStatus", { success: mcp(McpStatus), error: DeliveryError }),
  Rpc.make("Mcp.GetCapabilities", { success: mcp(CapabilityGroups), error: DeliveryError }),
  Rpc.make("Mcp.SetEnabled", { payload: { enabled: S.Boolean }, success: mcp(McpStatus), error: DeliveryError }),
  Rpc.make("Mcp.RotateToken", { success: mcp(McpStatus), error: DeliveryError })
);
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
export const RendererReady = S.Struct({ creditsTokens: S.Array(Token), authTokens: S.Array(Token) });
export const TranscriptExtractionView = RpcObserved(
  S.StructWithRest(
    S.Struct({
      title: S.String,
      author: S.String,
      duration: CreditNumberValue,
      tracks: S.Array(S.Unknown),
      selectedTrackId: S.String,
      segments: S.Array(S.Unknown),
    }),
    [S.Record(S.String, S.Unknown)]
  )
);
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
);
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
);
export const ObservationAdmission = S.Struct({
  input: ObservedValue,
  priority: RpcOptional(ObservedValue),
  groupKey: RpcOptional(ObservedValue),
  parentId: RpcOptional(ObservedValue),
  maxAttempts: RpcOptional(ObservedValue),
});
