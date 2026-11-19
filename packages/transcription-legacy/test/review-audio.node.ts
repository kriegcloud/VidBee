import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {extractMonoWav,readPcmWav} from '../src/audio'
import {audioModes,observeAudio} from './review-audio-fixture'
assert.equal(process.version,'v22.23.4')
const baseline=JSON.parse(readFileSync(new URL('./fixtures/review-audio-traces.json',import.meta.url),'utf8')) as Record<string,unknown>
for(const mode of audioModes)test(`audio old-source callback and microtask trace: ${mode}`,()=>observeAudio(extractMonoWav,mode).then(actual=>assert.deepEqual(actual,baseline[mode])))
test('Buffer-backed shared parser preserves high-bit ASCII, native bounds error identity and first data defaults',()=>{
 const root=mkdtempSync(join(tmpdir(),'audio-wave-review-'));const file=join(root,'wave')
 try{
  const bytes=Buffer.alloc(44);bytes.write('RIFF');bytes.write('WAVE',8);bytes[0]=bytes[0]!|128;bytes.write('data',12);bytes.writeUInt32LE(4,16);bytes.writeInt16LE(16384,20);bytes.writeInt16LE(-16384,22)
  writeFileSync(file,bytes);const result=readPcmWav(file);assert.equal(result.sampleRate,16000);assert.deepEqual(Array.from(result.samples),[.5,-.5])
  const malformed=Buffer.alloc(44);malformed.write('RIFF');malformed.write('WAVE',8);malformed.write('JUNK',12);malformed.writeUInt32LE(16,16);malformed.write('fmt ',36)
  writeFileSync(file,malformed)
  let expected:unknown;try{malformed.readUInt16LE(46)}catch(error){expected=error}
  assert(expected instanceof RangeError)
  assert.throws(()=>readPcmWav(file),{name:expected.name,message:expected.message})
  writeFileSync(file,Buffer.alloc(43));assert.throws(()=>readPcmWav(file),{name:'Error',message:`not a wav file: ${file}`})
 }finally{rmSync(root,{recursive:true,force:true})}
})
