import Wrapped from "yt-dlp-wrap-plus";
let Wrap=Wrapped;while(typeof Wrap!=="function")Wrap=Wrap.default;
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const scalars=[undefined,null,false,true,0,7,NaN,'','fixture'];
const settings={downloadPath:'/fixture/out',cookieSource:{type:'file',path:'/fixture/cookies'},browserForCookies:'none',cookiesPath:'',proxy:'',configPath:'',downloadSubtitles:false,subtitleLanguages:['en'],interfaceLanguage:'en',embedSubs:false,writeAutoSubs:false,embedThumbnail:false,embedMetadata:false,embedChapters:false,filenameStyle:'pretty',filenameViaVidBee:false,shareWatermark:true,downloadWithoutChannelSubfolders:false,downloadMirror:'auto'};
const options={media:'all',scope:'post',authorOnly:false,expandThreads:false,linkedMedia:true,slideshowAudio:false,since:'2026-01-01',until:'2026-12-31',maxPosts:2};
const mutations=(seed,p=[])=>Object.entries(seed).flatMap(([k,v])=>[...scalars.map(x=>({path:[...p,k],value:x})),...(v&&typeof v==='object'?mutations(v,[...p,k]):[])]);
const mutate=(seed,{path,value})=>{const v=structuredClone(seed);let o=v;for(const k of path.slice(0,-1))o=o[k];o[path.at(-1)]=value;return v;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function runStateful(modules,{browserOnly=false}={}){
 const root=mkdtempSync(join(tmpdir(),'vidbee-third-input-')),bin=join(root,'gallery');
 writeFileSync(bin,`#!${process.execPath}\nif(process.argv.includes('-J'))console.log(JSON.stringify({id:'playlist',title:'Playlist',entries:[{id:'one',url:'https://fixture.invalid/one',title:'One'}],formats:[]}));else console.log('[]');\n`,{mode:0o755});
 const normalize=v=>JSON.parse(JSON.stringify(v,(k,v)=>{if(v===undefined)return {$review:'undefined'};if(typeof v==='number'&&!Number.isFinite(v))return {$review:String(v)};if(['createdAt','completedAt','updatedAt','expiresAt'].includes(k))return '<time>';if(typeof v==='string'){if(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v)||/^(playlist_group_|instagram_profile_group_)/.test(v))return '<id>';return v.replaceAll(root,'<root>');}return v;}));
 const all=[];
 async function call(name,seed,invoke){if(process.env.REVIEW_ONLY&&!process.env.REVIEW_ONLY.split(',').includes(name))return;if(browserOnly){seed=structuredClone(seed);const visit=o=>{if(!o||typeof o!=='object')return;for(const [k,v]of Object.entries(o)){if(k==='cookieSource'&&v&&typeof v==='object')v.browser='chrome';else visit(v);}};visit(seed);}const changes=browserOnly?mutations(seed).filter(x=>x.path.at(-1)==='browser'):[{path:[],value:undefined},...mutations(seed)];for(const change of changes){const input=change.path.length?mutate(seed,change):structuredClone(seed);let result;if(process.env.REVIEW_PROGRESS)console.log(name,change.path.join("."),String(change.value));try{result={value:normalize(await invoke(input))};}catch(e){result={error:e?.constructor?.name,message:e?.message,engine:e instanceof TypeError||e instanceof RangeError||typeof e?.code==='string'};}let original=seed;for(const key of change.path)original=original[key];const excluded=Array.isArray(original)&&!Array.isArray(change.value)&&change.path.length>0&&change.path.at(-1)!=='itemIds'&&((change.value!==undefined&&change.value!==null)||(change.path.at(-1)==='categories'&&name.startsWith('enqueue')));all.push({name,path:change.path,value:change.value,excluded,result});}}
 const fakeQueue=()=>{const trace=[];return {trace,setMaxPerGroup:async(...a)=>{trace.push(['cap',...a]);},get:()=>undefined,add:async r=>{trace.push(['add',r]);return {id:r.id??'added'};},list:()=>({tasks:[],nextCursor:null}),retryManual:async()=>{}};};
 const inspection={inspectionId:'fixture',expiresAt:Number.MAX_SAFE_INTEGER,complete:true,profile:{username:'fixture',profileUrl:'https://www.instagram.com/fixture/'},categories:[{category:'posts',state:'ready',sourceCount:1,assetCount:1,items:[{id:'one',url:'https://www.instagram.com/p/ONE/',assetCount:1}]}],totalSourceCount:1,totalAssetCount:1};
 await call('enqueueInstagramProfileDownload',{inspectionId:'fixture',categories:['posts'],itemIds:['one'],settings,customDownloadPath:'/fixture/out'},async input=>{const queue=fakeQueue();const value=await modules.instagram.enqueueInstagramProfileDownload({queue,inspector:{get:id=>id==='fixture'?({inspection:structuredClone(inspection),categoryUrls:{posts:'https://www.instagram.com/fixture/posts/'}}):null},input,defaultDownloadDir:'/fixture/out',batch:{id:'batch',title:'Batch'},priority:0});return {value,trace:queue.trace};});
 await call('downloadSocialMedia',{url:'https://x.com/fixture',categories:['tweets'],options,settings,customDownloadPath:'/fixture/out'},async input=>{const queue=fakeQueue();const value=await modules.social.downloadSocialMedia(queue,input,{id:'batch',title:'Batch',order:1});return {value,trace:queue.trace};});

 await call('enqueue.outer',{input:{inspectionId:'fixture',categories:['posts'],itemIds:['one'],settings,customDownloadPath:'/fixture/out'},defaultDownloadDir:'/fixture/out',batch:{id:'batch',title:'Batch'},priority:0},async request=>{const queue=fakeQueue();const value=await modules.instagram.enqueueInstagramProfileDownload({...request,queue,inspector:{get:id=>id==='fixture'?({inspection:structuredClone(inspection),categoryUrls:{posts:'https://www.instagram.com/fixture/posts/'}}):null}});return {value,trace:queue.trace};});
 await call('mapSocialMediaProfile',{url:'https://x.com/fixture/tweets',settings,mapOptions:{knownIds:['1']}},async input=>{const items=[];const result=await modules.social.mapSocialMediaProfile(input.url,{resolveBinaryPath:()=>bin,resolveExtraArgs:()=>[]},input.settings,new AbortController().signal,item=>items.push(item),input.mapOptions);return {result,items};});
 const inspector=new modules.instagram.InstagramProfileInspector({resolveBinaryPath:()=>bin,resolveExtraArgs:()=>[],clock:()=>1000});
 await call('inspector.inspect',{url:'https://instagram.com/fixture',settings,categories:[]},async input=>{const value=await inspector.inspect(input.url,input.settings,input.categories);return value;});
 await call('inspector.cancel',{url:'https://instagram.com/fixture'},input=>inspector.cancel(input.url));
 await call('inspector.list',{argument:undefined},input=>inspector.list(input.argument));
 await inspector.stop();
 const managerDir=join(root,'profiles');mkdirSync(managerDir);
 const manager=new modules.manager.SocialProfileManager({storageDir:managerDir,runtime:{resolveBinaryPath:()=>bin,resolveExtraArgs:()=>[]},resolveYtDlpPath:()=>bin});
 await call('manager.map',{url:'https://x.com/fixture',category:'tweets',settings,options:{incremental:true}},async input=>{let value;try{value=manager.map(input.url,input.category,input.settings,input.options);}finally{await manager.stop('https://x.com/fixture');}return value;});
 await call('manager.mapAndWait',{url:'https://x.com/fixture',category:'tweets',settings,options:{incremental:true,signal:undefined}},input=>manager.mapAndWait(input.url,input.category,input.settings,input.options));
 await call('previewSocialMedia',{url:'https://x.com/fixture/status/12345',settings},input=>modules.social.previewSocialMedia(input.url,{resolveBinaryPath:()=>bin,resolveExtraArgs:()=>[]},input.settings));
 // Freeze only fixture time and randomness; production task IDs are projected separately.
 const now=Date.now,random=Math.random;Date.now=()=>1000;Math.random=()=>0.5;
 try{
  const coreSeed={url:'https://fixture.invalid/video',singleVideo:true,socialMedia:options,type:'video',title:'Title',thumbnail:'https://fixture.invalid/image',duration:1,description:'Description',channel:'Channel',uploader:'Uploader',viewCount:2,tags:['tag'],selectedFormat:{formatId:'1',ext:'mp4',vcodec:'h264',acodec:'aac',width:1920,height:1080,fps:30,filesize:1,filesizeApprox:1,formatNote:'note',tbr:1,quality:1,protocol:'https',language:'en',videoExt:'mp4',audioExt:'m4a'},playlistId:'playlist',playlistTitle:'Playlist',playlistIndex:1,playlistSize:1,format:'best',audioFormat:'best',audioFormatIds:['1'],startTime:'',endTime:'',customDownloadPath:root,customFilenameTemplate:'%(title)s.%(ext)s',containerFormat:'mp4',settings:{...settings,downloadPath:root}};
  async function coreCall(input,method){const core=new modules.core.DownloaderCore({downloadDir:root,runtimeSettings:{...settings,downloadPath:root},maxConcurrent:1});Object.assign(core,{initialized:true,binaryPath:bin,ffmpegLocation:root,ytdlp:new Wrap(bin)});try{return await core[method](input);}finally{await sleep(50);for(const task of core.listDownloads())await core.cancelDownload(task.id);await sleep(1);}}
  await call('createDownload',coreSeed,input=>coreCall(input,'createDownload'));
  await call('startPlaylistDownload',{url:'https://fixture.invalid/playlist',type:'video',entryIds:['one'],startIndex:1,endIndex:1,format:'best',audioFormat:'best',audioFormatIds:['1'],customDownloadPath:root,customFilenameTemplate:'%(title)s.%(ext)s',containerFormat:'mp4',settings:{...settings,downloadPath:root}},input=>coreCall(input,'startPlaylistDownload'));
 }finally{Date.now=now;Math.random=random;rmSync(root,{recursive:true,force:true});}
 return all;
}
export async function inspectorConcurrency(InstagramProfileInspector,mode){
 const root=mkdtempSync(join(tmpdir(),'vidbee-third-concurrent-')),bin=join(root,'gallery'),log=join(root,'calls');
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 writeFileSync(bin,`#!${process.execPath}\nconst fs=require('node:fs'),url=process.argv.at(-1);fs.appendFileSync(${JSON.stringify(log)},url+'\\n');const name=url.includes('/aaa/')?'a':url.includes('/bbb/')?'b':'c';const cat=url.includes('/reels/')?'reels':'posts';const gate=${JSON.stringify(root)}+'/'+name+'-'+cat;setInterval(()=>{if(fs.existsSync(gate)){console.log('[]');process.exit(0)}},5);`,{mode:0o755});
 const api=new InstagramProfileInspector({storageDir:root,resolveBinaryPath:()=>bin,resolveExtraArgs:()=>[],clock:()=>1000});
 let other;
 const urls=['https://instagram.com/aaa','https://instagram.com/bbb'];const trace=[];
 const compact=xs=>xs.map(x=>({owner:x.profile.username,mapping:x.mapping}));
 const wait=async predicate=>{for(let i=0;i<500;i++){if(predicate())return;await sleep(5);}throw new Error('fixture checkpoint timed out');};
 const calls=()=>existsSync(log)?readFileSync(log,'utf8').trim().split('\n'):[];
 try{
  if(mode==='prepare-failure'){
   const b=await api.inspect(urls[1],undefined,[]);writeFileSync(join(root,b.inspectionId+'.json'),'{');
   // Restart so the corrupt file is not masked by the old inspector's cache.
   const bad=other=new InstagramProfileInspector({storageDir:root,resolveBinaryPath:()=>bin,resolveExtraArgs:()=>[],clock:()=>1000});
   const a=bad.inspect(urls[0],undefined,['posts']);await wait(()=>calls().length===1);let settled=false;
   const bWork=bad.inspect(urls[1],undefined,['posts']).then(()=>{settled=true;trace.push('unexpected-success');},e=>{settled=true;trace.push(e.message);});
   await wait(()=>settled);trace.push({cancel:bad.cancel(urls[1])});writeFileSync(join(root,'a-posts'),'');await Promise.all([a,bWork]);await bad.stop();return trace;
  }
  const a=api.inspect(urls[0],undefined,['posts']);const middle=api.inspect(urls[0],undefined,['reels']);const b=api.inspect(urls[1],undefined,['posts']);
  await wait(()=>calls().length===1);trace.push(compact(api.list()));
  if(mode==='cancel-first'){trace.push(api.cancel(urls[0]));await Promise.all([a,middle]);await wait(()=>calls().some(x=>x.includes('/bbb/')));trace.push(compact(api.list()));writeFileSync(join(root,'b-posts'),'');await b;}
  else if(mode==='cancel-middle'){// Use the other profile in the middle to target only one request.
   writeFileSync(join(root,'a-posts'),'');await a;await wait(()=>calls().some(x=>x.includes('/reels/')));trace.push(compact(api.list()));trace.push(api.cancel(urls[0]));await middle;await wait(()=>calls().some(x=>x.includes('/bbb/')));writeFileSync(join(root,'b-posts'),'');await b;
  }else{writeFileSync(join(root,'a-posts'),'');const first=await a;trace.push({snapshot:first.mapping});await wait(()=>calls().some(x=>x.includes('/reels/')));trace.push(compact(api.list()));writeFileSync(join(root,'a-reels'),'');await middle;await wait(()=>calls().some(x=>x.includes('/bbb/')));trace.push(compact(api.list()));writeFileSync(join(root,'b-posts'),'');await b;}
  trace.push(calls().map(x=>new URL(x).pathname));trace.push(compact(api.list()));return trace;
 }finally{if(other)await other.stop();await api.stop();rmSync(root,{recursive:true,force:true});}
}
