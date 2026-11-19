import * as Effect from 'effect/Effect'
import * as Scheduler from 'effect/Scheduler'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import { makeCapturePlatformLayer } from './CapturePlatform.layer.js'
import { captureError } from './errors.js'
// Stateless host helpers share one warmed runtime. Stateful capture owners compose their own.
export const platformRuntime: ManagedRuntime.ManagedRuntime<Layer.Success<ReturnType<typeof makeCapturePlatformLayer>>, never> = ManagedRuntime.make(makeCapturePlatformLayer(() => platformRuntime, captureError).pipe(Layer.provideMerge(Layer.succeed(Scheduler.PreventSchedulerYield,true))))
platformRuntime.runSync(Effect.void)
