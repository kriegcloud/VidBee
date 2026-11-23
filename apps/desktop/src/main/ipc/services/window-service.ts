import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DesktopWindow } from "../../Window.service.js";
import { WindowHost } from "../../WindowHost.service.js";
import type { WindowOperations } from "../../Window.service.js";
import type { WindowHostOperations } from "../../WindowHost.service.js";

/** Implements focus-at-execution window commands and the existing maximize toggle. The native host retains capture queue ownership.
 * **Example** (Execute the current maximize toggle)
 * ```ts
 * import { makeWindow } from './window-service.js'
 * import type { WindowHostOperations } from '../../WindowHost.service.js'
 * export const toggle = (host:WindowHostOperations) => makeWindow(host).maximize
 * // A missing focused window succeeds without performing a command.
 * ```
 * @category constructors
 * @since 0.0.0
 */
export const makeWindow = (host: WindowHostOperations): WindowOperations => ({
  captureShareCard: host.capture,
  writeShareImage: host.clipboard,
  minimize: Effect.gen(function* () {
    const window = yield* host.focused;
    if (window !== null) yield* host.invoke(() => window.minimize());
  }),
  close: Effect.gen(function* () {
    const window = yield* host.focused;
    if (window !== null) yield* host.invoke(() => window.close());
  }),
  maximize: Effect.gen(function* () {
    const window = yield* host.focused;
    if (window !== null) {
      if (yield* host.maximized(window)) yield* host.invoke(() => window.unmaximize());
      else yield* host.invoke(() => window.maximize());
    }
  }),
  isMaximized: Effect.gen(function* () {
    const window = yield* host.focused;
    return window !== null ? yield* host.maximized(window) : false;
  }),
});
/** Supplies window behavior independently from the native host.
 * **Example** (Build with an injected window host)
 * ```ts
 * import { WindowLive } from './window-service.js'
 * import * as Layer from 'effect/Layer'
 * export const acquire = Layer.build(WindowLive)
 * // Provide WindowHost inside the application scope.
 * ```
 * @category layers
 * @since 0.0.0
 */
export const WindowLive = Layer.effect(DesktopWindow)(
  Effect.map(WindowHost, (host) => ({ forCall: (call) => makeWindow(host.forCall(call)) }))
);
