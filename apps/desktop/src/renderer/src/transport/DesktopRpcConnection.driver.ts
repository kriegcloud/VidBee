import * as Effect from "effect/Effect";
import { RpcClientDefect, RpcClientError } from "effect/rpc/RpcClientError";
import * as S from "effect/Schema";
import { Connect } from "./ElectronRpc.model.js";
import type { DesktopRpcBridge } from "./ElectronRpc.model.js";
import type { DesktopRpcConnection } from "./ElectronRpcClient.layer.js";

/**
 * Acquires the preload listener before invoking the connection handshake and ties both to the document scope; malformed handshakes release the listener instead of leaving a half-connected document.
 *
 * **Example** (Use makeBridgeConnection with its owner)
 *
 * ```ts
 * import { makeBridgeConnection } from "./DesktopRpcConnection.driver.js"
 * import * as Effect from "effect/Effect"
 * export const inspect = (bridge: Parameters<typeof makeBridgeConnection>[0]) => Effect.scoped(
 *   Effect.map(makeBridgeConnection(bridge), (connection) => connection.session)
 * );
 * // Running inspect subscribes before connecting, then releases the connection after reading its session.
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const makeBridgeConnection = Effect.fn("DesktopRpcConnection.make")(function* (bridge: DesktopRpcBridge) {
  let receiver: ((frame: unknown) => void) | undefined;
  yield* Effect.acquireRelease(
    Effect.sync(() =>
      bridge.subscribe((frame) => {
        receiver?.(frame);
      })
    ),
    (unsubscribe) => Effect.sync(unsubscribe)
  );
  const connected = yield* Effect.tryPromise({
    try: bridge.connect,
    catch: (cause) => RpcClientError.make({ reason: RpcClientDefect.make({ message: "Connect failed", cause }) }),
  });
  const connection = yield* S.decodeUnknownEffect(Connect)(connected).pipe(
    Effect.mapError((cause) =>
      RpcClientError.make({ reason: RpcClientDefect.make({ message: "Invalid connect response", cause }) })
    )
  );
  yield* Effect.addFinalizer(() => Effect.sync(() => bridge.disconnect(connection.session)));
  const result: DesktopRpcConnection["Service"] = {
    session: connection.session,
    listen: (receive) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          receiver = receive;
        }),
        () =>
          Effect.sync(() => {
            receiver = undefined;
          })
      ),
    send: (frame) =>
      Effect.try({
        try: () => bridge.send(frame),
        catch: (cause) => RpcClientError.make({ reason: RpcClientDefect.make({ message: "Send failed", cause }) }),
      }),
  };
  return result;
});
