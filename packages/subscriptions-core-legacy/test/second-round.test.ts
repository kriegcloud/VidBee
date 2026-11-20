import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { it } from '@effect/vitest'
import { NODE } from './fixtures/node-runtime.js'
it('all API public dispatches match unchanged old source for instance and subclass overrides',()=>{
 execFileSync(NODE,['--import','tsx',fileURLToPath(new URL('./fixtures/second-round.node.ts',import.meta.url))],{stdio:'pipe',timeout:120000})
},120000)
it('Node interval clamp and deterministic five-millisecond counts retain their recorded values',()=>{
 execFileSync(NODE,['--import','tsx',fileURLToPath(new URL('./fixtures/interval-clamp.node.ts',import.meta.url))],{stdio:'pipe',timeout:120000})
},120000)

for(const client of ['borrowed','node'])it(`native orphan await boundaries match old source (${client})`,()=>{
 execFileSync(NODE,['--import','tsx',fileURLToPath(new URL('./fixtures/second-round.node.ts',import.meta.url))],{env:{...process.env,SECOND_NATIVE:'1',SECOND_CLIENT:client},stdio:'pipe',timeout:120000})
},120000)
