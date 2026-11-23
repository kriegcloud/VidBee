import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $TransportId = $DesktopId.create("renderer/src/transport/DocumentDelivery.model");

/**
 * Validates a nonnegative safe integer used for generations, serials and sequence watermarks; overflow requires document disposal rather than wrapping.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Counter } from "./DocumentDelivery.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Counter)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Counter = S.Int.check(S.isGreaterThanOrEqualTo(0), S.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)).pipe(
  $TransportId.annoteSchema("Counter", { description: "Counter boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link Counter}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Counter = typeof Counter.Type;
/**
 * Identifies one immutable subscription incarnation across document, logical client, family, generation and serial; replacement registrations cannot satisfy an older token.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Token } from "./DocumentDelivery.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Token)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link Token}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Token = typeof Token.Type;
/**
 * Acknowledges that a subscription token and source epoch are installed before observations or completion cuts depend on them.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Registered } from "./DocumentDelivery.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Registered)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Registered = S.TaggedStruct("Registered", { token: Token, epoch: S.String }).pipe(
  $TransportId.annoteSchema("Registered", { description: "Registered boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link Registered}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Registered = typeof Registered.Type;
/**
 * Requires consumption through an inclusive sequence in a specific token and epoch; a later registration or a different epoch cannot satisfy it.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Cut } from "./DocumentDelivery.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Cut)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Cut = S.Struct({ token: Token, epoch: S.String, through: Counter }).pipe(
  $TransportId.annoteSchema("Cut", { description: "Cut boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link Cut}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Cut = typeof Cut.Type;
/**
 * Builds the Registered-or-Observation stream schema for a source value; observations carry the exact installed token, epoch and increasing sequence required by dependent cuts.
 *
 * **Example** (Use Subscription with its owner)
 *
 * ```ts
 * import { Subscription } from "./DocumentDelivery.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const events = Subscription(S.String);
 * export const token = { document: "d", client: "c", generation: 1, family: "events", serial: 1 };
 * export const decoded = S.decodeResult(events)({ _tag: "Registered", token, epoch: "epoch" });
 * if (Result.isSuccess(decoded)) decoded.success._tag // => "Registered"
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const Subscription = <A extends S.Constraint>(value: A) =>
  S.Union([Registered, S.TaggedStruct("Observation", { token: Token, epoch: S.String, sequence: Counter, value })]);
/**
 * Builds an operation result paired with inclusive delivery cuts; consumers must await the cuts before exposing the success or failure to callers.
 *
 * **Example** (Use Completion with its owner)
 *
 * ```ts
 * import { Completion } from "./DocumentDelivery.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const reply = Completion({ success: S.String, error: S.String });
 * export const encoded = S.encodeResult(reply)({ exit: { _tag: "Success", value: "done" }, cuts: [] });
 * if (Result.isSuccess(encoded)) encoded.success.cuts.length // => 0
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
 * Compares all five subscription identity fields, so a replaced registration with the same source family never satisfies a cut for the departed incarnation.
 *
 * **Example** (Use sameToken with its owner)
 *
 * ```ts
 * import { sameToken } from "./DocumentDelivery.model.js"
 * export const token = { document: "d", client: "c", generation: 1, family: "events", serial: 1 };
 * export const same = sameToken({ left: token, right: token });
 * same // => true
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const sameToken = ({ left, right }: { readonly left: Token; readonly right: Token }) =>
  S.toEquivalence(Token)(left, right);
