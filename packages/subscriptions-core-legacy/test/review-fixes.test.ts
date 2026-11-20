import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { it } from '@effect/vitest'
import { NODE } from './fixtures/node-runtime.js'
for(const [native,client] of [['0','borrowed'],['1','borrowed'],['1','node']])it(`review fixes match unchanged old source (native=${native}, client=${client})`,()=>{
 execFileSync(NODE,['--import','tsx',fileURLToPath(new URL('./fixtures/review-fixes.node.ts',import.meta.url))],{env:{...process.env,REVIEW_NATIVE:native,REVIEW_SQL_CLIENT:client},stdio:'pipe',timeout:120000,maxBuffer:16*1024*1024})
},120000)
