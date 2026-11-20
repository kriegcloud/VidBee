import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import * as Port from '../src/compute-provider'
import {observeProvider,type ProviderCase} from './fixtures/provider-matrix'
const cases=JSON.parse(readFileSync(new URL('./fixtures/provider-matrix.json',import.meta.url),'utf8')) as Array<{input:ProviderCase;expected:unknown}>
test('provider selection matches unchanged source across library, flag, cache and probe outcomes',async()=>{
 assert.equal(cases.length,768)
 for(const row of cases)assert.deepEqual(await observeProvider(Port,row.input),row.expected,JSON.stringify(row.input))
})
import * as Runtime from '../src/runtime'
import {observeRuntimeCache,type RuntimeCacheCase} from './fixtures/runtime-cache-matrix'
const runtimeCases=JSON.parse(readFileSync(new URL('./fixtures/runtime-cache-matrix.json',import.meta.url),'utf8')) as Array<{input:RuntimeCacheCase;expected:unknown}>
test('runtime disk-cache stale/absent/boolean decisions match old source across probe failures and GPU flags',async()=>{
 for(const row of runtimeCases)assert.deepEqual(await observeRuntimeCache(Runtime,row.input),row.expected,JSON.stringify(row.input))
})
