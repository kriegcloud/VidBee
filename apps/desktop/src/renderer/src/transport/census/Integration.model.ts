import * as LiteralKit from "@vidbee/schema/LiteralKit";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import * as Getter from "effect/SchemaGetter";
import { RpcOptional } from "../RpcField.model.js";
export class IntegrationFailure extends S.TaggedError<IntegrationFailure, { readonly brand: unique symbol }>()(
  "IntegrationFailure",
  { operation: S.String, message: S.String }
) {}
export const McpStatus = S.Struct({
  enabled: S.Boolean,
  running: S.Boolean,
  url: S.NullOr(S.String),
  configPath: S.String,
  toolCount: S.Finite,
  httpConfig: S.String,
});
export const CapabilityKind = LiteralKit.LiteralKit(["tools", "resources", "prompts"]);
export const Capability = S.Struct({ name: S.String, labelKey: S.String, description: S.String });
export const CapabilityGroups = S.Array(S.Struct({ id: S.String, kind: CapabilityKind, items: S.Array(Capability) }));
export const CreditNumberValue = S.declare((u): u is number => P.isNumber(u));
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
  })
);
export const CreditBucket = S.Struct({
  expiringSoonCredits: CreditNumber,
  quotaCredits: CreditNumber,
  remainingCredits: CreditNumber,
  reservedCredits: CreditNumber,
  usedCredits: CreditNumber,
});
export const Credits = S.Struct({
  ...CreditBucket.fields,
  byFeature: S.Struct({ prompt: CreditNumber, transcription: CreditNumber }),
  bySource: RpcOptional(S.Struct({ granted: CreditBucket, purchased: CreditBucket })),
  interruptedCredits: RpcOptional(CreditNumber),
  reconcilingCredits: RpcOptional(CreditNumber),
});
export const NonnegativeSafe = S.Finite.check(
  S.isInt(),
  S.isGreaterThanOrEqualTo(0),
  S.isLessThanOrEqualTo(9007199254740991)
);
export const HistoryCursor = S.StructWithRest(
  S.Struct({ at: NonnegativeSafe, id: S.String.check(S.isMinLength(1), S.isMaxLength(256)) }),
  [S.Record(S.String, S.Unknown)]
);
export const ReservationStatus = LiteralKit.LiteralKit(["reserved", "reconciling"]);
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
});
export const Reservations = S.Array(Reservation).check(S.isMaxLength(50));
export const Snapshot = S.Struct({ credits: Credits, reservations: Reservations });
const short = S.String.check(S.isMaxLength(256));
const nullable = S.NullOr(S.String.check(S.isMaxLength(1024)));
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
);
export const History = S.Struct({
  items: S.Array(Receipt).check(S.isMaxLength(50)),
  nextCursor: S.NullOr(HistoryCursor),
});
export const Overview = S.Struct({
  ...Snapshot.fields,
  invitationOverview: S.Unknown,
  invitedUsers: S.Unknown,
  giftedCreditRecords: S.Unknown,
});
