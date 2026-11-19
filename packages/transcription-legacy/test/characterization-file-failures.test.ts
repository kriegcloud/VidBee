import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { appendManifestChunk, ensureChunkManifest, findSidecarCaptionTracks, loadChunkManifest, loadPipelineSeed, ModelManager, writePipelineSeed, type ModelManagerOptions } from '@vidbee/transcription-legacy'
const roots:string[]=[]
const root=()=>{const dir=mkdtempSync(join(tmpdir(),'transcription-file-boundary-'));roots.push(dir);return dir}
const seed={language:null,modelVersion:'v',asrTier:null,speakers:[],segments:[{startMs:0,endMs:1,text:'hello',speakerKey:null,confidence:null}]}
afterEach(()=>{for(const dir of roots.splice(0))rmSync(dir,{recursive:true,force:true})})
it('unreadable sidecars are skipped and denied manifest/seed reads recover to null', {timeout:30000},()=>{
  const dir=root();const media=join(dir,'movie.mp4');writeFileSync(media,'');const sidecar=join(dir,'movie.en.vtt');writeFileSync(sidecar,'00:00.0 --> 00:01.0\nhello');const manifest=ensureChunkManifest({workDir:dir,taskId:'t',fingerprint:'f',modelVersion:'v'}).path;const seedPath=join(dir,'seed.json');writePipelineSeed(seedPath,seed)
  for(const path of [sidecar,manifest,seedPath])chmodSync(path,0)
  try {expect(()=>readFileSync(sidecar)).toThrow();expect(findSidecarCaptionTracks(media)).toEqual([]);expect(loadChunkManifest(manifest)).toBeNull();expect(loadPipelineSeed(seedPath)).toBeNull()}
  finally {for(const path of [sidecar,manifest,seedPath])chmodSync(path,0o600)}
})
it('atomic JSON publication replaces existing inode modes with default creation permissions', {timeout:30000},()=>{
  const dir=root();const path=join(dir,'seed.json');writeFileSync(path,'old',{mode:0o400});const before=statSync(path);writePipelineSeed(path,seed);const after=statSync(path)
  expect(after.ino).not.toBe(before.ino);expect(after.mode&0o777).toBe(0o666&~process.umask());expect(loadPipelineSeed(path)).toEqual({...seed,sourceKind:undefined})
  const manifest=ensureChunkManifest({workDir:dir,taskId:'t',fingerprint:'f',modelVersion:'v'}).path;expect(statSync(manifest).mode&0o777).toBe(0o666&~process.umask());chmodSync(manifest,0o400)
  appendManifestChunk(manifest,{index:0,startMs:0,endMs:1,text:'hello',speakerKey:null,confidence:null});expect(statSync(manifest).mode&0o777).toBe(0o666&~process.umask());expect(readdirSync(dir).sort()).toEqual(['chunks.json','seed.json'])
})
it('directory destination forces atomic rename failure and removes owned staging files', {timeout:30000},()=>{
  const dir=root();const destination=join(dir,'seed.json');mkdirSync(destination)
  expect(()=>writePipelineSeed(destination,seed)).toThrow(expect.objectContaining({code:'EISDIR',syscall:'rename'}));expect(statSync(destination).isDirectory()).toBe(true);expect(readdirSync(dir)).toEqual(['seed.json'])
  const work=join(dir,'manifest');mkdirSync(work);mkdirSync(join(work,'chunks.json'))
  expect(()=>ensureChunkManifest({workDir:work,taskId:'t',fingerprint:'f',modelVersion:'v'})).toThrow(expect.objectContaining({code:'EISDIR',syscall:'rename'}));expect(readdirSync(work)).toEqual(['chunks.json']);expect(loadChunkManifest(join(work,'chunks.json'))).toBeNull()
  expect(()=>appendManifestChunk(join(work,'chunks.json'),{index:0,startMs:0,endMs:1,text:'hello',speakerKey:null,confidence:null})).toThrow(`chunk manifest missing: ${join(work,'chunks.json')}`)
  expect(readdirSync(work)).toEqual(['chunks.json'])
})
it('metadata-preserving tokenizer mutation evades assessment cache until mtime changes', {timeout:30000},()=>{
  const dir=root();const folder=join(dir,'tokenizer');mkdirSync(folder);const path=join(folder,'member.json');const good='{"ok":true}';const bad='{"no":true}';writeFileSync(path,good);utimesSync(path,1000,1000)
  type Spec=NonNullable<ModelManagerOptions['catalog']>[number]
  const spec:Spec={id:'tokenizer',fileName:'tokenizer',url:'https://fixture.invalid/tokenizer',required:true,group:'asr',role:'asr-tokenizer',tier:'minimal',directoryMembers:[{name:'member.json',minBytes:2,sha256:createHash('sha256').update(good).digest('hex'),json:true}]}
  const manager=new ModelManager({modelsDir:dir,catalog:[spec]});expect(manager.status(['asr'],['minimal']).ready).toBe(true)
  writeFileSync(path,bad);utimesSync(path,1000,1000);expect(statSync(path).size).toBe(Buffer.byteLength(good));expect(manager.status(['asr'],['minimal']).ready).toBe(true);expect(manager.incompleteModelIssue('minimal')).toBeNull()
  utimesSync(path,1000,1001);expect(manager.status(['asr'],['minimal']).ready).toBe(false);expect(manager.incompleteModelIssue('minimal')).toBe('incomplete model: tokenizer/member.json checksum mismatch. Replace the Qwen3-ASR tokenizer from the official package, or switch to Whisper Tiny.');expect(existsSync(path)).toBe(true)
})
