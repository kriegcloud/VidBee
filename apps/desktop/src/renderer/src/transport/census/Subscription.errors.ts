import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $I = $DesktopId.create("shared/subscriptions/Subscription.errors");

/**
 * Validates Subscription Operation Error at the desktop capability boundary before dispatch.
 *
 * **Example** (Use SubscriptionOperationError at its owning boundary)
 *
 * ```ts
 * import { SubscriptionOperationError } from "./Subscription.errors.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(SubscriptionOperationError);
 * const validated = decode({});
 * void validated;
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
