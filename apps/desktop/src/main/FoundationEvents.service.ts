import * as HashMap from "effect/HashMap";
import * as O from "effect/Option";
import * as Result from "effect/Result";
import { failure } from "../renderer/src/transport/DocumentDelivery.errors.js";
import type { YtDlpKernelStatus } from "../shared/types/ytdlp-kernel.js";

/** Foundation source events are emitted at the existing native recipient step; account selects a particular window rather than caching a recipient set.
 * @category type-level
 * @since 0.0.0
 */
export interface FoundationEventValues {
  readonly home: undefined;
  readonly kernel: YtDlpKernelStatus;
  readonly settings: undefined;
}
const makeSource = <A>() => {
  let serial = 0;
  let listeners = HashMap.empty<number, { readonly account: string; readonly receive: (value: A) => void }>();
  const listen = (account: string, receive: (value: A) => void) => {
    if (HashMap.size(listeners) >= 16384 || serial >= Number.MAX_SAFE_INTEGER)
      return Result.getOrThrowWith(Result.fail(failure("SourceListenerCapacity")), (error) => error);
    const id = ++serial;
    listeners = HashMap.set(listeners, id, { account, receive });
    return () => {
      listeners = HashMap.remove(listeners, id);
    };
  };
  const publish = (account: string, value: A) => {
    const current = listeners;
    for (const [id, listener] of current) {
      if (listener.account === account && O.isSome(HashMap.get(listeners, id))) listener.receive(value);
    }
  };
  return { listen, publish, size: () => HashMap.size(listeners) };
};
/** Maintains bounded source listeners without replaying events. Each source registration owns its release callback and the transport charges that callback to the document budget.
 * **Example** (Install and release an invalidation listener)
 * ```ts
 * import { makeFoundationEvents } from './FoundationEvents.service.js'
 * const events=makeFoundationEvents()
 * const observed:undefined[]=[]
 * const release=events.settings.listen('window',value=>observed.push(value))
 * events.settings.publish('window',undefined)
 * release()
 * observed.length // => 1
 * ```
 * @category services
 * @since 0.0.0
 */
export const makeFoundationEvents = () => ({
  settings: makeSource<undefined>(),
  kernel: makeSource<YtDlpKernelStatus>(),
  home: makeSource<undefined>(),
});
