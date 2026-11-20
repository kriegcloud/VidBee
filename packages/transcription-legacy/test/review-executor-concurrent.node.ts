import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {TranscriptionExecutor} from '../src/executor'
import {MemoryTranscriptStore} from '../src/memory-store'
import {transcriptionPartials} from '../src/partial-buffer'
import {observeConcurrentExecutor} from './review-executor-concurrent-fixture'
const baseline=JSON.parse(readFileSync(new URL('./fixtures/review-executor-concurrent.json',import.meta.url),'utf8')) as Record<string,unknown>
for(const mode of ['same','different'])test(`executor concurrent provider keys preserve pending/cache/settle trace: ${mode}`,async()=>assert.deepEqual(await observeConcurrentExecutor(options=>new TranscriptionExecutor(options),()=>new MemoryTranscriptStore({clock:()=>1000}),transcriptionPartials,process.execPath,mode==='different'),baseline[mode]))
