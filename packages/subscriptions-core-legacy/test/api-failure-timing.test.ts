import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {expect,it} from '@effect/vitest'
import {NODE} from './fixtures/node-runtime.js'
it('retains success/rejection adoption turns and synchronous store re-entry without joining itself',()=>{
 const result=execFileSync(NODE,['--import','tsx',fileURLToPath(new URL('./fixtures/api-failure-timing.node.ts',import.meta.url))],{encoding:'utf8',timeout:30000})
 expect(JSON.parse(result)).toEqual({cases:17,differences:0})
},30000)
