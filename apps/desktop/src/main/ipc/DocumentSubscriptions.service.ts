import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HashMap from "effect/HashMap";
import * as O from "effect/Option";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";
import { failure } from "../../renderer/src/transport/DocumentDelivery.errors.js";
import { sameToken } from "../../renderer/src/transport/DocumentDelivery.model.js";
import { makeRetentionLedger, measureValue } from "../../renderer/src/transport/ElectronRpc.model.js";
import { snapshotPublication } from "./Publication.service.js";
import type { DeliveryError } from "../../renderer/src/transport/DocumentDelivery.errors.js";
import type { Cut, Token } from "../../renderer/src/transport/DocumentDelivery.model.js";

interface Lifecycle {
  active: boolean;
  close: Effect.Effect<void>;
  readonly epoch: string;
  sequence: number;
  readonly token: Token;
}
export interface Registration<A> extends Lifecycle {
  active: boolean;
  bytes: number;
  readonly epoch: string;
  readonly queue: Queue.Queue<
    {
      readonly _tag: "Observation";
      readonly token: Token;
      readonly epoch: string;
      readonly sequence: number;
      readonly value: A;
    },
    DeliveryError
  >;
  releases: Array<() => void>;
  readonly retention?: import("../../renderer/src/transport/ElectronRpc.model.js").RetentionLease;
  sequence: number;
  readonly token: Token;
}
/** A separate owner is constructed for each authenticated logical client. */
export const makeSubscriptions = ({
  identity,
  resources,
  onTerminal,
  capacity = 256,
  byteLimit = 128 * 1024 * 1024,
}: {
  readonly identity: {
    readonly document: string;
    readonly client: string;
    readonly generation: number;
    readonly epoch: string;
  };
  readonly resources?: import("../../renderer/src/transport/ElectronRpc.model.js").ResourceBudget;
  readonly onTerminal: (token: Token, reason: DeliveryError) => void;
  readonly capacity?: number;
  readonly byteLimit?: number;
}) => {
  const local = makeRetentionLedger({ windowBytes: byteLimit });
  const account = resources?.account ?? local.forWindow(identity.document);
  let serial = 0;
  let live = true;
  let bytes = 0;
  let slots = HashMap.empty<string, Lifecycle>();
  const failedReleases: Array<() => void> = [];
  const cleanupCauses: Array<unknown> = [];
  const close = Effect.fn("DocumentSubscriptions.close")(function* <A>(sub: Registration<A>, reason: string) {
    if (!sub.active) return;
    sub.active = false;
    // All transitions happen even if terminal publication or a release defects.
    const terminal = yield* Effect.exit(Effect.sync(() => onTerminal(sub.token, failure(reason))));
    if (Exit.isFailure(terminal)) {
      live = false;
      cleanupCauses.push(terminal.cause);
    }
    for (const release of A.reverse(sub.releases)) {
      const exit = yield* Effect.exit(Effect.sync(release));
      if (Exit.isFailure(exit)) {
        failedReleases.push(release);
        cleanupCauses.push(exit.cause);
        live = false;
      } else bytes -= 256;
    }
    sub.releases = [];
    while (Queue.takeUnsafe(sub.queue) !== undefined) {
      /* release queued ownership below */
    }
    bytes -= sub.bytes;
    sub.bytes = 0;
    if (failedReleases.length === 0) sub.retention?.release();
    else sub.retention?.resize(Math.max(256, failedReleases.length * 256));
    Queue.failCauseUnsafe(sub.queue, Cause.fail(failure(reason)));
    const current = HashMap.get(slots, sub.token.family);
    if (O.isSome(current) && sameToken({ left: current.value.token, right: sub.token }))
      slots = HashMap.remove(slots, sub.token.family);
  });
  const acquire = Effect.fn("DocumentSubscriptions.acquire")(function* <A>(
    family: string,
    install: (publish: (value: A) => void, ownRelease: (release: () => void) => void) => void,
    snapshot: (value: A) => { readonly value: A; readonly bytes: number }
  ) {
    if (!live || serial >= Number.MAX_SAFE_INTEGER || failedReleases.length > 0)
      return yield* failure("RegistrationCapacity");
    const old = HashMap.get(slots, family);
    if (O.isSome(old)) yield* old.value.close;
    if (HashMap.size(slots) >= 1024) return yield* failure("RegistrationCapacity");
    const retention = resources === undefined ? account.reserve(4096) : resources.claim("registration", 4096);
    if (retention === undefined) return yield* failure("RegistrationCapacity");
    const queue = yield* Queue.make<
      Registration<A>["queue"] extends Queue.Queue<infer V, DeliveryError> ? V : never,
      DeliveryError
    >({ capacity });
    const token: Token = { ...identity, family, serial: ++serial };
    const sub: Registration<A> = {
      token,
      ...(retention === undefined ? {} : { retention }),
      epoch: identity.epoch,
      queue,
      sequence: 0,
      active: true,
      bytes: 0,
      releases: [],
      close: Effect.void,
    };
    sub.close = close(sub, "RegistrationClosed");
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        slots = HashMap.set(slots, family, sub);
      }),
      () => sub.close
    );
    const terminals = yield* Queue.bounded<string>(1);
    yield* Effect.forkScoped(Effect.flatMap(Queue.take(terminals), (reason) => close(sub, reason)));
    let overflow = false;
    const installed = yield* Effect.exit(
      Effect.sync(() =>
        install(
          (value) => {
            if (!sub.active || overflow) return;
            const captured = Result.try({
              try: () => {
                const estimate = measureValue(value);
                const staging = account.reserve(
                  estimate === undefined ? 64 * 1024 * 1024 : Math.min(64 * 1024 * 1024, estimate * 4 + 4096)
                );
                if (staging === undefined)
                  return Result.getOrThrowWith(Result.fail(failure("ObservationCapacity")), (error) => error);
                const projected = Result.try({
                  try: () => snapshot(value),
                  catch: () => failure("ObservationEncodingFailed"),
                });
                if (Result.isFailure(projected)) {
                  staging.release();
                  return Result.getOrThrowWith(Result.fail(projected.failure), (error) => error);
                }
                return Result.getOrThrowWith(
                  snapshotPublication({ value: projected.success.value, account, staging }),
                  (error) => error
                );
              },
              catch: () => failure("ObservationEncodingFailed"),
            });
            if (Result.isFailure(captured)) {
              overflow = true;
              Queue.offerUnsafe(terminals, "ObservationEncodingFailed");
              return;
            }
            const retained = captured.success;
            if (
              !Number.isSafeInteger(retained.bytes) ||
              retained.bytes < 0 ||
              sub.sequence >= Number.MAX_SAFE_INTEGER ||
              sub.bytes + retained.bytes > byteLimit ||
              bytes + retained.bytes > byteLimit ||
              (sub.retention !== undefined && !sub.retention.resize(4096 + sub.bytes + retained.bytes))
            ) {
              retained.release();
              overflow = true;
              Queue.offerUnsafe(terminals, "StreamOverflow");
              return;
            }
            const sequence = sub.sequence + 1;
            if (
              !Queue.offerUnsafe(queue, {
                _tag: "Observation",
                token,
                epoch: identity.epoch,
                sequence,
                value: retained.value,
              })
            ) {
              retained.release();
              overflow = true;
              Queue.offerUnsafe(terminals, "StreamOverflow");
              return;
            }
            retained.release();
            sub.sequence = sequence;
            bytes += retained.bytes;
            sub.bytes += retained.bytes;
          },
          (release) => {
            // The installer reports ownership immediately after acquisition. Retain even if capacity is exceeded so teardown can release it.
            if (sub.releases.length >= 16) {
              release();
              return Result.getOrThrowWith(Result.fail(failure("RegistrationCapacity")), (error) => error);
            }
            sub.releases.push(release);
            bytes += 256;
            if (sub.releases.length > 16 || bytes > byteLimit) {
              overflow = true;
              Queue.offerUnsafe(terminals, "RegistrationCapacity");
            }
          }
        )
      )
    );
    if (Exit.isFailure(installed) || overflow) {
      yield* close(sub, Exit.isFailure(installed) ? "AcquisitionFailed" : "StreamOverflow");
      return yield* failure("AcquisitionFailed");
    }
    return sub;
  });
  const requireActive = (token: Token) =>
    Effect.suspend(() => {
      const sub = HashMap.get(slots, token.family);
      return live && O.isSome(sub) && sub.value.active && sameToken({ left: sub.value.token, right: token })
        ? Effect.succeed(sub.value)
        : Effect.fail(failure("RegistrationClosed"));
    });
  const bind = Effect.fn("DocumentSubscriptions.bind")(function* (tokens: ReadonlyArray<Token>) {
    if (tokens.length > 16) return yield* failure("DependencyCapacity");
    // Captured objects survive replacement and cannot be rebound at completion.
    const bound = yield* Effect.forEach(tokens, requireActive, { concurrency: 1 });
    return {
      capture: Effect.suspend((): Effect.Effect<ReadonlyArray<Cut>, DeliveryError> => {
        if (
          !live ||
          A.some(
            bound,
            (sub) => !sub.active || !O.exists(HashMap.get(slots, sub.token.family), (current) => current === sub)
          )
        )
          return Effect.fail(failure("RegistrationClosed"));
        return Effect.succeed(A.map(bound, (sub) => ({ token: sub.token, epoch: sub.epoch, through: sub.sequence })));
      }),
    };
  });
  const watch = <A>(sub: Registration<A>) =>
    Stream.concat(
      Stream.succeed({
        _tag: "Registered",
        token: sub.token,
        epoch: sub.epoch,
      } satisfies import("../../renderer/src/transport/DocumentDelivery.model.ts").Registered),
      Stream.fromQueue(sub.queue)
    );
  return {
    acquire,
    bind,
    requireActive,
    close,
    watch,
    disconnect: Effect.gen(function* () {
      live = false;
      for (const sub of HashMap.values(slots)) yield* sub.close;
    }),
    stats: () => ({ bytes, registrations: HashMap.size(slots), failedReleases: failedReleases.length, cleanupCauses }),
  };
};
export class DocumentSubscriptions extends Context.Service<
  DocumentSubscriptions,
  { readonly make: typeof makeSubscriptions }
>()("vidbee/main/ipc/DocumentSubscriptions.service/DocumentSubscriptions") {}
