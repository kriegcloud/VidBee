import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as S from "effect/Schema";
import { failure } from "../../renderer/src/transport/DocumentDelivery.errors.js";
import { measureValue } from "../../renderer/src/transport/ElectronRpc.model.js";
import { sameObservation } from "../../renderer/src/transport/RpcCensus.model.js";
import { ObservedValue } from "../../renderer/src/transport/RpcObservation.model.js";
import type { RetentionAccount, RetentionLease } from "../../renderer/src/transport/ElectronRpc.model.js";

/** Invoke at one existing recipient-send point. Listener traversal stays with its source owner. */
export const publishRecipient = Effect.fn("Publication.recipient")(function* <A>(input: {
  readonly value: A;
  readonly legacy?: (value: A) => void;
  readonly migrated?: (value: A) => Effect.Effect<void>;
  readonly report: (cause: import("effect/Cause").Cause<never>) => Effect.Effect<void>;
}) {
  // The original exception still stops the original publisher at this point.
  if (input.legacy !== undefined) yield* Effect.sync(() => input.legacy?.(input.value));
  if (input.migrated !== undefined) yield* input.migrated(input.value).pipe(Effect.catchCause(input.report));
});

/** Called synchronously at the source's existing recipient-send point, before later listeners. */
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
  const codec = RpcSerialization.json.codecFor(ObservedValue);
  const freeze = (value: unknown): void => {
    if (value === null || typeof value !== "object") return;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor !== undefined && "value" in descriptor) {
        const child: unknown = descriptor.value;
        freeze(child);
      }
    }
    Object.freeze(value);
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
