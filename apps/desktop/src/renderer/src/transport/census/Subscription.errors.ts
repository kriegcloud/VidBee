import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $I = $DesktopId.create("shared/subscriptions/Subscription.errors");

/**
 * Carries a feed subscription operation failure independently of delivery registration failures.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { SubscriptionOperationError } from "./Subscription.errors.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(SubscriptionOperationError)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class SubscriptionOperationError extends S.TaggedError<
  SubscriptionOperationError,
  { readonly brand: unique symbol }
>($I`SubscriptionOperationError`)(
  "SubscriptionOperationError",
  { operation: S.String, legacyMessage: S.String },
  $I.annoteError("SubscriptionOperationError", {
    description: "Serializable application failure; original errors stay main-only.",
  })
) {
  override get message() {
    return this.legacyMessage;
  }
}
