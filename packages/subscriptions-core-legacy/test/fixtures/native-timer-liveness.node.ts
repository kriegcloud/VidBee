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
if (!['after','every','every-backward','every-forward'].includes(mode ?? '')) throw new Error('Unknown native timer mode')
const events: string[] = []
const runtime = ManagedRuntime.make(Timers.pipe(Layer.provide(Dispatch)))
let finish: () => void = () => { throw new Error('Timer completion was not initialized') }
const completed = new Promise<void>(resolve => { finish = resolve })
const originalNow = Date.now
let ticks = 0
const command = {
  run: Effect.sync(() => {
    events.push('fired')
    ++ticks
    if(ticks===1 && mode==='every-backward')Date.now=()=>originalNow()-300000
    if(ticks===1 && mode==='every-forward')Date.now=()=>originalNow()+3600000
    if (ticks === (mode?.startsWith('every') ? 2 : 1)) { if(mode==='every-forward')setTimeout(finish,0); else finish() }
  })
}
const cancel = await runtime.runPromise(Effect.flatMap(SubscriptionTimers, timers =>
  mode?.startsWith('every') ? timers.every(10, command) : timers.after(10, command)))
events.push('ready')
await completed
Date.now=originalNow
await runtime.runPromise(cancel)
await runtime.dispose()
events.push('released')
process.once('beforeExit', () => {
  events.push('beforeExit')
  process.stdout.write(JSON.stringify({ mode, events }))
})
