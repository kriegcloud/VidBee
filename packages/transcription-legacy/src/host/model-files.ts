import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { ModelFileIO } from '../../../transcription/src/ModelFiles.service'
import { HostFailure } from '../../../transcription/src/Transcription.errors'
const execFileAsync = promisify(execFile)
const failure = (operation: string) => (cause: unknown) => HostFailure.make({ operation, cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) })
export const legacyModelFileIOLayer = (runChunk: (effect: Effect.Effect<void,HostFailure>) => void) => Layer.succeed(ModelFileIO, {
  readManifest: name => Effect.tryPromise({try: () => readFile(name), catch:failure('readManifest')}),
  parseJson: text => Effect.try({try:()=>JSON.parse(text) as unknown,catch:failure('parseJson')}),
  digest: bytes => Effect.sync(() => createHash('sha256').update(bytes).digest('hex')),
  stream: (response,name,signal,verify,chunk) => Effect.tryPromise({try:async()=>{
    const body=response.originalResponse?.body
    if(body==null)throw new Error('legacy model stream requires its original Response body')
    const hash=verify?createHash('sha256'):undefined
    const counter=new Transform({transform(bytes:Buffer,_encoding,complete){
      hash?.update(bytes)
      runChunk(chunk(bytes))
      complete(null,bytes)
    }})
    await pipeline(Readable.fromWeb(body as import('node:stream/web').ReadableStream<Uint8Array>),counter,createWriteStream(name),signal?{signal}:{})
    return hash?.digest('hex')
  },catch:failure('modelStream')}),
  extract: (archive,staging,signal) => Effect.tryPromise({try:()=>execFileAsync('tar',['-xjf',archive,'-C',staging],signal?{signal}:{}).then(()=>undefined),catch:failure('extractArchive')}),
})
