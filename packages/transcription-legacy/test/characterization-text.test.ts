import './fixtures/audit-isolation'
import { expect, it } from 'vitest'
import * as T from '@vidbee/transcription-legacy'
const atoms:unknown[]=[undefined,null,false,true,0,7,NaN,Infinity,'','text']
const observe=(fn:Function,args:unknown[])=>{try{return {returned:Reflect.apply(fn,undefined,args)}}catch{return {engine:true,failed:true}}}
it('ASR token grouping, punctuation attachment, CJK starts, invalid timings and last-started selection',()=>{
 const results:unknown[]=[]
 const inputs=[{}, {tokens:['a'],timestamps:[]},{tokens:['▁Hello','world',',','▁next','\nline','中','文','!'],timestamps:[-1,0,.1,.2,.3,.4,.5,.6]}, {tokens:['','▁','a'],timestamps:[0,0,0]}, {tokens:['a','▁b','▁c'],timestamps:[1,0,NaN]}, {tokens:['a','▁b'],timestamps:[Infinity,-Infinity],durations:[99]}]
 for(const input of inputs)for(const start of [0,100])for(const end of [0,150,1000])results.push({input,start,end,result:T.wordsFromAsrResult(input,start,end)})
 for(const key of ['tokens','timestamps','durations','text'])for(const value of atoms)results.push({key,value,...observe(T.wordsFromAsrResult,[{tokens:['a'],timestamps:[0], [key]:value},0,1000])})
 expect(results).toMatchSnapshot()
 const words=[{text:'a',startMs:100,endMs:200},{text:'b',startMs:100,endMs:120},{text:'c',startMs:50,endMs:60}]
 expect([-Infinity,49,49.49,49.5,99.5,100,1000,Infinity,NaN].map(time=>({time,index:T.activeWordIndex(words,time)}))).toMatchSnapshot()
})
it('punctuation density, unicode alignment, hook failures and rewritten outputs preserve exact fallbacks',()=>{
 const texts=['','123','🙂','hello','hello.','hello!','中。','a'.repeat(199)+'!','a'.repeat(200)+'!']
 expect(texts.map(text=>({text,needs:T.needsPunctuation(text)}))).toMatchSnapshot()
 expect([['','!'],['hello','(hello)!'],['aba','a,b,a!'],['hello','Hello!'],['🙂中','(🙂)，中。'],['abc','ab']].map(([source,target])=>T.alignInsertions(source!,target!))).toMatchSnapshot()
 const trace:unknown[]=[];const results:unknown[]=[]
 for(const value of [...atoms,'Hello!','(hello)!'])results.push({value,result:Reflect.apply(T.punctuateText,undefined,[{addPunct:(text:string)=>{trace.push(text);return value}},'hello'])})
 results.push({throws:T.punctuateText({addPunct:()=>{throw new Error('addon')}},'hello')});expect({results,trace}).toMatchSnapshot()
})
it('punctuation keeps word timing/identity on fallbacks and attaches inserted boundaries to prior cue',()=>{
 const words=[{text:'hello',startMs:1,endMs:2},{text:' world',startMs:3,endMs:4}]
 const punct={addPunct:(text:string)=>`(${text})!`}
 const result=T.punctuateWords(punct,'hello world',words);expect(result).toMatchSnapshot();expect(result.words?.[0]).not.toBe(words[0]);expect(result.words?.map(word=>word.text).join('')).toBe(result.text)
 expect(T.punctuateWords(punct,'different',words).words).toBe(words);expect(T.punctuateWords(punct,'hello!',words).words).toBe(words)
 expect([undefined,[]].map(value=>T.punctuateWords(punct,'hello',value))).toMatchSnapshot()
 const calls:string[]=[];const cues=[{id:1,text:'a'.repeat(300)},{id:2,text:'b'.repeat(300)},{id:3,text:'c'},{id:4,text:''}]
 const converted=T.punctuateCues({addPunct:text=>{calls.push(text);return `${text}!`}},cues)
 expect({calls,converted,original:cues}).toMatchSnapshot();expect(converted[0]).not.toBe(cues[0]);const empty:Array<{text:string}>=[];expect(T.punctuateCues(punct,empty)).toBe(empty)
})
it('Chinese tag/detection/conversion matrices pin non-Chinese exclusions and scalar successful results',()=>{
 const languages=['zh','zh_TW','zh-Hant-CN','zh-HK','zh-MO-x','cmn','zho','chi','en','ja','yue',' ZH-hans ']
 expect(languages.map(language=>({language,script:T.chineseScriptOf(language),hint:T.chineseScriptHint(language)}))).toMatchSnapshot()
 const texts=['','English','汉语中文后发','漢語中文後發','中文かな','中文한국','一二三','😀中文']
 expect(texts.map(text=>({text,chinese:T.looksLikeChinese(text),detected:T.chineseScriptFromText(text),hans:T.applyChineseScript(text,'hans'),hant:T.applyChineseScript(text,'hant')}))).toMatchSnapshot()
 expect(atoms.map(value=>({value,hint:observe(T.chineseScriptHint,[value]),convert:observe(T.applyChineseScript,[value,'hant']),looks:observe(T.looksLikeChinese,[value])}))).toMatchSnapshot()
})
it('Chinese result conversion preserves unchanged references and clones words only at selected boundary',()=>{
 const words=[{text:'汉语',startMs:10,endMs:20}];const segment={speakerKey:null,startMs:0,endMs:100,text:'汉语',words,confidence:null}
 const result:T.PipelineResult={resultKind:'transcript',language:'en',asrTier:null,modelVersion:'v',speakers:[],segments:[segment]}
 expect(T.applyChineseScriptToSegment(segment,null)).toBe(segment)
 expect(T.applyChineseScriptToResult(result,null).segments).toBe(result.segments)
 const converted=T.applyChineseScriptToResult(result,'hant');expect(converted).toMatchSnapshot();expect(converted.segments[0]?.words).not.toBe(words)
 const english={...result,segments:[{...segment,text:'English'}]};expect(T.applyChineseScriptToResult(english,null)).toBe(english)
 expect([null,undefined,'hans','hant'].map(script=>({script,language:Reflect.apply(T.languageAfterChineseScript,undefined,[[{text:'汉语'}],script])}))).toMatchSnapshot()
})
