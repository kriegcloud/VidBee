import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";

/** Identity governs transport repair only; existing consumer hydration races are unchanged. */
export const makeRecovery = ({
  count = 4096,
  bytes = 512 * 1024,
}: {
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
  const retire = () => {
    current = undefined;
    touched = HashSet.empty();
    spent = 0;
  };
  const begin = (nextEpoch: string): object => {
    retire();
    epoch = nextEpoch;
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
      watermarkBytes += charge;
    }
    watermarks = HashMap.set(watermarks, id, sequence);
    return true;
  };
  return {
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
