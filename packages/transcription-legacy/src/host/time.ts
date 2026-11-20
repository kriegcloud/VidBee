import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { TranscriptionTime } from '../../../transcription/src/TranscriptionTime.service'
import type { HostFailure } from '../../../transcription/src/Transcription.errors'
export const legacyTimeLayer = (runAction: (action: Effect.Effect<void,HostFailure>) => void) => Layer.succeed(TranscriptionTime, {
 now: Effect.sync(() => Date.now()),
 monotonicMillis: Effect.sync(() => performance.now()),
 readMonotonicMillis: () => performance.now(),
 sleep: (ms:number) => Effect.promise(()=>new Promise<void>(resolve=>{setTimeout(resolve,ms)})),
 after: (ms,action,options) => Effect.sync(()=>{ const timer=setTimeout(()=>runAction(action),ms); if(!options.keepAlive)timer.unref(); return Effect.sync(()=>clearTimeout(timer)) }),
 every: (ms,action,options) => Effect.sync(()=>{ const timer=setInterval(()=>runAction(action),ms); if(!options.keepAlive)timer.unref(); return Effect.sync(()=>clearInterval(timer)) }),
 microtask: action => Effect.sync(()=>queueMicrotask(()=>runAction(action))),
})
