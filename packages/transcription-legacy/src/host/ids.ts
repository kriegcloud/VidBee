import {randomUUID,randomBytes} from 'node:crypto'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import {TranscriptionIds} from '../../../transcription/src/TranscriptionIds.service'
export const TranscriptionIdsLegacy = Layer.succeed(TranscriptionIds,{
 uuid:Effect.sync(()=>randomUUID()),
 hex:(bytes:number)=>Effect.sync(()=>randomBytes(bytes).toString('hex')),
})
