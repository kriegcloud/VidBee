import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import {CaptionFiles} from '../../../transcription/src/CaptionFiles.service'
import {HostFailure} from '../../../transcription/src/Transcription.errors'
import {findSidecarCaptionTracks,isMachineCaptionPath,languageFromSidecarName,isImportableCaptionTrack,pickCaptionTrack} from '../captions'
const failure=(cause:unknown)=>HostFailure.make({operation:'caption-files',legacyMessage:'Caption file operation failed',cause})
export const CaptionFilesLegacy=Layer.succeed(CaptionFiles,{
 findSidecar:source=>Effect.try({try:()=>findSidecarCaptionTracks(source),catch:failure}),
 isMachinePath:path=>Effect.try({try:()=>isMachineCaptionPath(path),catch:failure}),
 languageFromName:(name,stem)=>Effect.try({try:()=>languageFromSidecarName(name,stem),catch:failure}),
 importable:track=>Effect.try({try:()=>isImportableCaptionTrack(track),catch:failure}),
 pick:(tracks,preferred)=>Effect.try({try:()=>pickCaptionTrack(tracks,preferred),catch:failure}),
})
