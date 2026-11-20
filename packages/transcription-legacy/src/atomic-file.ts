import * as Effect from 'effect/Effect'
import {AtomicFiles} from '../../transcription/src/AtomicFiles.service'
import {runStateless} from './bridge/stateless'
export const atomicStagingPath=(filePath:string):string=>runStateless(Effect.flatMap(AtomicFiles,files=>files.stagingPath(filePath)))
export const publishAtomicFile=(temporary:string,destination:string):void=>runStateless(Effect.flatMap(AtomicFiles,files=>files.publish(temporary,destination)))
export const atomicWriteFile=(filePath:string,contents:string|Uint8Array):void=>runStateless(Effect.flatMap(AtomicFiles,files=>files.write(filePath,contents)))
export const atomicWriteJson=(filePath:string,value:unknown):void=>atomicWriteFile(filePath,JSON.stringify(value))
