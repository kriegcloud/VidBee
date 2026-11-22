import * as S from "effect/Schema";

/** Public delivery failures contain no host objects or payloads. */
export class DeliveryError extends S.TaggedError<DeliveryError, { readonly brand: unique symbol }>()("DeliveryError", {
  reason: S.String,
  message: S.String,
}) {}

export const failure = (reason: string): DeliveryError => DeliveryError.make({ reason, message: reason });

/** Content-free transport faults for the document's public failure atom. */
export class ElectronRpcTransportError extends S.TaggedError<
  ElectronRpcTransportError,
  { readonly brand: unique symbol }
>()("ElectronRpcTransportError", {
  operation: S.String,
  reason: S.String,
  message: S.String,
}) {}
export class ElectronRpcCapacityError extends S.TaggedError<
  ElectronRpcCapacityError,
  { readonly brand: unique symbol }
>()("ElectronRpcCapacityError", {
  resource: S.Literals([
    "document sessions",
    "logical clients",
    "unary requests",
    "streams",
    "frame bytes",
    "buffered bytes",
    "native work",
    "command entries",
  ]),
  scope: S.Literals(["connect", "logical client", "document", "window"]),
  message: S.String,
}) {}
export type TransportFailure = ElectronRpcTransportError | ElectronRpcCapacityError;
