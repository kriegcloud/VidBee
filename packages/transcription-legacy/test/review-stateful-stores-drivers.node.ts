import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import * as S from 'effect/Schema'
import * as Client from 'effect/sql/SqlClient'
import { decodeRow } from '@vidbee/db/Row'
import { runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { make } from '../../transcription/src/TranscriptStore.layer'
import { make as makeMigration, sourceLayer } from '../../transcription/src/TranscriptMigration.layer'
import { TranscriptMigrationSource } from '../../transcription/src/TranscriptMigration.service'
import { MigrationTable } from '../../transcription/src/TranscriptMigration.model'
import { TranscriptionTime } from '../../transcription/src/TranscriptionTime.service'
import { TranscriptionIds } from '../../transcription/src/TranscriptionIds.service'
import { HostFailure } from '../../transcription/src/Transcription.errors'
import { legacyTimeLayer } from '../src/host/time'
import { TranscriptionFilesLegacySync } from '../src/host/files'
import { transcriptionCause } from '../src/bridge/errors'
import type { PipelineResult } from '../../transcription/src/Pipeline.model'

const selected = process.env.TRANSCRIPTION_STORE_TEST_CLIENT
const filename = new URL(import.meta.url).pathname
if (!selected) {
 for (const driver of ['borrowed','node']) test(`persistence strict SQL and migration on isolated ${driver} client`, () => {
  const env:NodeJS.ProcessEnv={...process.env,TRANSCRIPTION_STORE_TEST_CLIENT:driver}
  delete env.NODE_TEST_CONTEXT
  const child=spawnSync(process.execPath,['--import','tsx','--test',filename],{env,encoding:'utf8'})
  assert.equal(child.status,0,`${child.stdout}\n${child.stderr}`)
  if(driver==='borrowed')assert.equal(child.stderr,'')
 })
} else {
 const driver=selected
 test(`strict SQL layer, row boundary and migration: ${driver}`, async () => {
  assert.equal(process.version,'v22.23.4')
  const trace:string[]=[]
  const root=mkdtempSync(join(tmpdir(),`transcription-${driver}-`))
  let release:()=>void
  let runtime:ManagedRuntime.ManagedRuntime<Client.SqlClient,unknown>
  let openRaw:(path:string)=>{exec(sql:string):void;prepare(sql:string):{get():unknown};close():void}
  if(driver==='borrowed'){
   const {default:Database}=await import('better-sqlite3')
   const {runtimeForHandle,releaseHandle}=await import('@vidbee/db/legacy')
   const handle=new Database(':memory:',{verbose:sql=>trace.push(String(sql))})
   runtime=runtimeForHandle(handle)
   release=()=>{releaseHandle(handle);handle.close()}
   openRaw=path=>new Database(path)
  }else{
   const {layer}=await import('@vidbee/db/node')
   const {DatabaseSync}=await import('node:sqlite')
   runtime=ManagedRuntime.make(layer(':memory:'))
   release=()=>{runtime.runSync(runtime.disposeEffect)}
   openRaw=path=>new DatabaseSync(path)
  }
  const run=<A,E>(effect:Effect.Effect<A,E,Client.SqlClient>):A=>runLegacySync(runtime,effect.pipe(Effect.provideService(Scheduler.PreventSchedulerYield,true)),transcriptionCause)
  const sql=run(Client.SqlClient)
  const execute=(statement:string,params:readonly unknown[]=[])=>run(sql.unsafe(statement,params))
  let clock=0,id=0
  const ids=Layer.succeed(TranscriptionIds,{uuid:Effect.sync(()=>`fixture-id-${++id}`),hex:()=>Effect.succeed('00')})
  const service=run(Effect.flatMap(TranscriptionTime,time=>make().pipe(Effect.provideService(TranscriptionTime,{...time,now:Effect.sync(()=>++clock)}))).pipe(Effect.provide(legacyTimeLayer(action=>{run(action)})),Effect.provide(ids)))
  const result:PipelineResult={resultKind:'transcript',modelVersion:'fixture-v1',asrTier:null,language:'en',sourceKind:'captions',speakers:[{speakerKey:'s',displayName:'First'},{speakerKey:'s',displayName:'Last'}],segments:[{startMs:100,endMs:200,text:'later',speakerKey:'s',confidence:.5,words:[{text:'word',startMs:100,endMs:200}]},{startMs:0,endMs:50,text:'earlier',speakerKey:'missing',confidence:null}]}
  const input={transcriptId:'one',downloadTaskId:'d',transcriptionTaskId:'t',sourceFilePath:null,result}
  try{
   run(service.applySchema)
   const one=run(service.commit(input))
   assert.equal(one.segments[1]?.speakerId,one.speakers[1]?.id)
   assert.equal(one.segments[0]?.speakerId,null)
   assert.equal(one.createdAt,1)
   assert.deepEqual(run(service.commit(input)),one)
   assert.equal(clock,2)
   const two=run(service.commit({...input,transcriptId:'two',transcriptionTaskId:'t2',activate:false}))
   assert.equal(two.supersededAt,3)
   assert.equal(run(service.getLatestForDownload('d'))?.id,'one')
   assert.equal(run(service.activate('bad','two')),null)
   assert.equal(run(service.activate('d','two'))?.id,'two')

   for(const table of ['transcripts','transcript_speakers','transcript_segments']){
    const snapshot=run(service.listForDownload('d'))
    execute(`CREATE TRIGGER fail_insert BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'fixture insert failure'); END`)
    assert.throws(()=>run(service.commit({...input,transcriptId:`fail-${table}`,transcriptionTaskId:`fail-${table}`})))
    assert.deepEqual(run(service.listForDownload('d')),snapshot)
    execute('DROP TRIGGER fail_insert')
   }
   const before=clock
   assert.equal(run(service.deleteSegments('two',['missing']))?.id,'two')
   assert.equal(clock,before)
   assert.equal(run(service.updateSegment('two','missing',{})),null)
   const segmentId=two.segments[0]!.id
   assert.equal(run(service.updateSegment('two',segmentId,{text:'edited'}))?.segments[0]?.text,'edited')
   const appended=run(service.appendCaptionCues('two',[{startMs:900,endMs:1000,text:'appended'}]))
   assert.equal(appended.segments.at(-1)?.text,'appended')
   assert.equal(appended.segments[0]?.id,segmentId)
   const inserted=run(service.insertSegment('two',{atMs:500,text:'inserted'}))
   assert.equal(inserted?.record.segments.find(s=>s.id===inserted.segmentId)?.text,'inserted')
   execute("UPDATE transcripts SET result_kind='future-kind',source_kind='future-source'")
   for(const row of [run(service.getById('two')),run(service.getByTranscriptionTaskId('t2')),run(service.getLatestForDownload('d')),run(service.listForDownload('d'))[0],run(service.listLatest)[0],run(service.listHeads)[0],run(service.listHeadsForDownload('d'))[0]]){
    assert.equal(row?.resultKind,'future-kind');assert.equal(row?.sourceKind,'asr')
   }
   trace.length=0
   run(service.listHeads);run(service.listHeadsForDownload('d'));assert.equal(run(service.hasCurrent('d')),true)
   assert(!trace.some(s=>s.includes('transcript_segments')))
   trace.length=0
   run(service.listPlaybackCues('two'));assert(!trace.some(s=>s.includes('words_json')))
   execute('UPDATE transcript_segments SET words_json=?',['[null,{"text":"good","startMs":0,"endMs":1,"extra":true},{"text":"overflow","startMs":1e999,"endMs":2}]'])
   assert.deepEqual(run(service.getById('two'))?.segments[0]?.words,[{endMs:1,startMs:0,text:'good'}])
   execute("UPDATE transcript_segments SET start_ms='invalid'")
   assert.throws(()=>run(service.getById('two')),error=>error instanceof Error&&'_tag' in error&&error._tag==='DbRowDecodeError')
   execute('UPDATE transcript_segments SET start_ms=0,words_json=?',['[]'])
   const snapshot=run(service.listForDownload('d'))
   execute("CREATE TRIGGER fail_update BEFORE UPDATE ON transcripts BEGIN SELECT RAISE(ABORT,'fixture update failure'); END")
   assert.throws(()=>run(service.updateSegment('two',segmentId,{text:'rolled back'})))
   assert.deepEqual(run(service.listForDownload('d')),snapshot)
   execute('DROP TRIGGER fail_update')
   const rowCount=execute('SELECT id FROM transcripts').length
   const nested=sql.withTransaction(Effect.gen(function* (){
    yield* service.commit({...input,transcriptId:'nested',transcriptionTaskId:'nested'})
    return yield* Effect.fail(new Error('outer rollback'))
   })).pipe(Effect.provideService(Client.BeginTransaction,'BEGIN IMMEDIATE'))
   assert.throws(()=>run(nested))
   assert.equal(execute('SELECT id FROM transcripts').length,rowCount)
   run(service.deleteByDownload('d'))
   assert.deepEqual(run(service.listLatest),[])
   assert.deepEqual(execute('SELECT * FROM transcript_segments'),[])
   assert.deepEqual(execute('SELECT * FROM transcript_speakers'),[])
   execute('ALTER TABLE transcripts DROP COLUMN asr_tier')
   execute('ALTER TABLE transcripts DROP COLUMN source_kind')
   execute('ALTER TABLE transcript_segments DROP COLUMN words_json')
   run(service.applySchema)
   assert(execute('PRAGMA table_info(transcripts)').some(row=>Reflect.get(row,'name')==='asr_tier'))
   assert(execute('PRAGMA table_info(transcripts)').some(row=>Reflect.get(row,'name')==='source_kind'))
   assert(execute('PRAGMA table_info(transcript_segments)').some(row=>Reflect.get(row,'name')==='words_json'))
   run(service.applySchema)
   const queueSchema='CREATE TABLE tasks (id TEXT PRIMARY KEY);CREATE TABLE attempts (id TEXT PRIMARY KEY);CREATE TABLE process_journal (ts INTEGER, op TEXT, task_id TEXT, attempt_id TEXT, pid INTEGER, pid_started_at INTEGER, exit_code INTEGER, signal TEXT);'
   for(const statement of queueSchema.split(';'))if(statement)execute(statement)
   execute("INSERT INTO tasks VALUES ('existing')")
   execute("INSERT INTO attempts VALUES ('existing')")
   let closes=0
   const failure=(operation:string)=>(cause:unknown)=>HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})
   const sources=TranscriptMigrationSource.of({open:path=>Effect.acquireRelease(Effect.try({try:()=>{
    const db=openRaw(path);let closed=false
    const close=Effect.try({try:()=>{if(!closed){closed=true;closes++;db.close()}},catch:failure('closeLegacy')})
    return {hasTasks:Effect.try({try:()=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get(),catch:failure('inspectLegacy')}).pipe(Effect.flatMap(decodeRow('tasks')(S.UndefinedOr(MigrationTable))),Effect.map(row=>Boolean(row?.name))),close}
   },catch:failure('openLegacy')}),source=>source.close.pipe(Effect.orDie))})
   const migration=run(makeMigration().pipe(Effect.provideService(TranscriptMigrationSource,sources),Effect.provide(TranscriptionFilesLegacySync)))
   const legacyPath=join(root,"legacy'quote.db")
   assert.deepEqual(run(migration.merge({legacyPath})),{merged:false,tasksCopied:0,attemptsCopied:0,journalCopied:0,backupPath:null})
   const source=openRaw(legacyPath);source.exec(queueSchema);source.exec("INSERT INTO tasks VALUES ('copy');INSERT INTO attempts VALUES ('copy');INSERT INTO process_journal VALUES (1,'start','copy','copy',2,3,NULL,NULL)");source.close()
   writeFileSync(`${legacyPath}.migrated`,'backup')
   assert.deepEqual(run(migration.merge({legacyPath})),{merged:true,tasksCopied:1,attemptsCopied:2,journalCopied:1,backupPath:null})
   assert.deepEqual(run(migration.merge({legacyPath})),{merged:true,tasksCopied:0,attemptsCopied:2,journalCopied:2,backupPath:null})
   assert.equal(closes,2)
   const brokenPath=join(root,'broken.db');const broken=openRaw(brokenPath);broken.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY);INSERT INTO tasks VALUES ('partial')");broken.close()
   assert.throws(()=>run(migration.merge({legacyPath:brokenPath})))
   assert.equal(execute("SELECT id FROM tasks WHERE id='partial'").length,1)
   assert.equal(closes,3)
   assert.equal(existsSync(brokenPath),true)
   assert.equal(existsSync(`${brokenPath}.migrated`),false)
   const emptyPath=join(root,'empty.db');openRaw(emptyPath).close()
   assert.equal(run(migration.merge({legacyPath:emptyPath})).merged,false)
   assert.equal(existsSync(emptyPath),true)
   assert.equal(closes,4)
   const renamePath=join(root,'renamed.db');const renameSource=openRaw(renamePath);renameSource.exec(queueSchema);renameSource.exec("INSERT INTO tasks VALUES ('renamed')");renameSource.close()
   assert.equal(run(migration.merge({legacyPath:renamePath})).backupPath,`${renamePath}.migrated`)
   assert.equal(existsSync(renamePath),false)
   assert.equal(closes,5)
   if(driver==='node'){
    const {layer:nativeLayer}=await import('@vidbee/db/node')
    const scoped=run(makeMigration().pipe(Effect.provide(sourceLayer(nativeLayer)),Effect.provide(TranscriptionFilesLegacySync)))
    assert.equal(run(scoped.merge({legacyPath})).journalCopied,3)
   }else{
    const {default:Database}=await import('better-sqlite3')
    const {layerFromHandle}=await import('../../db/src/BetterSqlite.driver')
    const sourceFactory=(path:string)=>Layer.unwrap(Effect.acquireRelease(Effect.sync(()=>new Database(path)),handle=>Effect.sync(()=>handle.close())).pipe(Effect.map(layerFromHandle)))
    const scoped=run(makeMigration().pipe(Effect.provide(sourceLayer(sourceFactory)),Effect.provide(TranscriptionFilesLegacySync)))
    assert.equal(run(scoped.merge({legacyPath})).journalCopied,3)
   }

  }finally{release();rmSync(root,{recursive:true,force:true})}
 })
}
