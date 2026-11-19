import {readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {providerCases,observeProvider} from './provider-matrix'
const old=await import(pathToFileURL(resolve(process.argv[2]!,'modules/compute-provider.js')).href)
const cases=[]
for(const input of providerCases)cases.push({input,expected:await observeProvider(old,input)})
const bytes=JSON.stringify(cases,null,2)+'\n'
const output=new URL('./provider-matrix.json',import.meta.url)
if(process.argv.includes('--record-old'))writeFileSync(output,bytes)
else if(bytes!==readFileSync(output,'utf8'))throw new Error('Old provider oracle changed')
console.log(`${cases.length} unchanged old-source provider outcomes`)
const {runtimeCacheCases,observeRuntimeCache}=await import('./runtime-cache-matrix')
const runtime=await import(pathToFileURL(resolve(process.argv[2]!,'modules/runtime.js')).href)
const runtimeCases=[]
for(const input of runtimeCacheCases)runtimeCases.push({input,expected:await observeRuntimeCache(runtime,input)})
const runtimeBytes=JSON.stringify(runtimeCases,null,2)+'\n'
const runtimeOutput=new URL('./runtime-cache-matrix.json',import.meta.url)
if(process.argv.includes('--record-old'))writeFileSync(runtimeOutput,runtimeBytes)
else if(runtimeBytes!==readFileSync(runtimeOutput,'utf8'))throw new Error('Old runtime oracle changed')
console.log(`${runtimeCases.length} unchanged old-source runtime cache outcomes`)
