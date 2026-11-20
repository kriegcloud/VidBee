import * as Effect from 'effect/Effect'
import {runLegacySync,runLegacyPromise} from '@vidbee/task-queue-legacy/runtime'
import {Audio} from '../../transcription/src/Audio.service'
import {audioRuntime} from './bridge/audio-runtime'
import {transcriptionCause} from './bridge/errors'
import {isReusableExtractedWav as reusable} from '../../transcription/src/audio'
export {TARGET_SAMPLE_RATE} from '../../transcription/src/audio'
export const isReusableExtractedWav=(wavMs:number,sourceMs:number):boolean=>reusable(wavMs,sourceMs)
export interface ExtractedAudio {wavPath:string;durationMs:number}
export interface PcmWave {sampleRate:number;samples:Float32Array}
/** Keep the legacy Promise boundary while entering the warmed audio owner immediately. */
export function extractMonoWav(input:{sourceFilePath:string;ffmpegPath:string;outputDir:string;signal?:AbortSignal}):Promise<ExtractedAudio>{
 return runLegacyPromise(audioRuntime,Effect.flatMap(Audio,audio=>audio.extract(input)),transcriptionCause)
}
/** The shared parser runs synchronously using Buffer-backed byte operations. */
export function readPcmWav(path:string):PcmWave{
 return runLegacySync(audioRuntime,Effect.flatMap(Audio,audio=>audio.readPcm(path)),transcriptionCause)
}
