import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { originalFailure } from "./lib/OriginalFailure.errors.js";
import { WindowHost } from "./WindowHost.service.js";
import type { ShareCardPayload } from "../shared/types/share-card.js";
import type { NativePngInput, NativeRetention } from "./NativeFoundation.model.js";
import type { FocusedWindow, WindowHostOperations } from "./WindowHost.service.js";

/** Native window primitives, supplied without exposing BrowserWindow to the strict graph.
 * @category type-level
 * @since 0.0.0
 */
export interface WindowPrimitives {
  readonly capture: (payload: ShareCardPayload, retention?: NativeRetention) => PromiseLike<Uint8Array>;
  readonly clipboard: (data: Uint8Array | NativePngInput) => void;
  readonly focused: () => FocusedWindow | null;
}
/** Captures native failures with original identity; Promise adaptation is restricted to capture. Focus is resolved per invocation.
 * **Example** (Construct the window host layer)
 * ```ts
 * import { windowHostLayer } from './WindowHost.driver.js'
 * import type { WindowPrimitives } from './WindowHost.driver.js'
 * export const driver = (borrow:()=>WindowPrimitives) => windowHostLayer(borrow)
 * // Construction borrows nothing; operations resolve the installed host when executed.
 * ```
 * @category layers
 * @since 0.0.0
 */
export const windowHostLayer = (borrow: () => WindowPrimitives) =>
  Layer.succeed(WindowHost, {
    forCall: (call) => {
      const failure = (original: unknown) =>
        originalFailure({
          original,
          operation: "Window",
          legacyMessage: original instanceof Error ? original.message : String(original),
        });
      const attempt = <A>(body: () => A) => Effect.try({ try: () => call.use(body), catch: failure });
      const operations: WindowHostOperations = {
        focused: attempt(() => borrow().focused()),
        invoke: Effect.fn("WindowHost.invoke")((body: () => void) => attempt(body)),
        maximized: Effect.fn("WindowHost.maximized")((window: FocusedWindow) => attempt(() => window.isMaximized())),
        capture: Effect.fn("WindowHost.capture")((payload: ShareCardPayload, retention?: NativeRetention) =>
          Effect.tryPromise({ try: () => call.use(() => borrow().capture(payload, retention)), catch: failure })
        ),
        clipboard: Effect.fn("WindowHost.clipboard")((data: Uint8Array | NativePngInput) =>
          attempt(() => borrow().clipboard(data))
        ),
      };
      return operations;
    },
  });
