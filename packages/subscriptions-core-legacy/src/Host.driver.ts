import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Cause from 'effect/Cause'
import * as O from 'effect/Option'
import {SubscriptionTimers,type Operation} from '@vidbee/subscriptions-core/SubscriptionTimers.service'
import {SubscriptionDispatch} from '@vidbee/subscriptions-core/SubscriptionDispatch.service'
import {SubscriptionEntropy} from '@vidbee/subscriptions-core/SubscriptionEntropy.service'
import {SubscriptionLog} from '@vidbee/subscriptions-core/SubscriptionLog.service'
import {HostFailure} from '@vidbee/subscriptions-core/Subscriptions.errors'
import {ulid} from 'ulid'
import {randomUUID} from 'node:crypto'
export const message=(value:unknown):string=>value instanceof Error?value.message:String(value)
export const hostFailure=(original:unknown)=>HostFailure.make({original,legacyMessage:message(original)})
export const sync=<A>(run:()=>A):Effect.Effect<A,HostFailure>=>Effect.try({try:run,catch:hostFailure})
export const promise=<A>(run:()=>PromiseLike<A>):Effect.Effect<A,HostFailure>=>Effect.tryPromise({try:()=>Promise.resolve(run()),catch:hostFailure})
export const legacyError=(cause:Cause.Cause<unknown>):unknown=>{
 const failure=O.getOrUndefined(Cause.findErrorOption(cause))
 if(failure===undefined)return Cause.squash(cause)
 if(failure instanceof HostFailure)return failure.original
 if(failure!==null&&typeof failure==='object'&&'_tag' in failure){
  if(failure._tag==='FeedCancelled'&&'reason' in failure)return failure.reason
  if('original' in failure)return failure.original
  if('legacyMessage' in failure&&typeof failure.legacyMessage==='string'){
   const error=new Error(failure.legacyMessage)
   if(failure._tag==='DuplicateFeed'&&'duplicateOf' in failure)Reflect.set(error,'duplicateOf',failure.duplicateOf)
   return error
  }
 }
 return failure
}
export interface HostOptions {
 now?:()=>number
 log?:(level:'info'|'warn'|'error',msg:string,meta?:unknown)=>void
 after?:(callback:()=>void,ms:number)=>unknown
 clearAfter?:(handle:unknown)=>void
 every?:(callback:()=>void,ms:number)=>unknown
 clearEvery?:(handle:unknown)=>void
}
export const hostServices=(dispatch:(operation:Operation<void>)=>void,options:HostOptions={})=>{
 const now=options.now??(()=>Date.now()),log=options.log??(()=>undefined)
 const after=options.after??((callback,ms)=>setTimeout(callback,ms))
 const clearAfter=options.clearAfter??(handle=>clearTimeout(handle as ReturnType<typeof setTimeout>))
 const every=options.every??((callback,ms)=>setInterval(callback,ms))
 const clearEvery=options.clearEvery??(handle=>clearInterval(handle as ReturnType<typeof setInterval>))
 return {
  timers:SubscriptionTimers.of({
   now:sync(now),
   after:(ms,command)=>sync(()=>{const handle=after(()=>{dispatch(command.run)},ms);return sync(()=>clearAfter(handle))}),
   every:(ms,command)=>sync(()=>{const handle=every(()=>{dispatch(command.run)},ms);return sync(()=>{if(handle)clearEvery(handle)})}),
  }),
  dispatch:SubscriptionDispatch.of({detach:operation=>Effect.sync(()=>dispatch(operation))}),
  log:SubscriptionLog.of({write:(level,msg,meta,cause)=>sync(()=>log(level,msg,meta)).pipe(Effect.andThen(Effect.logDebug({level,msg,meta,cause})))}),
  entropy:SubscriptionEntropy.of({subscriptionId:sync(randomUUID),leaseId:sync(ulid),next:sync(()=>Math.random())}),
 }
}
export const hostLayers=(dispatch:(operation:Operation<void>)=>void,options:HostOptions={})=>{
 const services=hostServices(dispatch,options)
 return Layer.mergeAll(Layer.succeed(SubscriptionTimers,services.timers),Layer.succeed(SubscriptionDispatch,services.dispatch),Layer.succeed(SubscriptionLog,services.log),Layer.succeed(SubscriptionEntropy,services.entropy))
}
