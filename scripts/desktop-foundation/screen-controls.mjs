import { sourceLoader } from './source-harness.mjs'
const turns=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
export async function screenControlObservations() {
  const out=[]
  for(const pathMode of ['selected','cancelled','failure']) {
    const trace=[],effects=[];let stateIndex=0
    const settings={...sourceLoader()('apps/desktop/src/shared/types/index.ts').defaultSettings,oneClickDownload:true,downloadSubtitles:true},states=['darwin','general']
    const slots=new Proxy({}, {get:(_target,key)=>key==='__esModule'?true:String(key)})
    const load=sourceLoader({react:{useState:initial=>{const i=stateIndex++;return[states[i]??initial,value=>{states[i]=value}]},useCallback:fn=>fn,useEffect:fn=>effects.push(fn)},
      'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'},
      'react-i18next':{useTranslation:()=>({t:key=>key,i18n:{language:'en',changeLanguage:async value=>trace.push(['language',value])}})},
      'next-themes':{useTheme:()=>({theme:settings.theme,setTheme:value=>trace.push(['theme',value])})},
      '@tanstack/react-router':{useSearch:()=>({}),useRouteContext:()=>({platform:'darwin'}),useNavigate:()=>value=>trace.push(['navigate',value])},
      jotai:{useAtom:()=>[settings,()=>{}],useSetAtom:atom=>atom==='save'?async patch=>{trace.push(['save',patch]);settings[patch.key]=patch.value}:()=>{}},
      '../store/settings':{settingsAtom:'settings',saveSettingAtom:'save',loadSettingsAtom:'load'},
      '../lib/ipc':{ipcServices:{app:{getPlatform:async()=> 'darwin'},fs:Object.fromEntries(['selectDirectory','selectFile'].map(name=>[name,async()=>{trace.push([name]);if(pathMode==='failure')throw Error('selection failed');return pathMode==='selected'?`/fixture/${name}`:null}]))}},
      '../lib/logger':{logger:{error:(...args)=>trace.push(['error',...args.map(v=>v instanceof Error?v.message:v)])}},sonner:{toast:{error:value=>trace.push(['toast',value])}},
      '@renderer/components/settings/SettingsSectionNav':{SettingsSectionNav:'SettingsSectionNav',SETTINGS_NAV_ITEMS:[{value:'general',labelKey:'settings.general'},{value:'metadata',labelKey:'settings.metadata'},{value:'advanced',labelKey:'settings.advanced'}]},
      $require:id=>id.startsWith('@renderer/')||id.startsWith('@vidbee/ui/')||id.startsWith('../assets/')||id==='lucide-react'?slots:undefined})
    const {Settings}=load('apps/desktop/src/renderer/src/pages/Settings.tsx')
    const nodes=[]
    const visit=node=>{if(Array.isArray(node)){node.forEach(visit);return}if(!node||typeof node!=='object')return;if(node.props){nodes.push(node);visit(node.props.children)}}
    stateIndex=0;visit(Settings())
    const cases=[]
    for(const [index,node] of nodes.entries()) {
      const p=node.props,type=typeof node.type==='string'?node.type:node.type?.name
      const before=trace.length
      if(type==='Button'&&typeof p.onClick==='function'&&['settings.selectPath','settings.selectFile'].includes(p.children))await p.onClick()
      else if(type==='Switch'&&p.onToggle)await p.onToggle()
      else if(type==='Select'&&p.onValueChange){const options=[];const collect=n=>{if(Array.isArray(n))return n.forEach(collect);if(n?.type==='SelectItem')options.push(n.props.value);if(n?.props)collect(n.props.children)};collect(p.children);const value=options.find(v=>v!==p.value);if(value!==undefined)await p.onValueChange(value)}
      else if(type==='SubtitleLanguagePicker')await p.onValueChange(['fr','de'])
      else if(type==='Input'&&p.onChange)await p.onChange({target:{value:p.type==='number'?'3':'fixture text'}})
      else if(type==='AsrModelPicker'){await p.onChangeConcurrency(2);await p.onSelectTier('balanced');await p.onToggleAutoTranscribe()}
      else if(type==='CloudTranscriptionSettings'){await p.onChange('transcriptionProvider','cloud');await p.onChange('cloudTranscriptionModelId','fixture-model')}
      else if(type==='FilenameStylePicker'){await p.onChange('classic');await p.onFilenameViaVidBeeChange(false)}
      await turns()
      if(trace.length>before)cases.push({index,type,before:{value:p.value,checked:p.checked,disabled:p.disabled},effects:trace.slice(before)})
    }
    out.push({pathMode,cases,final:settings})
  }
  return JSON.parse(JSON.stringify(out))
}
