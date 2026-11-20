import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {SherpaTranscriptionPipeline} from '../src/pipeline-sherpa'
import {observePipeline,pipelineModes} from './review-pipeline-fixture.node.js'
const baseline=JSON.parse(readFileSync(new URL('./fixtures/review-pipeline-traces.json',import.meta.url),'utf8')) as Record<string,unknown>
for(const mode of pipelineModes)test(`pipeline unchanged-source dependency/callback/microtask trace: ${mode}`,async()=>assert.deepEqual(await observePipeline(options=>new SherpaTranscriptionPipeline(options),mode),baseline[mode]))
import {FakeTranscriptionPipeline} from '../src/pipeline-fake'
import {fakePipelineModes,observeFakePipeline} from './review-pipeline-fixture.node.js'
const fakeBaseline=JSON.parse(readFileSync(new URL('./fixtures/review-pipeline-fake-traces.json',import.meta.url),'utf8')) as Record<string,unknown>
for(const mode of fakePipelineModes)test(`fake pipeline unchanged-source callback/microtask/identity trace: ${mode}`,async()=>assert.deepEqual(await observeFakePipeline(options=>new FakeTranscriptionPipeline(options),mode),fakeBaseline[mode]))
