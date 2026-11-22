import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ShareCardPayload } from "../shared/types/share-card.js";
import type { OriginalFailure } from "./lib/OriginalFailure.errors.js";
import type { SynchronousCall } from "./lib/SynchronousHost.service.js";
import type { NativePngInput, NativeRetention } from "./NativeFoundation.model.js";
/** Focused-window and native capture operations shared by RPC and compatibility callers.
 * @category type-level
 * @since 0.0.0
 */
export interface WindowOperations {
  readonly captureShareCard: (
    payload: ShareCardPayload,
    retention?: NativeRetention
  ) => Effect.Effect<Uint8Array, OriginalFailure>;
  readonly close: Effect.Effect<void, OriginalFailure>;
  readonly isMaximized: Effect.Effect<boolean, OriginalFailure>;
  readonly maximize: Effect.Effect<void, OriginalFailure>;
  readonly minimize: Effect.Effect<void, OriginalFailure>;
  readonly writeShareImage: (data: Uint8Array | NativePngInput) => Effect.Effect<void, OriginalFailure>;
}
/** Window contract uses byte arrays for the wire; the compatibility facade restores ArrayBuffer results.
 * **Example** (Read the focused window state)
 * ```ts
 * import { DesktopWindow } from './Window.service.js'
 * import type { SynchronousCall } from './lib/SynchronousHost.service.js'
 * export const maximized = (call:SynchronousCall) => DesktopWindow.use(window => window.forCall(call).isMaximized)
 * ```
 * @category services
 * @since 0.0.0
 */
export class DesktopWindow extends Context.Service<
  DesktopWindow,
  { readonly forCall: (call: SynchronousCall) => WindowOperations }
>()("vidbee/main/Window.service/DesktopWindow") {}
