import { createWriteStream } from 'node:fs'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as Cause from 'effect/Cause'
import type * as ManagedRuntime from 'effect/ManagedRuntime'
import { runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { MediaTransport } from '../../browser-capture/src/MediaTransport.service.js'
import { HostFailure } from '../../browser-capture/src/Capture.errors.js'
async function* readBody(body:ReadableStream<Uint8Array>):AsyncGenerator<Uint8Array> {
  const reader=body.getReader()
  try { while(true) { const chunk=await reader.read();if(chunk.done)return;yield chunk.value } }
  finally { reader.releaseLock() }
}
const failure=(operation:string)=>(cause:unknown)=>HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})
export const makeMediaTransportLayer=<R,E>(runtime:()=>ManagedRuntime.ManagedRuntime<R,E>,mapError:(cause:Cause.Cause<E>)=>unknown)=>Layer.succeed(MediaTransport,{
  open:(url,referer,signal)=>Effect.tryPromise({try:async()=> {
    const response=await fetch(url,{headers:{Referer:referer},redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(30*60*1000)])})
    return {release:Effect.void,ok:response.ok,status:response.status,hasBody:response.body!==null,contentType:response.headers.get('content-type'),contentLength:response.headers.get('content-length'),copy:(path:string,signal:AbortSignal,sink:{emit:(bytes:number,total:number)=>Effect.Effect<void>})=>Effect.tryPromise({try:async()=>{
      const body=response.body
      if(!body)throw new Error('Media body is unavailable.')
      let bytes=0
      const total=Number(response.headers.get('content-length'))||0
      const meter=new Transform({transform(chunk:Buffer,_encoding,callback){bytes+=chunk.length;runLegacySync(runtime(),sink.emit(bytes,total),mapError);callback(null,chunk)}})
      await pipeline(Readable.from(readBody(body)),meter,createWriteStream(path),{signal})
      return {bytes,total}
    },catch:failure('copy media')})}
  },catch:failure('open media')})
})
