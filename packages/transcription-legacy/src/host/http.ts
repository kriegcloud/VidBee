import { Writable, Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { ModelHttp } from '../../../transcription/src/ModelHttp.service'
import { HostFailure } from '../../../transcription/src/Transcription.errors'
import { fetchFirstOk } from '../download-mirrors'
const failure=(operation:string)=>(cause:unknown)=>HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})
export const legacyModelHttpLayer=(fetchImpl:typeof fetch,runChunk:(effect:Effect.Effect<void,HostFailure>,complete:(error?:unknown)=>void)=>void)=>Layer.succeed(ModelHttp,{
 request:spec=>Effect.tryPromise({try:async()=>{
  const init=spec.method==='HEAD'?(spec.signal?{method:'HEAD',signal:spec.signal}:{method:'HEAD'}):spec.signal?{signal:spec.signal}:undefined
  const {response}=await fetchFirstOk([spec.url],fetchImpl,init,spec.timeoutMs??15000)
  return {
   originalResponse:response,status:response.status,ok:response.ok,contentLength:response.headers.get('content-length'),hasBody:Boolean(response.body),
   consume:sink=>Effect.tryPromise({try:async()=>{
    if(response.body===null)return
    const destination=new Writable({write(chunk,_encoding,complete){
     runChunk(sink(chunk),error=>complete(error instanceof Error?error:error===undefined?undefined:new Error(String(error))))
    }})
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>),destination,spec.signal?{signal:spec.signal}:{})
   },catch:failure('body')}),
  }
 },catch:failure('request')}),
})
