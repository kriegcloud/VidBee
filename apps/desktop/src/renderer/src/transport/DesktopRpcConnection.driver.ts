import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import { RpcClientDefect, RpcClientError } from "effect/rpc/RpcClientError";
import * as S from "effect/Schema";
import { Connect } from "./ElectronRpc.model.js";
import type { DesktopRpcBridge } from "./ElectronRpc.model.js";
import type { DesktopRpcConnection } from "./ElectronRpcClient.layer.js";

/** Listener acquisition precedes connect; its lifetime is the document scope. */
export const makeBridgeConnection = Effect.fn("DesktopRpcConnection.make")(function* (bridge: DesktopRpcBridge) {
  const frames = yield* Queue.bounded<unknown>(1024);
  yield* Effect.acquireRelease(
    Effect.sync(() =>
      bridge.subscribe((frame) => {
        Queue.offerUnsafe(frames, frame);
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
      Effect.forkScoped(
        Queue.take(frames).pipe(
          Effect.flatMap((frame) => Effect.sync(() => receive(frame))),
          Effect.forever
        )
      ).pipe(Effect.asVoid),
    send: (frame) =>
      Effect.try({
        try: () => bridge.send(frame),
        catch: (cause) => RpcClientError.make({ reason: RpcClientDefect.make({ message: "Send failed", cause }) }),
      }),
  };
  return result;
});
