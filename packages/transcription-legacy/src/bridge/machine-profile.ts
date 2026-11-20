import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import {MachineProfilesLegacy} from '../host/machine-profile'
import {transcriptionCause} from './errors'
import type {MachineProfiles} from '../../../transcription/src/MachineProfiles.service'
const runtime=ManagedRuntime.make(Layer.mergeAll(MachineProfilesLegacy,Layer.succeed(Scheduler.PreventSchedulerYield,true)))
runtime.runSync(Effect.void)
export const runMachineProfile=<A,E>(effect:Effect.Effect<A,E,MachineProfiles>):A=>runLegacySync(runtime,effect,transcriptionCause)
