import './fixtures/audit-isolation'
import { afterEach, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ModelManager, type ModelManagerOptions } from '@vidbee/transcription'
import { preferChinaMirrors } from '@vidbee/transcription/download-mirrors'
const roots:string[]=[]
const root=()=>{const dir=mkdtempSync(join(tmpdir(),'audit-models-'));roots.push(dir);return dir}
const spec={id:'audit',fileName:'sherpa-onnx-whisper-tiny/tokens.txt',url:'https://github.com/fixture/releases/download/v/tokens.txt',required:true,group:'asr' as const,role:'asr-tokens' as const,tier:'minimal' as const}
const clean=(value:unknown,dir:string)=>JSON.parse(JSON.stringify(value).replaceAll(dir,'<ROOT>'))
afterEach(()=>{vi.restoreAllMocks();for(const dir of roots.splice(0))rmSync(dir,{recursive:true,force:true})})
it('audit redownload removes every catalog path and shared cache before default ensure and returns complete status',async()=>{
 const dir=root();const other={...spec,id:'other',fileName:'other/file',tier:'whisper-base' as const};const calls:unknown[]=[]
 const models=new ModelManager({modelsDir:dir,catalog:[{...spec,tier:undefined},other],resolveUrls:s=>[s.url],fetchImpl:async(url,init)=>{calls.push([String(url),Object.keys(init??{}),existsSync(join(dir,'.downloads')),existsSync(join(dir,'other/file'))]);return new Response('fresh')}})
 for(const name of [spec.fileName,other.fileName,'.downloads/stale']){mkdirSync(join(dir,name,'..'),{recursive:true});writeFileSync(join(dir,name),'old')}
 const status=await models.redownload();expect(readFileSync(join(dir,spec.fileName),'utf8')).toBe('fresh');expect(existsSync(join(dir,other.fileName))).toBe(false);expect(existsSync(join(dir,'.downloads'))).toBe(false)
 expect({calls,status:clean(status,dir)}).toMatchSnapshot()
},30000)
it('audit redownload bypasses tier busy deletion guard and coexists with existing ensure',async()=>{
 const dir=root();let release:(response:Response)=>void=()=>{};let count=0
 const models=new ModelManager({modelsDir:dir,catalog:[spec],resolveUrls:s=>[s.url],fetchImpl:async()=>{count++;if(count===1)return new Promise(done=>release=done);return new Response('redownload')}})
 const pending=models.ensureReady({tiers:['minimal']});void pending.catch(()=>{});expect(()=>models.removeTier('minimal')).toThrow('cannot delete minimal while it is downloading')
 const deadline=Date.now()+25000;while(count===0&&Date.now()<deadline)await new Promise<void>(done=>setImmediate(done));expect(count).toBe(1);const redownload=models.redownload();await expect(redownload).rejects.toThrow('model not ready after download');release(new Response('original'));expect((await pending).ready).toBe(true);expect(count).toBe(1)
},30000)
it('audit ensureReadyAllowCancel resolves complete current status only for recognized cancellation',async()=>{
 const dir=root();const models=new ModelManager({modelsDir:dir,catalog:[spec],resolveUrls:s=>[s.url],fetchImpl:async(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason)))})
 const pending=models.ensureReadyAllowCancel({tiers:['minimal']});models.cancelDownload('minimal');expect(clean(await pending,dir)).toMatchSnapshot()
 const error=new Error('other failure');const failed=new ModelManager({modelsDir:root(),catalog:[spec],resolveUrls:s=>[s.url],fetchImpl:async()=>{throw error}});await expect(failed.ensureReadyAllowCancel({tiers:['minimal']})).rejects.toBe(error)
},30000)
it('audit manager reads preference per download, boolean preference and live default environment',async()=>{
 const observations:unknown[]=[];const old=process.env.VIDBEE_DOWNLOAD_MIRROR
 try{
 for(const mode of ['function','boolean','default'] as const){const dir=root();let china=false;const calls:string[]=[]
 const options:Partial<ModelManagerOptions>=mode==='function'?{preferChina:()=>china}:mode==='boolean'?{preferChina:true}:{}
 const models=new ModelManager({modelsDir:dir,catalog:[spec],...options,fetchImpl:async url=>{calls.push(String(url));return String(url)=== (china||mode==='boolean'?'https://github.com/fixture/releases/download/v/tokens.txt':'https://www.modelscope.cn/models/pengzhendong/sherpa-onnx-whisper-tiny/resolve/master/tokens.txt')?new Response('new'):new Response(null,{status:503})}})
 for(const enabled of [false,true]){china=enabled;process.env.VIDBEE_DOWNLOAD_MIRROR=enabled?'cn':'global';const before=calls.length;models.removeTier('minimal');await models.ensureReady({tiers:['minimal']});observations.push({mode,china:enabled,urls:calls.slice(before)})}
 }
 process.env.VIDBEE_DOWNLOAD_MIRROR='cn';expect(preferChinaMirrors({mirror:'auto'})).toBe(true)
 expect(observations).toMatchSnapshot()
 }finally{if(old===undefined)delete process.env.VIDBEE_DOWNLOAD_MIRROR;else process.env.VIDBEE_DOWNLOAD_MIRROR=old}
},30000)
