import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as S from "effect/Schema";
import { DeliveryError } from "../renderer/src/transport/DocumentDelivery.errors.js";
import { Completion, Subscription, Token } from "../renderer/src/transport/DocumentDelivery.model.js";
import { RpcUndefined } from "../renderer/src/transport/RpcField.model.js";
import { RpcObserved } from "../renderer/src/transport/RpcObservation.model.js";
import { DownloaderStatus, MessageBoxOptions, MessageBoxResult } from "./App.model.js";
import { DesktopOperationError } from "./DesktopOperation.errors.js";
import { YtDlpKernelStatus } from "./types/ytdlp-kernel.js";
/** Application procedures retain delivery failures outside Completion and native failures inside it. Kernel snapshots bind an active status registration; show-home remains a no-replay target-document stream.
 *
 * **Example** (Inspect application procedure membership)
 *
 * ```ts
 * import { AppRpcs } from './App.rpc.js'
 * AppRpcs.requests.has('App.GetVersion') // => true
 * ```
 *
 * @category rpc
 * @since 0.0.0
 */
export const AppRpcs = RpcGroup.make(
  Rpc.make("App.GetVersion", {
    success: Completion({ success: S.String, error: DesktopOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("App.GetPlatform", {
    success: Completion({ success: S.String, error: DesktopOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("App.GetDownloaderStatus", {
    success: Completion({ success: DownloaderStatus, error: DesktopOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("App.GetYtDlpKernelStatus", {
    payload: { kernel: Token },
    success: Completion({ success: YtDlpKernelStatus, error: DesktopOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("App.RetryYtDlpKernelPreparation", {
    payload: { kernel: Token },
    success: Completion({ success: YtDlpKernelStatus, error: DesktopOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("App.GetOsVersion", {
    success: Completion({ success: S.String, error: DesktopOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("App.Quit", {
    success: Completion({ success: RpcUndefined, error: DesktopOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("App.ShowMessageBox", {
    payload: { options: RpcObserved(MessageBoxOptions) },
    success: Completion({ success: MessageBoxResult, error: DesktopOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("App.GetSiteIcon", {
    payload: { domain: S.String },
    success: Completion({ success: S.NullOr(S.String), error: DesktopOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("App.WatchYtDlpKernelStatus", {
    success: Subscription(YtDlpKernelStatus),
    error: S.Union([DesktopOperationError, DeliveryError]),
    stream: true,
  }),
  Rpc.make("App.WatchShowHome", {
    success: Subscription(RpcUndefined),
    error: S.Union([DesktopOperationError, DeliveryError]),
    stream: true,
  })
);
