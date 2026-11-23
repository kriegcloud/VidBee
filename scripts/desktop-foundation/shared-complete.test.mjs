import { expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'
import * as Result from 'effect/Result'
import fs from 'node:fs'
import { sourceLoader } from './source-harness.mjs'

const fixture = 'scripts/desktop-foundation/fixtures/shared-port/'
const shared = 'apps/desktop/src/shared/'
const compat = 'apps/desktop/src/compatibility/shared/'
const documents = Object.fromEntries(fs.readdirSync('skills').sort().filter(name=>fs.existsSync(`skills/${name}/SKILL.md`)).map(name=>[`../../../../skills/${name}/SKILL.md`,fs.readFileSync(`skills/${name}/SKILL.md`,'utf8')]))
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [1_700_000_000_000])) } static now() { return 1_700_000_000_000 } }
const options = {$glob:()=>documents,$Date:Clock,'@vidbee/task-queue-legacy/process':{FFMPEG_ENCODE_THREADS:'2'}}
const old = sourceLoader(options)
const current = sourceLoader(options)
const adapters = new Set(['agent-errors','agent-history','agent-markdown','ai-prompts','ai-presets','ai-run','live-log','media-transform','overview-result','source-media-kind','transcript-export','tts-models','agent-thread-patch','extension-chat-state','extension-overview-reuse','extension-transcript','utils/download-file','utils/pending-download','types/share-card'])
const modulePair = file => [old(fixture+file+'.ts'),current((adapters.has(file)?compat:shared)+file+'.ts')]
const outcome = (fn,args) => {try { return {value:fn(...args)} }catch(error) {return {error:error.name,message:error.message}}}
const compare = (file,symbol,rows) => {
 const [before,after]=modulePair(file)
 expect(typeof before[symbol],`${file}.${symbol} original export`).toBe('function')
 expect(typeof after[symbol],`${file}.${symbol} current export`).toBe('function')
 for(const args of rows) {
 const actual=outcome(after[symbol],args), expected=outcome(before[symbol],args)
 // PORT-GUIDE permits failure-only comparison for out-of-type JavaScript engine errors.
 // Application errors, codec errors, and all successful values retain exact comparison.
 if(expected.error === 'TypeError') expect(actual.error,`${file}.${symbol}`).toBe('TypeError')
 else if(typeof expected.value?.code === 'function') expect({...actual.value,code:String(actual.value.code)},`${file}.${symbol}`).toEqual({...expected.value,code:String(expected.value.code)})
 else expect(actual,`${file}.${symbol}`).toEqual(expected)
 }
}
const test = (label,body) => it.effect(label,()=>Effect.sync(body))
const strange=[undefined,null,NaN,Infinity,-1,0,false,'','constructor','__proto__','toString','x'.repeat(10000)]

