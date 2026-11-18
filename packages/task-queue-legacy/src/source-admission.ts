import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Option from 'effect/Option'
import { makeState, layerFromShared } from '@vidbee/task-queue/SourceAdmission.layer'
export class SourceAdmission {
  private readonly listeners = new WeakMap<()=>void,Effect.Effect<void>>()
  readonly state = makeState()
  private readonly runtime = ManagedRuntime.make(layerFromShared(this.state))
  subscribe(listener:()=>void):()=>void {
    let effect=this.listeners.get(listener)
    if(effect===undefined){effect=Effect.sync(listener);this.listeners.set(listener,effect)}
    return this.runtime.runSync(this.state.subscribe(effect))
  }
  tryAcquire(url:string):(()=>void)|null {
    const acquired=this.runtime.runSync(this.state.tryAcquire(url))
    return Option.isSome(acquired)?()=>this.runtime.runSync(acquired.value):null
  }
  acquire(url:string,signal?:AbortSignal):Promise<(()=>void)|null> {
    if(signal?.aborted)return Promise.resolve(null)
    return new Promise((resolve,reject)=> {
      const fiber=this.runtime.runFork(this.state.acquire(url))
      const abort=()=>fiber.interruptUnsafe()
      signal?.addEventListener('abort',abort,{once:true})
      fiber.addObserver(exit=> {
        signal?.removeEventListener('abort',abort)
        if(Exit.isSuccess(exit))resolve(()=>this.runtime.runSync(exit.value))
        else if(signal?.aborted)resolve(null)
        else reject(exit.cause)
      })
    })
  }
}
