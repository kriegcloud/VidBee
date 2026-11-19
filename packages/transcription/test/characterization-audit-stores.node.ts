import './fixtures/audit-isolation'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, writeFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import * as T from '@vidbee/transcription'

for (const kind of ['memory', 'sql'] as const) test(`audit complete ${kind} mutations, live identity, promotion and clock order`, {timeout: 30000}, t => {
  const db = kind === 'sql' ? new Database(':memory:') : null
  t.after(() => db?.close())
  let time = 0
  const store = db ? new T.TranscriptStore({db, clock: () => ++time}) : new T.MemoryTranscriptStore({clock: () => ++time})
  const result: T.PipelineResult = {resultKind:'no-speech',sourceKind:'captions',modelVersion:'v',asrTier:null,language:'en',speakers:[],segments:[]}
  const input = {downloadTaskId:'d',transcriptionTaskId:'task',transcriptId:'one',sourceFilePath:'/fixture/media',result}
  const row = store.commit(input)
  const observations: unknown[] = []
  const ids: string[] = []
  const capture = (label:string, value: T.TranscriptRecord | null) => {
    assert(value)
    if(kind === 'memory') assert.equal(value,row)
    else assert.notEqual(value,row)
    observations.push(JSON.parse(JSON.stringify({label,time,value},(key,item)=>key==='id' && typeof item === 'string' && item !== 'one' ? `segment-${ids.indexOf(item) < 0 ? ids.push(item)-1 : ids.indexOf(item)}` : item)))
  }
  capture('append no-speech',store.appendCaptionCues('one',[{startMs:900,endMs:1000,text:'later'},{startMs:100,endMs:200,text:'first'}]))
  const beforeIds = store.getById('one')!.segments.map(segment=>segment.id)
  capture('patch clamp and words',store.updateSegment('one',beforeIds[0]!,{startMs:50,endMs:20,text:'patched'}))
  const inserted = store.insertSegment('one',{atMs:300,text:'inserted'})
  assert(inserted); assert(inserted.record.segments.some(segment=>segment.id===inserted.segmentId))
  capture('insert',inserted.record)
  capture('append continuation',store.appendCaptionCues('one',[{startMs:0,endMs:1,text:'last appended'}]))
  assert(beforeIds.every(id=>store.getById('one')!.segments.some(segment=>segment.id===id)))
  capture('delete all',store.deleteSegments('one',store.getById('one')!.segments.map(segment=>segment.id)))
  const fixture = new URL(`./fixtures/audit-store-${kind}.json`,import.meta.url)
  if(process.env.VIDBEE_RECORD_CHARACTERIZATION==='1') writeFileSync(fixture,JSON.stringify(observations,null,2)+'\n')
  assert.deepEqual(observations,JSON.parse(readFileSync(fixture,'utf8')))
})

test('audit SQL activate supersedes old current, shortcut skips clock, complete ordered heads preserve future kinds', {timeout:30000}, t=>{
  const db=new Database(':memory:');t.after(()=>db.close());let time=0
  const store=new T.TranscriptStore({db,clock:()=>++time})
  const result:T.PipelineResult={resultKind:'no-speech',modelVersion:'v',asrTier:null,language:null,speakers:[],segments:[]}
  for(const [id,activate] of [['one',true],['two',false],['three',false]] as const) store.commit({transcriptId:id,downloadTaskId:'d',transcriptionTaskId:`task-${id}`,sourceFilePath:`/fixture/${id}`,result,activate})
  assert.equal(store.activate('d','two')?.id,'two');assert.equal(time,4)
  assert.equal(store.getById('one')?.supersededAt,4);assert.equal(store.getById('one')?.updatedAt,4)
  assert.equal(store.getById('two')?.supersededAt,null);assert.equal(store.getLatestForDownload('d')?.id,'two')
  store.activate('d','two');assert.equal(time,4)
  const expected=[{id:'three',createdAt:3,updatedAt:3,supersededAt:3},{id:'two',createdAt:2,updatedAt:4,supersededAt:null},{id:'one',createdAt:1,updatedAt:4,supersededAt:4}].map(row=>({...row,downloadTaskId:'d',transcriptionTaskId:`task-${row.id}`,sourceFilePath:`/fixture/${row.id}`,resultKind:'no-speech',modelVersion:'v',asrTier:null,language:null,sourceKind:'asr'}))
  assert.deepEqual(store.listHeads(),expected);assert.deepEqual(store.listHeadsForDownload('d'),expected);assert.deepEqual(store.listHeadsForDownload('absent'),[])
  db.prepare("UPDATE transcripts SET result_kind='future-kind',source_kind='future-source'").run()
  const future=expected.map(row=>({...row,resultKind:'future-kind'}));assert.deepEqual(store.listHeads(),future);assert.deepEqual(store.listHeadsForDownload('d'),future)
})
