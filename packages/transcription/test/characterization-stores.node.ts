import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { TranscriptStore, buildTranscriptSources, pipelineSeedFromRecord, latestAsrSeed, mergeLegacyTaskQueueDb, type PipelineResult } from '@vidbee/transcription'
const result = (): PipelineResult => ({ resultKind: 'transcript', modelVersion: 'v1', asrTier: null, language: 'en', sourceKind: 'captions', speakers: [{ speakerKey: 's', displayName: 'First' }, { speakerKey: 's', displayName: 'Second' }], segments: [{ startMs: 100, endMs: 200, speakerKey: 's', text: 'later', words: [{ text: 'word', startMs: 100, endMs: 200 }], confidence: 0.5 }, { startMs: 0, endMs: 50, speakerKey: 'absent', text: 'earlier', confidence: null }] })
const setup = () => { const sql: string[] = []; const db = new Database(':memory:', { verbose: statement => sql.push(String(statement)) }); let time = 0; const store = new TranscriptStore({ db, clock: () => ++time }); return { db, store, sql, clock: () => time } }
test('SQL real handle: complete hydration, duplicate speaker keys, query shapes and all lookup paths', { timeout: 30000 }, t => {
  const { db, store, sql } = setup(); t.after(() => db.close())
  const row = store.commit({ transcriptId: 'one', downloadTaskId: 'd', transcriptionTaskId: 'task', sourceFilePath: '/fixture/media', result: result() })
  assert.equal(row.segments[1]?.speakerId, row.speakers[1]?.id)
  const ids = new Map<string,string>(); const id = (value: string | null): string | null => { if (value === null || value === 'one') return value; const found = ids.get(value); if(found) return found; const next = `id-${ids.size+1}`; ids.set(value,next); return next }
  const normalized = { ...row, speakers: row.speakers.map(s => ({ ...s, id: id(s.id) })), segments: row.segments.map(s => ({ ...s, id: id(s.id), speakerId: id(s.speakerId) })) }
  assert.deepEqual(normalized, { id: 'one', downloadTaskId: 'd', transcriptionTaskId: 'task', resultKind: 'transcript', modelVersion: 'v1', asrTier: null, language: 'en', sourceFilePath: '/fixture/media', sourceKind: 'captions', supersededAt: null, createdAt: 1, updatedAt: 1, speakers: [{ id:'id-1',speakerKey:'s',displayName:'First',sortIndex:0 },{ id:'id-2',speakerKey:'s',displayName:'Second',sortIndex:1 }], segments:[{ id:'id-3',speakerId:null,startMs:0,endMs:50,text:'earlier',words:[],confidence:null,sortIndex:1 },{ id:'id-4',speakerId:'id-2',startMs:100,endMs:200,text:'later',words:[{text:'word',startMs:100,endMs:200}],confidence:0.5,sortIndex:0 }] })
  assert(sql.some(s => s === 'BEGIN IMMEDIATE')); assert(sql.some(s => s === 'COMMIT'))
  for(const read of [() => store.getById('one'), () => store.getByTranscriptionTaskId('task'), () => store.getLatestForDownload('d'), () => store.listForDownload('d')[0], () => store.listLatest()[0]]) { assert.deepEqual(read(),row); assert.notEqual(read(),row) }
  sql.length=0; assert.equal(store.listHeads()[0]?.id,'one'); assert.equal(store.listHeadsForDownload('d')[0]?.id,'one'); assert.equal(store.hasCurrent('d'),true)
  assert(!sql.some(s => s.includes('transcript_segments')))
  sql.length=0; assert.deepEqual(store.listPlaybackCues('one'), row.segments.map(({ words, ...cue }) => cue)); assert(!sql.some(s => s.includes('words_json')))
  db.prepare("UPDATE transcripts SET result_kind = 'future-kind', source_kind = 'future-source'").run()
  for(const read of [() => store.getById('one'), () => store.getByTranscriptionTaskId('task'), () => store.getLatestForDownload('d'), () => store.listForDownload('d')[0], () => store.listLatest()[0], () => store.listHeads()[0], () => store.listHeadsForDownload('d')[0]]) { assert.equal(read()?.resultKind,'future-kind'); assert.equal(read()?.sourceKind,'asr') }
  assert.equal(pipelineSeedFromRecord(store.getById('one')),null); assert.equal(latestAsrSeed(store,'d'),null)
  assert.deepEqual(buildTranscriptSources({ current:null,stored:store.listHeads(),tracks:[] }),[])
})
test('SQL words tolerant reader and section 9 nonfinite/wrong row candidates', { timeout: 30000 }, t => {
  const { db,store }=setup(); t.after(() => db.close()); store.commit({ transcriptId:'one', downloadTaskId:'d', transcriptionTaskId:'t', sourceFilePath:null,result:result() })
  const cases: Array<[string, unknown]> = [['{',[]],['null',[]],['{}',[]],['[null,7,{"text":"x","startMs":0,"endMs":1,"extra":true},{"text":"bad","startMs":"0","endMs":1}]',[{text:'x',startMs:0,endMs:1}]],['[{"text":"overflow","startMs":1e999,"endMs":2}]',[{text:'overflow',startMs:Infinity,endMs:2}]]]
  for(const [raw,expected] of cases) { db.prepare('UPDATE transcript_segments SET words_json=?').run(raw); assert.deepEqual(store.getById('one')?.segments.map(s => s.words),[expected,expected]) }
  db.prepare("UPDATE transcript_segments SET start_ms='wrong', confidence='bad'").run(); const row=store.getById('one'); assert.equal(row?.segments[0]?.startMs,'wrong'); assert.equal(row?.segments[0]?.confidence,'bad')
})
test('SQL idempotence allocates clock early, inactive/superseded reinserts, edits and no-ops', { timeout: 30000 }, t => {
  const { db,store,clock }=setup(); t.after(() => db.close()); const input={ transcriptId:'one',downloadTaskId:'d',transcriptionTaskId:'t',sourceFilePath:null,result:result() }
  const one=store.commit(input); assert.deepEqual(store.commit(input),one); assert.equal(clock(),2)
  const two=store.commit({ ...input,transcriptId:'two',transcriptionTaskId:'t2',activate:false }); assert.equal(two.supersededAt,3); assert.equal(store.getLatestForDownload('d')?.id,'one')
  assert.equal(store.activate('bad','two'),null); assert.equal(store.activate('d','two')?.id,'two')
  assert.equal(store.commit({ ...input,transcriptId:'three' }).id,'three'); assert.equal(store.listForDownload('d').length,3)
  const before=clock(); assert.equal(store.deleteSegments('three',['absent'])?.id,'three'); assert.equal(clock(),before)
  assert.equal(store.updateSegment('three','missing',{}),null); assert.equal(store.insertSegment('missing',{}),null)
  const original=store.getById('three'); const segment=original?.segments[0]; assert(segment)
  const patched=store.updateSegment('three',segment.id,{ text:segment.text,startMs:50 }); assert.deepEqual(patched?.segments.find(s => s.id===segment.id)?.words,[])
  const appended=store.appendCaptionCues('three',[{startMs:900,endMs:1000,text:'append'}]); assert(appended.segments.some(s=>s.id===segment.id)); assert.equal(appended.segments.at(-1)?.text,'append')
  const inserted=store.insertSegment('three',{atMs:200,text:'new'}); assert(inserted); assert.equal(inserted.record.segments.find(s=>s.id===inserted.segmentId)?.text,'new')
  assert.equal(store.deleteSegments('three',inserted.record.segments.map(s=>s.id))?.resultKind,'transcript')
  assert.throws(()=>store.appendCaptionCues('missing',[]),{message:'Caption transcript is unavailable'})
  store.deleteByDownload('d'); assert.deepEqual(store.listLatest(),[]); assert.deepEqual(db.prepare('SELECT * FROM transcript_segments').all(),[]); assert.deepEqual(db.prepare('SELECT * FROM transcript_speakers').all(),[])
})
test('SQL each insert stage rolls back atomically and preserves driver error; borrowed transaction survives', { timeout: 30000 }, t => {
  const {db,store,sql}=setup(); t.after(()=>db.close()); const input={transcriptId:'base',downloadTaskId:'d',transcriptionTaskId:'base',sourceFilePath:null,result:result()}; store.commit(input)
  for(const table of ['transcripts','transcript_speakers','transcript_segments']) {
    db.exec(`CREATE TRIGGER fail_insert BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END`)
    assert.throws(()=>store.commit({...input,transcriptId:'failed',transcriptionTaskId:'failed'}),error=> error instanceof Error && error.name==='SqliteError' && error.message==='fixture write failure')
    assert.equal(store.getById('failed'),null); assert.equal(store.getLatestForDownload('d')?.id,'base'); db.exec('DROP TRIGGER fail_insert')
  }
  db.exec('BEGIN'); store.commit({...input,transcriptId:'nested',transcriptionTaskId:'nested'}); assert.equal(db.inTransaction,true); assert(sql.some(s=>s.startsWith('SAVEPOINT'))); db.exec('ROLLBACK'); assert.equal(store.getById('nested'),null); assert.equal(store.getLatestForDownload('d')?.id,'base')
})
test('SQL upgrades pre-tier/pre-words/pre-source schema synchronously and repeat application is harmless', { timeout: 30000 }, t => {
  const {db}=setup(); t.after(()=>db.close())
  db.exec('ALTER TABLE transcripts DROP COLUMN asr_tier'); db.exec('ALTER TABLE transcripts DROP COLUMN source_kind'); db.exec('ALTER TABLE transcript_segments DROP COLUMN words_json')
  const store=new TranscriptStore({db,clock:()=>10}); store.applySchema()
  assert.deepEqual(db.prepare('PRAGMA table_info(transcripts)').all().map(row=>Object.getOwnPropertyDescriptor(row,'name')?.value).slice(-2),['asr_tier','source_kind'])
  assert.equal(store.commit({transcriptId:'migrated',downloadTaskId:'d',transcriptionTaskId:'t',sourceFilePath:null,result:result()}).id,'migrated')
})
const queueSchema = `CREATE TABLE tasks (id TEXT PRIMARY KEY); CREATE TABLE attempts (id TEXT PRIMARY KEY); CREATE TABLE process_journal (ts INTEGER, op TEXT, task_id TEXT, attempt_id TEXT, pid INTEGER, pid_started_at INTEGER, exit_code INTEGER, signal TEXT);`
test('legacy queue merge counts target totals, backup existence allows repeated journal copying, missing source/no tasks', { timeout:30000 },t=>{
  const dir=mkdtempSync(join(tmpdir(),'transcription-merge-')); const legacyPath=join(dir,"legacy'quote.db"); const target=new Database(':memory:'); t.after(()=>{target.close();rmSync(dir,{recursive:true,force:true})}); target.exec(queueSchema); target.exec("INSERT INTO tasks VALUES ('existing'); INSERT INTO attempts VALUES ('existing');")
  assert.deepEqual(mergeLegacyTaskQueueDb({target,legacyPath,openLegacy:path=>new Database(path)}),{merged:false,tasksCopied:0,attemptsCopied:0,journalCopied:0,backupPath:null})
  const legacy=new Database(legacyPath); legacy.exec(queueSchema); legacy.exec("INSERT INTO tasks VALUES ('copied'); INSERT INTO attempts VALUES ('copied'); INSERT INTO process_journal VALUES (1,'start','copied','copied',2,3,NULL,NULL)");legacy.close()
  writeFileSync(`${legacyPath}.migrated`,'existing backup')
  assert.deepEqual(mergeLegacyTaskQueueDb({target,legacyPath,openLegacy:path=>new Database(path)}),{merged:true,tasksCopied:1,attemptsCopied:2,journalCopied:1,backupPath:null})
  assert.deepEqual(mergeLegacyTaskQueueDb({target,legacyPath,openLegacy:path=>new Database(path)}),{merged:true,tasksCopied:0,attemptsCopied:2,journalCopied:2,backupPath:null}); assert.equal(existsSync(legacyPath),true)
  const empty=join(dir,'empty.db'); new Database(empty).close(); assert.equal(mergeLegacyTaskQueueDb({target,legacyPath:empty,openLegacy:path=>new Database(path)}).merged,false); assert.equal(existsSync(empty),true)
})
test('legacy queue merge publishes rename and leaves partial writes after a later statement fails', {timeout:30000},t=>{
  const dir=mkdtempSync(join(tmpdir(),'transcription-merge-failure-'));const target=new Database(':memory:');t.after(()=>{target.close();rmSync(dir,{recursive:true,force:true})});target.exec(queueSchema)
  const source=join(dir,'legacy.db');const legacy=new Database(source);legacy.exec(queueSchema);legacy.exec("INSERT INTO tasks VALUES ('t')");legacy.close()
  const success=mergeLegacyTaskQueueDb({target,legacyPath:source,openLegacy:path=>new Database(path)});assert.equal(success.backupPath,`${source}.migrated`);assert.equal(existsSync(source),false)
  const broken=join(dir,'broken.db'); const invalid=new Database(broken);invalid.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY); INSERT INTO tasks VALUES ('partial')"); invalid.close()
  assert.throws(()=>mergeLegacyTaskQueueDb({target,legacyPath:broken,openLegacy:path=>new Database(path)}),{message:'no such table: legacy_tq.attempts'})
  assert.deepEqual(target.prepare("SELECT * FROM tasks WHERE id='partial'").get(),{id:'partial'});assert.equal(existsSync(broken),true);assert.equal(existsSync(`${broken}.migrated`),false)
})
test('SQL edit/append/activation/deletion rollback their intermediate writes', {timeout:30000},t=>{
  const {db,store}=setup();t.after(()=>db.close())
  const input={transcriptId:'one',downloadTaskId:'d',transcriptionTaskId:'t',sourceFilePath:null,result:result()};store.commit(input);store.commit({...input,transcriptId:'two',transcriptionTaskId:'t2',activate:false})
  const before=store.listForDownload('d');const cue=before.find(row=>row.id==='one')?.segments[0];assert(cue)
  for(const operation of [()=>store.updateSegment('one',cue.id,{text:'changed'}),()=>store.appendCaptionCues('one',[{startMs:500,endMs:600,text:'new'}]),()=>store.insertSegment('one',{}),()=>store.deleteSegments('one',[cue.id]),()=>store.activate('d','two')]) {
    db.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON transcripts BEGIN SELECT RAISE(ABORT, 'fixture update failure'); END")
    assert.throws(operation,{name:'SqliteError',message:'fixture update failure'});assert.deepEqual(store.listForDownload('d'),before);db.exec('DROP TRIGGER fail_update')
  }
  db.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON transcripts BEGIN SELECT RAISE(ABORT, 'fixture delete failure'); END")
  assert.throws(()=>store.deleteByDownload('d'),{name:'SqliteError',message:'fixture delete failure'});assert.deepEqual(store.listForDownload('d'),before)
})
