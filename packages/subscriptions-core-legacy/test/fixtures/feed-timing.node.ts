import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {RssParserFeedFetcher} from '../../src/feed-parser.js'
import {feedTimingScenarios,observeFeedTiming} from './feed-timing.js'
assert.equal(process.version,'v22.23.4')
const expected=JSON.parse(readFileSync(new URL('./feed-timing.json',import.meta.url),'utf8'))
for(const scenario of feedTimingScenarios)assert.deepEqual(await observeFeedTiming(RssParserFeedFetcher,scenario),expected[scenario],scenario)
console.log(JSON.stringify({cases:feedTimingScenarios.length,differences:0}))
