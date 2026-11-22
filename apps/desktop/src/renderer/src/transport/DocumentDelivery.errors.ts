import * as S from "effect/Schema";

/** Public delivery failures contain no host objects or payloads. */
export class DeliveryError extends S.TaggedError<DeliveryError, { readonly brand: unique symbol }>()("DeliveryError", {
  reason: S.String,
  message: S.String,
}) {}

export const failure = (reason: string): DeliveryError => DeliveryError.make({ reason, message: reason });
