import { locateLifecycleState } from './lifecycle-locators.mjs'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { sourceLoader } from './source-harness.mjs'
const turns=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
function hooks() {
  let cursor=0
  const slots=[],effects=[],updates=[]
  return {effects,updates,render:fn=>{cursor=0;effects.length=0;return fn()},react:{
    useEffect:fn=>effects.push(fn),useMemo:fn=>fn(),useCallback:fn=>fn,
    useState:(initial,identity)=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=value;updates.push([identity ?? `unidentified-state`,value,i])}]},
    useRef:initial=>{const i=cursor++;return slots[i]??=( {current:initial} )}
  }}
}
function bridge() {
  const ipcRenderer=new EventEmitter(),exposed={},trace=[]
  ipcRenderer.send=()=>{}
  const load=sourceLoader({$process:{contextIsolated:true},electron:{ipcRenderer,webUtils:{},contextBridge:{exposeInMainWorld:(k,v)=>{exposed[k]=v}}},
    '@electron-toolkit/preload':{electronAPI:{ipcRenderer}},'@better-auth/electron/preload':{setupRenderer:(...args)=>trace.push(['auth',...args])},
    '@vidbee/logger/legacy/client':{logger:{error:(...args)=>trace.push(['error',...args])}}})
  load('apps/desktop/src/preload/index.ts')
  const {ipcEvents}=sourceLoader({$window:exposed})('apps/desktop/src/renderer/src/lib/ipc.ts')
  return{ipcEvents,ipcRenderer,exposed,trace}
}
export async function lifecycleObservations(transform = source => source) {
  const out={},b=bridge(),h=hooks(),navigation=[],deliveries=[];let pathname='/settings'
  const on=b.ipcEvents.on.bind(b.ipcEvents);b.ipcEvents.on=(channel,fn)=>on(channel,(...args)=>{if(channel==='app:show-home')deliveries.push(pathname);return fn(...args)})
  const noop=()=>{}
  const auto=new Proxy({}, {get:(_target,key)=>key==='__esModule'?true:noop})
  const loadLayout=(b,h,navigation)=>sourceLoader({react:h.react,'react/jsx-runtime':{jsx:(type,props)=>({type:typeof type==='function'?'<component>':String(type),props}),jsxs:()=>null},
    '@tanstack/react-router':{useRouteContext:()=>({platform:'linux'}),useNavigate:()=>args=>{navigation.push(args);return new Promise(()=>{})},useRouterState:()=>pathname},
    jotai:{useAtom:()=>[{theme:'system'}],useSetAtom:()=>noop,useAtomValue:()=>[]},'next-themes':{useTheme:()=>({setTheme:noop})},
    './lib/ipc':{ipcEvents:b.ipcEvents,ipcServices:{}},'./hooks/use-import-local-media':{useImportLocalMedia:()=>({applyImportResult:noop})},
    './lib/url':{withDesktopUtm:x=>x},'./desktop-chrome':{DesktopChromeContext:{Provider:noop}},
    $require:id=>id.startsWith('./')||id.startsWith('@renderer/')?auto:undefined
  })('apps/desktop/src/renderer/src/app-layout.tsx')
  const module=loadLayout(b,h,navigation)
  const emit=()=>b.ipcRenderer.emit('app:show-home',{})
  const mount=()=>{h.render(()=>module.AppLayout());return h.effects[0]()}
  emit();let cleanup=mount();const before=navigation.slice()
  emit();emit();emit();const slow=navigation.slice()
  pathname='/';h.render(()=>module.AppLayout());emit();const atHome=navigation.slice()
  pathname='/settings';h.render(()=>module.AppLayout());cleanup();const deliveriesBeforeAbsence=deliveries.length;emit();cleanup=mount();const resubscribe=navigation.slice();assert.equal(deliveries.length,deliveriesBeforeAbsence);assert.deepEqual(resubscribe,atHome)
  pathname='/about';h.render(()=>module.AppLayout());emit();cleanup()
  const oldDocument=navigation.slice()
  const next=bridge();next.ipcRenderer.emit('app:show-home',{})
  const newNavigation=[],newHooks=hooks(),newModule=loadLayout(next,newHooks,newNavigation)
  newHooks.render(()=>newModule.AppLayout());const newCleanup=newHooks.effects[0]()
  const afterReloadMount=newNavigation.slice()
  emit();next.ipcRenderer.emit('app:show-home',{});newCleanup()
  out.home={deliveries,deliveriesBeforeAbsence,afterReloadMount,newNavigation,before,slow,atHome,resubscribe,oldDocument,oldListeners:b.ipcRenderer.listenerCount('app:show-home'),newListeners:next.ipcRenderer.listenerCount('app:show-home')}
  // Actual TitleBar cleanup supplies original callbacks to a wrapper-based API.
  const titleHooks=hooks(),titleBridge=bridge()
  const Title=sourceLoader({$transform:(source,file)=>locateLifecycleState(transform(source,file),file),react:titleHooks.react,'react/jsx-runtime':{jsx:(_type,props)=>props},'../../lib/ipc':{ipcEvents:titleBridge.ipcEvents,ipcServices:{window:{}}},
    $require:id=>id.endsWith('.css')||id.startsWith('~icons/')||id.startsWith('@vidbee/ui/')?auto:undefined
  })('apps/desktop/src/renderer/src/components/ui/title-bar.tsx').TitleBar
  const counts=[]
  for(let i=0;i<2;i++){titleHooks.render(()=>Title({platform:'linux'}));const off=titleHooks.effects[0]();counts.push(titleBridge.ipcRenderer.listenerCount('window-maximized'));off();counts.push(titleBridge.ipcRenderer.listenerCount('window-maximized'))}
  titleBridge.ipcRenderer.emit('window-maximized',{});titleBridge.ipcRenderer.emit('window-unmaximized',{})
  out.title={counts,updates:titleHooks.updates,auth:titleBridge.trace}
  out.preload=[]
  for(const isolation of [false,true])for(const fail of [false,true]) {
    const window={},trace=[]
    sourceLoader({$window:window,$process:{contextIsolated:isolation},electron:{ipcRenderer:new EventEmitter(),webUtils:{},contextBridge:{exposeInMainWorld:(...args)=>{trace.push(['expose',args[0]]);if(fail)throw Error('bridge')}}},
      '@electron-toolkit/preload':{electronAPI:{}},'@better-auth/electron/preload':{setupRenderer:(...args)=>trace.push(['auth',...args])},
      '@vidbee/logger/legacy/client':{logger:{error:(...args)=>trace.push(['error',args[0],args[1].message])}}})('apps/desktop/src/preload/index.ts')
    out.preload.push({isolation,fail,trace,keys:Object.keys(window),api:window.api?Object.keys(window.api):[]})
  }
  out.appInfo=[]
  for(const metadataMode of ['failure','success','unmounted']) {
  const infoHooks=hooks(),requests=[],errors=[],settings={...sourceLoader()('apps/desktop/src/shared/types/index.ts').defaultSettings,browserForCookies:'firefox',cookiesPath:'/fixture/cookies',proxy:'http://fixture.invalid',configPath:'/fixture/config',maxConcurrentDownloads:3,oneClickQuality:'720p',oneClickContainer:'mkv',downloadSubtitles:true,subtitleLanguages:['fr','de']},kernel={state:'preparing',ready:false,source:'bundled',ytDlpVersion:'fixture-ytdlp',nodeVersion:'fixture-runtime',error:null,progress:7,preparationStep:'copying'},version=deferred(),os=deferred()
  const info=sourceLoader({$transform:(source,file)=>locateLifecycleState(transform(source,file),file),react:infoHooks.react,$window:{electron:{process:{platform:'linux',versions:{electron:'fixture-electron',chrome:'fixture-chrome',node:'fixture-node'}}}},
    jotai:{useAtomValue:atom=>atom==='settings'?settings:kernel},'@renderer/store/settings':{settingsAtom:'settings'},'@renderer/store/ytdlp-kernel':{ytdlpKernelStatusAtom:'kernel'},
    '@renderer/lib/ipc':{ipcServices:{app:{getVersion:()=>{requests.push('version');return version.promise},getOsVersion:()=>{requests.push('os');return os.promise}}}},
    '../../lib/logger':{logger:{error:(message,error)=>errors.push([message,error.message])}}
  })('apps/desktop/src/renderer/src/components/feedback/FeedbackLinks.tsx')
  const provisional=infoHooks.render(()=>info.useAppInfo());const offA=infoHooks.effects[0]();infoHooks.render(()=>info.useAppInfo());const offB=infoHooks.effects[0]()
  if(metadataMode==='unmounted'){offA();offB()}
  if(metadataMode==='failure')version.reject(Error('metadata'));else version.resolve('fixture-version');os.resolve('fixture-os');await turns();offA();offB()
  const after=infoHooks.render(()=>info.useAppInfo());infoHooks.effects[0]();await turns()
  out.appInfo.push({metadataMode,requests,errors,provisional,after,updates:infoHooks.updates})
  }
  out.share=[]
  for(const mode of ['closed','success','late','rejection']) {
    const hooksApi=hooks(),platform=deferred(),requests=[]
    const Component=sourceLoader({$transform:(source,file)=>locateLifecycleState(transform(source,file),file),react:hooksApi.react,$navigator:{userAgent:'Mac fixture'},
      'react/jsx-runtime':{jsx:(_type,props)=>props},jotai:{useAtomValue:()=>null},'react-i18next':{useTranslation:()=>({t:x=>x})},
      '@renderer/lib/ipc':{ipcServices:{app:{getPlatform:()=>{requests.push('platform');return platform.promise}}}},
      $require:id=>id.startsWith('@renderer/')||id.startsWith('@vidbee/')||id==='sonner'||id.startsWith('./')?auto:undefined
    })('apps/desktop/src/renderer/src/components/transcript/TranscriptShareImageDialog.tsx').TranscriptShareImageDialog
    const initial=hooksApi.render(()=>Component({open:mode!=='closed',payload:null}));const off=hooksApi.effects[0]()
    if(mode==='late')off()
    if(mode==='rejection')platform.reject(Error('platform'));else platform.resolve('linux')
    await turns()
    out.share.push({mode,requests,initialNative:typeof initial?.onNativeShare,updates:hooksApi.updates})
  }
  return JSON.parse(JSON.stringify(out))
}
