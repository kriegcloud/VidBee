// Run with pinned Node --import tsx after prepare-old-oracle.mjs. Checks bytes; never rewrites an oracle.
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {audioModes,observeAudio} from '../review-audio-fixture.ts'
import {audioAwaitModes,observeAudioAwaits} from '../review-audio-await-fixture.ts'
import {executorModes,observeExecutor} from '../review-executor-fixture.ts'
import {reentryModes,observeExecutorReentry} from '../review-executor-reentry-fixture.ts'
import {observeConcurrentExecutor} from '../review-executor-concurrent-fixture.ts'
import {pipelineModes,observePipeline,fakePipelineModes,observeFakePipeline} from '../review-pipeline-fixture.node.ts'
import {observeSeedOwners} from '../review-seeds-owner-fixture.ts'
import {observeMachine,observeRecognizer,observeConcurrency} from '../review-configuration-fixture.ts'
const base=pathToFileURL(resolve(process.argv[2])+'/')
const load=name=>import(new URL(`modules/${name}.js`,base).href)
const Old=await import(new URL('old.mjs',base).href)
const Audio=await load('audio'),Executor=Old,Memory=Old,Partials=Old
const check=(name,value)=>{const bytes=JSON.stringify(value,null,2)+'\n';if(process.argv[3])writeFileSync(resolve(process.argv[3],name),bytes);if(bytes!==readFileSync(new URL(name,import.meta.url),'utf8'))throw new Error(`Old source differs: ${name}`);console.log(`${name}: identical bytes`)}
const modes=async(values,observe)=>{const result={};for(const mode of values)result[mode]=await observe(mode);return result}
check('review-audio-traces.json',await modes(audioModes,mode=>observeAudio(Audio.extractMonoWav,mode)))
check('review-audio-await-traces.json',await modes(audioAwaitModes,mode=>observeAudioAwaits(Audio.extractMonoWav,mode)))
const create=options=>new Executor.TranscriptionExecutor(options),memory=()=>new Memory.MemoryTranscriptStore({clock:()=>1000})
check('review-executor-traces.json',await modes(executorModes,mode=>observeExecutor(create,mode)))
Partials.transcriptionPartials.clear('task')
check('review-executor-reentry.json',await modes(reentryModes,mode=>observeExecutorReentry(create,memory,Partials.transcriptionPartials,mode)))
check('review-executor-concurrent.json',await modes(['same','different'],mode=>observeConcurrentExecutor(create,memory,Partials.transcriptionPartials,process.execPath,mode==='different')))
const Sherpa=await load('pipeline-sherpa'),Fake=await load('pipeline-fake')
check('review-pipeline-traces.json',await modes(pipelineModes,mode=>observePipeline(options=>new Sherpa.SherpaTranscriptionPipeline(options),mode)))
check('review-pipeline-fake-traces.json',await modes(fakePipelineModes,mode=>observeFakePipeline(options=>new Fake.FakeTranscriptionPipeline(options),mode)))
check('review-seeds-owner.json',observeSeedOwners(await load('speaker-assign'),memory))
check('review-configuration.json',{machine:observeMachine(await load('asr-recommend')),recognizer:observeRecognizer(await load('asr-recognizer')),concurrency:await observeConcurrency(await load('concurrency'))})
