import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $TransportId = $DesktopId.create("renderer/src/transport/DocumentDelivery.model");

/**
 * Counters never wrap or accept fractional, negative or unsafe values.
 *
 * **Example** (Use Counter at its owning boundary)
 *
 * ```ts
 * import { Counter } from "./DocumentDelivery.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Counter);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Counter = S.Int.check(S.isGreaterThanOrEqualTo(0), S.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)).pipe(
  $TransportId.annoteSchema("Counter", { description: "Counter boundary in the desktop transport contract." })
);
/**
 * Describes Counter ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Counter = typeof Counter.Type;
/**
 * Validates Token at the desktop transport boundary before dispatch.
 *
 * **Example** (Use Token at its owning boundary)
 *
 * ```ts
 * import { Token } from "./DocumentDelivery.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Token);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Token = S.Struct({
  document: S.String,
  client: S.String,
  generation: Counter,
  family: S.String,
  serial: Counter,
}).pipe($TransportId.annoteSchema("Token", { description: "Token boundary in the desktop transport contract." }));
/**
 * Describes Token ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Token = typeof Token.Type;
/**
 * Validates Registered at the desktop transport boundary before dispatch.
 *
 * **Example** (Use Registered at its owning boundary)
 *
 * ```ts
 * import { Registered } from "./DocumentDelivery.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Registered);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Registered = S.TaggedStruct("Registered", { token: Token, epoch: S.String }).pipe(
  $TransportId.annoteSchema("Registered", { description: "Registered boundary in the desktop transport contract." })
);
/**
 * Describes Registered ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Registered = typeof Registered.Type;
/**
 * Validates Cut at the desktop transport boundary before dispatch.
 *
 * **Example** (Use Cut at its owning boundary)
 *
 * ```ts
 * import { Cut } from "./DocumentDelivery.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Cut);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Cut = S.Struct({ token: Token, epoch: S.String, through: Counter }).pipe(
  $TransportId.annoteSchema("Cut", { description: "Cut boundary in the desktop transport contract." })
);
/**
 * Describes Cut ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Cut = typeof Cut.Type;
/**
 * Constructs Subscription with explicit lifetime and failure ownership.
 *
 * **Example** (Use Subscription at its owning boundary)
 *
 * ```ts
 * import { Subscription } from "./DocumentDelivery.model.js"
 * import * as S from "effect/Schema"
 * const events = Subscription(S.String);
 * void S.decodeUnknownEffect(events)({ _tag: "Registered" });
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const Subscription = <A extends S.Constraint>(value: A) =>
  S.Union([Registered, S.TaggedStruct("Observation", { token: Token, epoch: S.String, sequence: Counter, value })]);
/**
 * Constructs Completion with explicit lifetime and failure ownership.
 *
 * **Example** (Use Completion at its owning boundary)
 *
 * ```ts
 * import { Completion } from "./DocumentDelivery.model.js"
 * import * as S from "effect/Schema"
 * const reply = Completion({ success: S.String, error: S.String });
 * void S.encodeEffect(reply)({ exit: { _tag: "Success", value: "done" }, cuts: [] });
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const Completion = <A extends S.Constraint, E extends S.Constraint>({
  success,
  error,
}: {
  readonly success: A;
  readonly error: E;
}) =>
  S.Struct({
    exit: S.Union([S.TaggedStruct("Success", { value: success }), S.TaggedStruct("Failure", { error })]),
    cuts: S.Array(Cut),
  });
/**
 * Constructs same Token with explicit lifetime and failure ownership.
 *
 * **Example** (Use sameToken at its owning boundary)
 *
 * ```ts
 * import { sameToken } from "./DocumentDelivery.model.js"
 * const token = { document: "d", client: "c", generation: 1, family: "events", serial: 1 };
 * const same = sameToken({ left: token, right: token });
 * void same;
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const sameToken = ({ left, right }: { readonly left: Token; readonly right: Token }) =>
  S.toEquivalence(Token)(left, right);
