import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";

/** Identity governs transport repair only; existing consumer hydration races are unchanged. */
export const makeRecovery = ({
  count = 4096,
  resources,
  bytes = 512 * 1024,
}: {
  readonly resources?: import("../transport/ElectronRpc.model.js").ResourceBudget;
  readonly count?: number;
  readonly bytes?: number;
} = {}) => {
  let current: object | undefined;
  let epoch = "";
  let spent = 0;
  let touched = HashSet.empty<string>();
  let watermarks = HashMap.empty<string, number>();
  let watermarkBytes = 0;
  let stale = false;
  let attemptLease: import("../transport/ElectronRpc.model.js").RetentionLease | undefined;
  let touchedLeases = HashMap.empty<string, import("../transport/ElectronRpc.model.js").RetentionLease>();
  let watermarkLeases = HashMap.empty<string, import("../transport/ElectronRpc.model.js").RetentionLease>();
  const retire = () => {
    current = undefined;
    attemptLease?.release();
    attemptLease = undefined;
    for (const lease of HashMap.values(touchedLeases)) lease.release();
    touchedLeases = HashMap.empty();
    touched = HashSet.empty();
    spent = 0;
  };
  const begin = (nextEpoch: string): object => {
    retire();
    if (epoch !== nextEpoch) {
      for (const lease of HashMap.values(watermarkLeases)) lease.release();
      watermarkLeases = HashMap.empty();
      watermarks = HashMap.empty();
      watermarkBytes = 0;
      stale = false;
    }
    epoch = nextEpoch;
    attemptLease = resources?.claim("repair", 256);
    if (resources !== undefined && attemptLease === undefined) return {};
    current = {};
    return current;
  };
  const accept = ({ attempt, nextEpoch }: { readonly attempt: object; readonly nextEpoch: string }) =>
    !stale && current === attempt && epoch === nextEpoch;
  const touch = (id: string) => {
    if (current === undefined || HashSet.has(touched, id)) return current !== undefined;
    const charge = id.length * 2 + 64;
    if (HashSet.size(touched) >= count || spent + charge > bytes) {
      retire();
      return false;
    }
    const lease = resources?.claim("repairEntry", charge);
    if (resources !== undefined && lease === undefined) {
      retire();
      return false;
    }
    if (lease !== undefined) touchedLeases = HashMap.set(touchedLeases, id, lease);
    touched = HashSet.add(touched, id);
    spent += charge;
    return true;
  };
  const watermark = ({ id, sequence }: { readonly id: string; readonly sequence: number }) => {
    if (stale || !Number.isSafeInteger(sequence) || sequence < 0) return false;
    if (!HashMap.has(watermarks, id)) {
      const charge = id.length * 2 + 80;
      if (HashMap.size(watermarks) >= count || watermarkBytes + charge > bytes) {
        stale = true;
        retire();
        return false;
      }
      const lease = resources?.claim("repairEntry", charge);
      if (resources !== undefined && lease === undefined) {
        stale = true;
        retire();
        return false;
      }
      if (lease !== undefined) watermarkLeases = HashMap.set(watermarkLeases, id, lease);
      watermarkBytes += charge;
    }
    const previous = HashMap.get(watermarks, id);
    if (previous._tag === "Some" && sequence < previous.value) return false;
    watermarks = HashMap.set(watermarks, id, sequence);
    return true;
  };
  return {
    dispose: () => {
      retire();
      for (const lease of HashMap.values(watermarkLeases)) lease.release();
      watermarkLeases = HashMap.empty();
      watermarks = HashMap.empty();
      watermarkBytes = 0;
      stale = true;
    },
    begin,
    accept,
    touch,
    retire,
    watermark,
    has: (id: string) => HashSet.has(touched, id),
    stats: () => ({
      touched: HashSet.size(touched),
      spent,
      watermarks: HashMap.size(watermarks),
      watermarkBytes,
      stale,
    }),
  };
};
