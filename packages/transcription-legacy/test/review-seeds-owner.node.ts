import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import * as Seeds from '../src/speaker-assign'
import {MemoryTranscriptStore} from '../src/memory-store'
import {observeSeedOwners} from './review-seeds-owner-fixture'
const baseline=JSON.parse(readFileSync(new URL('./fixtures/review-seeds-owner.json',import.meta.url),'utf8')) as unknown
test('seed owner history rereads, original caption preference, word alias and public reader state match old source',()=>assert.deepEqual(observeSeedOwners(Seeds,()=>new MemoryTranscriptStore({clock:()=>1000})),baseline))
