import * as Effect from 'effect/Effect'
import {runLegacySync,runLegacyPromise} from '@vidbee/task-queue-legacy/runtime'
import {CaptionExtraction} from '../../transcription/src/CaptionExtraction.service'
import {captionRuntime} from './bridge/caption-runtime'
import {transcriptionCause} from './bridge/errors'
export interface ExtractedCaptionTrack {language:string|null;text:string;title?:string}
export const ffprobePathFromFfmpeg=(ffmpegPath:string):string=>runLegacySync(captionRuntime,Effect.map(CaptionExtraction,service=>service.probePath(ffmpegPath)),transcriptionCause)
export const extractEmbeddedCaptionTracks=(input:{ffmpegPath:string;filePath:string;preferredLanguages?:string[]}):Promise<ExtractedCaptionTrack[]>=>runLegacyPromise(captionRuntime,Effect.flatMap(CaptionExtraction,service=>service.extract(input)),transcriptionCause)
