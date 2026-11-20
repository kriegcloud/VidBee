import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {expect,it} from '@effect/vitest'
import {NODE} from './fixtures/node-runtime.js'
it('retains every nested feed Promise turn, timer cleanup, retry/discovery error and scalar projection',()=>{
 const result=execFileSync(NODE,['--import','tsx',fileURLToPath(new URL('./fixtures/feed-timing.node.ts',import.meta.url))],{encoding:'utf8',timeout:30000})
 expect(JSON.parse(result)).toEqual({cases:31,differences:0})
},30000)
