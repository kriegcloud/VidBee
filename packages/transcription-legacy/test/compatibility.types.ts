/** Frozen declarations were emitted from the unchanged pre-port source, with no assertion changes. */
import type * as Original from './contracts/original-public/index'
import type * as Current from '../src/index'
type Assignable<A extends B,B>=A
type PublicBinding<T>=T extends abstract new(...args:infer Args)=>infer Instance?abstract new(...args:Args)=>Pick<Instance,keyof Instance>:T
// These signatures contain private class identities from separate module graphs.
// Their public methods and call sites are checked below; nominal identity is not portable.
type NominalEdges='resolveAsrModelPaths'|'tryRecognizerConfig'|'AutoTranscriptionCoordinator'|'SherpaTranscriptionPipeline'|'TranscriptionExecutor'|'commitCaptionTrack'|'importCaptionsForDownload'|'importSidecarCaptionsIfPresent'|'switchToCaptionLanguage'|'startMinimalModelFill'|'enqueueTranscription'
type PublicModule<T>={[K in Exclude<keyof T,NominalEdges>]:PublicBinding<T[K]>}
export type CurrentToOriginal=Assignable<PublicModule<typeof Current>,PublicModule<typeof Original>>
export type OriginalToCurrent=Assignable<PublicModule<typeof Original>,PublicModule<typeof Current>>
type PublicInstance<T extends abstract new(...args:never[])=>unknown>=Pick<InstanceType<T>,keyof InstanceType<T>>
export type ModelMethodsForward=Assignable<PublicInstance<typeof Current.ModelManager>,PublicInstance<typeof Original.ModelManager>>
export type ModelMethodsBackward=Assignable<PublicInstance<typeof Original.ModelManager>,PublicInstance<typeof Current.ModelManager>>
export type StoreMethodsForward=Assignable<PublicInstance<typeof Current.TranscriptStore>,PublicInstance<typeof Original.TranscriptStore>>
export type StoreMethodsBackward=Assignable<PublicInstance<typeof Original.TranscriptStore>,PublicInstance<typeof Current.TranscriptStore>>
export type MemoryMethodsForward=Assignable<PublicInstance<typeof Current.MemoryTranscriptStore>,PublicInstance<typeof Original.MemoryTranscriptStore>>
export type MemoryMethodsBackward=Assignable<PublicInstance<typeof Original.MemoryTranscriptStore>,PublicInstance<typeof Current.MemoryTranscriptStore>>
export type ExecutorMethodsForward=Assignable<PublicInstance<typeof Current.TranscriptionExecutor>,PublicInstance<typeof Original.TranscriptionExecutor>>
export type ExecutorMethodsBackward=Assignable<PublicInstance<typeof Original.TranscriptionExecutor>,PublicInstance<typeof Current.TranscriptionExecutor>>
export type CoordinatorMethodsForward=Assignable<PublicInstance<typeof Current.AutoTranscriptionCoordinator>,PublicInstance<typeof Original.AutoTranscriptionCoordinator>>
export type CoordinatorMethodsBackward=Assignable<PublicInstance<typeof Original.AutoTranscriptionCoordinator>,PublicInstance<typeof Current.AutoTranscriptionCoordinator>>
export type PipelineMethodsForward=Assignable<PublicInstance<typeof Current.SherpaTranscriptionPipeline>,PublicInstance<typeof Original.SherpaTranscriptionPipeline>>
export type PipelineMethodsBackward=Assignable<PublicInstance<typeof Original.SherpaTranscriptionPipeline>,PublicInstance<typeof Current.SherpaTranscriptionPipeline>>
export type OriginalExportKeys=Assignable<keyof typeof Original,keyof typeof Current>
export type CurrentExportKeys=Assignable<keyof typeof Current,keyof typeof Original>
export type ModelConstructorForward=Assignable<ConstructorParameters<typeof Current.ModelManager>,ConstructorParameters<typeof Original.ModelManager>>
export type ModelConstructorBackward=Assignable<ConstructorParameters<typeof Original.ModelManager>,ConstructorParameters<typeof Current.ModelManager>>
export type StoreConstructorForward=Assignable<ConstructorParameters<typeof Current.TranscriptStore>,ConstructorParameters<typeof Original.TranscriptStore>>
export type StoreConstructorBackward=Assignable<ConstructorParameters<typeof Original.TranscriptStore>,ConstructorParameters<typeof Current.TranscriptStore>>
export type MemoryConstructorForward=Assignable<ConstructorParameters<typeof Current.MemoryTranscriptStore>,ConstructorParameters<typeof Original.MemoryTranscriptStore>>
export type MemoryConstructorBackward=Assignable<ConstructorParameters<typeof Original.MemoryTranscriptStore>,ConstructorParameters<typeof Current.MemoryTranscriptStore>>
export type FakeConstructorForward=Assignable<ConstructorParameters<typeof Current.FakeTranscriptionPipeline>,ConstructorParameters<typeof Original.FakeTranscriptionPipeline>>
export type FakeConstructorBackward=Assignable<ConstructorParameters<typeof Original.FakeTranscriptionPipeline>,ConstructorParameters<typeof Current.FakeTranscriptionPipeline>>
