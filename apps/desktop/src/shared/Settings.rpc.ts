import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as S from "effect/Schema";
import { DeliveryError } from "../renderer/src/transport/DocumentDelivery.errors.js";
import { Completion, Subscription, Token } from "../renderer/src/transport/DocumentDelivery.model.js";
import { RpcUndefined } from "../renderer/src/transport/RpcField.model.js";
import { RpcObserved } from "../renderer/src/transport/RpcObservation.model.js";
import { SettingsError } from "./Settings.errors.js";
import { SettingKey, SettingsPatch, SettingsView, SettingUpdate, SettingValue } from "./Settings.model.js";

/** Settings procedures preserve application failures inside Completion and delivery failures outside.
 * Reads bind the live settings registration before their initial snapshot. Raw legacy channels do not use these schemas.
 *
 * **Example** (Inspect the foundation settings group)
 * ```ts
 * import { SettingsRpcs } from './Settings.rpc.js'
 * SettingsRpcs.requests.size // => 8
 * ```
 * @category rpc
 * @since 0.0.0
 */
export const SettingsRpcs = RpcGroup.make(
  Rpc.make("Settings.Get", {
    payload: { key: SettingKey, settings: Token },
    success: Completion({ success: RpcObserved(SettingValue), error: SettingsError }),
    error: DeliveryError,
  }),
  Rpc.make("Settings.Set", {
    payload: SettingUpdate,
    success: Completion({ success: RpcUndefined, error: SettingsError }),
    error: DeliveryError,
  }),
  Rpc.make("Settings.GetAll", {
    payload: { settings: Token },
    success: Completion({ success: RpcObserved(SettingsView), error: SettingsError }),
    error: DeliveryError,
  }),
  Rpc.make("Settings.SetAll", {
    payload: { settings: SettingsPatch },
    success: Completion({ success: RpcUndefined, error: SettingsError }),
    error: DeliveryError,
  }),
  Rpc.make("Settings.Reset", {
    success: Completion({ success: RpcUndefined, error: SettingsError }),
    error: DeliveryError,
  }),
  Rpc.make("Settings.ShouldPromptWhatsNew", {
    success: Completion({ success: S.Boolean, error: SettingsError }),
    error: DeliveryError,
  }),
  Rpc.make("Settings.MarkWhatsNewSeen", {
    success: Completion({ success: RpcUndefined, error: SettingsError }),
    error: DeliveryError,
  }),
  Rpc.make("Settings.WatchChanged", {
    success: Subscription(RpcUndefined),
    error: S.Union([SettingsError, DeliveryError]),
    stream: true,
  })
);
