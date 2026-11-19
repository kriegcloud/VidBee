import assert from "node:assert/strict";
import fs, { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { NODE } from "./fixtures/node-runtime";
import { SourceAdmission } from "@vidbee/task-queue-legacy/source-admission";
import { mapThreadsProfile } from "../src/threads-profile-map";
import { mapFacebookProfile } from "../src/facebook-profile-map";
import { YtDlpExecutor } from "../src/yt-dlp-executor";

import type { ExecutorFinishEvent, ExecutorRun } from "@vidbee/task-queue-legacy";

for (const mode of ["spawn", "mapping", "write", "abort"]) test(`review Threads cleanup ${mode}`, {timeout:5000}, async(t)=>{
 const root=mkdtempSync(join(tmpdir(),"vidbee-review-cleanup-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const bin=join(root,"fake.cjs"),ready=join(root,"ready");
 writeFileSync(bin,`#!${NODE}\nrequire('node:fs').writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000)\n`,{mode:0o755});
 const controller=new AbortController(); const directories:string[]=[];const trace:string[]=[];
 const original=fs.promises.mkdtemp;
 fs.promises.mkdtemp=async (...args:Parameters<typeof fs.promises.mkdtemp>)=>{
   const directory=await original(...args);
   if(String(args[0]).includes("vidbee-threads-map-") && typeof directory==="string"){
    directories.push(directory);if(mode==="write")fs.mkdirSync(join(directory,"known-items.json"));
   } return directory;
 };
 syncBuiltinESMExports();
 t.after(()=>{fs.promises.mkdtemp=original;syncBuiltinESMExports();});
 class Admission extends SourceAdmission {override async acquire(){return ()=>{trace.push("release");assert.equal(directories.every(existsSync),true);};}}
 t.after(()=>controller.abort());
 const work=mapThreadsProfile("https://www.threads.com/@fixture/media","fixture",{
  admission:new Admission(),resolveGalleryDlPath:()=>mode==="spawn"?join(root,"missing"):bin,
  resolveYtDlpPath:()=>bin,resolveGalleryDlArgs:()=>{if(mode==="mapping")throw new Error("mapping fixture");return [];}
 },undefined,controller.signal,()=>{},{knownIds:["1"]});
 if(mode==="abort"){
  for(let i=0;i<500&&!existsSync(ready);i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(existsSync(ready),true);controller.abort();await work;
 }else await assert.rejects(work);
 assert.deepEqual(trace,["release"]);assert.equal(directories.length,1);
 assert.equal(directories.some(existsSync),false);
});

for(const output of ["[]","null","", "{", '{"entries":[{"url":false},{"url":0},{"url":""},{"url":"https://fixture.invalid/video"}]}', '{"entries":[{"url":7}]}','{"entries":[{"url":"abc","ie_key":0}]}'])test(`review Facebook reels JSON ${output}`,async(t)=>{
 const root=mkdtempSync(join(tmpdir(),"vidbee-review-reels-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const bin=join(root,"fake.cjs");writeFileSync(bin,`#!${NODE}\nprocess.stdout.write(${JSON.stringify(output)});\n`,{mode:0o755});
 const work=mapFacebookProfile("https://facebook.com/fixture/reels","reels","fixture",{resolveGalleryDlPath:()=>bin,resolveYtDlpPath:()=>bin,resolveGalleryDlArgs:()=>[]},undefined,new AbortController().signal,()=>{});
 if(output==="[]"||output.includes("false"))assert.deepEqual(await work,{complete:true});
 else {
  const expected=output==="null"?"Cannot read properties of null (reading 'entries')":output.includes('"url":7')?"entry.url.trim is not a function":output.includes('"ie_key":0')?"entry.ie_key?.toLowerCase is not a function":undefined;
  if(expected)await assert.rejects(work,{name:"TypeError",message:expected});
  else await assert.rejects(work,(error)=>{try{JSON.parse(output)}catch(old){assert.equal((error as Error).constructor,(old as Error).constructor);assert.equal((error as Error).message,(old as Error).message);return true;}return false;});
 }
});

for(const cancel of [false,true])test(`review fallback spawn throw cancellation=${cancel}`,async()=>{
 const stderr=new PassThrough();const emitter=Object.assign(new EventEmitter(),{ytDlpProcess:{stdout:new PassThrough(),stderr,kill:()=>true}});
 const finishes:ExecutorFinishEvent[]=[];let calls=0;let run:ExecutorRun;
 const executor=new YtDlpExecutor({resolveYtDlpPath:()=>"fixture",resolveFfmpegLocation:()=>"ffmpeg",defaultDownloadDir:"/fixture",
 spawnFn:()=>{if(++calls===2){if(cancel)run.cancel();throw new Error("Permission denied fixture");}return emitter;}});
 run=executor.run({taskId:"t",attemptId:"a",attemptNumber:1,input:{kind:"video",url:"https://fixture.invalid/watch"}},{onSpawn(){},onProgress(){},onProcessing(){},onStd(){},onFinish(e){finishes.push(e);}});
 stderr.emit("data",Buffer.from("Unable to download video subtitles for en"));
 emitter.emit("close",1);
 for(let i=0;i<100&&!finishes.length;i++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(calls,2);assert.equal(finishes.length,1);
 const result=finishes[0]!.result;
 if(cancel)assert.deepEqual(result,{type:"cancelled"});
 else {assert.equal(result.type,"error");if(result.type==="error")assert.equal(result.error.category,"permission-denied");}
});
