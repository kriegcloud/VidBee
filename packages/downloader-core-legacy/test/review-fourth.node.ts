import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {fourthRound} from './review-fourth-harness.mjs'
import * as gallery from '../src/gallery-dl-executor'
import * as social from '../src/social-media-service'
import * as threads from '../src/threads-profile-map'
import * as yt from '../src/yt-dlp-executor'
test('review fourth-round social constraints and host Retry-After parser', {timeout:120000}, async()=>{
 const expected=JSON.parse(readFileSync(new URL('./fixtures/review-fourth-oracle.json',import.meta.url),'utf8'))
 assert.deepEqual(await fourthRound({gallery,yt,social,threads}),expected)
})
