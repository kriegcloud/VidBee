import * as fs from 'node:fs'
import * as promises from 'node:fs/promises'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import {TranscriptionFiles} from '../../../transcription/src/TranscriptionFiles.service'
import {HostFailure} from '../../../transcription/src/Transcription.errors'
const failure=(operation:string)=>(cause:unknown)=>HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})
const sync=<A>(operation:string,body:()=>A)=>Effect.try({try:body,catch:failure(operation)})
const asyncOp=<A>(operation:string,body:()=>Promise<A>)=>Effect.tryPromise({try:body,catch:failure(operation)})
export const TranscriptionFilesLegacySync=Layer.succeed(TranscriptionFiles,{
 readBytes:path=>sync('readBytes',()=>fs.readFileSync(path)),
 readText:path=>sync('readText',()=>fs.readFileSync(path,'utf8')),
 stat:path=>sync('stat',()=>{const stat=fs.statSync(path);return {size:stat.size,mtimeMs:stat.mtimeMs,isFile:stat.isFile(),isDirectory:stat.isDirectory()}}),
 readDirectory:path=>sync('readDirectory',()=>fs.readdirSync(path)),
 exists:path=>Effect.sync(()=>fs.existsSync(path)),
 write:(path,data)=>sync('write',()=>fs.writeFileSync(path,data)),
 mkdir:(path,recursive)=>sync('mkdir',()=>{fs.mkdirSync(path,{recursive})}),
 rename:(source,target)=>sync('rename',()=>fs.renameSync(source,target)),
 remove:(path,recursive,force)=>sync('remove',()=>fs.rmSync(path,{recursive,force})),
 openRead:path=>sync('openRead',()=>{const fd=fs.openSync(path,'r');let closed=false;return {
  readAt:(buffer,offset,length,position)=>sync('readAt',()=>fs.readSync(fd,buffer,offset,length,position)),
  close:sync('close',()=>{if(!closed){closed=true;fs.closeSync(fd)}}),
 }}),
})
export const TranscriptionFilesLegacyAsync=Layer.succeed(TranscriptionFiles,{
 readBytes:path=>asyncOp('readBytes',()=>promises.readFile(path)),
 readText:path=>asyncOp('readText',()=>promises.readFile(path,'utf8')),
 stat:path=>asyncOp('stat',async()=>{const stat=await promises.stat(path);return {size:stat.size,mtimeMs:stat.mtimeMs,isFile:stat.isFile(),isDirectory:stat.isDirectory()}}),
 readDirectory:path=>asyncOp('readDirectory',()=>promises.readdir(path)),
 exists:path=>Effect.sync(()=>fs.existsSync(path)),
 write:(path,data)=>asyncOp('write',()=>promises.writeFile(path,data)),
 mkdir:(path,recursive)=>asyncOp('mkdir',async()=>{await promises.mkdir(path,{recursive})}),
 rename:(source,target)=>asyncOp('rename',()=>promises.rename(source,target)),
 remove:(path,recursive,force)=>asyncOp('remove',()=>promises.rm(path,{recursive,force})),
 openRead:path=>asyncOp('openRead',async()=>{const file=await promises.open(path,'r');return {
  readAt:(buffer,offset,length,position)=>asyncOp('readAt',async()=>(await file.read(buffer,offset,length,position)).bytesRead),
  close:asyncOp('close',()=>file.close()),
 }}),
})
