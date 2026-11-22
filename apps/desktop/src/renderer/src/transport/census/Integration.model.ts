import { $DesktopId } from "@vidbee/identity/packages";
import * as LiteralKit from "@vidbee/schema/LiteralKit";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import * as Getter from "effect/SchemaGetter";
import { RpcArray, RpcOptional } from "../RpcField.model.js";

const $TransportId = $DesktopId.create("renderer/src/transport/census/Integration.model");

/**
 * Validates Integration Failure at the desktop capability boundary before dispatch.
 *
 * **Example** (Use IntegrationFailure at its owning boundary)
 *
 * ```ts
 * import { IntegrationFailure } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(IntegrationFailure);
 * const validated = decode({});
 * void validated;
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
 * Validates Mcp Status at the desktop capability boundary before dispatch.
 *
 * **Example** (Use McpStatus at its owning boundary)
 *
 * ```ts
 * import { McpStatus } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(McpStatus);
 * const validated = decode({});
 * void validated;
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
 * Describes Mcp Status ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type McpStatus = typeof McpStatus.Type;
/**
 * Validates Capability Kind at the desktop capability boundary before dispatch.
 *
 * **Example** (Use CapabilityKind at its owning boundary)
 *
 * ```ts
 * import { CapabilityKind } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(CapabilityKind);
 * const validated = decode({});
 * void validated;
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
 * Describes Capability Kind ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CapabilityKind = typeof CapabilityKind.Type;
/**
 * Validates Capability at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Capability at its owning boundary)
 *
 * ```ts
 * import { Capability } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Capability);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Capability = S.Struct({ name: S.String, labelKey: S.String, description: S.String }).pipe(
  $TransportId.annoteSchema("Capability", { description: "Capability boundary in the desktop transport contract." })
);
/**
 * Describes Capability ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Capability = typeof Capability.Type;
/**
 * Validates Capability Groups at the desktop capability boundary before dispatch.
 *
 * **Example** (Use CapabilityGroups at its owning boundary)
 *
 * ```ts
 * import { CapabilityGroups } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(CapabilityGroups);
 * const validated = decode({});
 * void validated;
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
 * Describes Capability Groups ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CapabilityGroups = typeof CapabilityGroups.Type;
/**
 * Constructs Credit Number Value with explicit lifetime and failure ownership.
 *
 * **Example** (Use CreditNumberValue at its owning boundary)
 *
 * ```ts
 * import { CreditNumberValue } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const validate = S.decodeUnknownEffect(CreditNumberValue);
 * void validate({});
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
 * Describes Credit Number Value ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CreditNumberValue = typeof CreditNumberValue.Type;
/**
 * Constructs Credit Number with explicit lifetime and failure ownership.
 *
 * **Example** (Use CreditNumber at its owning boundary)
 *
 * ```ts
 * import { CreditNumber } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const validate = S.decodeUnknownEffect(CreditNumber);
 * void validate({});
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
 * Describes Credit Number ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CreditNumber = typeof CreditNumber.Type;
/**
 * Validates Credit Bucket at the desktop capability boundary before dispatch.
 *
 * **Example** (Use CreditBucket at its owning boundary)
 *
 * ```ts
 * import { CreditBucket } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(CreditBucket);
 * const validated = decode({});
 * void validated;
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
 * Describes Credit Bucket ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CreditBucket = typeof CreditBucket.Type;
/**
 * Validates Credits at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Credits at its owning boundary)
 *
 * ```ts
 * import { Credits } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Credits);
 * const validated = decode({});
 * void validated;
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
 * Describes Credits ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Credits = typeof Credits.Type;
/**
 * Validates Nonnegative Safe at the desktop capability boundary before dispatch.
 *
 * **Example** (Use NonnegativeSafe at its owning boundary)
 *
 * ```ts
 * import { NonnegativeSafe } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(NonnegativeSafe);
 * const validated = decode({});
 * void validated;
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
 * Describes Nonnegative Safe ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type NonnegativeSafe = typeof NonnegativeSafe.Type;
/**
 * Validates History Cursor at the desktop capability boundary before dispatch.
 *
 * **Example** (Use HistoryCursor at its owning boundary)
 *
 * ```ts
 * import { HistoryCursor } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(HistoryCursor);
 * const validated = decode({});
 * void validated;
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
 * Describes History Cursor ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type HistoryCursor = typeof HistoryCursor.Type;
/**
 * Validates Reservation Status at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ReservationStatus at its owning boundary)
 *
 * ```ts
 * import { ReservationStatus } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ReservationStatus);
 * const validated = decode({});
 * void validated;
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
 * Describes Reservation Status ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ReservationStatus = typeof ReservationStatus.Type;
/**
 * Validates Reservation at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Reservation at its owning boundary)
 *
 * ```ts
 * import { Reservation } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Reservation);
 * const validated = decode({});
 * void validated;
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
 * Describes Reservation ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Reservation = typeof Reservation.Type;
/**
 * Validates Reservations at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Reservations at its owning boundary)
 *
 * ```ts
 * import { Reservations } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Reservations);
 * const validated = decode({});
 * void validated;
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
 * Describes Reservations ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Reservations = typeof Reservations.Type;
/**
 * Validates Snapshot at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Snapshot at its owning boundary)
 *
 * ```ts
 * import { Snapshot } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Snapshot);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Snapshot = S.Struct({ credits: Credits, reservations: Reservations }).pipe(
  $TransportId.annoteSchema("Snapshot", { description: "Snapshot boundary in the desktop transport contract." })
);
/**
 * Describes Snapshot ownership at the desktop transport boundary.
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
 * Validates Receipt at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Receipt at its owning boundary)
 *
 * ```ts
 * import { Receipt } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Receipt);
 * const validated = decode({});
 * void validated;
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
 * Describes Receipt ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Receipt = typeof Receipt.Type;
/**
 * Validates History at the desktop capability boundary before dispatch.
 *
 * **Example** (Use History at its owning boundary)
 *
 * ```ts
 * import { History } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(History);
 * const validated = decode({});
 * void validated;
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
 * Describes History ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type History = typeof History.Type;
/**
 * Validates Overview at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Overview at its owning boundary)
 *
 * ```ts
 * import { Overview } from "./Integration.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Overview);
 * const validated = decode({});
 * void validated;
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
 * Describes Overview ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Overview = typeof Overview.Type;
