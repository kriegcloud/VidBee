import * as Result from "effect/Result";
import { channels } from "../renderer/src/transport/ElectronRpc.model.js";
import type { IpcRenderer } from "electron";
import type { DesktopRpcBridge } from "../renderer/src/transport/ElectronRpc.model.js";

/**
 * Fixed channels only; native event objects never leave preload.
 *
 * **Example** (Use makePreloadBridge at its owning boundary)
 *
 * ```ts
 * import { makePreloadBridge } from "./DesktopRpcBridge.driver.js"
 * const compose = (options: Parameters<typeof makePreloadBridge>[0]) => makePreloadBridge(options);
 * void compose;
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const makePreloadBridge = (
  ipc: Pick<IpcRenderer, "invoke" | "send" | "on" | "removeListener">
): DesktopRpcBridge => ({
  connect: (): Promise<unknown> => ipc.invoke(channels.connect),
  send: (frame) => ipc.send(channels.message, frame),
  disconnect: (session) => ipc.send(channels.end, session),
  subscribe: (receive) => {
    let live = true;
    const listener = (_event: unknown, frame: unknown) => {
      if (live) receive(frame);
    };
    try {
      ipc.on(channels.message, listener);
    } catch (error) {
      live = false;
      ipc.removeListener(channels.message, listener);
      return Result.getOrThrowWith(Result.fail(error), (original) => original);
    }
    return () => {
      if (!live) return;
      live = false;
      ipc.removeListener(channels.message, listener);
    };
  },
});
