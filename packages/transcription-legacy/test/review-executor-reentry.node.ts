import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {TranscriptionExecutor} from '../src/executor'
import {MemoryTranscriptStore} from '../src/memory-store'
import {transcriptionPartials} from '../src/partial-buffer'
import {observeExecutorReentry,reentryModes} from './review-executor-reentry-fixture'
const baseline=JSON.parse(readFileSync(new URL('./fixtures/review-executor-reentry.json',import.meta.url),'utf8')) as Record<string,unknown>
for(const mode of reentryModes)test(`executor reentry/window/readers match unchanged owners: ${mode}`,async()=>assert.deepEqual(await observeExecutorReentry(options=>new TranscriptionExecutor(options),()=>new MemoryTranscriptStore({clock:()=>1000}),transcriptionPartials,mode),baseline[mode]))
