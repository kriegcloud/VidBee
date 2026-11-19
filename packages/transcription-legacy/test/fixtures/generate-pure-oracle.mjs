import { writeFileSync,readFileSync } from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const oldBase=pathToFileURL(resolve(process.argv[2])+'/')
import { seeds as baseSeeds } from '../pure-cases.ts'
import { observe, pack, substitutions } from '../pure-oracle.ts'
import { pureTextCases } from '../pure-text-cases.ts'
import { asrSeeds } from '../pure-asr-cases.ts'
import { remainingSeeds } from '../pure-remaining-cases.ts'
import { seedSeeds } from '../pure-seed-cases.ts'
const seeds={...baseSeeds,...pureTextCases,...asrSeeds,...remainingSeeds,...seedSeeds}
if (process.version !== 'v22.23.4') throw new Error('wrong Node '+process.version)
const fixtures = []
for (const [module, names] of Object.entries(seeds)) {
const old = await import(new URL('modules/'+module+'.js',oldBase).href);
for (const [name, cases] of Object.entries(names)) {
 for (const args of substitutions(cases)) {
  const saved = pack(args)
  const expected = observe(old[name], args)
  const excluded = expected.failed && expected.engine ? 'old-engine-error' : undefined
  fixtures.push({module,name,args:saved,expected,...(excluded ? {excluded} : {})})
 }
}}
const bytes='[\n'+fixtures.map(f=>JSON.stringify(f)).join(',\n')+'\n]\n'
if(process.argv[3])writeFileSync(process.argv[3],bytes)
if(bytes!==readFileSync(new URL('./review-pure-oracle.json',import.meta.url),'utf8'))throw new Error('Old-source pure regeneration differs')
if(process.argv[3])writeFileSync(process.argv[3],bytes)
console.log(JSON.stringify({fixtures:fixtures.length,identical:true}))
