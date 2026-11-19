import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { MemoryTranscriptStore } from '../src/memory-store'
import { transcriptionPartials } from '../src/partial-buffer'
import type { PipelineResult } from '../src/types'

const result = (): PipelineResult => ({resultKind:'transcript',language:'en',modelVersion:'fixture',asrTier:null,sourceKind:'captions',speakers:[],segments:[{speakerKey:null,startMs:0,endMs:100,text:'fixture',words:[{text:'fixture',startMs:0,endMs:100}],confidence:null}]})
test('borrowed store import does not eagerly load node:sqlite', () => {
 const module = new URL('../src/transcript-store.ts', import.meta.url).href
 const child = spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`await import(${JSON.stringify(module)})`],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
 assert.equal(child.status,0)
 assert.equal(child.stdout,'')
 assert.equal(child.stderr,'')
})
test('memory owner preserves live identities, word aliases, external mutation, insertion ties, and no-op clocks', () => {
 let now=0
 const store=new MemoryTranscriptStore({clock:()=>++now})
 const original=result()
 const input={transcriptId:'one',downloadTaskId:'d',transcriptionTaskId:'t',sourceFilePath:null,result:original}
 const one=store.commit(input)
 assert.equal(store.getById('one'),one)
 assert.equal(one.segments[0]?.words,original.segments[0]?.words)
 assert.equal(store.commit(input),one)
 assert.equal(now,1)
 one.language='externally edited'
 assert.equal(store.getLatestForDownload('d')?.language,'externally edited')
 const two=store.commit({...input,transcriptId:'two',transcriptionTaskId:'t2',activate:false})
 assert.equal(two.supersededAt,2)
 assert.equal(store.getLatestForDownload('d'),one)
 assert.equal(store.activate('wrong','two'),null)
 assert.equal(store.activate('d','two'),two)
 assert.equal(one.supersededAt,3)
 const before=now
 assert.equal(store.deleteSegments('two',['missing']),two)
 assert.equal(now,before)
 assert.equal(store.updateSegment('two','missing',{}),null)
 assert.equal(store.insertSegment('missing',{}),null)
 assert.equal('listHeads' in store,false)
 const segmentId=two.segments[0]!.id
 assert.equal(store.updateSegment('two',segmentId,{text:'updated'}),two)
 assert.equal(two.segments[0]?.text,'updated')
 assert.equal(store.appendCaptionCues('two',[{startMs:200,endMs:300,text:'appended'}]),two)
 const inserted=store.insertSegment('two',{atMs:500,text:'inserted'})
 assert.equal(inserted?.record,two)
 assert.equal(store.deleteSegments('two',two.segments.map(s=>s.id)),two)
 assert.equal(two.resultKind,'transcript')
 store.deleteByDownload('d')
 assert.deepEqual(store.listLatest(),[])
 const tied=new MemoryTranscriptStore({clock:()=>1})
 for(const id of ['b','a'])tied.commit({...input,transcriptId:id,downloadTaskId:id,transcriptionTaskId:id})
 assert.deepEqual(tied.listLatest().map(r=>r.id),['b','a'])
})
test('partial singleton preserves stage clocks, replacement identity, indexes, and manifest precedence', () => {
 const previous=Date.now
 let now=0
 Date.now=()=>++now
 const dir=mkdtempSync(join(tmpdir(),'transcription-partials-review-'))
 try {
  const one=transcriptionPartials.setStage('partial-a','download-a','recognizing')
  assert.equal(now,1)
  const repeated=transcriptionPartials.setStage('partial-a','download-a','recognizing')
  assert.equal(now,1)
  assert.equal(repeated.stageHistory,one.stageHistory)
  const backward=transcriptionPartials.setStage('partial-a','download-a','preparing-audio')
  assert.equal(now,1)
  assert.equal(backward.stage,'preparing-audio')
  assert.equal(backward.stageHistory,one.stageHistory)
  const segment=result().segments[0]!
  const set=transcriptionPartials.set('partial-a','download-a',[{...segment,startMs:200,endMs:300},segment])
  assert.equal(set.segments[0],segment)
  assert.equal(transcriptionPartials.getByTask('partial-a'),set)
  assert.equal(transcriptionPartials.getByDownload('download-a'),set)
  const replaced=transcriptionPartials.append('partial-a','download-a',{...segment,text:'replacement'})
  assert.equal(replaced.segments.length,2)
  assert.equal(replaced.segments[0]?.text,'replacement')
  transcriptionPartials.set('partial-b','download-a',[])
  transcriptionPartials.clear('partial-a')
  assert.equal(transcriptionPartials.getByDownload('download-a')?.taskId,'partial-b')
  transcriptionPartials.clearByDownload('download-a')
  assert.equal(transcriptionPartials.getByTask('partial-b'),null)
  const chunks=[{index:0,...segment}]
  writeFileSync(join(dir,'chunks.json'),JSON.stringify({key:{taskId:'t',fingerprint:'f',modelVersion:'v'},chunks,stages:[{stage:'recognizing',startedAt:11}]}))
  writeFileSync(join(dir,'stages.json'),JSON.stringify([{stage:'committing',startedAt:22}]))
  const restored=transcriptionPartials.restoreFromManifest({taskId:'restore',downloadTaskId:'download-restore',workDir:dir})
  assert.equal(restored?.stage,'committing')
  assert.deepEqual(restored?.stageHistory,[{stage:'committing',startedAt:22}])
  assert.equal(restored?.segments[0]?.text,'fixture')
  writeFileSync(join(dir,'stages.json'),'[]')
  assert.deepEqual(transcriptionPartials.restoreFromManifest({taskId:'restore',downloadTaskId:'download-restore',workDir:dir})?.stageHistory,[])
 } finally {
  Date.now=previous
  for(const id of ['partial-a','partial-b','restore'])transcriptionPartials.clear(id)
  rmSync(dir,{recursive:true,force:true})
 }
})

test('borrowed SQL facade rethrows the original driver object by identity', async () => {
 const {default:Database}=await import('better-sqlite3')
 const {releaseHandle}=await import('@vidbee/db/legacy')
 const {TranscriptStore}=await import('../src/transcript-store')
 const db=new Database(':memory:')
 const sentinel=new Error('fixture driver identity')
 const wrapped={
  prepare:(query:string)=>query.startsWith('INSERT INTO transcripts')?{reader:false,run:()=>{throw sentinel},get:()=>undefined,all:()=>[]}:db.prepare(query),
  exec:db.exec.bind(db),transaction:db.transaction.bind(db)
 }
 try{
  const store=new TranscriptStore({db:wrapped})
  assert.throws(()=>store.commit({transcriptId:'failure',downloadTaskId:'d',transcriptionTaskId:'t',sourceFilePath:null,result:result()}),error=>error===sentinel)
 }finally{releaseHandle(wrapped as unknown as InstanceType<typeof Database>);db.close()}
})
