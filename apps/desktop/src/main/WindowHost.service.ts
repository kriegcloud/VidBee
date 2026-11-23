import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ShareCardPayload } from "../shared/types/share-card.js";
import type { OriginalFailure } from "./lib/OriginalFailure.errors.js";
import type { SynchronousCall } from "./lib/SynchronousHost.service.js";
import type { NativePngInput, NativeRetention } from "./NativeFoundation.model.js";

/** Borrowed window methods exclude native identity from the wire.
 * @category type-level
 * @since 0.0.0
 */
export interface FocusedWindow {
  readonly close: () => void;
  readonly isMaximized: () => boolean;
  readonly maximize: () => void;
  readonly minimize: () => void;
  readonly unmaximize: () => void;
}
/** Native window adapter including separately resolved focus and capture serialization.
 * @category type-level
 * @since 0.0.0
 */
export interface WindowHostOperations {
  readonly capture: (
    payload: ShareCardPayload,
    retention?: NativeRetention
  ) => Effect.Effect<Uint8Array, OriginalFailure>;
  readonly clipboard: (data: Uint8Array | NativePngInput) => Effect.Effect<void, OriginalFailure>;
  readonly focused: Effect.Effect<FocusedWindow | null, OriginalFailure>;
  readonly invoke: (body: () => void) => Effect.Effect<void, OriginalFailure>;
  readonly maximized: (window: FocusedWindow) => Effect.Effect<boolean, OriginalFailure>;
}
/** Shares a borrowed window host without storing a focused-window snapshot across invocations.
 * **Example** (Resolve the current focused window)
 * ```ts
 * import { WindowHost } from './WindowHost.service.js'
 * import type { SynchronousCall } from './lib/SynchronousHost.service.js'
 * export const focused = (call:SynchronousCall) => WindowHost.use(host=>host.forCall(call).focused)
 * ```
 * @category services
 * @since 0.0.0
 */
export class WindowHost extends Context.Service<
  WindowHost,
  { readonly forCall: (call: SynchronousCall) => WindowHostOperations }
>()("vidbee/main/WindowHost.service/WindowHost") {}