test('complete shared port: pure export filenames keep exact text',()=>{
 for(const fn of ['exportBaseFileName','shareImageFileName']) compare('agent-export',fn,[...strange,' a<>:"/\\|?* title. ','😀'.repeat(100),'VidBeep'].map(x=>[x]))
 compare('agent-export','exportFileName',[[' title. ','.md'],[undefined,'png'],[null,''],['constructor','__proto__']])
})
test('complete shared port: capped logs retain pathological cap semantics',()=>{
 compare('live-log','appendCappedLog',[[undefined,undefined],['a','b'],['','x'.repeat(80001)],...[undefined,NaN,Infinity,-1,0,1,1.5,Number.MAX_VALUE].map(cap=>['abc','def',cap])])
})
test('complete shared port: thinking parsing, headings and equality',()=>{
 compare('ai-thinking','parseThinkingSteps',[...strange,'# First\nbody\n\n## Second','1. One\n2. Two','a'.repeat(100),'**Heading**:\nBody','\n\n'].map(x=>[x]))
 compare('ai-thinking','isThinkingSameAsAnswer',[[' a ','a'],['',''],['A','a'],[null,null],['one','two']])
})
test('complete shared port: provider catalog order and lookup',()=>{
 const [a,b]=modulePair('ai-presets');expect(b.AI_PROVIDER_PRESETS).toEqual(a.AI_PROVIDER_PRESETS)
 for(const fn of ['getAiProviderPreset','aiProviderRequiresBaseUrl','aiProviderNeedsApiKey']) compare('ai-presets',fn,[...strange,...['cliproxy','custom','alibaba','anthropic','openai','google','deepseek','xai','zhipu']].map(x=>[x]))
 compare('ai-presets','resolveAiProviderBaseUrl',[['custom',' x '],['openai',''],['constructor'],['cliproxy','override'],['custom',null]])
 compare('ai-presets','isAiProviderModelBlocked',[['cliproxy','Claude Sonnet'],['custom','claude'],['cliproxy','gpt-6.1-sol']])
})
test('complete shared port: provider grouping retains first occurrence and fallback key',()=>{
 const provider=(id,name,extra={})=>({id,presetId:'custom',name,modelId:'model',baseUrl:'https://example.test///',...extra})
 const rows=[[],[provider('a','name'),provider('b','name')],[provider('a','model'),provider('b','')],[provider('a','name · model'),provider('b','name')],[provider('a','x',{groupId:'constructor'}),provider('b','y',{groupId:'constructor'})],[provider('a','__proto__'),provider('b','constructor')]]
 compare('ai-provider-groups','groupAiProviders',rows.map(x=>[x]))
 compare('ai-provider-groups','aiProviderName',rows.flat().map(x=>[x]))
})
test('complete shared port: AI failure rules and cause identity',()=>{
 for(const fn of ['isEphemeralPromptRunDownloadId','isTerminalPromptRunStatus','flattenErrorMessage','isIncompleteAiStreamError','isRecoverableAiPromptError']) compare('ai-run',fn,[...strange,'completed','running','Connection error','401 forbidden','503 timeout','stream ended without finish_reason'].map(x=>[x]))
 for(const fn of ['formatAiPromptError','classifyAiPromptError','promptTabIndicator']) compare('ai-run',fn,[['Connection error'],['Connection error\neconnreset',true],['completed',true],['error',false],[null,true],['',true]])
 const a={message:'same'},b={message:'same',cause:a};a.cause=b
 compare('ai-run','flattenErrorMessage',[[Object.assign([],{message:'array',cause:{message:'inner'}})],[a],[new Error('outer',{cause:new Error('inner')})],[{message:'a',cause:{message:'a'}}]])
 compare('ai-run','idlePromptRunSnapshot',[['a','b'],['a','b',NaN],['constructor','__proto__',Number.MAX_VALUE]])
 compare('ai-run','isRecoverableAiFailure',[[{}],[{reason:'constructor'}],[{reason:'timeout-or-cancel'}],[{retryable:false,message:'503'}],[{retryable:true,message:'401'}]])
})
test('complete shared port: agent failure markers, prototypes and original class',()=>{
 for(const fn of ['parseAgentError','isRetryableAgentError']) compare('agent-errors',fn,[...strange,'[VB:TIMEOUT] wait','Connection error: [VB:TRANSPORT_LOST] reset','context length exceeded','quota exhausted','cancelled'].map(x=>[x]))
 for(const reason of [...strange,'provider-http','provider-auth']) compare('agent-errors','agentFailureFromCloudReason',[[{reason}],[{reason,retryable:true}],[{reason,retryable:false,message:' details '}]])
 const [a,b]=modulePair('agent-errors');for(const code of ['INTERNAL','TIMEOUT','TRANSPORT_LOST']) {const x=new a.AgentUserError('message',code,true),y=new b.AgentUserError('message',code,true);expect({name:y.name,message:y.message,failure:y.toFailure(),isError:y instanceof Error}).toEqual({name:x.name,message:x.message,failure:x.toFailure(),isError:x instanceof Error})}
})
test('complete shared port: history preserves local calendar grouping and sort ties',()=>{
 for(const fn of ['isUuid','sanitizeAgentConversationTitle']) compare('agent-history',fn,strange.map(x=>[x]))
 const now=Clock.now();for(const locale of ['en','ja','invalid_locale']) compare('agent-history','groupAgentHistory',[[[],now,locale],[[{id:'a',updatedAt:now},{id:'b',updatedAt:now},{id:'c',updatedAt:now-86400000},{id:'d',updatedAt:0}],now,locale]])
 for(const stamp of [0,NaN,Infinity,-1,Clock.now()])compare('agent-history','startOfLocalDay',[[stamp]])
 const thread={promptId:'chat',messages:[{role:'user',text:'  first\nsecond ',createdAt:3}],runs:[],images:[]}
 for(const fn of ['agentThreadUserPreview','agentThreadIsRunning','agentThreadNeedsApproval','agentThreadLatestRun','agentThreadUpdatedAt'])compare('agent-history',fn,[[thread],[{...thread,messages:[],images:[{name:'image',createdAt:9}]}]])
 for(const fn of ['agentThreadIsRunning','agentThreadNeedsApproval'])compare('agent-history',fn,[[{...thread,runs:[,,{status:'running',tools:[,,{status:'pending-approval'}]}]}]])
 compare('agent-history','agentThreadUserPreview',[[{...thread,messages:[],images:[{}]}],[{...thread,messages:[],images:[null]}],[{...thread,messages:[],images:[]}]])
 compare('agent-history','agentConversationTitle',[[thread,'video'],[{...thread,promptId:'overview'},' video ']])
 compare('agent-history','agentHistoryDisplayTitle',[[{title:'',promptId:'chat'},'Untitled','Chat'],[{title:'video',promptId:'overview'},'Untitled','Overview']])
})
test('complete shared port: subtitle alignment and exact serialization',()=>{
 const cues=[{startMs:0,endMs:1000,text:' hello '},{startMs:1000,endMs:2000,text:'字幕\nline'}]
 for(const fn of ['buildSrtDocument','buildVttDocument','buildAssDocument'])compare('subtitle-export',fn,[[[]],[cues],[[{startMs:NaN,endMs:Infinity,text:'{\\}'}]]])
 for(const fn of ['formatSrtClock','formatAssClock'])compare('subtitle-export',fn,[...strange,3599999,3600000,Number.MAX_VALUE].map(x=>[x]))
 compare('subtitle-export','escapeAssText',strange.map(x=>[x]))
 compare('subtitle-export','alignSubtitleCues',[[[],[]],[cues,cues],[cues,[{startMs:500,endMs:1500,text:'shared'},{startMs:500,endMs:1500,text:'shared'}]],[cues,[{startMs:NaN,endMs:Infinity,text:'nan'}]]])
})
test('complete shared port: source failure mapping preserves Error identity',()=>{
 compare('source-media-kind','sourceMediaKind',[[{}],[{type:'audio'}],[{filePath:'x.MP3'}],[{url:'https://example.test/a.mp4'}],[{savedFileName:'x.wav'}]])
 const [a,b]=modulePair('source-media-kind');for(const input of [...strange,new Error('keep'),new TypeError('Media output is empty')]) {const before=a.agentUnusableVideoError(input),after=b.agentUnusableVideoError(input);expect({name:after.name,message:after.message,identity:after===input}).toEqual({name:before.name,message:before.message,identity:before===input})}
})
test('complete shared port: TTS family, parser, model and speaker failures',()=>{
 for(const fn of ['ttsModelFamily','parseTtsModelId','getTtsModel'])compare('tts-models',fn,[...strange,'kokoro-multi-lang-v1_0','kokoro-int8-multi-lang-v1_1','vits-melo-tts-zh_en','vits-piper-en_US-model','nabra-test','supertonic-3-model'].map(x=>[x]))
 compare('tts-models','resolveTtsSpeaker',[['kokoro-multi-lang-v1_0','en'],['kokoro-multi-lang-v1_0','xx'],['kokoro-multi-lang-v1_0','en',53],['kokoro-multi-lang-v1_0','en',NaN],['kokoro-multi-lang-v1_0','en',0],['unknown','en']])
})
test('complete shared port: media transform argument ordering',()=>{
 for(const format of ['mp4','mkv','webm','mp3','m4a','wav','flac','constructor','__proto__'])for(const height of [undefined,0,144,NaN])compare('media-transform','buildMediaTransformArgs',[[{parentId:'p',format,height,startSeconds:NaN,durationSeconds:0},'source','output']])
})
test('complete shared port: Overview parsing and playback intervals',()=>{
 compare('overview-result','parseOverviewMarkdown',[...strange,'# Takeaway\n## Chapters\n- **0:00** Opening — Summary\n## Key quotes\n- **0:03** "Words"','```md\n## Chapters\n- 0:00 One\n```'].map(x=>[x]))
 for(const current of [NaN,-1,0,5,10,20,Infinity])compare('overview-result','overviewPlayhead',[[[],current],[[{seconds:0},{seconds:10}],current,20]])
})
test('complete shared port: transcript exports preserve bytes, grouping and filenames',()=>{
 const segments=[{startMs:0,endMs:1200,speakerId:null,text:' Hello. World! '},{startMs:1200,endMs:2400,speakerId:'1',text:' 字幕です。次。'}]
 compare('transcript-export','formatExportClock',strange.map(x=>[x]))
 for(const grouping of ['none','words','sentences']) {compare('transcript-export','buildExportUnits',[[segments,grouping],[[],grouping]]);for(const format of ['txt','md','srt'])for(const style of ['transcript','subtitles','segments','whisper','video'])compare('transcript-export','buildTranscriptExportText',[[{segments,grouping,format,style,showTimestamp:true,resolveSpeaker:()=> 'Speaker'}]])}
 compare('transcript-export','buildTranscriptExportFileName',[['title'],[' a<>. ','md',true],['constructor','srt',false]])
 compare('transcript-export','buildVideoSubtitleExportFileName',[['title','soft'],['title','hard']])
})
test('complete shared port: prompt defaults and migrations use explicit time',()=>{
 const [a,b]=modulePair('ai-prompts');expect(b.AI_PROMPT_PRESETS).toEqual(a.AI_PROMPT_PRESETS)
 compare('ai-prompts','agentChatPrompt',[[],[0],[NaN,false],[123,true]])
 compare('ai-prompts','createDefaultAiPrompts',[[],[0],[NaN]])
 const defaults=[{name:'overview',description:'Fixture overview',content:'User-edited overview body',autoRun:false,isPreset:true,sortOrder:0,createdAt:1,updatedAt:1},{name:'custom',description:'Custom',content:'Independent fixture body',autoRun:false,isPreset:false,sortOrder:1,createdAt:1,updatedAt:1}]
 compare('ai-prompts','mergeDefaultAiPrompts',[[[],2],[defaults,2],[[{...defaults[0],icon:'old',enabled:true}],3],[[{name:'constructor',content:'custom',isPreset:false,sortOrder:0}],2]])
 for(const fn of ['aiPromptUiLanguageName','isAiPromptPresetName'])compare('ai-prompts',fn,['en','zh-CN','ja','constructor','__proto__','overview'].map(x=>[x]))
 compare('ai-prompts','resolveAiPromptContent',[['{{uiLanguage}}','en'],['{{uiLanguage}} {{uiLanguage}}','ja']])
 compare('ai-prompts','canonicalizeAiPromptContent',defaults.map(x=>[x.name,x.content]))
 for(const fn of ['isTranscriptSkillSidebarEnabled','isTranscriptSkillVisible'])compare('ai-prompts',fn,defaults.map(x=>[x]))
 compare('ai-prompts','partitionTranscriptPromptTabs',[[defaults],[[]]])
})
test('complete shared port: eager built-in documents and parse error classes',()=>{
 const [a,b]=modulePair('builtin-skills');expect(b.BUILTIN_SKILLS).toEqual(a.BUILTIN_SKILLS)
 for(const text of ['---\nname: 1\ndescription: false\n---\nbody','---\nother: missing\n---\nbody','---\nnull\n---\nbody','', '---\nname: [\n---\nbody', '---\nname: overview\ndescription: desc\nextra: okay\n---\n body ']) {
  const run=prefix=>{try{return {value:sourceLoader({...options,$glob:()=>({one:text})})(prefix+'builtin-skills.ts').BUILTIN_SKILLS}}catch(error){return {error:error.name,message:error.message}}}
  expect(run(shared)).toEqual(run(fixture))
 }
})
test('complete shared port: original Zod boundaries keep exact errors and strict codec acceptance',()=>{
 const names={ 'agent-settings':['agentSettingsSchema','agentTtsModelSchema','agentAiSettingsSchema'],'agent-task':['agentTaskSchema','agentTaskParameters'],'media-transform':['mediaTransformSchema'],'video-localization':['subtitleExportInputSchema','dubbingInputSchema'] }
 const values=[...strange,{}, {unexpected:true},{kind:'transcription',parentId:'p'},{kind:'model-download',asrTier:'tiny'},{url:'x'},{parentId:'p',format:'mp4'},{sourceKey:'source',format:'srt'},{sourceKey:'source'},{sourceKey:'source',speechOverrides:[{cueIndex:1,originalText:'x',text:' y '}]},{action:'status'},{action:'select',family:'piper'},{downloadPath:''},{downloadPath:'x'},{theme:'dark'},{language:'en'},{maxConcurrentDownloads:1.5},{ttsModelId:'valid-model'}]
 for(const [file,symbols] of Object.entries(names))for(const symbol of symbols){const before=old(fixture+file+'.ts')[symbol],boundary=current(compat+file+'.ts')[symbol],native=current(shared+file+'.ts')[({agentSettingsSchema:'AgentSettingsPatch',agentTtsModelSchema:'AgentTtsModelInput',agentAiSettingsSchema:'AgentAiSettingsInput',agentTaskSchema:'AgentTaskInput',agentTaskParameters:'AgentTaskParameters',mediaTransformSchema:'MediaTransformInput',subtitleExportInputSchema:'SubtitleExportInput',dubbingInputSchema:'DubbingInput'})[symbol]];for(const input of values){const a=before.safeParse(input),b=boundary.safeParse(input),c=S.decodeUnknownResult(native)(input);expect(b.success).toBe(a.success);if(a.success){expect(b.data).toEqual(a.data);expect(Result.isSuccess(c),`${file}.${symbol} ${JSON.stringify(input)}`).toBe(true);if(Result.isSuccess(c))expect(c.success).toEqual(a.data)}else {expect(b.error.message).toBe(a.error.message);expect(Result.isFailure(c),`${file}.${symbol} ${JSON.stringify(input)}`).toBe(true)}}}
})

