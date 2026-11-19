import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { captionsTaskId, commitCaptionTrack, importSidecarCaptionsIfPresent, isTextSubtitleCodec, latestTranscriptHead, MemoryTranscriptStore, recordForTranscriptSource, reindexTranscriptSegments, resolveInsertSegmentPlacement, seedDurationMs, singleSpeakerTurns, type PipelineResult, type TranscriptSegment, type TranscriptSourceOption } from '@vidbee/transcription'
const roots:string[]=[]
afterEach(()=>{for(const dir of roots.splice(0))rmSync(dir,{recursive:true,force:true})})
it('direct caption task IDs, codec matrix and caption commit guards remain synchronous', {timeout:30000},()=>{
  expect([undefined,null,'',' ','eng','AI_zh','zh-TW'].map(language=>captionsTaskId('download:colon',language))).toEqual(['captions:download:colon','captions:download:colon','captions:download:colon','captions:download:colon','captions:download:colon:en','captions:download:colon:ai-zh','captions:download:colon:zh-tw'])
  expect([undefined,null,'','subrip','ASS','hdmv_pgs_subtitle','dvd_subtitle','DVB_SUBTITLE','unknown'].map(isTextSubtitleCodec)).toEqual([true,true,true,true,true,false,false,false,true])
  const store=new MemoryTranscriptStore({clock:()=>100});const input={store,downloadTaskId:'d',sourceFilePath:'/fixture/media',convertScript:false,track:{language:'eng',format:'vtt' as const,text:'00:00.0 --> 00:01.0\nhello'}}
  const record=commitCaptionTrack(input);expect(record?.language).toBe('en');expect(record?.transcriptionTaskId).toBe('captions:d:en');expect(record?.segments.map(({text,startMs,endMs})=>({text,startMs,endMs}))).toEqual([{text:'hello',startMs:0,endMs:1000}]);expect(record).not.toBeInstanceOf(Promise)
  expect(commitCaptionTrack({...input,track:{...input.track,language:'chat'}})).toBe(record)
  expect(commitCaptionTrack({...input,downloadTaskId:'chat',track:{...input.track,language:'chat'}})).toBeNull()
  expect(commitCaptionTrack({...input,downloadTaskId:'empty',track:{...input.track,text:'invalid subtitle'}})).toBeNull()
  const asr:PipelineResult={resultKind:'transcript',modelVersion:'v',asrTier:null,language:null,speakers:[],segments:[]};store.commit({downloadTaskId:'asr',transcriptionTaskId:'a',transcriptId:'asr',sourceFilePath:null,result:asr})
  expect(commitCaptionTrack({...input,downloadTaskId:'asr'})).toBeNull()
})
it('direct sidecar import returns current identity before probing and imports a found track synchronously', {timeout:30000},()=>{
  const dir=mkdtempSync(join(tmpdir(),'helper-sidecar-'));roots.push(dir);const media=join(dir,'movie.mp4');writeFileSync(media,'');writeFileSync(join(dir,'movie.en.vtt'),'00:00.0 --> 00:01.0\nhello')
  const store=new MemoryTranscriptStore({clock:()=>10});const input={store,downloadTaskId:'d',sourceFilePath:media,preferredLanguages:['en']};const imported=importSidecarCaptionsIfPresent(input);expect(imported?.segments[0]?.text).toBe('hello');expect(importSidecarCaptionsIfPresent({...input,sourceFilePath:'/missing'})).toBe(imported);expect(importSidecarCaptionsIfPresent({...input,downloadTaskId:'missing',sourceFilePath:'/missing'})).toBeNull()
})
it('head and source readers retain selected/fallback references and exact literal predicates', {timeout:30000},()=>{
  const store=new MemoryTranscriptStore({clock:()=>10});const result:PipelineResult={resultKind:'transcript',modelVersion:'v',asrTier:null,language:'en',sourceKind:'captions',speakers:[],segments:[]};const caption=store.commit({downloadTaskId:'d',transcriptionTaskId:'caption',transcriptId:'caption',sourceFilePath:null,result});const asr=store.commit({downloadTaskId:'d',transcriptionTaskId:'asr',transcriptId:'asr',sourceFilePath:null,result:{...result,sourceKind:'asr'}})
  expect(latestTranscriptHead([caption,asr],null)).toBe(asr);expect(latestTranscriptHead([caption],null)).toBeNull();expect(latestTranscriptHead([caption],'caption')).toBe(caption);expect(latestTranscriptHead([],'missing')).toBeNull()
  const selected:TranscriptSourceOption={auto:false,key:'captions:en',kind:'captions',language:'en',languageCode:'en',selected:true}
  expect(recordForTranscriptSource(selected,[asr,caption],null)).toBe(caption);expect(recordForTranscriptSource({...selected,language:'fr'},[asr,caption],asr)).toBe(asr);expect(recordForTranscriptSource(undefined,[],caption)).toBe(caption);expect(recordForTranscriptSource({...selected,key:'asr',kind:'asr'},[caption,asr],caption)).toBe(asr);expect(recordForTranscriptSource({...selected,key:'asr',kind:'asr'},[caption],caption)).toBeNull()
})
it('direct reindex/placement, seed duration and single speaker vectors pin nonfinite and soft defaults', {timeout:30000},()=>{
  const first:TranscriptSegment={id:'a',startMs:100,endMs:300,text:'a',words:[],speakerId:'s',confidence:null,sortIndex:5};const second={...first,id:'b',startMs:100,endMs:200,sortIndex:1};const input=[first,second];const indexed=reindexTranscriptSegments(input);expect(indexed.map(row=>({id:row.id,sortIndex:row.sortIndex}))).toEqual([{id:'b',sortIndex:0},{id:'a',sortIndex:1}]);expect(indexed[0]).not.toBe(second);expect(indexed[0]?.words).toBe(second.words);expect(input[0]?.sortIndex).toBe(5)
  expect([{}, {afterId:'a'}, {beforeId:'b'}, {afterId:'missing',atMs:200}, {startMs:-3.7,endMs:Infinity}, {atMs:NaN}, {afterId:'a',speakerId:null}].map(options=>resolveInsertSegmentPlacement(input,options))).toMatchSnapshot('direct placement')
  expect([0,-1,1,NaN,Infinity].map(singleSpeakerTurns)).toMatchSnapshot('single turns')
  const seed={language:null,modelVersion:'v',asrTier:null,speakers:[],segments:[{startMs:100,endMs:50,text:'reverse',speakerKey:null,confidence:null},{startMs:0,endMs:500,text:'last',speakerKey:null,confidence:null}]};expect(seedDurationMs(seed)).toBe(500);expect(seedDurationMs({...seed,segments:[]})).toBe(0);expect(seedDurationMs({...seed,segments:[{...seed.segments[0]!,endMs:NaN}]})).toBeNaN();expect(seedDurationMs({...seed,segments:[{...seed.segments[0]!,endMs:Infinity}]})).toBe(Infinity)
})
