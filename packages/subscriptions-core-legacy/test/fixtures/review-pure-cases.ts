// Synthetic, environment-independent arguments for the pre-port pinned-Node oracle.
export const scalarInputs: unknown[] = [undefined, null, false, true, 0, 7, NaN, '', 'text']
export const baseRule = {
 id:'subscription', title:'Fixture', sourceUrl:'https://fixture.invalid/source', feedUrl:'https://fixture.invalid/feed',
 platform:'instagram', keywords:['news'], tags:['tag'], onlyDownloadLatest:false, autoDownload:true, enabled:true,
 status:'idle', createdAt:100, updatedAt:100, sourceKind:'profile', profileOwner:'owner', categories:['posts','reels'],
 checkIntervalMs:1800000, nextCheckAt:500, latestVideoPublishedAt:10, lastCheckedAt:100,
 downloadType:'video', downloadQuality:'good', downloadContainer:'mkv'
}
const rawItem = {youtubeId:'item',guid:'guid',id:'id',link:'https://fixture.invalid/item',title:'News',isoDate:'2026-01-01T00:00:00Z',pubDate:'2026-01-01T00:00:00Z',content:'<img src="image">',contentSnippet:'text',contentEncoded:'text',summary:'text',description:'text',mediaThumbnail:[{url:'thumb'}],mediaContent:[{url:'media'}],enclosure:[{url:'enclosure',type:'image/jpeg'}],itunes:{image:{href:'image',url:'image'}}}
const item = {id:'known',url:'https://fixture.invalid/known',title:'Known',publishedAt:10,thumbnail:'thumb',addedToQueue:true,taskId:'task'}
const feed = {title:'Feed',link:'https://fixture.invalid',image:{url:'cover'},itunes:{image:'itunes'},items:[rawItem]}
const profile = {title:'Profile',avatarUrl:'avatar',items:[{id:'item',category:'posts',url:'https://fixture.invalid/item',title:'News',publishedAt:100,thumbnail:'thumb',versioned:false}],categoryErrors:{posts:'error'},error:'error',retryAfter:200}
export interface PureCase { module:string; name:string; args:unknown[]; path:string }
function paths(value:unknown, prefix:(string|number)[]=[]):(string|number)[][] {
 if(value===null||typeof value!=='object')return []
 if('$callback' in value||'$map' in value)return []
 const out:(string|number)[][]=[]
 for(const [key,child] of Object.entries(value)){
  const path=[...prefix,Array.isArray(value)?Number(key):key]
  out.push(path,...paths(child,path))
 }
 return out
}
export function pureReviewCases():PureCase[]{
 const templates:[string,string,unknown[]][]=[
  ['form','sanitizeCommaList',[' a, b,a,A,, b ']], ['form','sanitizeTemplateInput',['C:\\Videos\\a//b']], ['form','buildDefaultSubscriptionDirectory',['/fixture/downloads/']],
  ['status','getSubscriptionStatusMeta',['failed',true]],['status','resolveSubscriptionItemStatus',[{addedToQueue:true,downloadId:'download',taskId:'task'},{$map:[['task',{status:'pending'}],['download',{status:'completed'}]]}]],
  ['resolver','profileFeedUrl',['instagram','SomeOne']],['resolver','resolveProfileSource',['instagram.com/SomeOne/reels']],['resolver','resolveFeedFromInput',['youtube.com/channel/fixture']],['resolver','buildFeedKey',['https://EXAMPLE.invalid/Feed/?b=2&a=1#hash']],
  ['types','isProfilePlatform',['instagram']],['types','profileItemId',['posts','item']],['types','profileItemCategory',['instagram','posts:item']],
  ['items','getSubscriptionFeedEntries',[[{id:'subscription',items:[item,{...item,id:'second',publishedAt:11}]}]]],
  ['items','resolveThumbnail',[rawItem]],['items','resolveFeedCover',[feed,[{...item,thumbnail:'item-thumb'}],[rawItem]]],['items','normalizeFeedItems',[[rawItem],{now:{$callback:'now'}}]],['items','dedupeFeedItems',[[item,{...item,id:'second'},item]]],
  ['auto','decideAutoDownloads',[{subscription:baseRule,knownItems:[item],feed,isHistoryDup:{$callback:'history'},now:{$callback:'now'}}]],
  ['profile','resolveCheckIntervalMs',[baseRule]],['profile','isSubscriptionDue',[baseRule,1000]],['profile','nextProfileCheckAt',[baseRule,100,200,{$callback:'random'}]],['profile','summarizeProfileStatus',[baseRule,profile]],['profile','decideProfileDownloads',[{subscription:baseRule,knownItems:[item],result:profile,isHistoryDup:{$callback:'history'},now:{$callback:'now'}}]],
  ['downloads','buildSubscriptionDownloadOptions',[{downloadType:'video',downloadQuality:'best',downloadContainer:'auto'},{oneClickDownloadType:'audio',oneClickQuality:'good',oneClickContainer:'mkv'}]],
  ['feed','discoverFeedUrls',['<link rel="alternate" type="application/rss+xml" href="/feed?x=1&amp;y=2">','https://fixture.invalid/page']]
 ]
 const result:PureCase[]=[]
 for(const [module,name,args] of templates){
  result.push({module,name,args:structuredClone(args),path:'valid'})
  for(const path of paths(args))for(const [index,value] of scalarInputs.entries()){
   const copy=structuredClone(args);let target:object=copy
   for(const key of path.slice(0,-1))target=Reflect.get(target,key)
   Reflect.set(target,path.at(-1)!,value)
   result.push({module,name,args:copy,path:path.join('.')+':'+index})
  }
 }
 return result
}
export function encode(value:unknown):unknown {
 if(value===undefined)return {$review:'undefined'}
 if(typeof value==='number'&&!Number.isFinite(value))return {$review:String(value)}
 if(typeof value==='function')return {$callback:value.name}
 if(value instanceof Map)return {$map:[...value.entries()].map(encode)}
 if(Array.isArray(value))return value.map(encode)
 if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))
 return value
}
export function materialize(value:unknown):unknown {
 if(value===null||typeof value!=='object')return value
 if('$review' in value){const name=Reflect.get(value,'$review');return name==='undefined'?undefined:Number(name)}
 if('$callback' in value){const name=Reflect.get(value,'$callback');if(name==='now')return function now(){return 123};if(name==='random')return function random(){return 0.5};if(name==='history')return function history(){return false};throw new Error('Unknown callback fixture')}
 if('$map' in value)return new Map((Reflect.get(value,'$map') as [unknown,unknown][]).map(([k,v]:[unknown,unknown])=>[k,materialize(v)]))
 if(Array.isArray(value))return value.map(materialize)
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,materialize(v)]))
}
export function observePure(fn:Function,args:unknown[]):unknown {
 try{return {value:encode(Reflect.apply(fn,undefined,args)),postArgs:encode(args)}}
 catch(error){return {error:error instanceof Error?error.constructor.name:typeof error,message:error instanceof Error?error.message:String(error),engine:error instanceof TypeError||error instanceof URIError,postArgs:encode(args)}}
}