test('complete shared port: legacy default constants match all original exports',()=>{
 for(const file of ['types/index','constants','extension-identity','agent-notifications','mcp','skill-install','types/ytdlp-kernel','types/player','types/mermaid-export','types/auth','extension-cookies','extension-chat','extension-overview','ai-types']) {
  const [before,after]=modulePair(file)
  for(const [key,value] of Object.entries(before)) if(typeof value!=='function') expect(after[key],`${file}.${key}`).toEqual(value)
 }
})
it.effect('complete shared port: markdown collection adapters, image bytes and callback timing',()=>Effect.promise(async()=>{
 const artifact={id:'12345678-1234-1234-1234-123456789012',threadId:'t',runId:'r',kind:'image',name:'shot.PNG',path:'/shot.PNG',start:5,end:5,createdAt:0}
 const text=`before ![0:05](artifact:${artifact.id}) after [shot](artifact:${artifact.id})`
 for(const [fn,rows] of Object.entries({artifactIdFromUrl:[[artifact.id],[artifact.id.slice(0,8),[artifact]],['bad',[]]],clockFromImage:[['0:05','x'],['1–3 seconds','x'],['','']],matchArtifactByClock:[[[artifact],new Set(),5,'r'],[[artifact],new Set([artifact.id]),5,'r']],bindArticleImageArtifacts:[[text,[artifact],'r'],['![0:05](unknown)',[artifact],'r',new Set([artifact.id])]],unboundArticleImageTimes:[[text,[]],['![0:05](unknown)',[]]],citedArtifactIds:[[text,[artifact]],[text,[]]],embedArtifactDataUris:[[text,new Map([[artifact.id,'data:image/png;base64,AA==']]),[artifact]],[text,new Map(),[]]],artifactsForMessage:[[[artifact],text,[]],[[artifact],'', ['r']]],splitAgentResponseMedia:[[text,[artifact],'r'],['plain',[artifact],'r',true]]}))compare('agent-markdown',fn,rows)
 const [before,after]=modulePair('agent-markdown')
 for(const mode of ['success','empty','throw','reject','sync','null','zero','nan','boxed-empty','symbol','thenable']) {
  const run=async mod=>{const calls=[];const result=mod.embedArtifactImages(text,[artifact],item=>{calls.push(item.id);if(mode==='throw')throw new Error('read');if(mode==='sync')return 'AA==';if(mode==='null')return Promise.resolve(null);if(mode==='zero')return Promise.resolve(0);if(mode==='nan')return Promise.resolve(NaN);if(mode==='boxed-empty')return Promise.resolve(new String(''));if(mode==='symbol')return Promise.resolve(Symbol('bytes'));if(mode==='thenable')return {then(resolve){resolve('AA==')}};return mode==='reject'?Promise.reject(new Error('read')):Promise.resolve(mode==='empty'?'':'AA==')});const immediate=[...calls];return {immediate,result:await result,calls}}
  expect(await run(after)).toEqual(await run(before))
 }
}))

