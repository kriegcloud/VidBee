import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DocumentDelivery, makeDeliveryGate } from "./DocumentDelivery.service.js";
import { DocumentResources } from "./ElectronRpc.model.js";

/**
 * Constructs layer with explicit lifetime and failure ownership.
 *
 * **Example** (Use layer at its owning boundary)
 *
 * ```ts
 * import { layer } from "./DocumentDelivery.layer.js"
 * import * as Layer from "effect/Layer"
 * const acquire = Layer.build(layer);
 * void acquire;
 * ```
 *
 * @category layers
 * @since 0.0.0
 */
export const layer = Layer.effect(DocumentDelivery)(
  Effect.acquireRelease(
    Effect.map(DocumentResources, (resources) => makeDeliveryGate({ resources })),
    (owner) => Effect.sync(owner.disconnect)
  )
);
