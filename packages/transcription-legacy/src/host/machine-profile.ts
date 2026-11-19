import {cpus,totalmem} from 'node:os'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import {makeService} from '../../../transcription/src/MachineProfiles.layer'
import {MachineProfiles} from '../../../transcription/src/MachineProfiles.service'
import {HostFailure} from '../../../transcription/src/Transcription.errors'
const attempt=<A>(operation:string,read:()=>A)=>Effect.try({try:read,catch:cause=>HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})})
export const machineProfilesLegacy=makeService({platform:Effect.sync(()=>process.platform),arch:Effect.sync(()=>process.arch),ramBytes:attempt('totalmem',()=>totalmem()),cpuCount:attempt('cpus',()=>cpus().length),cpuModel:attempt('cpuModel',()=>cpus()[0]?.model)})
export const MachineProfilesLegacy=Layer.succeed(MachineProfiles,machineProfilesLegacy)