test('complete shared port: settings model admits an independent complete settings document',()=>{
 // This literal fixture is independent of both implementations; no old result seeds new code.
 const before={downloadPath:'',maxConcurrentDownloads:5,downloadWithoutChannelSubfolders:false,browserForCookies:'none',cookiesPath:'',extensionCookieSources:[],proxy:'',configPath:'',language:'en',theme:'system',oneClickDownload:true,oneClickDownloadType:'video',oneClickQuality:'best',oneClickContainer:'auto',closeToTray:true,hideDockIcon:true,launchAtLogin:true,subscriptionOnlyLatestDefault:true,enableDownloadNotifications:true,rememberLastAudioLanguage:true,preferredAudioLanguage:'',downloadSubtitles:true,subtitleLanguages:['en'],embedSubs:true,writeAutoSubs:true,embedThumbnail:false,embedMetadata:true,embedChapters:true,filenameStyle:'pretty',filenameViaVidBee:true,shareWatermark:false,sequentialFilenames:true,autoTranscribeAfterDownload:true,maxConcurrentTranscriptions:1,asrTier:'minimal',ttsModelId:'kokoro-multi-lang-v1_0',transcriptionProvider:'local',cloudTranscriptionModelId:'fixture-model',downloadMirror:'auto',lastSeenWhatsNew:'',agentManagementTools:'auto'}
 const model=current(shared+'types/index.ts').AppSettings
 const decoded=S.decodeUnknownResult(model)(before)
 expect(Result.isSuccess(decoded)).toBe(true)
 if(Result.isSuccess(decoded))expect(decoded.success).toEqual(before)
})

