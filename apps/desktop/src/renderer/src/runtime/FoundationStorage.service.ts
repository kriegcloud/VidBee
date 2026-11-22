import * as HashMap from "effect/HashMap";
import * as O from "effect/Option";
import * as Result from "effect/Result";
import { ElectronRpcCapacityError } from "../transport/DocumentDelivery.errors.js";
import { measureValue } from "../transport/ElectronRpc.model.js";
import type * as Atom from "effect/reactivity/Atom";
import type * as AtomRegistry from "effect/reactivity/AtomRegistry";
import type { RetentionAccount, RetentionLease } from "../transport/ElectronRpc.model.js";

/** Charges retained atom snapshots and rollback references to the same document account as protocol frames. Replacement reserves the receiving snapshot before releasing its predecessor; close releases every captured ownership claim.
 * **Example** (Reserve a state replacement)
 * ```ts
 * import { makeFoundationStorage } from './FoundationStorage.service.js'
 * import { makeRetentionLedger } from '../transport/ElectronRpc.model.js'
 * import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
 * import * as Atom from 'effect/reactivity/Atom'
 * const registry=AtomRegistry.make()
 * const storage=makeFoundationStorage({registry,account:makeRetentionLedger().forWindow('sample'),report:()=>{}})
 * const state=Atom.make('old')
 * storage.write(state,'new')
 * storage.close();registry.dispose()
 * ```
 * @category services
 * @since 0.0.0
 */
export const makeFoundationStorage = ({
  registry,
  account,
  report,
}: {
  readonly registry: AtomRegistry.AtomRegistry;
  readonly account: RetentionAccount;
  readonly report: (failure: ElectronRpcCapacityError) => void;
}) => {
  let closed = false;
  let atoms = HashMap.empty<object, RetentionLease>();
  let rollbacks = HashMap.empty<number, RetentionLease>();
  let serial = 0;
  const reserve = (value: unknown) => {
    const bytes = measureValue(value);
    const retained = closed || bytes === undefined ? undefined : account.reserve(bytes);
    if (retained === undefined) {
      const error = ElectronRpcCapacityError.make({
        resource: "buffered bytes",
        scope: "document",
        message: "Foundation state capacity exceeded",
      });
      report(error);
      return Result.getOrThrowWith(Result.fail(error), (error) => error);
    }
    return retained;
  };
  const write = <A>(atom: Atom.Writable<A, A>, value: A) => {
    const previous = O.getOrUndefined(HashMap.get(atoms, atom));
    if (previous !== undefined && Object.is(registry.get(atom), value)) return;
    const next = reserve(value);
    // Publish ownership before registry notifications can reenter this writer.
    atoms = HashMap.set(atoms, atom, next);
    try {
      registry.set(atom, value);
    } finally {
      previous?.release();
    }
  };
  const hold = (value: unknown) => {
    if (serial >= Number.MAX_SAFE_INTEGER || HashMap.size(rollbacks) >= 1024) {
      const error = ElectronRpcCapacityError.make({
        resource: "buffered bytes",
        scope: "document",
        message: "Foundation rollback capacity exceeded",
      });
      report(error);
      return Result.getOrThrowWith(Result.fail(error), (error) => error);
    }
    const lease = reserve(value);
    const id = ++serial;
    rollbacks = HashMap.set(rollbacks, id, lease);
    const release = () => {
      const retained = HashMap.get(rollbacks, id);
      if (O.isSome(retained)) {
        retained.value.release();
        rollbacks = HashMap.remove(rollbacks, id);
      }
    };
    return { id, lease, release };
  };
  const capture = <A>(atom: Atom.Writable<A, A>, value: A) => {
    const held = hold(value);
    return {
      release: held.release,
      restore: () => {
        if (!HashMap.has(rollbacks, held.id)) return;
        const previous = O.getOrUndefined(HashMap.get(atoms, atom));
        atoms = HashMap.set(atoms, atom, held.lease);
        rollbacks = HashMap.remove(rollbacks, held.id);
        try {
          registry.set(atom, value);
        } finally {
          previous?.release();
        }
      },
    };
  };
  return {
    write,
    retain: (value: unknown) => hold(value).release,
    capture,
    close: () => {
      if (closed) return;
      closed = true;
      for (const lease of HashMap.values(atoms)) lease.release();
      for (const lease of HashMap.values(rollbacks)) lease.release();
      atoms = HashMap.empty();
      rollbacks = HashMap.empty();
    },
    stats: () => ({ atoms: HashMap.size(atoms), rollbacks: HashMap.size(rollbacks) }),
  };
};
