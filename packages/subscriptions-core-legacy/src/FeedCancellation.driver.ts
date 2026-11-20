import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import {
  FeedCancellation,
  type FeedCancellationToken,
  type OwnedFeedCancellation,
} from '@vidbee/subscriptions-core/FeedCancellation.service'
import { FeedCancelled } from '@vidbee/subscriptions-core/Subscriptions.errors'
import type { HostFailure } from '@vidbee/subscriptions-core/Subscriptions.errors'
import { sync } from './Host.driver.js'

/** Every bridge owner retains only weak references to its borrowed/owned signals. */
export const feedCancellationHost = (
  enter: (operation: Effect.Effect<void, HostFailure>) => void,
) => {
  const signals = new WeakMap<FeedCancellationToken, AbortSignal>()
  const tokenFor = (signal: AbortSignal): OwnedFeedCancellation => {
    const removers: Array<() => void> = []
    const snapshot = sync(() => ({ aborted: signal.aborted, reason: signal.reason }))
    const token: FeedCancellationToken = {
      snapshot,
      check: Effect.flatMap(snapshot, state => state.aborted
        ? Effect.fail(FeedCancelled.make({ reason: state.reason })) : Effect.void),
      subscribe: sink => Effect.suspend(() => {
        if (signal.aborted) return Effect.as(sink.emit(signal.reason), Effect.succeed(false))
        return sync(() => {
          let registered = true
          const listener = () => { enter(sink.emit(signal.reason)) }
          signal.addEventListener('abort', listener, { once: true })
          const remove = () => { signal.removeEventListener('abort', listener) }
          removers.push(remove)
          return Effect.sync(() => {
            if (!registered) return false
            registered = false
            remove()
            const index = removers.indexOf(remove)
            if (index >= 0) removers.splice(index, 1)
            return true
          })
        })
      }),
    }
    signals.set(token, signal)
    return {
      token,
      // Borrowed signals cannot be aborted by this bridge.
      abort: () => Effect.void,
      dispose: sync(() => { for (const remove of removers.splice(0)) remove() }),
    }
  }
  const make = Effect.sync(() => {
    const controller = new AbortController()
    const owned = tokenFor(controller.signal)
    return { ...owned, abort: (reason: unknown) => sync(() => controller.abort(reason)) }
  })
  return {
    layer: Layer.succeed(FeedCancellation, { make }),
    borrow: (signal: AbortSignal) => tokenFor(signal),
    signalFor: (token: FeedCancellationToken): AbortSignal => {
      const signal = signals.get(token)
      if (signal === undefined) throw new Error('Feed cancellation token belongs to another owner')
      return signal
    },
  }
}