test('complete shared port: persisted extension preferences retain unknown nested data',()=>{
 const input={id:'source',browser:'chrome',variant:'store',future:{enabled:true}}
 const result=S.decodeUnknownResult(current(shared+'extension-cookies.ts').ExtensionCookieSourcePreference)(input)
 expect(Result.isSuccess(result)).toBe(true)
 if(Result.isSuccess(result))expect(result.success).toEqual(input)
})

test('complete shared port: extension source URL acceptance is unchanged',()=>{
 compare('extension-source-url','isExtensionSourceUrl',[...strange,'https://youtube.com/watch?v=abcdefghijk','http://example.test/watch','ftp://example.test/watch','https://user:pass@example.test/watch','https://localhost/watch','https://test.localhost/watch','https://10.1.2.3/watch','https://127.0.0.1/watch','https://[::1]/watch','https://constructor/watch',' https://example.test/watch ','https://example.test/'+ 'x'.repeat(2049)].map(value=>[value]))
})
test('complete shared port: all utility rules retain metadata, filename order, sparse formats and presets',()=>{
 for(const fn of ['buildVideoFormatPreference','buildAudioFormatPreference'])compare('utils/format-preferences',fn,['best','good','normal','bad','worst','constructor','__proto__'].map(oneClickQuality=>[{oneClickQuality}]))
 for(const fn of ['normalizeSavedFileName','normalizeFilenameKey','buildFilenameKey'])compare('utils/download-file',fn,[...strange,'a/b.mp4',' a\\b.MP4 ','.hidden','trailing.'].map(value=>[value]))
 compare('utils/download-file','buildFileNameCandidates',[[],[' title ','saved.mp4','key'],['constructor','__proto__','saved'],['same','same','same']])
 compare('utils/download-file','buildFilePathCandidates',[[],['/root','name','saved.mp4','id'],['','name',undefined],['/root','same','same','same']])
 compare('utils/video-info-metadata','buildVideoInfoDownloadMetadata',[[undefined],[null],[{}],[{title:'title',uploader:'',extractor_key:'source',view_count:NaN,duration:Infinity}]])
 const formats=[{format_id:'video',vcodec:'h264',height:1080,fps:30,filesize:200},{format_id:'small',vcodec:'h264',height:360,fps:30},{format_id:'audio',acodec:'aac',vcodec:'none',video_ext:'none',tbr:128}]
 for(const oneClickDownloadType of ['video','audio'])for(const oneClickQuality of ['best','good','normal','bad','worst','constructor'])compare('utils/video-info-metadata','pickOneClickSelectedFormat',[[{formats},{oneClickDownloadType,oneClickQuality}],[{formats:[,,...formats]},{oneClickDownloadType,oneClickQuality}]])
 compare('utils/pending-download','hasDisplayMetadata',[[{}],[{title:''}],[{title:'title'}],[{thumbnail:'x'}]])
 compare('utils/pending-download','buildPendingDownloadItem',[['id',{url:'https://example.test',type:'video'}],['id',{url:'url',type:'audio',title:'Title',filename:'name'}]])
})
test('complete shared port: extension transcript malformed JSON and sidecars',()=>{
 compare('extension-transcript','parseCaptionSidecarName',[...strange,'video.en.vtt','video.zh-CN.srt','a/b.en.vtt','video.auto.json3','video.en.ASS'].map(value=>[value]))
 compare('extension-transcript','captionCuesFromPayload',[['{}','json3'],['null','json3'],['bad','json3'],['{"events":[null]}','json3'],['{"events":[{"tStartMs":0,"dDurationMs":0,"segs":[{"utf8":" hi "}]}]}','json3'],['{"events":[{"tStartMs":"bad","segs":[{"utf8":5}]}]}','json3'],['1\n00:00:00,000 --> 00:00:01,000\nhello','srt']])
 compare('extension-transcript','pickExtensionCaptionTrack',[[[]],[[{auto:true,id:'a',language:'en'},{auto:false,id:'b',language:'ja'}]],[[{auto:false,id:'constructor',language:'en'}],'constructor']])
})
test('complete shared port: agent thread collection and patch boundary rules',()=>{
 const thread={id:'t',downloadId:'d',promptId:'p',leafId:null,seq:0,messages:[],runs:[],createdAt:0,updatedAt:0}
 compare('agent-thread-patch','createAgentGapRecovery',[[]])
 compare('agent-thread-patch','projectAgentThread',[[thread],[{...thread,images:[],toolGrants:[]}]])
 compare('agent-thread-patch','acceptAgentThread',[[null,thread],[thread,{...thread,seq:1}],[thread,{...thread}]])
 compare('agent-thread-patch','agentEventRoute',[[{}],[{patch:{downloadId:'d',promptId:'p',threadId:'t'}}],[{snapshot:thread}]])
 compare('agent-thread-patch','agentEventMatches',[[{snapshot:thread},{downloadId:'d',promptId:'p',threadId:'t'}],[{snapshot:thread},{downloadId:'wrong',promptId:'p'}]])
 compare('agent-thread-patch','applyAgentRunEvent',[[null,{snapshot:thread},{downloadId:'d',promptId:'p'}],[thread,{snapshot:thread},{downloadId:'d',promptId:'p'}]])
 const state={revision:0,thread:null,catalog:{downloadId:'d',threads:[],history:[],statuses:{},sources:{}}}
 compare('extension-chat-state','applyExtensionChatEvent',[[state,{type:'snapshot',state}],[state,{type:'unknown'}],[state,{type:'agent',event:{type:'thread.deleted',threadId:'t'}}]])
})

