import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { DownloaderCore } from "../src/downloader-core";
import { NODE } from "./fixtures/node-runtime";

for(const options of [{endIndex:NaN},{endIndex:null},{endIndex:0},{entryIds:null}])test(`review playlist selection ${JSON.stringify(options)}`,async(t)=>{
 const root=mkdtempSync(join(tmpdir(),"vidbee-review-selection-")); const saved={...process.env};
 t.after(()=>{process.env=saved;rmSync(root,{recursive:true,force:true});});
 const binary=join(root,"yt-dlp");
 const raw={entries:[1,2,3].map(id=>({id:String(id),url:`https://fixture.invalid/${id}`}))};
 writeFileSync(binary,`#!${NODE}\nconsole.log(${JSON.stringify(JSON.stringify(raw))});\n`,{mode:0o755});
 for(const name of ["ffmpeg","ffprobe"])writeFileSync(join(root,name),"",{mode:0o755});
 process.env.YTDLP_PATH=binary;process.env.FFMPEG_PATH=join(root,"ffmpeg");process.env.YTDLP_JS_RUNTIME="none";
 const core=new DownloaderCore({downloadDir:join(root,"downloads")});
 const result=await Reflect.apply(core.startPlaylistDownload,core,[{url:"https://fixture.invalid/playlist",type:"video",...options}]);
 assert.equal(result.totalCount,3);
 assert.deepEqual(result.entries.map((entry:{entryId:string})=>entry.entryId),["1","2","3"]);
 for(let i=0;i<500 && core.getStatus().active;i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(core.getStatus().active,0);
});
test("review short non-JSON transient stdout retries three times with two one-second sleeps",async(t)=>{
 const root=mkdtempSync(join(tmpdir(),"vidbee-review-jsonretry-"));const saved={...process.env};
 t.after(()=>{process.env=saved;rmSync(root,{recursive:true,force:true});});
 const bin=join(root,"yt-dlp"),log=join(root,"attempts");
 writeFileSync(bin,`#!${NODE}\nrequire('node:fs').appendFileSync(${JSON.stringify(log)},String(Date.now())+'\\n');process.stdout.write('Read timed out');\n`,{mode:0o755});
 process.env.YTDLP_PATH=bin;process.env.YTDLP_JS_RUNTIME="none";
 const core=new DownloaderCore({downloadDir:join(root,"downloads")});
 await assert.rejects(core.getVideoInfo("https://fixture.invalid/watch"),{name:"SyntaxError",message:'Unexpected token \'R\', "Read timed out" is not valid JSON'});
 const times=readFileSync(log,"utf8").trim().split("\n").map(Number);
 assert.equal(times.length,3);
 assert.ok(times[1]!-times[0]!>=1000);
 assert.ok(times[2]!-times[1]!>=1000);
});
