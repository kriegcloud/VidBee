import assert from 'node:assert/strict'
import { sourceLoader } from './source-harness.mjs'
export function sharedMatrixObservations() {
  const load=sourceLoader({$glob:()=>({})}),out={schemas:[]}
  const groups=load('apps/desktop/src/shared/ai-provider-groups.ts')
  const providers=[
    {id:'z',name:'Name · m1',modelId:'m1',presetId:'p',baseUrl:'https://fixture.invalid///'},
    {id:'a',name:'Name · m2',modelId:'m2',presetId:'p',baseUrl:'https://fixture.invalid'},
    {id:'b',name:'m3',modelId:'m3',presetId:'p',baseUrl:'https://fixture.invalid/'},
    {id:'c',name:'',modelId:'m4',presetId:'p',baseUrl:'https://fixture.invalid'},
    {id:'d',name:'Different',modelId:'m5',groupId:'same',presetId:'p',baseUrl:'one'},
    {id:'e',name:'Collision',modelId:'m6',groupId:'same',presetId:'q',baseUrl:'two'},
    {id:'f',name:'Name',modelId:'m7',presetId:'q',baseUrl:'https://fixture.invalid'},
    {id:'g',name:'Name',modelId:'m8',presetId:'p|q',baseUrl:'url'},
    {id:'h',name:'Name',modelId:'m9',presetId:'p',baseUrl:'q|url'}]
  out.providers={input:providers,names:providers.map(groups.aiProviderName),groups:groups.groupAiProviders(providers),reverse:groups.groupAiProviders([...providers].reverse())}
  out.providerCatalog=load('apps/desktop/src/shared/ai-presets.ts').AI_PROVIDER_PRESETS
  const files=load('apps/desktop/src/shared/utils/download-file.ts')
  out.files=[]
  for(const title of ['Title','  ',''])for(const saved of [undefined,'','  ','Title.f123.mp4','Title.mp4'])for(const recorded of [undefined,'','/fixture/Title.mp4'])out.files.push({title,saved:saved??'<undefined>',recorded:recorded??'<undefined>',names:files.buildFileNameCandidates(title,'mp4',saved),paths:files.buildFilePathCandidates('/fixture',title,'mp4',saved,recorded)})
  class CalendarDate extends Date {setHours(...args){return this.setUTCHours(...args)}}
  const history=sourceLoader({$glob:()=>({}),$Date:CalendarDate,$Intl:{DateTimeFormat:class extends Intl.DateTimeFormat{constructor(locale,options){super(locale,{...options,timeZone:'UTC'})}}}})('apps/desktop/src/shared/agent-history.ts')
  // Literal coordinates are independent of startOfLocalDay and grouping.
  const now=1583755200000,midnight=1583712000000
  const items=[0,-1,1,2,6,7,8].flatMap((days,index)=>[{id:`${index}a`,updatedAt:midnight-days*86400000},{id:`${index}b`,updatedAt:midnight-days*86400000}])
  items.push({id:'same-day-0030',updatedAt:1583713800000},{id:'same-day-2330',updatedAt:1583796600000},{id:'previous-2330',updatedAt:1583710200000})
  out.calendar={midnight:history.startOfLocalDay(now),groups:history.groupAgentHistory(items,now,'en-US')}
  const definitions=[
    ['agent-settings','agentSettingsSchema',{}],['agent-settings','agentTtsModelSchema',{action:'status'}],['agent-settings','agentAiSettingsSchema',{action:'list'}],
    ['agent-subtitles','agentSubtitleInputSchema',{language:' en ',cues:[{start:0,end:1,text:' text '}]}],
    ['agent-task','agentTaskSchema',{url:'https://fixture.invalid'}],['agent-task','agentTaskParameters',{}],
    ['media-transform','mediaTransformSchema',{parentId:'fixture',format:'mp4'}],
    ['video-localization','subtitleExportInputSchema',{sourceKey:'fixture',format:'srt'}],['video-localization','dubbingInputSchema',{sourceKey:'fixture'}],
    ['tts-models','ttsModelIdSchema','unknown-family-v1']]
  for(const [file,name,valid] of definitions) {
    const schema=load(`apps/desktop/src/shared/${file}.ts`)[name]
    assert(schema.safeParse(valid).success,`Missing accepted seed for ${name}`)
    const inputs=[undefined,null,false,0,'',{},valid,typeof valid==='object'?{...valid,unexpected:true}:'bad / id']
    if(name==='agentTaskSchema')inputs.push({kind:'conversion',parentId:'fixture',format:'mp4'},{kind:'transcription',parentId:'fixture'},{kind:'model-download',asrTier:'minimal'})
    if(name==='agentSubtitleInputSchema')inputs.push({...valid,cues:Array.from({length:500},()=>({start:0,end:1,text:'text'}))},{...valid,cues:Array.from({length:501},()=>({start:0,end:1,text:'text'}))},{...valid,cues:[{start:1,end:0,text:' '}]})
    if(name==='dubbingInputSchema')for(const file of ['voice.wav','../voice.wav','/voice.wav','C:\\voice.wav','nested/voice.wav'])inputs.push({...valid,reference:{file,text:'fixture'}})
    if(schema.shape)for(const field of Object.keys(schema.shape)){
      let fieldSchema=schema.shape[field]
      while(typeof fieldSchema.unwrap==='function'){const next=fieldSchema.unwrap();if(next===fieldSchema)break;fieldSchema=next}
      const literals=(fieldSchema.options??[]).filter(value=>value===null||['string','number','boolean'].includes(typeof value))
      const arrayLiterals=(fieldSchema.element?.options??[]).filter(value=>['string','number','boolean'].includes(typeof value)).map(value=>[value])
      for(const value of [undefined,null,false,true,0,1,-1,1.5,NaN,Infinity,144,4320,4321,864000,864001,2000000,2000001,'','invalid',[],{},...literals,...arrayLiterals])inputs.push({...valid,[field]:value})
    }
    for(const input of inputs){const safe=schema.safeParse(input);let parsed;try{parsed={value:schema.parse(input)}}catch(error){parsed={name:error.name,message:error.message,issues:error.issues}}
      out.schemas.push({file,name,input:input===undefined?'<undefined>':input,safe:safe.success?{success:true,data:safe.data}:{success:false,issues:safe.error.issues},parsed})}
  }
  return JSON.parse(JSON.stringify(out,(_key,value)=>value===undefined?'<undefined>':Number.isNaN(value)?'<NaN>':value===Infinity?'<Infinity>':value===-Infinity?'<-Infinity>':value))
}