test('complete shared port: extension overview reuse keeps newest and equal-time order',()=>{
 const url='https://youtube.com/watch?v=abcdefghijk'
 const tasks=[{id:'a',kind:'video',input:{url},updatedAt:1},{id:'b',kind:'audio',input:{url},updatedAt:2},{id:'c',kind:'video',input:{url},updatedAt:2}]
 compare('extension-overview-reuse','findDownloadIdForSourceUrl',[[url,tasks],[url,tasks,id=>id==='a'],['bad',tasks],[url,[]]])
 compare('extension-overview-reuse','isReusableOverviewSnapshot',[[{status:'running',text:''}],[{status:'idle',text:'x'}],[{status:'error',text:' x '}],[{status:'aborted',text:' '}]])
})

test('complete shared port: strict Cloud reasons always produce valid failures',()=>{
 const native=current(shared+'agent-errors.ts')
 for(const reason of ['constructor','__proto__','provider-http','unknown']) {
  const failure=native.agentFailureFromCloudReason({reason})
  expect(S.is(native.AgentFailure)(failure)).toBe(true)
 }
})

test('complete shared port: legacy history and Overview imports retain eager skill initialization',()=>{
 for(const file of ['agent-history','extension-overview-reuse']) for(const document of [documents,'missing frontmatter']) {
  const run=prefix=>{const calls=[];try {sourceLoader({...options,$glob:(...args)=>{calls.push(args);return typeof document==='string'?{one:document}:document}})(prefix+file+'.ts');return {calls,loaded:true}}catch(error){return {calls,error:error.name,message:error.message}}}
  expect(run(compat),file).toEqual(run(fixture))
 }
})

