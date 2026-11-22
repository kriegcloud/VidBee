import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $I = $DesktopId.create("shared/subscriptions/Subscription.errors");
export class SubscriptionOperationError extends S.TaggedError<
  SubscriptionOperationError,
  { readonly brand: unique symbol }
>($I`SubscriptionOperationError`)(
  "SubscriptionOperationError",
  { operation: S.String, legacyMessage: S.String },
  $I.annote("SubscriptionOperationError", {
    description: "Serializable application failure; original errors stay main-only.",
  })
) {
  override get message() {
    return this.legacyMessage;
  }
}
