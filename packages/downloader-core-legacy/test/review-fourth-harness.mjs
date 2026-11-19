import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
export async function fourthRound(modules){
 const root=mkdtempSync(join(tmpdir(),'vidbee-fourth-')),out=[];
 const now=Date.UTC(2029,0,1), originalNow=Date.now, originalTZ=process.env.TZ;Date.now=()=>now;
 const run=async(kind,stdout,stderr)=>{
  const bin=join(root,'fake.cjs');writeFileSync(bin,`#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(stdout)});process.stderr.write(${JSON.stringify(stderr)});process.exitCode=${stderr?1:0};\n`,{mode:0o755});
  const progress=[];let emitter;
  const executor=kind==='gallery'?new modules.gallery.GalleryDlExecutor({resolveBinaryPath:()=>bin,defaultDownloadDir:root,clock:()=>now}):new modules.yt.YtDlpExecutor({resolveYtDlpPath:()=>bin,resolveFfmpegLocation:()=>'ffmpeg',defaultDownloadDir:root,clock:()=>now,spawnFn:()=>{emitter=Object.assign(new EventEmitter(),{ytDlpProcess:{stdout:new PassThrough(),stderr:new PassThrough(),kill:()=>true}});return emitter;}});
  const finish=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('executor timeout')),5000);executor.run({taskId:'t',attemptId:'a',attemptNumber:1,input:{kind:stderr?'video':'social-media',url:stderr?'https://fixture.invalid/watch':'https://x.com/fixture/tweets'}},{onSpawn(){},onProgress(e){progress.push(e)},onStd(){},onFinish(e){clearTimeout(timer);resolve(e)}});if(emitter){emitter.ytDlpProcess.stderr.emit('data',Buffer.from(stderr));emitter.emit('close',1);}});
  return JSON.parse(JSON.stringify({progress,finish},(key,value)=>typeof value==='string'?value.replaceAll(root,'<root>'):value));
 };
 try{
  const manifest=join(root,'.vidbee','social-media.sqlite');mkdirSync(join(root,'.vidbee'));writeFileSync(manifest,'manifest');
  const summary={posts:2,images:1,videos:1,downloaded:2,existing:0,failed:0,totalSize:10,reason:'exhausted',manifestPath:manifest,startedAt:1};
  for(const field of ['posts','images','videos','downloaded','existing','failed','totalSize'])for(const value of [-1,0.5])for(const type of ['progress','complete']){
   const line=event=>'__VIDBEE_SOCIAL__\t'+JSON.stringify(event)+'\n';
   out.push({case:`${type}.${field}=${value}`,result:await run('gallery',line({type,summary:{...summary,[field]:value}})+line({type:'complete',summary}),'')});
  }
  for(const tz of ['UTC','America/Chicago']){process.env.TZ=tz;for(const header of ['Tue, 01 Jan 2030 12:00:00','Tue, 01 Jan 2030 12:00:00 CST','Tue, 01 Jan 2030 12:00:00 GMT','120'])for(const kind of ['gallery','yt'])out.push({case:`${tz}.${kind}.${header}`,result:await run(kind,'',`HTTP Error 429: Too Many Requests\nRetry-After: ${header}\n`)});}
  writeFileSync(join(root,'fake.cjs'),`#!${process.execPath}\nconsole.log('[]');\n`,{mode:0o755});
  if(modules.social){for(const knownIds of [null,undefined,[],['1']]){
   out.push({case:`known-file.${String(knownIds)}`,result:await modules.social.writeKnownItemsFile(root,knownIds)});
   out.push({case:`known-map.${String(knownIds)}`,result:await modules.social.mapSocialMediaProfile('https://x.com/fixture/tweets',{resolveBinaryPath:()=>join(root,'fake.cjs'),resolveExtraArgs:()=>[]},undefined,new AbortController().signal,()=>{},{knownIds})});
   out.push({case:`known-threads.${String(knownIds)}`,result:await modules.threads.mapThreadsProfile('https://www.threads.net/@fixture','fixture',{resolveGalleryDlPath:()=>join(root,'fake.cjs'),resolveYtDlpPath:()=>join(root,'fake.cjs'),resolveGalleryDlArgs:()=>[]},undefined,new AbortController().signal,()=>{},{knownIds})});
  }}
  return JSON.parse(JSON.stringify(out,(key,value)=>typeof value==='string'?value.replaceAll(root,'<root>'):value));
 }finally{Date.now=originalNow;if(originalTZ===undefined)delete process.env.TZ;else process.env.TZ=originalTZ;rmSync(root,{recursive:true,force:true});}
}
