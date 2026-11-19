import { register, syncBuiltinESMExports } from 'node:module';
import fs from 'node:fs';
import cp from 'node:child_process';
import { pathToFileURL } from 'node:url';
register('./review-import-loader.mjs',import.meta.url);
let trace=[];
const actualExists=fs.existsSync;
fs.existsSync=p=>p==='/fixture/chrome'?true:String(p).startsWith('/fixture/')?false:actualExists(p);
fs.mkdirSync=(p)=>{trace.push(['mkdir',p])};
fs.readdirSync=()=>[];fs.writeFileSync=()=>{};fs.renameSync=()=>{};
cp.spawnSync=()=>({stdout:'/fixture/chrome\n',status:0});
syncBuiltinESMExports();
const api=await import(process.argv[2]?pathToFileURL(process.argv[2]).href:'../../src/onlyfans-profile.ts');
const rows=[];
for(const site of ['onlyfans','fansly']) {
 const profiles=new api.OnlyFansProfiles('/fixture/storage',()=>'/fixture/downloads',site==='fansly'?(await import('../../src/fansly-profile.ts')).fanslyAdapter:undefined);
 const url=`https://${site}.com/fixture`;
 profiles.get(url);trace=[];
 try {await profiles.command({url,action:site==='onlyfans'?'open':'map'});await new Promise(setImmediate)}catch(error){trace.push(['error',error.message])}
 // Mapping reports failures through saved state rather than rejecting.
 for(let i=0;i<100;i++)await new Promise(setImmediate);
 rows.push({site,trace:trace.filter(row=>row[0]==='error'||String(row[1]).endsWith('/browser-session'))});
 await profiles.stop();
}
console.log(JSON.stringify(rows));
