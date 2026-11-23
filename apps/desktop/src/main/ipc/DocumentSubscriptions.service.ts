import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
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
/**
 * Represents one source incarnation with immutable identity with its queued observations and owned native listener releases; departure ends admission while borrowed observations keep their retained charge.
 *
 * @category type-level
 * @since 0.0.0
 */
export interface Registration<A> extends Lifecycle {
  active: boolean;
  bytes: number;
  charges: HashMap.HashMap<number, number>;
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
/**
 * Creates one source-subscription owner for an authenticated logical client; registration replacement and departure close native listeners, while borrowed observations remain charged until their consumer releases them.
 *
 * **Example** (Use makeSubscriptions with its owner)
 *
 * ```ts
 * import { makeSubscriptions } from "./DocumentSubscriptions.service.js"
 * export const owner = makeSubscriptions({ identity: { document: "d", client: "c", generation: 1, epoch: "epoch" }, onTerminal: () => {} });
 * export const releaseDocument = owner.disconnect;
 * // Run on departure; no native listeners have been acquired in this example.
 * export const release = releaseDocument;
 * // Run release on document departure; the resulting registration count is zero.
 * owner.stats().registrations // => 0
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
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
  let states = HashMap.empty<number, { installing: boolean; borrowed: HashSet.HashSet<number>; failed: number }>();
  const failedReleases: Array<() => void> = [];
  const cleanupCauses: Array<unknown> = [];
  const retain = <A>(sub: Registration<A>, additionalBytes = 0) => {
    const state = O.getOrUndefined(HashMap.get(states, sub.token.serial));
    if (state === undefined) return false;
    if (!sub.active && !state.installing && sub.bytes === 0 && sub.releases.length === 0 && state.failed === 0) {
      sub.retention?.release();
      states = HashMap.remove(states, sub.token.serial);
      return true;
    }
    return (
      sub.retention?.resize(
        (sub.active || state.installing ? 4096 : 0) +
          sub.bytes +
          additionalBytes +
          (sub.releases.length + state.failed) * 256
      ) ?? true
    );
  };
  const releaseValue = <A>(sub: Registration<A>, sequence: number) => {
    const amount = O.getOrElse(HashMap.get(sub.charges, sequence), () => 0);
    bytes -= amount;
    sub.bytes -= amount;
    sub.charges = HashMap.remove(sub.charges, sequence);
    const state = O.getOrUndefined(HashMap.get(states, sub.token.serial));
    if (state !== undefined) state.borrowed = HashSet.remove(state.borrowed, sequence);
    retain(sub);
  };
  const close = Effect.fn("DocumentSubscriptions.close")(function* <A>(sub: Registration<A>, reason: string) {
    if (!sub.active) return;
    sub.active = false;
    // All transitions happen even if terminal publication or a release defects.
    const terminal = yield* Effect.exit(Effect.sync(() => onTerminal(sub.token, failure(reason))));
    if (Exit.isFailure(terminal)) {
      live = false;
      cleanupCauses.push(terminal.cause);
    }
    while (sub.releases.length > 0) {
      const release = A.getUnsafe(sub.releases, sub.releases.length - 1);
      const exit = yield* Effect.exit(Effect.sync(release));
      // Keep the executing callback installed until its attempt ends, then transfer failures atomically.
      sub.releases.pop();
      if (Exit.isFailure(exit)) {
        const state = O.getOrUndefined(HashMap.get(states, sub.token.serial));
        if (state !== undefined) state.failed++;
        failedReleases.push(release);
        cleanupCauses.push(exit.cause);
        live = false;
      } else bytes -= 256;
      retain(sub);
    }
    sub.releases = [];
    while (Queue.takeUnsafe(sub.queue) !== undefined) {
      /* release queued ownership below */
    }
    const state = O.getOrUndefined(HashMap.get(states, sub.token.serial));
    for (const [sequence] of HashMap.toEntries(sub.charges))
      if (state === undefined || !HashSet.has(state.borrowed, sequence)) releaseValue(sub, sequence);
    retain(sub);
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
      charges: HashMap.empty(),
      close: Effect.void,
    };
    const state = { installing: true, borrowed: HashSet.empty<number>(), failed: 0 };
    states = HashMap.set(states, token.serial, state);
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
              !retain(sub, retained.bytes)
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
            sub.charges = HashMap.set(sub.charges, sequence, retained.bytes);
            sub.sequence = sequence;
            bytes += retained.bytes;
            sub.bytes += retained.bytes;
          },
          (release) => {
            if (!sub.active) {
              const released = Result.try({ try: release, catch: (original) => original });
              if (Result.isFailure(released)) {
                state.failed++;
                bytes += 256;
                failedReleases.push(release);
                cleanupCauses.push(Cause.die(released.failure));
                live = false;
              }
              retain(sub);
              return;
            }
            // The installer reports ownership immediately after acquisition. Retain even if capacity is exceeded so teardown can release it.
            if (sub.releases.length >= 16) {
              sub.releases.push(release);
              bytes += 256;
              retain(sub);
              overflow = true;
              return Result.getOrThrowWith(Result.fail(failure("RegistrationCapacity")), (error) => error);
            }
            sub.releases.push(release);
            bytes += 256;
            if (!retain(sub)) {
              overflow = true;
              return Result.getOrThrowWith(Result.fail(failure("RegistrationCapacity")), (error) => error);
            }
            if (sub.releases.length > 16 || bytes > byteLimit) {
              overflow = true;
              Queue.offerUnsafe(terminals, "RegistrationCapacity");
            }
          }
        )
      )
    );
    state.installing = false;
    if (!retain(sub)) overflow = true;
    if (
      Exit.isFailure(installed) ||
      overflow ||
      !live ||
      !sub.active ||
      !O.exists(HashMap.get(slots, family), (current) => current === sub)
    ) {
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
    Stream.unwrap(
      Effect.map(requireActive(sub.token), () => {
        let current: number | undefined;
        const release = () => {
          if (current === undefined) return;
          releaseValue(sub, current);
          current = undefined;
        };
        return Stream.concat(
          Stream.succeed({
            _tag: "Registered",
            token: sub.token,
            epoch: sub.epoch,
          } satisfies import("../../renderer/src/transport/DocumentDelivery.model.ts").Registered),
          Stream.fromEffectRepeat(Queue.take(sub.queue)).pipe(
            Stream.mapEffect((observation) =>
              Effect.sync(() => {
                release();
                if (!sub.active)
                  return Result.getOrThrowWith(Result.fail(failure("RegistrationClosed")), (error) => error);
                current = observation.sequence;
                const state = O.getOrUndefined(HashMap.get(states, sub.token.serial));
                if (state !== undefined) state.borrowed = HashSet.add(state.borrowed, current);
                return observation;
              })
            )
          )
        ).pipe(Stream.ensuring(Effect.sync(release)));
      })
    );
  return {
    acquire,
    bind,
    requireActive,
    bindOptional: (family: string) =>
      Effect.suspend(() => {
        const sub = O.getOrUndefined(HashMap.get(slots, family));
        return bind(sub === undefined ? [] : [sub.token]);
      }),
    close,
    watch,
    disconnect: Effect.gen(function* () {
      live = false;
      for (const sub of HashMap.values(slots)) yield* sub.close;
    }),
    stats: () => ({ bytes, registrations: HashMap.size(slots), failedReleases: failedReleases.length, cleanupCauses }),
  };
};
/**
 * Constructs per-client source owners using the document resource budget supplied by composition; never reuse one owner for unrelated logical clients.
 *
 * **Example** (Use DocumentSubscriptions with its owner)
 *
 * ```ts
 * import { DocumentSubscriptions } from "./DocumentSubscriptions.service.js"
 * import * as Effect from "effect/Effect"
 * export const make = DocumentSubscriptions.use((service) => Effect.sync(() => service.make({ identity: { document: "d", client: "c", generation: 1, epoch: "e" }, onTerminal: () => {} }).stats()));
 * // Provide document resources; this creates one client owner and reads its initial registration count.
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export class DocumentSubscriptions extends Context.Service<
  DocumentSubscriptions,
  { readonly make: typeof makeSubscriptions }
>()("vidbee/main/ipc/DocumentSubscriptions.service/DocumentSubscriptions") {}
