import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {expect,it} from '@effect/vitest'
import {NODE} from './fixtures/node-runtime.js'
it('matches the unchanged pinned-Node pure fixture including argument mutation',()=>{
 const result=execFileSync(NODE,['--import','tsx',fileURLToPath(new URL('./review-pure.node.ts',import.meta.url))],{encoding:'utf8',timeout:30000})
 expect(JSON.parse(result)).toEqual({cases:4228,compared:3823,excludedArrayPositions:405,differences:0})
},30000)
