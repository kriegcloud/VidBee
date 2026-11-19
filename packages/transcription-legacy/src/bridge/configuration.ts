import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import {transcriptionCause} from './errors'
const runtime=ManagedRuntime.make(Layer.succeed(Scheduler.PreventSchedulerYield,true))
runtime.runSync(Effect.void)
export const runConfiguration=<A,E>(effect:Effect.Effect<A,E>):A=>runLegacySync(runtime,effect,transcriptionCause)
