// Parity boundary: valid arguments and successful JSON scalar/null/NaN fallbacks
// retain exact results. Outside the declared types, old engine/Node failures only
// require a new throw; deliberate errors and the reviewed external-data exceptions
// retain their exact class/message. Structural wrong types are excluded except
// playlist JSON fields (rule 5); invalid dual data-first dispatch is excluded.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { win32 } from "node:path";
import { windowsProfileBasename, windowsProfileIsAbsolute } from "../../downloader-core/src/yt-dlp-args";
import { mapPlaylistInfo } from "../../downloader-core/src/playlist-plan";
import { resolveYtDlpWrapCtor } from "../../downloader-core/src/yt-dlp-wrap";

const undefinedMarker=Symbol("undefined");
const snapshots = JSON.parse(readFileSync(new URL("./fixtures/review-pure-oracle.json",import.meta.url),"utf8"),(_key,value)=>{
 if(value && typeof value==="object" && "$review" in value) return value.$review==="undefined"?undefinedMarker:Number(value.$review);
 return value;
});
function restore(value:unknown):void {
 if(value===null || typeof value!=="object")return;
 for(const [key,item] of Object.entries(value)) {
  if(item===undefinedMarker)Reflect.set(value,key,undefined);else restore(item);
 }
}
restore(snapshots);
const groups = Object.groupBy(snapshots, (entry: {module:string}) => entry.module);
for(const [module,entries] of Object.entries(groups))test(`review pinned-Node pure oracle: ${module}`,async()=>{
 const mod=await import(module==="download-file" ? "../src/download-file.ts" : `../../downloader-core/src/${module}.ts`);
 for(const entry of entries??[]){
  let actual:unknown;
  let threw=false;
  try{const value=mod[entry.name](...structuredClone(entry.args));actual=typeof value==="function"?{function:true}:{value};}
  catch(error){threw=true;actual=entry.comparison==="throws"?undefined:{error:(error as Error).constructor.name,message:(error as Error).message,...(typeof (error as NodeJS.ErrnoException).code==="string"?{code:(error as NodeJS.ErrnoException).code}:{})};}
  if(entry.comparison==="throws") {
   assert.ok(threw,`${entry.name}(${JSON.stringify(entry.args)}) must still throw`);
  }else assert.deepEqual(actual,entry.expected,`${entry.name}(${JSON.stringify(entry.args)})`);
 }
});
test("review Windows profile primitives match Node over generated paths",()=>{
 const parts=["","a","C:","C:\\","\\","/","\\\\server\\share","C:/","..",".","folder."," "];
 for(const a of parts)for(const sep of ["/","\\","//","\\\\"])for(const b of parts){
  const value=a+sep+b;
  assert.equal(windowsProfileIsAbsolute(value),win32.isAbsolute(value),value);
  assert.equal(windowsProfileBasename(value),win32.basename(value),value);
 }
});
test("review playlist raw field values retain old results and method messages",()=>{
 for(const url of [false,0,"",null,undefined,NaN]){
  assert.equal(mapPlaylistInfo({entries:[{url},{url:"https://fixture.invalid/v"}]},"id").entryCount,1);
 }
 for(const url of [7,true,{},[]])assert.throws(()=>mapPlaylistInfo({entries:[{url}]},"id"),{name:"TypeError",message:"entry.url.trim is not a function"});
 for(const ie_key of [0,false,7,{},[]])assert.throws(()=>mapPlaylistInfo({entries:[{url:"abc",ie_key}]},"id"),{name:"TypeError",message:"entry.ie_key?.toLowerCase is not a function"});
});
test("review wrapper constructor resolves direct and nested constructors",()=>{
 class Fixture {}
 for(const value of [Fixture,{default:Fixture},{default:{default:Fixture}}])assert.equal(resolveYtDlpWrapCtor(value),Fixture);
});
