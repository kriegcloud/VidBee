import { cpus, totalmem, tmpdir } from 'node:os'
import {createRequire} from 'node:module'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import {lowerChildPriority} from '@vidbee/task-queue-legacy/process'
import {TranscriptionHost,TranscriptionHostPrimitives} from '../../../transcription/src/TranscriptionHost.service'
import {HostFailure} from '../../../transcription/src/Transcription.errors'
import {machineProfilesLegacy} from './machine-profile'
import {existsSync} from 'node:fs'
import {dirname,join} from 'node:path'
const require=createRequire(import.meta.url)
const resolveSherpaLibraryDir=():string|null=>{
 const id=`sherpa-onnx-${process.platform==='win32'?'win':process.platform}-${process.arch}`
 try{return dirname(require.resolve(`${id}/package.json`))}catch{}
 try{const nodeDir=dirname(require.resolve('sherpa-onnx-node/package.json'));const sibling=join(nodeDir,'..',id);if(existsSync(join(sibling,'package.json')))return sibling}catch{}
 return null
}
const sherpaWorkerEnv=(extra?:NodeJS.ProcessEnv,opts?:{electronAsNode?:boolean}):NodeJS.ProcessEnv=>{
 const env={...process.env,...extra};if(opts?.electronAsNode!==false)env.ELECTRON_RUN_AS_NODE='1';const dir=resolveSherpaLibraryDir();if(!dir)return env
 if(process.platform==='darwin')env.DYLD_LIBRARY_PATH=[dir,env.DYLD_LIBRARY_PATH].filter(Boolean).join(':')
 if(process.platform==='linux')env.LD_LIBRARY_PATH=[dir,env.LD_LIBRARY_PATH].filter(Boolean).join(':')
 if(process.platform==='win32')env.PATH=[dir,env.PATH].filter(Boolean).join(';')
 return env
}

const attempt=<A>(operation:string,body:()=>A)=>Effect.try({try:body,catch:cause=>HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})})
const intl=(key:'locale'|'timeZone')=>{try{return Intl.DateTimeFormat().resolvedOptions()[key]??''}catch{return ''}}
const snapshot=attempt('snapshot',()=>{const resources:unknown=Reflect.get(process,'resourcesPath');return ({
 platform:process.platform,arch:process.arch,pid:process.pid,execPath:process.execPath,cwd:process.cwd(),temporaryDirectory:tmpdir(),
 resourceDirectories:[...(typeof resources==='string'?[resources]:[])],environment:{...process.env},
 cpuModel:cpus()[0]?.model??'',cpuCount:Math.max(1,cpus().length),ramBytes:totalmem(),locale:intl('locale'),timeZone:intl('timeZone'),
})})
const lowerPriority=(pid:number)=>attempt('lowerPriority',()=>lowerChildPriority(pid))
const isProcessAlive=(pid:number)=>Effect.sync(()=>{if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true}catch(error){return !(error!==null&&typeof error==='object'&&'code' in error&&error.code==='ESRCH')}})
export const TranscriptionHostPrimitivesLegacy=Layer.succeed(TranscriptionHostPrimitives,{
 snapshot,lowerPriority,isProcessAlive,resolveModule:(id:string)=>attempt('resolveModule',()=>require.resolve(id)),
})
export const TranscriptionHostLegacy=Layer.succeed(TranscriptionHost,{
 snapshot,lowerPriority,isProcessAlive,
 libraryDirectory:attempt('libraryDirectory',()=>resolveSherpaLibraryDir()),
 workerEnvironment:(extra,electronAsNode)=>attempt('workerEnvironment',()=>sherpaWorkerEnv(extra,{electronAsNode})),
 machine:machineProfilesLegacy.read,
})