test('complete shared port: legacy prompt flags retain truthiness without new admission',()=>{
 const flags=[undefined,null,false,true,0,1,NaN,'','yes',{},[]]
 for(const isPreset of flags)for(const workflowOnly of flags){const prompt={name:'overview',description:'fixture',content:'fixture',isPreset,workflowOnly,sortOrder:0,createdAt:1,updatedAt:1};for(const fn of ['isTranscriptSkillSidebarEnabled','isTranscriptSkillVisible'])compare('ai-prompts',fn,[[prompt]]);for(const translate of [undefined,null,false,0,()=> 'translated'])for(const fn of ['aiPromptLabel','aiPromptDescription'])compare('ai-prompts',fn,[[prompt,translate]])}
 const content='Correct grammar, spelling, and punctuation so the transcript reads naturally and professionally. Keep the original meaning, speakers, and details. Do not add new facts. Use the same language as the transcript.'
 for(const isPreset of flags)compare('ai-prompts','mergeDefaultAiPrompts',[[[{name:'improve-grammar',content,isPreset,sortOrder:0,createdAt:1,updatedAt:1}],2]])
})
test('complete shared port: catalog objects retain legacy truthy endpoint overrides',()=>{
 const [before,after]=modulePair('ai-presets'),a=before.getAiProviderPreset('cliproxy'),b=after.getAiProviderPreset('cliproxy'),originalA=a.requiresBaseUrl,originalB=b.requiresBaseUrl
 try {for(const flag of [undefined,null,false,true,0,1,NaN,'','yes',{}]){a.requiresBaseUrl=flag;b.requiresBaseUrl=flag;compare('ai-presets','resolveAiProviderBaseUrl',[['cliproxy',' https://fixture.test/v1 ']])}} finally {a.requiresBaseUrl=originalA;b.requiresBaseUrl=originalB}
})

it.effect('legacy image Promise settlement preserves every frozen microtask boundary in the same realm', () => Effect.promise(async () => {
 const load = sourceLoader(options)
 const before = load(fixture+'agent-markdown.ts'), after = load(compat+'agent-markdown.ts')
 const resolved=load.inRealm('(value) => Promise.resolve(value)')
 const rejected=load.inRealm('(error) => Promise.reject(error)')
 const images = [1,2,3].map(i=>({id:`12345678-1234-1234-1234-12345678901${i}`,threadId:'t',runId:'r',kind:'image',name:'shot.png',path:'/shot.png',start:i,end:i,createdAt:0}))
 for(const mode of ['none','resolved','throw','several','reject','thenable','sync']) {
  const artifacts=mode==='several'?images:images.slice(0,1)
  const text=mode==='none'?'no citations':artifacts.map(x=>`![image](artifact:${x.id})`).join('\n')
  const trace=async implementation=>{
   const events=[]
   const promise=implementation.embedArtifactImages(text,artifacts,item=>{
    events.push(`read:${item.id}`)
    if(mode==='throw')throw new Error('read')
    if(mode==='reject')return rejected(new Error('read'))
    if(mode==='thenable')return {then(resolve){events.push('thenable');resolve('AA==')}}
    return mode==='sync'?'AA==':resolved('AA==')
   })
   events.push('returned')
   const settled=promise.then(value=>{events.push('settled');return value})
   let tick=0
   const count=()=>{events.push(`microtask:${++tick}`);if(tick<16)queueMicrotask(count)}
   queueMicrotask(count)
   const value=await settled
   // Drain the bounded counter so traces compare the same observation window.
   for(let i=0;i<20;i++)await Promise.resolve()
   return {events,value}
  }
  expect(await trace(after),mode).toEqual(await trace(before))
 }
}))

test('legacy transcript observations admit negative starts and TTS identifiers retain the full 200 character boundary',()=>{
 const segment=current(shared+'extension-transcript.ts').ExtensionTranscriptSegment
 expect(Result.isSuccess(S.decodeUnknownResult(segment)({start:-1,end:0,text:'observed'}))).toBe(true)
 const a=old(fixture+'tts-models.ts').ttsModelIdSchema,b=current(compat+'tts-models.ts').ttsModelIdSchema
 for(const length of [1,198,199,200,201]) {
  const text='a'.repeat(length)
  expect(b.safeParse(text).success).toBe(a.safeParse(text).success)
  expect(b.safeParse(text).success).toBe(length<=200)
 }
})

