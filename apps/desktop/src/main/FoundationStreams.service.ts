import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as O from "effect/Option";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";
import * as Str from "effect/String";
import { failure } from "../renderer/src/transport/DocumentDelivery.errors.js";
import { makeSubscriptions } from "./ipc/DocumentSubscriptions.service.js";
import { snapshotPublication } from "./ipc/Publication.service.js";
import type { DeliveryError } from "../renderer/src/transport/DocumentDelivery.errors.js";
import type { Token } from "../renderer/src/transport/DocumentDelivery.model.js";
import type { FoundationEventValues, makeFoundationEvents } from "./FoundationEvents.service.js";
import type { Lease } from "./ipc/ElectronRpcAdmission.service.js";
import type { ElectronRpcServer } from "./ipc/ElectronRpcServer.layer.js";

/** Owns one subscription registry per authenticated logical client. Optional unary bindings capture the current family at admission without inventing a registration. Invalidation coalesces to one queued pulse; kernel keeps one charged immutable latest slot behind its queued observation; show-home never coalesces or replays.
 * **Example** (Build the stream owner alongside the mounted server)
 * ```ts
 * import { makeFoundationStreams } from './FoundationStreams.service.js'
 * import type { ElectronRpcServer } from './ipc/ElectronRpcServer.layer.js'
 * import { makeFoundationEvents } from './FoundationEvents.service.js'
 * export const streams=(server:ElectronRpcServer['Service'])=>makeFoundationStreams({server,events:makeFoundationEvents(),epoch:'application-lifetime'})
 * // Each watch owns its native release and removes its client entry after the last stream closes.
 * ```
 * @category services
 * @since 0.0.0
 */
export const makeFoundationStreams = ({
  server,
  events,
  epoch,
}: {
  readonly server: ElectronRpcServer["Service"];
  readonly events: ReturnType<typeof makeFoundationEvents>;
  readonly epoch: string;
}) => {
  type Owner = ReturnType<typeof makeSubscriptions>;
  let generation = 0;
  let clients = HashMap.empty<string, { readonly owner: Owner; references: number }>();
  const key = (lease: Lease) => `${lease.request.session}/${lease.request.client}`;
  const bind = Effect.fn("FoundationStreams.bind")(function* (
    lease: Lease,
    token: Token,
    family: keyof FoundationEventValues
  ) {
    const current = O.getOrUndefined(HashMap.get(clients, key(lease)));
    if (current === undefined || token.family !== family) return yield* failure("RegistrationClosed");
    return yield* current.owner.bind([token]);
  });
  const watch = <K extends keyof FoundationEventValues>(
    family: K,
    headers: Readonly<Record<string, string>>,
    listen: (account: string, receive: (value: FoundationEventValues[K]) => void) => () => void
  ) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const lease = yield* server.requestLease(headers);
        const id = key(lease);
        let current = O.getOrUndefined(HashMap.get(clients, id));
        if (current !== undefined && current.owner.stats().failedReleases > 0) return yield* failure("CleanupFailed");
        if (current === undefined) {
          if (generation >= Number.MAX_SAFE_INTEGER || HashMap.size(clients) >= 4096)
            return yield* failure("RegistrationCapacity");
          generation++;
          current = {
            owner: makeSubscriptions({
              identity: {
                document: lease.request.session,
                client: String(lease.request.client),
                generation,
                epoch,
              },
              resources: lease.resources,
              onTerminal: () => {},
            }),
            references: 0,
          };
          clients = HashMap.set(clients, id, current);
        }
        const captured = current;
        captured.references++;
        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            captured.references--;
            if (captured.references === 0) {
              yield* captured.owner.disconnect;
              if (captured.owner.stats().failedReleases === 0) clients = HashMap.remove(clients, id);
            }
          })
        );
        const terminal = yield* Queue.bounded<DeliveryError>(1);
        let pending = false;
        let latest: { readonly value: FoundationEventValues[K]; readonly release: () => void } | undefined;
        let publish: ((value: FoundationEventValues[K]) => void) | undefined;
        const sub = yield* captured.owner.acquire<FoundationEventValues[K]>(
          family,
          (send, ownRelease) => {
            publish = send;
            ownRelease(() => {
              latest?.release();
              latest = undefined;
            });
            const account = Str.split(lease.request.session, "/")[0] ?? "";
            ownRelease(
              listen(account, (value) => {
                if (family === "home") {
                  send(value);
                  return;
                }
                if (!pending) {
                  pending = true;
                  send(value);
                  return;
                }
                if (family === "settings") return;
                latest?.release();
                latest = undefined;
                const retained = snapshotPublication({ value, account: lease.resources.account });
                if (Result.isFailure(retained)) {
                  Queue.offerUnsafe(terminal, retained.failure);
                  return;
                }
                latest = retained.success;
              })
            );
          },
          (value) => ({ value, bytes: 0 })
        );
        yield* server.ownSubscription(headers, {
          registered: { _tag: "Registered", token: sub.token, epoch: sub.epoch },
          close: sub.close,
        });
        return captured.owner.watch(sub).pipe(
          Stream.interruptWhen(Effect.flatMap(Queue.take(terminal), Effect.fail)),
          Stream.map((event) => {
            if (event._tag === "Observation") {
              pending = false;
              const next = latest;
              latest = undefined;
              if (next !== undefined) {
                pending = true;
                publish?.(next.value);
                next.release();
              }
            }
            return event;
          })
        );
      })
    );
  return {
    bind,
    bindOptional: (lease: Lease, family: keyof FoundationEventValues) =>
      Effect.suspend(() => {
        const current = O.getOrUndefined(HashMap.get(clients, key(lease)));
        return current === undefined
          ? Effect.succeed({ capture: Effect.succeed([]) })
          : current.owner.bindOptional(family);
      }),
    settings: (headers: Readonly<Record<string, string>>) => watch("settings", headers, events.settings.listen),
    kernel: (headers: Readonly<Record<string, string>>) => watch("kernel", headers, events.kernel.listen),
    home: (headers: Readonly<Record<string, string>>) => watch("home", headers, events.home.listen),
    size: () => HashMap.size(clients),
  };
};
