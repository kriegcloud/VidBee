import * as S from "effect/Schema";

export class SubscriptionNotFound extends S.TaggedError<SubscriptionNotFound, { readonly brand: unique symbol }>(
  "@vidbee/subscriptions-core/SubscriptionNotFound"
)("SubscriptionNotFound", { id: S.String, legacyMessage: S.String }) {}

export class DuplicateFeed extends S.TaggedError<DuplicateFeed, { readonly brand: unique symbol }>(
  "@vidbee/subscriptions-core/DuplicateFeed"
)("DuplicateFeed", { duplicateOf: S.String, legacyMessage: S.String }) {}

export class ProfileHostRequired extends S.TaggedError<ProfileHostRequired, { readonly brand: unique symbol }>(
  "@vidbee/subscriptions-core/ProfileHostRequired"
)("ProfileHostRequired", { legacyMessage: S.String }) {}

export class InvalidCategories extends S.TaggedError<InvalidCategories, { readonly brand: unique symbol }>(
  "@vidbee/subscriptions-core/InvalidCategories"
)("InvalidCategories", { legacyMessage: S.String }) {}

export class FeedHttpStatus extends S.TaggedError<FeedHttpStatus, { readonly brand: unique symbol }>(
  "@vidbee/subscriptions-core/FeedHttpStatus"
)("FeedHttpStatus", { status: S.Finite, legacyMessage: S.String }) {}

export class FeedRequestTimeout extends S.TaggedError<FeedRequestTimeout, { readonly brand: unique symbol }>(
  "@vidbee/subscriptions-core/FeedRequestTimeout"
)("FeedRequestTimeout", { timeoutMs: S.Finite, legacyMessage: S.String }) {}

export class FeedParseFailure extends S.TaggedError<FeedParseFailure, { readonly brand: unique symbol }>(
  "@vidbee/subscriptions-core/FeedParseFailure"
)("FeedParseFailure", { original: S.Defect(), legacyMessage: S.String }) {}

export class FeedTraversalFailure extends S.TaggedError<FeedTraversalFailure, { readonly brand: unique symbol }>(
  "@vidbee/subscriptions-core/FeedTraversalFailure"
)("FeedTraversalFailure", { original: S.Defect(), legacyMessage: S.String }) {}

export class FeedCancelled extends S.TaggedError<FeedCancelled, { readonly brand: unique symbol }>(
  "@vidbee/subscriptions-core/FeedCancelled"
)("FeedCancelled", { reason: S.Defect() }) {}

export class HostFailure extends S.TaggedError<HostFailure, { readonly brand: unique symbol }>(
  "@vidbee/subscriptions-core/HostFailure"
)("HostFailure", { original: S.Defect(), legacyMessage: S.String }) {}

export type SubscriptionsError =
  | SubscriptionNotFound
  | DuplicateFeed
  | ProfileHostRequired
  | InvalidCategories
  | FeedHttpStatus
  | FeedRequestTimeout
  | FeedParseFailure
  | FeedTraversalFailure
  | FeedCancelled
  | HostFailure;
