import { readFileSync } from 'node:fs'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import { SubscriptionTimers } from '@vidbee/subscriptions-core/SubscriptionTimers.service'
import { layer as Timers } from '@vidbee/subscriptions-core/SubscriptionTimers.layer'
import { layer as Dispatch } from '@vidbee/subscriptions-core/SubscriptionDispatch.layer'

const expected = readFileSync(new URL('../../../../.node-version', import.meta.url), 'utf8').trim().replace(/^v/, '')
if (process.versions.node !== expected || process.versions.bun !== undefined) {
  throw new Error('Native timer liveness requires the repository-pinned Node')
}
const mode = process.argv[2]
if (mode !== 'after' && mode !== 'every') throw new Error('Unknown native timer mode')
const events: string[] = []
const runtime = ManagedRuntime.make(Timers.pipe(Layer.provide(Dispatch)))
let finish: () => void = () => { throw new Error('Timer completion was not initialized') }
const completed = new Promise<void>(resolve => { finish = resolve })
let ticks = 0
const command = {
  run: Effect.sync(() => {
    events.push('fired')
    if (++ticks === (mode === 'every' ? 2 : 1)) finish()
  })
}
const cancel = await runtime.runPromise(Effect.flatMap(SubscriptionTimers, timers =>
  mode === 'every' ? timers.every(10, command) : timers.after(10, command)))
events.push('ready')
await completed
await runtime.runPromise(cancel)
await runtime.dispose()
events.push('released')
process.once('beforeExit', () => {
  events.push('beforeExit')
  process.stdout.write(JSON.stringify({ mode, events }))
})
