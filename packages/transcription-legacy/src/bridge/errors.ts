import * as Cause from 'effect/Cause'
import * as Option from 'effect/Option'
import * as Errors from '../../../transcription/src/Transcription.errors'
export const transcriptionCause=(cause:Cause.Cause<unknown>):unknown=>{
 const found=Cause.findErrorOption(cause)
 if(Option.isNone(found))return Cause.squash(cause)
 const error=found.value
 if(error instanceof Errors.HostFailure)return error.cause
 if(error instanceof Errors.BoundaryDecodeError)return new Error(`Invalid transcription data at ${error.operation}.`)
 if(error instanceof Errors.SourceUnavailable||error instanceof Errors.AudioFailure||error instanceof Errors.ModelUnavailable||error instanceof Errors.ModelBusy||error instanceof Errors.ModelIntegrityFailure||error instanceof Errors.RuntimeUnavailable||error instanceof Errors.WorkerUnexpectedExit||error instanceof Errors.WorkerFailure||error instanceof Errors.CheckpointFailure||error instanceof Errors.TranscriptUnavailable){
  return new Error(error.legacyMessage)
 }
 return error
}
