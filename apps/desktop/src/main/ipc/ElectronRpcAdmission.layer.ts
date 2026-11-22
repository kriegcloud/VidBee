import * as Layer from "effect/Layer";
import { ElectronRpcAdmission, makeAdmission } from "./ElectronRpcAdmission.service.js";

/**
 * Installs one application admission ledger; reuse this layer across document generations so reconnecting cannot reset window or application limits.
 *
 * **Example** (Use layer with its owner)
 *
 * ```ts
 * import { layer } from "./ElectronRpcAdmission.layer.js"
 * import * as Layer from "effect/Layer"
 * export const acquire = Layer.build(layer);
 * // Run acquire inside the application or document scope with its required services.
 * ```
 *
 * @category layers
 * @since 0.0.0
 */
export const layer = Layer.sync(ElectronRpcAdmission)(makeAdmission);
