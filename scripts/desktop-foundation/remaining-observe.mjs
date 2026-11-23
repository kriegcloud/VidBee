import { sharedMatrixObservations } from './shared-matrix.mjs'
import { windowMatrixObservations } from './window-matrix.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { sourceLoader, root } from './source-harness.mjs'
const turns=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
export async function remainingObservations() {
  const out={sharedMatrix:sharedMatrixObservations(),windowMatrix:windowMatrixObservations(),window:[],kernel:[],skills:[]}
  for(const initiallyMaximized of [false,true]) {
    const trace=[],window=new EventEmitter();let max=false
    Object.assign(window,{getNormalBounds:()=>({width:901,height:702}),isMinimized:()=>false,isFullScreen:()=>false,isMaximized:()=>max,maximize:()=>{trace.push(['maximize']);max=true;window.emit('maximize')}})
    class Store{constructor(options){trace.push(['store',options])}set(value){trace.push(['set',value])}}
    const module=sourceLoader({electron:{app:{getPath:()=>'/synthetic/profile'}},'electron-log/main':{warn:(...args)=>trace.push(['warn',...args])},'electron-store':Store})('apps/desktop/src/main/lib/window-state.ts')
    module.rememberMainWindowState(window,initiallyMaximized);const beforeShow=trace.slice()
    window.emit('resize');window.emit('show');window.emit('close');const beforeClosed=trace.slice();window.emit('closed')
    out.window.push({initiallyMaximized,beforeShow,beforeClosed,trace})
  }
  for(const mode of ['snapshot','snapshot-rejection','retry-rejection','preparing','progress','failed','recovered','race']) {
    const trace=[],values=[],errors=[];let effect,resolve,reject,retryReject,retryResolve,live
    const snapshot=new Promise((a,b)=>{resolve=a;reject=b}),retry=new Promise((a,b)=>{retryResolve=a;retryReject=b})
    let atomId=0
    const module=sourceLoader({react:{useEffect:fn=>{effect=fn},useCallback:fn=>fn},jotai:{atom:value=>({id:atomId++,value}),useAtom:atom=>[atom.value,value=>values.push(value)]},
      '../lib/ipc':{ipcEvents:{on:(channel,fn)=>{trace.push(['subscribe',channel]);live=fn;return fn},removeListener:(channel)=>trace.push(['remove',channel])},ipcServices:{app:{getYtDlpKernelStatus:()=>{trace.push(['snapshot']);return snapshot},retryYtDlpKernelPreparation:()=>{trace.push(['retry']);return retry}}}},
      '../lib/logger':{logger:{error:(message,error)=>errors.push([message,error.message])}}
    })('apps/desktop/src/renderer/src/store/ytdlp-kernel.ts')
    const initial=module.ytdlpKernelStatusAtom.value,hook=module.useYtDlpKernelStatus(),off=effect()
    const statuses={preparing:{ready:false,state:'preparing',source:null,ytDlpVersion:null,nodeVersion:null,progress:0,preparationStep:'copying',error:null},progress:{ready:false,state:'preparing',source:'bundled',ytDlpVersion:'old',nodeVersion:'node-old',progress:37,preparationStep:'validating',error:null},failed:{ready:false,state:'unavailable',source:'bundled',ytDlpVersion:null,nodeVersion:'fixture-node',progress:null,preparationStep:null,error:'preparation failed'},recovered:{ready:true,state:'up-to-date',source:'bundled',ytDlpVersion:'fixture-ytdlp',nodeVersion:'fixture-node',progress:null,preparationStep:null,error:null}}
    if(mode==='race')live(statuses.progress)
    if(mode==='snapshot-rejection')reject(Error('snapshot failed'));else resolve(statuses[mode]??statuses.recovered)
    await turns()
    if(['preparing','progress','failed','recovered','race'].includes(mode)){for(const status of Object.values(statuses))live(status);const p=hook.retry();retryResolve(statuses[mode]??statuses.recovered);await p}
    if(mode==='retry-rejection'){const p=hook.retry().then(value=>({value}),error=>({error:error.message}));retryReject(Error('retry failed'));out.kernel.push({mode,initial,trace,values,errors,retry:await p})}
    else out.kernel.push({mode,initial,trace,values,errors})
    off()
  }
  const documents=Object.fromEntries(fs.readdirSync(path.join(root,'skills')).sort().filter(name=>fs.existsSync(path.join(root,'skills',name,'SKILL.md'))).map(name=>[name,fs.readFileSync(path.join(root,'skills',name,'SKILL.md'),'utf8')]))
  for(const [mode,input] of Object.entries({repository:documents,ordered:{z:'---\nname: z\ndescription: last\n---\n Z ',a:'---\nname: a\ndescription: first\n---\n A '},missing:{bad:'no frontmatter'},yaml:{bad:'---\nname: [\n---\nbody'}})) {
    const calls=[];let outcome
    try{const module=sourceLoader({$glob:(...args)=>{calls.push(args);return input}})('apps/desktop/src/shared/builtin-skills.ts');outcome={skills:module.BUILTIN_SKILLS}}
    catch(error){outcome={error:{name:error.name,message:error.message}}}
    out.skills.push({mode,calls,outcome})
  }
  class Clock extends Date { static now(){return 1700000000123} }
  const shared=sourceLoader({$Date:Clock,$glob:()=>documents})
  const prompts=shared('apps/desktop/src/compatibility/shared/ai-prompts.ts')
  const runs=shared('apps/desktop/src/compatibility/shared/ai-run.ts')
  const pending=shared('apps/desktop/src/compatibility/shared/utils/pending-download.ts')
  const groups=shared('apps/desktop/src/shared/ai-provider-groups.ts')
  const files=shared('apps/desktop/src/compatibility/shared/utils/download-file.ts')
  const providers=[['z','First','m1','one'],['a','Second','m2','two'],['b','First','m3','one']].map(([id,name,modelId,groupId])=>({id,name,modelId,groupId,presetId:'fixture',baseUrl:'https://fixture.invalid/'}))
  out.shared={groups:groups.groupAiProviders(providers),fileNames:files.buildFileNameCandidates(' Title ','mp4','Title.f123.mp4'),filePaths:files.buildFilePathCandidates('/fixture','Title','mp4','Title.mp4','/fixture/Title.mp4'),chat:prompts.agentChatPrompt(),chatExplicit:prompts.agentChatPrompt(7,false),presetOrder:prompts.AI_PROMPT_PRESETS,
    idle:runs.idlePromptRunSnapshot('download','prompt'),idleExplicit:runs.idlePromptRunSnapshot('download','prompt',7),
    pending:pending.buildPendingDownloadItem('fixture',{url:'https://fixture.invalid',type:'video',title:'  Title  ',viewCount:0,duration:0,tags:['z','a','z']})}
  return JSON.parse(JSON.stringify(out))
}
