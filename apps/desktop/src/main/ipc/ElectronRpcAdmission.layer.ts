import * as Layer from "effect/Layer";
import { ElectronRpcAdmission, makeAdmission } from "./ElectronRpcAdmission.service.js";

/**
 * Constructs layer with explicit lifetime and failure ownership.
 *
 * **Example** (Use layer at its owning boundary)
 *
 * ```ts
 * import { layer } from "./ElectronRpcAdmission.layer.js"
 * import * as Layer from "effect/Layer"
 * const acquire = Layer.build(layer);
 * void acquire;
 * ```
 *
 * @category layers
 * @since 0.0.0
 */
export const layer = Layer.sync(ElectronRpcAdmission)(makeAdmission);
