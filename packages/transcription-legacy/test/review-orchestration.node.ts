import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import * as Current from '../src/index'
import * as Cloud from '../src/cloud-runner'
import {observeOrchestration,orchestrationModes} from './review-orchestration-fixture'
assert.equal(process.version,'v22.23.4')
const baseline=JSON.parse(readFileSync(new URL('./fixtures/review-orchestration-traces.json',import.meta.url),'utf8')) as Record<string,unknown>
for(const mode of orchestrationModes)test(`stateful unchanged-old-source seam trace: ${mode}`,{timeout:30000},async()=>assert.deepEqual(await observeOrchestration({...Current,...Cloud},mode),baseline[mode]))
