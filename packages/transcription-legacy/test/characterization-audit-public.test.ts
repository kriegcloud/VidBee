import './fixtures/audit-isolation'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import * as T from '@vidbee/transcription-legacy'
import * as Asr from '@vidbee/transcription-legacy/asr'
import * as Cloud from '@vidbee/transcription-legacy/cloud'
import * as CloudRunner from '@vidbee/transcription-legacy/cloud-runner'
import * as Concurrency from '@vidbee/transcription-legacy/concurrency'
import * as Mirrors from '@vidbee/transcription-legacy/download-mirrors'
const roots:string[]=[]
afterEach(()=>{vi.useRealTimers();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
it('audit every non-callable public constant value and cross-entry identity',()=>{
 const entries={root:T,asr:Asr,concurrency:Concurrency,cloud:Cloud,cloudRunner:CloudRunner,mirrors:Mirrors}
 // Stateful singleton exports are covered through their API, not serializable constants.
 for(const [name,entry] of Object.entries(entries)){
  const values=Object.fromEntries(Object.entries(entry).filter(([key,value])=>typeof value!=='function'&&key!=='transcriptionPartials'))
  expect(values).toMatchSnapshot(name)
  if(name!=='root')for(const [key,value] of Object.entries(values))if(key in T)expect(Reflect.get(T,key)).toBe(value)
 }
})
it('audit caption language sidecar import replaces current record and missing language returns null',()=>{
 const root=mkdtempSync(join(tmpdir(),'audit-captions-'));roots.push(root);const source=join(root,'movie.mp4');writeFileSync(source,'media')
 for(const [language,text] of [['en','hello'],['fr','bonjour']])writeFileSync(join(root,`movie.${language}.vtt`),`WEBVTT\n\n00:00.000 --> 00:01.000\n${text}\n`)
 let time=0;const store=new T.MemoryTranscriptStore({clock:()=>++time})
 const old=store.commit({transcriptId:'old',downloadTaskId:'d',transcriptionTaskId:'old-task',sourceFilePath:source,result:{resultKind:'no-speech',modelVersion:'old',asrTier:null,language:null,speakers:[],segments:[]}})
 const row=T.switchToCaptionLanguage({store,downloadTaskId:'d',sourceFilePath:source,language:'fra',preferredLanguages:['en']});expect(row?.language).toBe('fr');expect(old.supersededAt).toBe(2)
 const ids:string[]=[];const normalized=JSON.parse(JSON.stringify({row,history:store.listForDownload('d')},(key,value)=>key==='sourceFilePath'?basename(value):typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value)?`id-${ids.indexOf(value)<0?ids.push(value)-1:ids.indexOf(value)}`:value))
 expect(normalized).toMatchSnapshot();expect(T.switchToCaptionLanguage({store,downloadTaskId:'d',sourceFilePath:source,language:'de'})).toBeNull()
})
for(const reason of [new Error('caller stop'),'caller stop'])it(`audit mirror in-flight user abort ${typeof reason}`,async()=>{
 vi.useFakeTimers();const controller=new AbortController();const attempts:AbortSignal[]=[]
 const pending=Mirrors.fetchFirstOk(['https://fixture.invalid/a','https://fixture.invalid/b'],async(_url,init)=>new Promise((_resolve,reject)=>{const signal=init?.signal;expect(signal).toBeInstanceOf(AbortSignal);if(signal){attempts.push(signal);signal.addEventListener('abort',()=>reject(new Error('transport abort')))}}),{signal:controller.signal})
 const assertion=reason instanceof Error?expect(pending).rejects.toBe(reason):expect(pending).rejects.toMatchObject({name:'AbortError',message:'download cancelled'})
 expect(attempts).toHaveLength(1);controller.abort(reason);await assertion;expect(attempts[0]?.reason).toBe(reason);expect(attempts).toHaveLength(1);expect(vi.getTimerCount()).toBe(0)
})
