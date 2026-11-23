import { $DesktopId } from "@vidbee/identity/packages";
import * as Effect from "effect/Effect";
import * as P from "effect/Predicate";
import * as Result from "effect/Result";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as S from "effect/Schema";
import { failure } from "../../renderer/src/transport/DocumentDelivery.errors.js";
import { measureValue } from "../../renderer/src/transport/ElectronRpc.model.js";
import { sameObservation } from "../../renderer/src/transport/RpcCensus.model.js";
import { ObservedValue } from "../../renderer/src/transport/RpcObservation.model.js";
import type { RetentionAccount, RetentionLease } from "../../renderer/src/transport/ElectronRpc.model.js";

const $TransportId = $DesktopId.create("main/ipc/Publication.service");

/**
 * Runs one source-owned recipient step, preserving legacy listener order and isolating migrated delivery and reporting failures so later legacy recipients still run.
 *
 * **Example** (Use publishRecipient with its owner)
 *
 * ```ts
 * import { publishRecipient } from "./Publication.service.js"
 * import * as Effect from "effect/Effect"
 * const delivered: string[] = [];
 * export const publish = publishRecipient({ value: "update", legacy: (value) => { delivered.push(value); }, migrated: () => Effect.void, report: () => Effect.void }).pipe(Effect.as(delivered));
 * // Running publish yields ["update"] after the legacy recipient has been called.
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const publishRecipient = Effect.fn("Publication.recipient")(function* <A>(input: {
  readonly value: A;
  readonly legacy?: (value: A) => void;
  readonly migrated?: (value: A) => Effect.Effect<void>;
  readonly report: (cause: import("effect/Cause").Cause<never>) => Effect.Effect<void>;
}) {
  // The original exception still stops the original publisher at this point.
  if (input.legacy !== undefined) yield* Effect.sync(() => input.legacy?.(input.value));
  if (input.migrated !== undefined)
    yield* Effect.suspend(() => input.migrated?.(input.value) ?? Effect.void).pipe(
      Effect.catchCause((cause) => Effect.suspend(() => input.report(cause)).pipe(Effect.ignoreCause))
    );
});

/**
 * Captures an immutable, observation-preserving publication at the existing source send point; the returned release callback owns the snapshot charge until delivery or discard.
 *
 * **Example** (Use snapshotPublication with its owner)
 *
 * ```ts
 * import { snapshotPublication } from "./Publication.service.js"
 * import { makeRetentionLedger } from "../../renderer/src/transport/ElectronRpc.model.js";
 * export const captured = snapshotPublication({ value: { state: "ready" }, account: makeRetentionLedger().forWindow("window") });
 * if (captured._tag === "Success") captured.success.release();
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const snapshotPublication = <A>({
  value,
  account,
  staging,
}: {
  readonly value: A;
  readonly account: RetentionAccount;
  readonly staging?: RetentionLease;
}) => {
  const estimated = measureValue(value);
  const retained =
    staging ??
    account.reserve(estimated === undefined ? 64 * 1024 * 1024 : Math.min(64 * 1024 * 1024, estimated * 4 + 4096));
  if (retained === undefined) return Result.fail(failure("ObservationCapacity"));
  const codec = RpcSerialization.json
    .codecFor(ObservedValue)
    .pipe($TransportId.annoteSchema("codec", { description: "codec boundary in the desktop transport contract." }));
  const freeze = (value: unknown): void => {
    if (!P.isObjectOrArray(value)) return;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor !== undefined && "value" in descriptor) {
        const child: unknown = descriptor.value;
        freeze(child);
        Reflect.defineProperty(value, key, { ...descriptor, writable: false, configurable: false });
      }
    }
    Reflect.preventExtensions(value);
  };
  const result = S.encodeUnknownResult(codec)(value).pipe(
    Result.flatMap((wire) => S.decodeUnknownResult(codec)(wire).pipe(Result.map((copy) => ({ wire, copy })))),
    Result.flatMap(({ wire, copy }) => {
      const bytes = measureValue(wire);
      if (bytes === undefined || bytes > retained.bytes()) return Result.fail(failure("ObservationCapacity"));
      const checked = S.decodeUnknownResult(
        S.declare((copy: unknown): copy is A => sameObservation({ left: value, right: copy }))
      )(copy);
      return checked.pipe(
        Result.mapError(() => failure("ObservationEncodingFailed")),
        Result.map((copy) => {
          freeze(copy);
          retained.resize(bytes);
          return { value: copy, bytes, release: retained.release };
        })
      );
    }),
    Result.mapError(() => failure("ObservationEncodingFailed"))
  );
  if (Result.isFailure(result)) retained.release();
  return result;
};
