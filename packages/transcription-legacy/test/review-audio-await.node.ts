import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {extractMonoWav} from '../src/audio'
import {observeAudioAwaits,audioAwaitModes} from './review-audio-await-fixture'
const baseline=JSON.parse(readFileSync(new URL('./fixtures/review-audio-await-traces.json',import.meta.url),'utf8')) as Record<string,unknown>
for(const mode of audioAwaitModes)test(`audio old await/error/cleanup observations: ${mode}`,async()=>assert.deepEqual(await observeAudioAwaits(extractMonoWav,mode),baseline[mode]))
