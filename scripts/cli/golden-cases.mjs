import assert from 'node:assert/strict';
import {mkdir,writeFile,rm,symlink,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startLoopback} from '../../apps/desktop/scripts/port/golden/loopback.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const cli=path.join(root,'apps/cli/dist/index.mjs');
/** Additional executable scenarios; projections are explicit and raw answers remain in scratch. */
export async function runExtendedCliCases({runDir,build,client,record,command,roots,env}) {
  const evidence=path.join(runDir,'cli-extended');await mkdir(evidence,{recursive:true});
  const server=await startLoopback(runDir);
  const output=path.join(evidence,'downloads');await mkdir(output);
  const alias=path.join(root,'.golden-cli-'+path.basename(path.dirname(runDir)));await symlink(output,alias);
  roots.unshift([alias,'<run>/cli-extended/downloads']);
  const stream=await client.events();const raw=[];const ids=[];
  const invoke=async(label,args,overrides={},rawStdout=false)=>{
    const result=await command(process.execPath,[cli,'--vidbee-no-autostart',...args],{env:{...env,...overrides}});
    let stdout=result.stdout;if(!rawStdout){try{stdout=JSON.parse(result.stdout);}catch{}}
    const value={code:result.code,signal:result.signal,stdout,stderr:result.stderr};raw.push({label,args,value});return value;
  };
  const project=value=>{
    const task=value.stdout?.task;
    if(!task)return value;
    // Queue progress values and full task logs depend on observation timing, as in loopback snapshots.
    const {progress,log,...stable}=task;
    return {...value,stdout:{...value.stdout,task:{...stable,...(progress?{progressFields:Object.keys(progress)}:{})}}};
  };
  const wait=async(id,predicate)=>{
    const end=Date.now()+30000;
    while(Date.now()<end){const response=await client.mcp('get_task',{id});const task=response.result?.structuredContent?.result;
      raw.push({tool:'get_task',id,response});if(task&&predicate(task))return task;await delay(20);}
    throw Error('CLI extended task condition timed out');
  };
  const args=(route,label)=>['--ignore-config','--no-playlist','--retries','0','--fragment-retries','0','--no-part','-o',path.join(alias,label+'.%(ext)s'),server.url+'/'+route];
  const control=async(action,id)=>{const value=await invoke('control-'+action,[':download',action,id]);assert.equal(value.code,0);await record('cli/extended/control-'+action,value);};
  try {
    for(const [name,args]of [['parse',['--vidbee-typo']],['parse-pretty',['--vidbee-pretty','--vidbee-typo']],['unknown-verb',[':download','unknown']]])await record('cli/extended/'+name,await invoke(name,args,{},name==='parse-pretty'));
    const fake=path.join(evidence,'probe');await writeFile(fake,`#!${process.execPath}\nif(process.argv.includes('--get-url')){process.stdout.write('x'.repeat(33*1024*1024));}else{process.stdout.write('fixture probe\\n');process.stderr.write('fixture tail\\n');process.exitCode=process.argv.includes('--dump-json')?7:0;}\n`,{mode:0o755});
    for(const flag of ['--version','--dump-json','--get-url']){
      const value=await invoke('probe-'+flag,[flag],{YTDLP_PATH:fake});
      await record('cli/extended/probe-'+flag.slice(2),value);
    }
    const binaries={YTDLP_PATH:path.join(build,'resources/resources/yt-dlp_linux'),FFMPEG_PATH:path.join(build,'resources/resources/ffmpeg')};
    for(const [label,route] of [['wait-success','cli-success.mp4'],['wait-failed','404-cli.mp4']]){
      const value=await invoke(label,['--vidbee-wait','--vidbee-no-retry',...args(route,label)]);
      if(value.stdout?.task?.id)ids.push(value.stdout.task.id);
      assert.equal(value.code,label==='wait-success'?0:1,JSON.stringify(value));
      await record('cli/extended/'+label,project(value));
    }
    const retryWait=await invoke('wait-retry-scheduled',['--vidbee-wait','--vidbee-max-attempts','2',...args('500-cli.mp4','wait-retry')]);
    assert.equal(retryWait.code,1);assert.equal(retryWait.stdout.task.status,'retry-scheduled');ids.push(retryWait.stdout.task.id);
    await record('cli/extended/wait-retry-scheduled',project(retryWait));
    await invoke('cancel-retry',[':download','cancel',retryWait.stdout.task.id]);
    const pendingPause=invoke('wait-paused',['--vidbee-wait','--vidbee-no-retry',...args('slow-cli-wait-paused.mp4','wait-paused')]);
    let pausedId;const pauseDeadline=Date.now()+30000;
    while(!pausedId&&Date.now()<pauseDeadline){
      pausedId=stream.values.find(event=>event.type==='snapshot-changed'&&event.task?.input?.url===server.url+'/slow-cli-wait-paused.mp4')?.taskId;
      if(!pausedId)await delay(20);
    }
    assert.ok(pausedId,'wait admission must appear on the subscribed event stream');ids.push(pausedId);
    await wait(pausedId,task=>task.status==='running'&&task.progress.bytesDownloaded>0&&server.requests.some(request=>request.path==='/slow-cli-wait-paused.mp4'&&request.method==='GET'));
    await invoke('pause-wait',[':download','pause',pausedId]);
    const pausedWait=await pendingPause;assert.equal(pausedWait.code,1);assert.equal(pausedWait.stdout.task.status,'paused');
    await record('cli/extended/wait-paused',project(pausedWait));
    await invoke('cancel-paused',[':download','cancel',pausedId]);
    // Subscribe before admission and require a body request plus positive transfer progress.
    const admitted=await invoke('control-admission',['--vidbee-no-retry',...args('slow-cli-control.mp4','control')]);
    const id=admitted.stdout.task.id;ids.push(id);
    await wait(id,task=>task.status==='running'&&task.progress.bytesDownloaded>0&&server.requests.some(request=>request.path==='/slow-cli-control.mp4'&&request.method==='GET'));
    await control('pause',id);await wait(id,task=>task.status==='paused');
    await control('resume',id);await wait(id,task=>task.status==='running'||task.status==='completed');
    await control('cancel',id);await wait(id,task=>task.status==='cancelled');
    await control('retry',id);await wait(id,task=>task.status==='running'||task.status==='completed');
    await invoke('cleanup-cancel',[':download','cancel',id]);await wait(id,task=>['cancelled','completed','failed'].includes(task.status));
    const removals=[];
    for(const id of ids){const removed=await invoke('history-remove',[':history','remove',id]);assert.equal(removed.code,0);assert.deepEqual(removed.stdout.result.removed,[id]);removals.push(removed);}
    const history=await invoke('history-after-removal',[':history','list','--limit','1000']);
    assert.equal(history.code,0);
    for(const id of ids)assert.equal(history.stdout.result.items.some(task=>task.id===id),false);
    await record('cli/extended/history-remove',{removals,history});
    for(const waitForCompletion of [true,false]){
      const label=waitForCompletion?'local-wait':'local-detached';
      const value=await invoke(label,['--vidbee-local',...(waitForCompletion?['--vidbee-wait']:[]),...args('cli-'+label+'.mp4',label)],binaries);
      assert.equal(value.code,0,JSON.stringify(value));await record('cli/extended/'+label,project(value));
    }
    const sqlite=await command(process.execPath,[path.join(root,'scripts/cli/golden-sql.runner.mjs'),evidence],{env});
    assert.equal(sqlite.code,0,sqlite.stderr);await record('cli/extended/local-sqlite',JSON.parse(sqlite.stdout));
    // Probe the real loopback media separately from the deterministic byte fixture.
    const probe=await invoke('loopback-probe',['--dump-json',server.url+'/cli-probe.mp4'],binaries);
    assert.equal(probe.code,0,JSON.stringify(probe));const metadata=JSON.parse(probe.stdout.ytDlp.stdout);
    await record('cli/extended/loopback-probe',{code:probe.code,signal:probe.signal,ok:probe.stdout.ok,ext:metadata.ext,protocol:metadata.protocol});
  } finally {
    await writeFile(path.join(evidence,'raw.json'),JSON.stringify(raw,null,2));
    await writeFile(path.join(evidence,'events.json'),JSON.stringify(stream.values,null,2));
    await stream.close();await server.close();await rm(alias,{force:true});
  }
}
