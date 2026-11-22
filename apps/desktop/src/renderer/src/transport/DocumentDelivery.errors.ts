import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $TransportId = $DesktopId.create("renderer/src/transport/DocumentDelivery.errors");

/**
 * Public delivery failures contain no host objects or payloads.
 *
 * **Example** (Use DeliveryError at its owning boundary)
 *
 * ```ts
 * import { DeliveryError } from "./DocumentDelivery.errors.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(DeliveryError);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class DeliveryError extends S.TaggedError<DeliveryError, { readonly brand: unique symbol }>()(
  "DeliveryError",
  {
    reason: S.String,
    message: S.String,
  },
  $TransportId.annoteError("DeliveryError", {
    description: "Delivery Error preserves the declared desktop failure fields.",
  })
) {}

/**
 * Constructs failure with explicit lifetime and failure ownership.
 *
 * **Example** (Use failure at its owning boundary)
 *
 * ```ts
 * import { failure } from "./DocumentDelivery.errors.js"
 * import * as Effect from "effect/Effect"
 * const refused = failure("DocumentClosed");
 * const failed = Effect.fail(refused);
 * void failed;
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const failure = (reason: string): DeliveryError => DeliveryError.make({ reason, message: reason });

/**
 * Content-free transport faults for the document's public failure atom.
 *
 * **Example** (Use ElectronRpcTransportError at its owning boundary)
 *
 * ```ts
 * import { ElectronRpcTransportError } from "./DocumentDelivery.errors.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ElectronRpcTransportError);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class ElectronRpcTransportError extends S.TaggedError<
  ElectronRpcTransportError,
  { readonly brand: unique symbol }
>()(
  "ElectronRpcTransportError",
  {
    operation: S.String,
    reason: S.String,
    message: S.String,
  },
  $TransportId.annoteError("ElectronRpcTransportError", {
    description: "Electron Rpc Transport Error preserves the declared desktop failure fields.",
  })
) {}
/**
 * Validates Electron Rpc Capacity Error at the desktop transport boundary before dispatch.
 *
 * **Example** (Use ElectronRpcCapacityError at its owning boundary)
 *
 * ```ts
 * import { ElectronRpcCapacityError } from "./DocumentDelivery.errors.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ElectronRpcCapacityError);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class ElectronRpcCapacityError extends S.TaggedError<
  ElectronRpcCapacityError,
  { readonly brand: unique symbol }
>()(
  "ElectronRpcCapacityError",
  {
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
  },
  $TransportId.annoteError("ElectronRpcCapacityError", {
    description: "Electron Rpc Capacity Error preserves the declared desktop failure fields.",
  })
) {}
/**
 * Describes Transport Failure ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type TransportFailure = ElectronRpcTransportError | ElectronRpcCapacityError;
