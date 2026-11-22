import { $DesktopId } from "@vidbee/identity/packages";
import * as LiteralKit from "@vidbee/schema/LiteralKit";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import * as Getter from "effect/SchemaGetter";
import { RpcArray, RpcOptional } from "../RpcField.model.js";

const $TransportId = $DesktopId.create("renderer/src/transport/census/Integration.model");

/**
 * Carries a native integrations failure separately from transport or delivery errors.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { IntegrationFailure } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(IntegrationFailure)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class IntegrationFailure extends S.TaggedError<IntegrationFailure, { readonly brand: unique symbol }>()(
  "IntegrationFailure",
  { operation: S.String, message: S.String },
  $TransportId.annoteError("IntegrationFailure", {
    description: "Integration Failure preserves the declared desktop failure fields.",
  })
) {}
/**
 * Describes MCP enablement, live server state, configuration path and published tool count.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { McpStatus } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(McpStatus)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const McpStatus = S.Struct({
  enabled: S.Boolean,
  running: S.Boolean,
  url: S.NullOr(S.String),
  configPath: S.String,
  toolCount: S.Finite,
  httpConfig: S.String,
}).pipe(
  $TransportId.annoteSchema("McpStatus", { description: "Mcp Status boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link McpStatus}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type McpStatus = typeof McpStatus.Type;
/**
 * Selects the MCP capability collection: tools, resources or prompts.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { CapabilityKind } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(CapabilityKind)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const CapabilityKind = LiteralKit.LiteralKit(["tools", "resources", "prompts"]).pipe(
  $TransportId.annoteSchema("CapabilityKind", {
    description: "Capability Kind boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link CapabilityKind}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CapabilityKind = typeof CapabilityKind.Type;
/**
 * Pairs an MCP capability name with its localized label key and description.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Capability } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Capability)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Capability = S.Struct({ name: S.String, labelKey: S.String, description: S.String }).pipe(
  $TransportId.annoteSchema("Capability", { description: "Capability boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link Capability}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Capability = typeof Capability.Type;
/**
 * Groups named MCP capabilities by identifier and capability kind.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { CapabilityGroups } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(CapabilityGroups)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const CapabilityGroups = RpcArray(
  S.Struct({ id: S.String, kind: CapabilityKind, items: RpcArray(Capability) })
).pipe(
  $TransportId.annoteSchema("CapabilityGroups", {
    description: "Capability Groups boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link CapabilityGroups}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CapabilityGroups = typeof CapabilityGroups.Type;
/**
 * Accepts an observed numeric credit value without silently replacing exceptional numbers.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { CreditNumberValue } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(CreditNumberValue)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const CreditNumberValue = S.declare((u): u is number => P.isNumber(u)).pipe(
  $TransportId.annoteSchema("CreditNumberValue", {
    description: "Credit Number Value boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link CreditNumberValue}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CreditNumberValue = typeof CreditNumberValue.Type;
/**
 * Preserves exceptional credit numbers with explicit wire tags so NaN, infinities and negative zero round-trip.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { CreditNumber } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(CreditNumber)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const CreditNumber = S.Union([S.Finite, S.Literals(["NaN", "Infinity", "-Infinity", "-0"])]).pipe(
  S.decodeTo(CreditNumberValue, {
    decode: Getter.transform((value) => Number(value)),
    encode: Getter.transform((value): number | "NaN" | "Infinity" | "-Infinity" | "-0" =>
      Object.is(value, -0)
        ? "-0"
        : Number.isFinite(value)
          ? value
          : Number.isNaN(value)
            ? "NaN"
            : value > 0
              ? "Infinity"
              : "-Infinity"
    ),
  }),
  $TransportId.annoteSchema("CreditNumber", {
    description: "Credit Number boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link CreditNumber}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CreditNumber = typeof CreditNumber.Type;
/**
 * Describes credit balances and usage for one accounting bucket.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { CreditBucket } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(CreditBucket)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const CreditBucket = S.Struct({
  expiringSoonCredits: CreditNumber,
  quotaCredits: CreditNumber,
  remainingCredits: CreditNumber,
  reservedCredits: CreditNumber,
  usedCredits: CreditNumber,
}).pipe(
  $TransportId.annoteSchema("CreditBucket", {
    description: "Credit Bucket boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link CreditBucket}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CreditBucket = typeof CreditBucket.Type;
/**
 * Describes credit balances grouped by feature and source, including interrupted and reconciling work.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Credits } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Credits)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Credits = S.Struct({
  ...CreditBucket.fields,
  byFeature: S.Struct({ prompt: CreditNumber, transcription: CreditNumber }),
  bySource: RpcOptional(S.Struct({ granted: CreditBucket, purchased: CreditBucket })),
  interruptedCredits: RpcOptional(CreditNumber),
  reconcilingCredits: RpcOptional(CreditNumber),
}).pipe($TransportId.annoteSchema("Credits", { description: "Credits boundary in the desktop transport contract." }));
/**
 * Decoded representation validated by {@link Credits}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Credits = typeof Credits.Type;
/**
 * Restricts pagination counts and offsets to nonnegative safe integers.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { NonnegativeSafe } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(NonnegativeSafe)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const NonnegativeSafe = S.Finite.check(
  S.isInt(),
  S.isGreaterThanOrEqualTo(0),
  S.isLessThanOrEqualTo(9007199254740991)
).pipe(
  $TransportId.annoteSchema("NonnegativeSafe", {
    description: "Nonnegative Safe boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link NonnegativeSafe}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type NonnegativeSafe = typeof NonnegativeSafe.Type;
/**
 * Identifies a stable history position by timestamp and record ID.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { HistoryCursor } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(HistoryCursor)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const HistoryCursor = S.StructWithRest(
  S.Struct({ at: NonnegativeSafe, id: S.String.check(S.isMinLength(1), S.isMaxLength(256)) }),
  [S.Record(S.String, S.Unknown)]
).pipe(
  $TransportId.annoteSchema("HistoryCursor", {
    description: "History Cursor boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link HistoryCursor}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type HistoryCursor = typeof HistoryCursor.Type;
/**
 * Distinguishes reserved credit work from work awaiting reconciliation.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ReservationStatus } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ReservationStatus)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ReservationStatus = LiteralKit.LiteralKit(["reserved", "reconciling"]).pipe(
  $TransportId.annoteSchema("ReservationStatus", {
    description: "Reservation Status boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link ReservationStatus}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ReservationStatus = typeof ReservationStatus.Type;
/**
 * Describes a credit reservation and its deadline, progress and recovery timestamps.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Reservation } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Reservation)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Reservation = S.Struct({
  requestId: S.String.check(S.isMaxLength(128)),
  status: ReservationStatus,
  taskLabel: S.NullOr(S.String),
  createdAt: NonnegativeSafe,
  deadlineAt: NonnegativeSafe,
  expiresAt: NonnegativeSafe,
  lastHeartbeatAt: NonnegativeSafe,
  lastProgressAt: NonnegativeSafe,
  reservedCredits: NonnegativeSafe,
  recoveryStoppedAt: NonnegativeSafe.pipe(S.NullOr, RpcOptional),
}).pipe(
  $TransportId.annoteSchema("Reservation", { description: "Reservation boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link Reservation}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Reservation = typeof Reservation.Type;
/**
 * Preserves the observed collection of outstanding credit reservations.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Reservations } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Reservations)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Reservations = RpcArray(Reservation)
  .check(S.isMaxLength(50))
  .pipe(
    $TransportId.annoteSchema("Reservations", {
      description: "Reservations boundary in the desktop transport contract.",
    })
  );
/**
 * Decoded representation validated by {@link Reservations}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Reservations = typeof Reservations.Type;
/**
 * Pairs current credits with outstanding reservations in one account snapshot.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Snapshot } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Snapshot)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Snapshot = S.Struct({ credits: Credits, reservations: Reservations }).pipe(
  $TransportId.annoteSchema("Snapshot", { description: "Snapshot boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link Snapshot}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Snapshot = typeof Snapshot.Type;
const short = S.String.check(S.isMaxLength(256)).pipe(
  $TransportId.annoteSchema("short", { description: "short boundary in the desktop transport contract." })
);
const nullable = S.NullOr(S.String.check(S.isMaxLength(1024))).pipe(
  $TransportId.annoteSchema("nullable", { description: "nullable boundary in the desktop transport contract." })
);
/**
 * Preserves a billing history receipt with charged and refunded credits and model usage metadata.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Receipt } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Receipt)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Receipt = S.StructWithRest(
  S.Struct({
    id: short,
    requestId: short,
    feature: short,
    status: short,
    createdAt: NonnegativeSafe,
    credits: NonnegativeSafe,
    refundedCredits: NonnegativeSafe,
    taskLabel: nullable,
    basis: nullable,
    pricingVersion: nullable,
    model: nullable,
    inputTokens: S.NullOr(NonnegativeSafe),
    outputTokens: S.NullOr(NonnegativeSafe),
  }),
  [S.Record(S.String, S.Unknown)]
).pipe($TransportId.annoteSchema("Receipt", { description: "Receipt boundary in the desktop transport contract." }));
/**
 * Decoded representation validated by {@link Receipt}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Receipt = typeof Receipt.Type;
/**
 * Describes a page of billing receipts and its optional continuation cursor.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { History } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(History)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const History = S.Struct({
  items: RpcArray(Receipt).check(S.isMaxLength(50)),
  nextCursor: S.NullOr(HistoryCursor),
}).pipe($TransportId.annoteSchema("History", { description: "History boundary in the desktop transport contract." }));
/**
 * Decoded representation validated by {@link History}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type History = typeof History.Type;
/**
 * Preserves invitation, invited-user and gifted-credit observations from the account overview.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Overview } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Overview)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Overview = S.Struct({
  ...Snapshot.fields,
  invitationOverview: S.Unknown,
  invitedUsers: S.Unknown,
  giftedCreditRecords: S.Unknown,
}).pipe($TransportId.annoteSchema("Overview", { description: "Overview boundary in the desktop transport contract." }));
/**
 * Decoded representation validated by {@link Overview}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Overview = typeof Overview.Type;
