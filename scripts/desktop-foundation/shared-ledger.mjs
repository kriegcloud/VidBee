import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const ledgerFile='docs/effect-port/reports/9.0-shared-ledger.json'
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()&&!['node_modules','dist','out','.output','.wxt','.git','.cache'].includes(entry.name)?walk(path.join(directory,entry.name)):entry.isFile()&&/\.(ts|tsx|mjs)$/.test(entry.name)?[path.join(directory,entry.name)]:[])
const shared=walk('apps/desktop/src/shared').sort()
const sources=walk('apps/desktop/src').concat(walk('scripts/desktop-foundation')).sort()
const text=new Map(sources.map(file=>[file,fs.readFileSync(file,'utf8')]))
const scope=JSON.parse(fs.readFileSync('standards/scope.json','utf8')).files
const testOwners=['scripts/desktop-foundation/shared-complete.test.mjs','scripts/desktop-foundation/shared-port.test.mjs']
const declarations=file=>{
 const source=fs.readFileSync(file,'utf8')
 const values=[...source.matchAll(/^export const (\w+)\b/gm)].map(match=>match[1])
 const types=new Set([...source.matchAll(/^export type (\w+)\b/gm)].map(match=>match[1]))
 return values.filter(name=>types.has(name)).sort()
}
const compatibilityFiles=walk('apps/desktop/src/compatibility/shared').sort()
const frozenFiles=walk('scripts/desktop-foundation/fixtures/shared-port').sort()
const structuralSubjects=shared.flatMap(file=>declarations(file).map(declaration=>({file,declaration,construction:'structural for legacy construction',architectureDecision:'User-carried architect answer 2; foundation section 3 plain object APIs use structs',count:1,maximum:1,digest:digest(file)})))
const imports=file=>{
 const result=[]
 for(const [consumer,source]of text){if(consumer===file)continue
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
   let target=match[1]
   if(target.startsWith('@shared/'))target='apps/desktop/src/shared/'+target.slice(8)
   else if(target.startsWith('.'))target=path.normalize(path.join(path.dirname(consumer),target))
   else continue
   if(target.replace(/(?:\.d)?\.(?:js|ts|tsx)$/,'')===file.replace(/(?:\.d)?\.(?:js|ts|tsx)$/,'')){result.push(consumer);break}
  }
 }
 if(result.length===0 && file.startsWith('apps/desktop/src/compatibility/shared/') && text.get(testOwners[0]).includes(path.basename(file,'.ts')))result.push(testOwners[0])
 return result.sort()
}
const own=file=>{
 if(file.startsWith('scripts/desktop-foundation/fixtures/shared-port/'))return {consumers:['scripts/desktop-foundation/shared-ledger.mjs',...testOwners],tests:['scripts/desktop-foundation/shared-ledger.mjs',...testOwners],ownership:'The required ledger assertions consume every frozen source byte. The shared differential suites own characterization; the exact type proof additionally owns type-only contracts. Delete with the phase 10 compatibility boundary.'}
 if(file.startsWith('scripts/desktop-foundation/fixtures/frozen-ipc/') || file==='scripts/desktop-foundation/fixtures/frozen-helper-inputs.d.ts')return {consumers:imports(file),tests:['scripts/desktop-foundation/shared-type-parity.ts'],ownership:'Frozen service source used by the required exact IPC proof.'}
 return {consumers:imports(file),tests:testOwners,ownership:'Direct importers own migration; required differential characterization owns deletion safety.'}
}
const old=JSON.parse(fs.readFileSync(ledgerFile,'utf8'))
const compatibility=old.compatibility.map(row=>({...row,digest:digest(row.file),consumers:imports(row.file)}))
const pendingDeletion=scope.filter(row=>row.classification==='pending-deletion'&&(row.file.startsWith('apps/desktop/src/compatibility/shared/')||row.file==='apps/desktop/src/drivers/shared/BuiltinSkill.driver.ts'||row.file==='apps/desktop/src/shared/types/ipc.ts'||row.file.startsWith('scripts/desktop-foundation/fixtures/shared-port/')||row.file.startsWith('scripts/desktop-foundation/fixtures/frozen-ipc/')||row.file==='scripts/desktop-foundation/fixtures/frozen-helper-inputs.d.ts')).map(row=>({file:row.file,classification:row.classification,decision:'D1',deletionPhase:10,executable:row.executable,digest:digest(row.file),...own(row.file)})).sort((a,b)=>a.file.localeCompare(b.file))
const expected={...old,structuralCount:structuralSubjects.length,structuralSubjects,compatibility,pendingDeletion,interfaceClassification:'docs/effect-port/reports/9.0-shared-interface-classification.json',typeParity:{pairs:[...fs.readFileSync('scripts/desktop-foundation/shared-type-parity.ts','utf8').matchAll(/^export const (?:forward\w+|inputForward\w+|supplementalForward\w+)=/gm)].length,proof:'scripts/desktop-foundation/shared-type-parity.ts',requiredCheck:'check:shared'},retirementCount:pendingDeletion.length}
export function validateLedger(candidate=old){
 assert.deepEqual(candidate.compatibility.map(row=>row.file).sort(),compatibilityFiles,'all compatibility declarations have ledger rows')
 assert.deepEqual(candidate.files.map(row=>row.file).sort(),frozenFiles.map(file=>file.replace('scripts/desktop-foundation/fixtures/shared-port/','apps/desktop/src/shared/')).sort(),'all frozen disposition files have ledger rows')

 assert.equal(candidate.structuralCount,structuralSubjects.length,'ledger schema count')
 assert.deepEqual(candidate.structuralSubjects,structuralSubjects,'ledger declarations and digests')
 assert.deepEqual(candidate.compatibility,compatibility,'ledger compatibility consumers and digests')
 assert.deepEqual(candidate.pendingDeletion,pendingDeletion,'ledger retirement scope, consumers, tests and digests')
 assert.deepEqual(candidate.typeParity,expected.typeParity,'ledger type proof count')
 assert.equal(candidate.retirementCount,pendingDeletion.length,'ledger retirement count')
 assert(structuralSubjects.some(row=>row.declaration==='CatalogMemoryEntry'),'CatalogMemoryEntry inventory')
 assert(structuralSubjects.some(row=>row.declaration==='Message'),'Message inventory')
 for(const row of pendingDeletion){assert(row.consumers.length>0,`No consumer owner: ${row.file}`);assert(row.tests.length>0,`No test owner: ${row.file}`);for(const file of [...row.consumers,...row.tests])assert(fs.existsSync(file),`Missing owner ${file}`)}
 for(const row of candidate.files)assert(fs.existsSync(row.file),`Missing disposition declaration ${row.file}`)
 const frozen=JSON.parse(fs.readFileSync('scripts/desktop-foundation/fixtures/frozen-ipc-manifest.json','utf8'))
 assert.deepEqual(frozen.files.map(row=>row.file).sort(),walk('scripts/desktop-foundation/fixtures/frozen-ipc').sort(),'all frozen service declarations are inventoried')
 const sourceDigest=(revision,file)=>{
  const original=spawnSync('git',['show',`${revision}:${file}`])
  assert.equal(original.status,0,`Cannot read frozen source ${revision}:${file}`)
  return crypto.createHash('sha256').update(original.stdout).digest('hex')
 }
 for(const row of frozen.files){
  assert.equal(digest(row.file),row.digest,`Frozen IPC source digest: ${row.file}`)
  assert.equal(sourceDigest(frozen.revision,row.source),row.sourceDigest,`Original IPC source digest: ${row.source}`)
 }
 for(const file of frozenFiles)assert.equal(digest(file),sourceDigest(candidate.sourceRevision,file.replace('scripts/desktop-foundation/fixtures/shared-port/','apps/desktop/src/shared/')),`Frozen source changed: ${file}`)

 const classification=JSON.parse(fs.readFileSync(expected.interfaceClassification,'utf8'))
 assert.equal(classification.length,45,'all original exported interfaces classified')
 for(const row of classification){assert(fs.existsSync(row.file));const source=fs.readFileSync(row.file,'utf8');assert(source.includes(row.classification==='pure-data-schema'?`export const ${row.declaration} =`:`export interface ${row.declaration} {`),`Classification no longer matches ${row.declaration}`)}
 return {schemas:structuralSubjects.length,retirements:pendingDeletion.length,interfaces:classification.length}
}
if(process.argv.includes('--write'))fs.writeFileSync(ledgerFile,JSON.stringify(expected,null,2)+'\n')
else {
 console.log('Shared ledger:',validateLedger())
 // These guard assertions prove the validator rejects the reviewer's surviving ledger mutations.
 const badConsumer=structuredClone(old);badConsumer.compatibility[0].consumers=['does/not/exist.ts']
 assert.throws(()=>validateLedger(badConsumer),/consumers/)
 const badDigest=structuredClone(old);badDigest.structuralSubjects[0].digest='0'.repeat(64)
 assert.throws(()=>validateLedger(badDigest),/digests/)
}
