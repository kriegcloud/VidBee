import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DocumentDelivery, makeDeliveryGate } from "./DocumentDelivery.service.js";
import { DocumentResources } from "./ElectronRpc.model.js";

/**
 * Provides a document delivery gate charged to DocumentResources and disconnects it on scope exit, failing pending completion cuts.
 *
 * **Example** (Use layer with its owner)
 *
 * ```ts
 * import { layer } from "./DocumentDelivery.layer.js"
 * import * as Layer from "effect/Layer"
 * export const acquire = Layer.build(layer);
 * // Run acquire inside the application or document scope with its required services.
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