test('Effect Orders retain source order for tied markdown, format, catalog and skill entries',()=>{
 const artifacts=[{id:'12345678-1234-1234-1234-123456789011',kind:'image',path:'a.png',runId:'r',start:4},{id:'12345678-1234-1234-1234-123456789012',kind:'image',path:'b.png',runId:'r',start:6}]
 for(const rows of [artifacts,[...artifacts].reverse()])compare('agent-markdown','matchArtifactByClock',[[rows,new Set(),5,'r']])
 for(const kind of ['audio','video']) {
  const formats=['first','second'].map(format_id=>({format_id,ext:'mp4',height:720,width:1280,vcodec:kind==='audio'?'none':'h264',acodec:'aac',tbr:100,quality:1,filesize:1000}))
  for(const rows of [formats,[...formats].reverse()])compare('utils/video-info-metadata','pickOneClickSelectedFormat',[[{formats:rows},{oneClickDownloadType:kind,oneClickQuality:'best'}]])
 }
 const summaries=['a','b'].map(id=>({id,downloadId:'d',promptId:id,title:id,updatedAt:1,running:false}))
 for(const rows of [summaries,[...summaries].reverse()]) {
  const state={revision:0,thread:null,catalog:{downloadId:'d',threads:rows,history:rows,statuses:{},sources:{}}}
  const summary={id:'c',downloadId:'d',promptId:'c',title:'c',updatedAt:1,running:false}
  compare('extension-chat-state','applyExtensionChatEvent',[[state,{type:'agent',event:{catalog:{kind:'upsert',revision:1,summary,history:true,runStatus:'idle'}}}]])
 }
 const [before,after]=modulePair('ai-prompts')
 expect(after.AI_PROMPT_PRESETS.map(item=>item.name)).toEqual(before.AI_PROMPT_PRESETS.map(item=>item.name))
})

test('exact-key decoding preserves missing and present undefined with original default boundaries',()=>{
 const pairs=[['video-localization','subtitleExportInputSchema','SubtitleExportInput',{sourceKey:'s',format:'srt'}],['video-localization','dubbingInputSchema','DubbingInput',{sourceKey:'s'}]]
 for(const [file,legacyName,name,base]of pairs)for(const key of ['bilingual','background','maxSpeed','burnSubtitles']) {
  const legacy=old(fixture+file+'.ts')[legacyName],schema=current(shared+file+'.ts')[name]
  for(const input of [base,{...base,[key]:undefined}]){
   const expected=legacy.safeParse(input),actual=S.decodeUnknownResult(schema)(input)
   expect(Result.isSuccess(actual)).toBe(expected.success)
   if(expected.success&&Result.isSuccess(actual))expect(actual.success).toEqual(expected.data)
  }
 }
 const attach=current(shared+'types/player.ts').PlayerAttachResult
 for(const value of [{playablePath:'p'},{playablePath:'p',reason:undefined}]){
  const decoded=S.decodeUnknownResult(attach)(value)
  // This is a presence assertion over an independent literal, not an old output fed to new code.
  expect(Result.isSuccess(decoded)).toBe(true)
  if(Result.isSuccess(decoded))expect(Object.hasOwn(decoded.success,'reason')).toBe(Object.hasOwn(value,'reason'))
 }
})

test('strict lookup operations carry absence in Option while compatibility keeps legacy shapes',()=>{
 const native=current(shared+'agent-markdown.ts'),legacy=current(compat+'agent-markdown.ts')
 const missing=native.artifactIdFromUrl({url:'not-an-artifact',artifacts:[]})
 expect(missing._tag).toBe('None')
 expect(legacy.artifactIdFromUrl('not-an-artifact',[])).toBeUndefined()
 expect(native.clockFromImage({alt:'no clock',url:'unknown'})._tag).toBe('None')
 expect(legacy.clockFromImage('no clock','unknown')).toBeNull()
 const found=native.clockFromImage({alt:'0:05',url:'unknown'})
 expect(found._tag).toBe('Some')
 expect(found.value).toBe(5)
 const run=current(shared+'ai-run.ts')
 expect(run.promptTabIndicator({status:'idle'})._tag).toBe('None')
 expect(current(compat+'ai-run.ts').promptTabIndicator('idle')).toBeNull()
 for(const file of fs.readdirSync(compat,{recursive:true}).filter(file=>file.endsWith('.ts'))){
  const source=fs.readFileSync(compat+file,'utf8')
  expect(source,`Promise turns in ${file}`).not.toMatch(/Effect\.(?:runPromise|tryPromise|promise)|\.then\(|\.catch\(|\.finally\(/)
  if(file!=='agent-markdown.ts')expect(source,`async export in ${file}`).not.toMatch(/\basync\b|\bPromise\b/)
 }
})
