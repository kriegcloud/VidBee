import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {SubscriptionsApi} from '../../src/api.js'
import {observeApiFailureTiming,failureTimingScenarios} from './api-failure-timing.js'
assert.equal(process.version,'v22.23.4')
const expected=JSON.parse(readFileSync(new URL('./api-failure-timing.json',import.meta.url),'utf8'))
for(const scenario of failureTimingScenarios)assert.deepEqual(await observeApiFailureTiming(SubscriptionsApi,scenario),expected[scenario],scenario)
console.log(JSON.stringify({cases:failureTimingScenarios.length,differences:0}))
