import { EventEmitter } from 'node:events'
import { sourceLoader } from './source-harness.mjs'
export function windowMatrixObservations() {
  const out=[]
  for(const seed of [{width:910,height:710,maximized:true},{width:820,height:610},{width:0,height:'bad',maximized:'true'},null])for(const failure of ['none','read','write'])for(const mode of ['normal','hidden','minimized','fullscreen'])for(const event of ['resize','maximize','unmaximize','close']) {
    const trace=[];let bounds={width:900,height:700},max=false
    class Store {get store(){if(failure==='read')throw Error('read');return seed}set(value){trace.push(['set',value]);if(failure==='write')throw Error('write')}}
    const module=sourceLoader({'electron-store':Store,electron:{app:{getPath:()=>'/synthetic/profile'}},'electron-log/main':{warn:(...args)=>trace.push(['warn',...args.map(v=>v instanceof Error?v.message:v)])}})('apps/desktop/src/main/lib/window-state.ts')
    const loaded=module.getMainWindowState(),window=new EventEmitter()
    Object.assign(window,{getNormalBounds:()=>bounds,isMaximized:()=>max,isMinimized:()=>mode==='minimized',isFullScreen:()=>mode==='fullscreen',maximize:()=>{max=true;window.emit('maximize')}})
    module.rememberMainWindowState(window,loaded.maximized)
    if(mode!=='hidden')window.emit('show')
    bounds={width:1001,height:801};if(event==='maximize')max=true;if(event==='unmaximize')max=false;window.emit(event)
    // Destroy directly after the named event: another close/resize must not
    // repair a missing listener and erase its independent saved observation.
    window.emit('closed')
    out.push({seed,failure,mode,event,loaded,trace})
  }
  return out
}
