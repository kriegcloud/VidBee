import {open,readFile,writeFile,rename} from 'node:fs/promises'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import {CloudFileIO} from '../../../transcription/src/CloudTranscription.service'
import type {CloudSavedClip} from '../../../transcription/src/CloudRun.model'
import {HostFailure} from '../../../transcription/src/Transcription.errors'
import {sourceFingerprint} from '../chunk-manifest'
const failure=(cause:unknown)=>HostFailure.make({operation:'cloud-files',legacyMessage:cause instanceof Error?cause.message:String(cause),cause})
export const CloudFileIOLegacy=Layer.succeed(CloudFileIO,{
 fingerprint:path=>Effect.try({try:()=>sourceFingerprint(path),catch:failure}),
 load:(name,accountId)=>Effect.tryPromise({try:async()=>{
  let saved:{accountId:unknown;clips:CloudSavedClip[]}
  const save=async()=>{await writeFile(`${name}.tmp`,JSON.stringify(saved));await rename(`${name}.tmp`,name)}
  try{saved=JSON.parse(await readFile(name,'utf8')) as typeof saved}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;saved={accountId,clips:[]};await save()}
  return {accountId:Effect.try({try:()=>saved.accountId,catch:failure}),clipAt:(index:number)=>Effect.try({try:()=>saved.clips[index],catch:failure}),append:(clip:CloudSavedClip)=>Effect.try({try:()=>{saved.clips.push(clip)},catch:failure}),save:Effect.tryPromise({try:save,catch:failure})}
 },catch:failure}),
 open:name=>Effect.tryPromise({try:async()=>{const file=await open(name,'r');return {read:(bytes:Uint8Array,position:number)=>Effect.tryPromise({try:async()=>(await file.read(bytes,0,bytes.length,position)).bytesRead,catch:failure}),size:Effect.tryPromise({try:async()=>(await file.stat()).size,catch:failure}),close:Effect.tryPromise({try:()=>file.close(),catch:failure})}},catch:failure}),
})
