import { channels } from "../renderer/src/transport/ElectronRpc.model.js";
import type { IpcRenderer } from "electron";
import type { DesktopRpcBridge } from "../renderer/src/transport/ElectronRpc.model.js";

/** Fixed channels only; native event objects never leave preload. */
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
    ipc.on(channels.message, listener);
    return () => {
      if (!live) return;
      live = false;
      ipc.removeListener(channels.message, listener);
    };
  },
});
