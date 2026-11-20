import {writeFileSync,readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const oldRoot=pathToFileURL(resolve(process.argv[2])+'/')
const Old=await import(new URL('old.mjs',oldRoot).href)
const Cloud=await import(new URL('modules/cloud-runner.js',oldRoot).href)
import {observeOrchestration,orchestrationModes} from '../review-orchestration-fixture.ts'
const results={}
for(const mode of orchestrationModes){process.stdout.write(`${mode}\n`);results[mode]=await observeOrchestration({...Old,...Cloud},mode)}
const bytes=JSON.stringify(results,null,2)+'\n'
const expected=readFileSync(new URL('./review-orchestration-traces.json',import.meta.url),'utf8')
if(bytes!==expected)throw new Error('Old-source orchestration regeneration differs')
if(process.argv[3])writeFileSync(process.argv[3],bytes)
console.log('46 old-source scenarios reproduced fixture bytes')
