import * as Context from "effect/Context";
import type { TransportFailure } from "../transport/DocumentDelivery.errors.js";

/** Reports connection and source failures into the document's one visible failure atom. Intentional scope interruption is handled as teardown rather than a new failure.
 * **Example** (Report through the document owner)
 * ```ts
 * import { FoundationFailures } from './FoundationFailures.service.js'
 * import { ElectronRpcTransportError } from '../transport/DocumentDelivery.errors.js'
 * import * as Effect from 'effect/Effect'
 * export const report=FoundationFailures.use(owner=>Effect.sync(()=>owner.report(ElectronRpcTransportError.make({operation:'watch',reason:'SourceClosed',message:'Reload to reconnect.'}))))
 * // Provide the document reporter; it refuses registry writes after permanent departure.
 * ```
 * @category services
 * @since 0.0.0
 */
export class FoundationFailures extends Context.Service<
  FoundationFailures,
  { readonly report: (failure: TransportFailure) => void }
>()("vidbee/renderer/src/runtime/FoundationFailures.service/FoundationFailures") {}
