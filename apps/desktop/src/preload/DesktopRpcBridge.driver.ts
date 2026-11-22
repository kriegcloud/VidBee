import * as Result from "effect/Result";
import { channels } from "../renderer/src/transport/ElectronRpc.model.js";
import type { IpcRenderer } from "electron";
import type { DesktopRpcBridge } from "../renderer/src/transport/ElectronRpc.model.js";

/**
 * Exposes only fixed RPC channels to the renderer and strips native event objects from deliveries; subscriptions return an idempotent listener release callback.
 *
 * **Example** (Use makePreloadBridge with its owner)
 *
 * ```ts
 * import { makePreloadBridge } from "./DesktopRpcBridge.driver.js"
 * export const listen = (ipc: Parameters<typeof makePreloadBridge>[0]) => {
 *   const bridge = makePreloadBridge(ipc);
 *   const frames: unknown[] = [];
 *   const unsubscribe = bridge.subscribe((frame) => { frames.push(frame); });
 *   return { unsubscribe, frames };
 * };
 * // Pass preload ipcRenderer; invoke the returned release callback when the document leaves.
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
