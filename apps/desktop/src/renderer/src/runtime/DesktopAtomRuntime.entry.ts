import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Atom from "effect/reactivity/Atom";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import * as Scheduler from "effect/Scheduler";
import { forwardingLogger } from "../../../shared/logging/ForwardLogger.layer.js";
import { makeBridgeConnection } from "../transport/DesktopRpcConnection.driver.js";
import { ElectronRpcTransportError } from "../transport/DocumentDelivery.errors.js";
import { makeResourceBudget, makeRetentionLedger } from "../transport/ElectronRpc.model.js";
import { DesktopRpcConnection, layer as transportLayer } from "../transport/ElectronRpcClient.layer.js";
import { aboutLayer } from "./About.atoms.js";
import { makeFoundationAtoms } from "./Foundation.atoms.js";
import { makeFoundationCalls } from "./FoundationCalls.service.js";
import { FoundationClientLive } from "./FoundationClient.service.js";
import { FoundationFailures } from "./FoundationFailures.service.js";
import { makeFoundationStorage } from "./FoundationStorage.service.js";
import { makeRendererDocumentOwner, makeTransportFailureOwner } from "./RendererInvocation.entry.js";
import type { DesktopLogWire } from "../../../shared/logging/DesktopLogWire.model.js";
import type { DesktopRpcBridge } from "../transport/ElectronRpc.model.js";

/** Creates the one registry and shared runtime factory for a document. Atom and direct invocation runners borrow the same memoized protocol/client graph; permanent departure settles invocation owners before registry and runtime disposal.
 * **Example** (Create and close an isolated document owner)
 * ```ts
 * import { makeDesktopDocument } from './DesktopAtomRuntime.entry.js'
 * import type { DesktopRpcBridge } from '../transport/ElectronRpc.model.js'
 * export const create=(bridge:DesktopRpcBridge)=>makeDesktopDocument({bridge,sendLog:()=>{}})
 * // Attach the returned close callback to document departure and HMR, not React effect replay.
 * ```
 * @category runtime
 * @since 0.0.0
 */
export const makeDesktopDocument = ({
  bridge,
  sendLog,
}: {
  readonly bridge: DesktopRpcBridge;
  readonly sendLog: (entry: DesktopLogWire) => void;
}) => {
  const memoMap = Layer.makeMemoMapUnsafe();
  const factory = Atom.context({ memoMap });
  const registry = AtomRegistry.make();
  const atoms = makeFoundationAtoms();
  const ledger = makeRetentionLedger();
  ledger.connect("renderer-document", "renderer-window");
  const account = ledger.document("renderer-document");
  if (account === undefined)
    throw ElectronRpcTransportError.make({
      operation: "connect",
      reason: "ConnectFailed",
      message: "Renderer document budget not installed",
    });
  const resources = makeResourceBudget(account);
  const failure = makeTransportFailureOwner(registry);
  const storage = makeFoundationStorage({ registry, account, report: failure.report });
  let documentOwner: ReturnType<typeof makeRendererDocumentOwner> | undefined;
  const connection = Layer.effect(DesktopRpcConnection)(
    makeBridgeConnection(bridge).pipe(
      Effect.map((connection) => {
        const current = documentOwner;
        if (current === undefined)
          throw ElectronRpcTransportError.make({
            operation: "connect",
            reason: "ConnectFailed",
            message: "Document owner not installed",
          });
        return { ...connection, delivery: current.delivery, retention: account, onFailure: failure.report };
      }),
      Effect.tapError(() =>
        Effect.sync(() =>
          failure.report(
            ElectronRpcTransportError.make({
              operation: "connect",
              reason: "ConnectFailed",
              message: "Desktop connection failed",
            })
          )
        )
      )
    )
  );
  const calls = makeFoundationCalls({ registry, atoms, storage });
  const clientLive = FoundationClientLive.pipe(
    Layer.provide(Layer.succeed(FoundationFailures, { report: failure.report })),
    Layer.provideMerge(transportLayer.pipe(Layer.provide(connection)))
  );
  const live = Layer.mergeAll(
    aboutLayer({
      registry,
      atoms,
      storage,
      calls: calls.app,
      report: (message, error) => Effect.logError(message, error),
    }).pipe(Layer.provideMerge(clientLive)),
    forwardingLogger(sendLog)
  ).pipe(Layer.orDie, Layer.provideMerge(Layer.succeed(Scheduler.Scheduler, registry.scheduler)));
  const runtime = ManagedRuntime.make(live, { memoMap });
  const owner = makeRendererDocumentOwner({ runtime, resources, disposeRegistry: () => registry.dispose() });
  documentOwner = owner;
  const atomRuntime = factory(live);
  let closed = false;
  return {
    registry,
    atoms,
    calls,
    factory,
    runtime,
    atomRuntime,
    owner,
    resources,
    storage,
    failure,
    retentionStats: ledger.stats,
    close: () => {
      if (closed) return;
      closed = true;
      failure.close();
      owner.close();
      storage.close();
      return runtime.dispose().then(() => ledger.disconnect("renderer-document"));
    },
  };
};
