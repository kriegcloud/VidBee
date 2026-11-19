import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import * as form from '../../subscriptions-core/src/form.js'
import * as status from '../../subscriptions-core/src/status.js'
import * as resolver from '../../subscriptions-core/src/feed-resolver.js'
import * as items from '../src/feed-items.js'
import * as profile from '../src/profile-policy.js'
import * as auto from '../src/auto-download.js'
import * as downloads from '../../subscriptions-core/src/download-options.js'
import * as types from '../../subscriptions-core/src/types.js'
import {discoverFeedUrls} from '../../subscriptions-core/src/feed-parser.js'
import {encode,materialize,observePure} from './fixtures/review-pure-cases.js'
if(process.versions.node!=='22.23.4'||process.versions.bun)throw new Error('Pinned Node required')
const modules={form,status,resolver,items,profile,auto,downloads,types,feed:{discoverFeedUrls}}
const fixture=JSON.parse(readFileSync(new URL('./fixtures/review-pure-oracle.json',import.meta.url),'utf8'))
const validCases=new Map(fixture.filter((entry:{path:string})=>entry.path==='valid').map((entry:{module:string;name:string;args:unknown[]})=>[entry.module+'.'+entry.name,entry.args]))
let excluded=0
const originalNow=Date.now,originalRandom=Math.random
Date.now=()=>123;Math.random=()=>0.5
try{
 for(const entry of fixture){
  // The parity boundary excludes a non-array supplied in an array position.
  if(entry.path!=='valid'){
   let original:unknown=validCases.get(entry.module+'.'+entry.name)
   for(const key of entry.path.split(':')[0].split('.'))original=Reflect.get(original as object,key)
   if(Array.isArray(original)){excluded++;continue}
  }
  const args=materialize(entry.args) as unknown[]
  const result=observePure(Reflect.get(Reflect.get(modules,entry.module),entry.name),args)
  const label=entry.module+'.'+entry.name+':'+entry.path
  if(entry.expected.engine===true){assert(result!==null&&typeof result==='object'&&'error' in result,label+' must still fail');assert.deepEqual(Reflect.get(result,'postArgs'),entry.expected.postArgs,label+' argument mutation')}
  else assert.deepEqual(result,entry.expected,label)
 }
 console.log(JSON.stringify({cases:fixture.length,compared:fixture.length-excluded,excludedArrayPositions:excluded,differences:0}))
}finally{Date.now=originalNow;Math.random=originalRandom}
