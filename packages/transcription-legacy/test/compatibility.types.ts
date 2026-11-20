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

// Compare every advertised sub-entry as well as the root barrel.
import type * as OriginalAsr from './contracts/original-public/asr-tiers'
import type * as CurrentAsr from '../src/asr-tiers'
import type * as OriginalConcurrency from './contracts/original-public/concurrency'
import type * as CurrentConcurrency from '../src/concurrency'
import type * as OriginalCloud from './contracts/original-public/cloud'
import type * as CurrentCloud from '../src/cloud'
import type * as OriginalRunner from './contracts/original-public/cloud-runner'
import type * as CurrentRunner from '../src/cloud-runner'
import type * as OriginalMirrors from './contracts/original-public/download-mirrors'
import type * as CurrentMirrors from '../src/download-mirrors'
import type * as OriginalWorker from './contracts/original-public/worker/entry'
import type * as CurrentWorker from '../src/worker/entry'
type EntriesOld = [typeof OriginalAsr,typeof OriginalConcurrency,typeof OriginalCloud,typeof OriginalRunner,typeof OriginalMirrors,typeof OriginalWorker]
type EntriesNew = [typeof CurrentAsr,typeof CurrentConcurrency,typeof CurrentCloud,typeof CurrentRunner,typeof CurrentMirrors,typeof CurrentWorker]
export type SubentriesForward=Assignable<EntriesNew,EntriesOld>
export type SubentriesBackward=Assignable<EntriesOld,EntriesNew>
// Erase only private class identity recursively, preserving argument tuples,
// optional fields, callbacks, Promise returns and all public instance methods.
type Portable<T>=T extends (...args:infer A)=>infer R ? (...args:{[K in keyof A]:Portable<A[K]>})=>Portable<R> : T extends Promise<infer R> ? Promise<Portable<R>> : T extends object ? {[K in keyof T]:Portable<T[K]>} : T
type FunctionEdges=Exclude<NominalEdges,'AutoTranscriptionCoordinator'|'SherpaTranscriptionPipeline'|'TranscriptionExecutor'>
type OldFunctions={[K in FunctionEdges]:FunctionContract<typeof Original[K]>}
type NewFunctions={[K in FunctionEdges]:FunctionContract<typeof Current[K]>}
export type FunctionsForward=Assignable<NewFunctions,OldFunctions>
export type FunctionsBackward=Assignable<OldFunctions,NewFunctions>

type OldNominalConstructors=Portable<[ConstructorParameters<typeof Original.TranscriptionExecutor>,ConstructorParameters<typeof Original.AutoTranscriptionCoordinator>,ConstructorParameters<typeof Original.SherpaTranscriptionPipeline>]>
type NewNominalConstructors=Portable<[ConstructorParameters<typeof Current.TranscriptionExecutor>,ConstructorParameters<typeof Current.AutoTranscriptionCoordinator>,ConstructorParameters<typeof Current.SherpaTranscriptionPipeline>]>
export type NominalConstructorsForward=Assignable<NewNominalConstructors,OldNominalConstructors>
export type NominalConstructorsBackward=Assignable<OldNominalConstructors,NewNominalConstructors>

// Tuple comparison also catches dropped optional parameters, which ordinary
// function assignability intentionally permits in TypeScript.
type FunctionContract<T>=T extends (...args:infer A)=>infer R ? {parameters:Portable<A>;result:Portable<R>} : PublicBinding<T>

// Evaluate each binding separately. Comparing two generic mapped module types
// can reuse the modules' function variance and miss an optional tuple element.
type ContractDifferences<A,B> = Exclude<keyof A,keyof B> | Exclude<keyof B,keyof A> | {
 [K in keyof A & keyof B]: [FunctionContract<A[K]>] extends [FunctionContract<B[K]>]
  ? [FunctionContract<B[K]>] extends [FunctionContract<A[K]>] ? never : K
  : K
}[keyof A & keyof B]
type NoDifferences<T extends never>=T
export type AsrContracts=NoDifferences<ContractDifferences<typeof CurrentAsr,typeof OriginalAsr>>
export type ConcurrencyContracts=NoDifferences<ContractDifferences<typeof CurrentConcurrency,typeof OriginalConcurrency>>
export type CloudContracts=NoDifferences<ContractDifferences<typeof CurrentCloud,typeof OriginalCloud>>
export type RunnerContracts=NoDifferences<ContractDifferences<typeof CurrentRunner,typeof OriginalRunner>>
export type MirrorContracts=NoDifferences<ContractDifferences<typeof CurrentMirrors,typeof OriginalMirrors>>
export type WorkerContracts=NoDifferences<ContractDifferences<typeof CurrentWorker,typeof OriginalWorker>>
export type NominalFunctionContracts=NoDifferences<ContractDifferences<Pick<typeof Current,FunctionEdges>,Pick<typeof Original,FunctionEdges>>>
