import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as S from "effect/Schema";
import { DeliveryError } from "../renderer/src/transport/DocumentDelivery.errors.js";
import { Completion } from "../renderer/src/transport/DocumentDelivery.model.js";
import { RpcUndefined } from "../renderer/src/transport/RpcField.model.js";
import { RpcObserved } from "../renderer/src/transport/RpcObservation.model.js";
import { DesktopOperationError } from "./DesktopOperation.errors.js";
import { ShareCardPayload } from "./types/share-card.js";
/** Window procedures resolve the focused window at execution time. Capture and clipboard use bytes on the new wire while old channels retain ArrayBuffer.
 *
 * **Example** (Inspect window procedure membership)
 *
 * ```ts
 * import { WindowRpcs } from './Window.rpc.js'
 * WindowRpcs.requests.has('Window.CaptureShareCard') // => true
 * ```
 *
 * @category rpc
 * @since 0.0.0
 */
export const WindowRpcs = RpcGroup.make(
  Rpc.make("Window.CaptureShareCard", {
    payload: { payload: RpcObserved(ShareCardPayload) },
    success: Completion({ success: S.Uint8ArrayFromBase64, error: DesktopOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("Window.WriteShareImage", {
    payload: { data: S.Uint8ArrayFromBase64 },
    success: Completion({ success: RpcUndefined, error: DesktopOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("Window.Minimize", {
    success: Completion({ success: RpcUndefined, error: DesktopOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("Window.Maximize", {
    success: Completion({ success: RpcUndefined, error: DesktopOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("Window.Close", {
    success: Completion({ success: RpcUndefined, error: DesktopOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("Window.IsMaximized", {
    success: Completion({ success: S.Boolean, error: DesktopOperationError }),
    error: DeliveryError,
  })
);
