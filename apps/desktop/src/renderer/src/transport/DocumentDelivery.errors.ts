import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $TransportId = $DesktopId.create("renderer/src/transport/DocumentDelivery.errors");

/**
 * Reports failure to establish a subscription registration or satisfy its delivery cut; callers must not treat a failed cut as an observed successful mutation.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { DeliveryError } from "./DocumentDelivery.errors.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(DeliveryError)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Builds a typed delivery failure with matching reason and message; use it when registration ownership or an inclusive completion cut can no longer be honored.
 *
 * **Example** (Use failure with its owner)
 *
 * ```ts
 * import { failure } from "./DocumentDelivery.errors.js"
 * import * as Effect from "effect/Effect"
 * export const refused = failure("DocumentClosed");
 * export const failed = Effect.fail(refused);
 * // Run failed through Effect.result to inspect the typed DocumentClosed delivery error.
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const failure = (reason: string): DeliveryError => DeliveryError.make({ reason, message: reason });

/**
 * Reports loss of a renderer document connection. Once this failure closes admission, creating a new logical client cannot revive that document.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ElectronRpcTransportError } from "./DocumentDelivery.errors.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ElectronRpcTransportError)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Identifies the exhausted admission resource and limit so callers can distinguish bounded refusal from an operation failure.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ElectronRpcCapacityError } from "./DocumentDelivery.errors.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ElectronRpcCapacityError)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Unifies typed document transport and capacity failures for renderer recovery without replacing capability-specific operation errors.
 *
 * @category type-level
 * @since 0.0.0
 */
export type TransportFailure = ElectronRpcTransportError | ElectronRpcCapacityError;
