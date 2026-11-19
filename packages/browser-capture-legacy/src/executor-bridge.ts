import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import type * as ManagedRuntime from 'effect/ManagedRuntime'
import type { Executor, ExecutorEvents } from '@vidbee/task-queue-legacy'
import type { ExecutorSink, TaskExecutor } from '@vidbee/task-queue/TaskExecutor.service'
import { HostFailure } from '@vidbee/task-queue/TaskQueue.errors'
import { runLegacySync } from '@vidbee/task-queue-legacy/runtime'

const originalEvents = new WeakMap<ExecutorSink, ExecutorEvents>()

export const executorCallbacks = <R, E>(runtime: ManagedRuntime.ManagedRuntime<R,E>, sink: ExecutorSink, mapError: (cause: Cause.Cause<E>) => unknown): ExecutorEvents => originalEvents.get(sink) ?? ({
  onSpawn: event => runLegacySync(runtime,sink.emit({type:'spawn',...event}),mapError),
  onProgress: event => runLegacySync(runtime,sink.emit({type:'progress',...event}),mapError),
  onStd: event => runLegacySync(runtime,sink.emit({type:'std',...event}),mapError),
  onFinish: event => runLegacySync(runtime,sink.emit({type:'finish',...event}),mapError),
})
export const executorSink = (events: ExecutorEvents): ExecutorSink => {
  const sink: ExecutorSink = {emit: event => Effect.sync(() => {
  switch(event.type) {
    case 'spawn': { const {type,...value}=event;events.onSpawn(value);return }
    case 'progress': { const {type,...value}=event;events.onProgress(value);return }
    case 'std': { const {type,...value}=event;events.onStd(value);return }
    case 'finish': { const {type,...value}=event;events.onFinish(value);return }
    case 'processing': return
  }
})}
  originalEvents.set(sink, events)
  return sink
}
export const executorBridge = <R,E>(executor: Executor, runtime:()=>ManagedRuntime.ManagedRuntime<R,E>, mapError:(cause:Cause.Cause<E>)=>unknown):typeof TaskExecutor.Service => ({run:(ctx,sink)=>Effect.try({
  try:()=> {
    const handle=executor.run(ctx,executorCallbacks(runtime(),sink,mapError))
    const failure=(original:unknown)=>HostFailure.make({original,legacyMessage:original instanceof Error?original.message:String(original)})
    return {cancel:(timeout?:number)=>Effect.tryPromise({try:()=>handle.cancel(timeout),catch:failure}),pause:Effect.tryPromise({try:()=>handle.pause(),catch:failure})}
  },catch:original=>HostFailure.make({original,legacyMessage:original instanceof Error?original.message:String(original)})
})})
