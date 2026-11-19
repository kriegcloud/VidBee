import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {expect,it} from '@effect/vitest'
import {NODE} from './fixtures/node-runtime.js'
it('matches the unchanged pinned-Node pure fixture including argument mutation',()=>{
 // This historical fixture was recorded in America/Chicago; numeric Date.parse inputs need that explicit runtime.
 // The separate date oracle pins UTC, Asia/Tokyo and America/New_York.
 const result=execFileSync(NODE,['--import','tsx',fileURLToPath(new URL('./review-pure.node.ts',import.meta.url))],{encoding:'utf8',timeout:30000,env:{...process.env,TZ:'America/Chicago'}})
 expect(JSON.parse(result)).toEqual({cases:4228,compared:3823,excludedArrayPositions:405,differences:0})
},30000)
