import * as S from "effect/Schema";

/** Counters never wrap or accept fractional, negative or unsafe values. */
export const Counter = S.Int.check(S.isGreaterThanOrEqualTo(0), S.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER));
export type Counter = typeof Counter.Type;
export const Token = S.Struct({
  document: S.String,
  client: S.String,
  generation: Counter,
  family: S.String,
  serial: Counter,
});
export type Token = typeof Token.Type;
export const Registered = S.TaggedStruct("Registered", { token: Token, epoch: S.String });
export type Registered = typeof Registered.Type;
export const Cut = S.Struct({ token: Token, epoch: S.String, through: Counter });
export type Cut = typeof Cut.Type;
export const Subscription = <A extends S.Constraint>(value: A) =>
  S.Union([Registered, S.TaggedStruct("Observation", { token: Token, epoch: S.String, sequence: Counter, value })]);
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
export const sameToken = ({ left, right }: { readonly left: Token; readonly right: Token }) =>
  S.toEquivalence(Token)(left, right);
