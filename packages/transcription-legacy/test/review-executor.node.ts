import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {TranscriptionExecutor} from '../src/executor'
import {executorModes,observeExecutor} from './review-executor-fixture'
const baseline=JSON.parse(readFileSync(new URL('./fixtures/review-executor-traces.json',import.meta.url),'utf8')) as Record<string,unknown>
for(const mode of executorModes)test(`executor old-source callbacks and Promise turns: ${mode}`,async()=>assert.deepEqual(await observeExecutor(options=>new TranscriptionExecutor(options),mode),baseline[mode]))
