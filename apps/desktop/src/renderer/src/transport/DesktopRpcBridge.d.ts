import type { DesktopRpcBridge } from "./ElectronRpc.model.js";

declare global {
  interface Window {
    vidbeeRpc: DesktopRpcBridge;
  }
}
