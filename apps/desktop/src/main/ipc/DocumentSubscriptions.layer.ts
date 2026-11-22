import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DocumentResources } from "../../renderer/src/transport/ElectronRpc.model.js";
import { DocumentSubscriptions, makeSubscriptions } from "./DocumentSubscriptions.service.js";

/**
 * Provides source-subscription factories backed by the shared document resource budget; composition creates a separate owner for each logical client.
 *
 * **Example** (Use layer with its owner)
 *
 * ```ts
 * import { layer } from "./DocumentSubscriptions.layer.js"
 * import * as Layer from "effect/Layer"
 * export const acquire = Layer.build(layer);
 * // Run acquire inside the application or document scope with its required services.
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
