import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DocumentResources } from "../../renderer/src/transport/ElectronRpc.model.js";
import { DocumentSubscriptions, makeSubscriptions } from "./DocumentSubscriptions.service.js";

/**
 * Constructs layer with explicit lifetime and failure ownership.
 *
 * **Example** (Use layer at its owning boundary)
 *
 * ```ts
 * import { layer } from "./DocumentSubscriptions.layer.js"
 * import * as Layer from "effect/Layer"
 * const acquire = Layer.build(layer);
 * void acquire;
 * ```
 *
 * @category layers
 * @since 0.0.0
 */
export const layer = Layer.effect(DocumentSubscriptions)(
  Effect.map(DocumentResources, (resources) => ({
    make: (options: Parameters<typeof makeSubscriptions>[0]) => makeSubscriptions({ ...options, resources }),
  }))
);
