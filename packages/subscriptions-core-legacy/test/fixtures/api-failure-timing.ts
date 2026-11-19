export const failureTimingScenarios=['refreshOne-get','refreshOne-write','refresh-get','refreshAll-get','observe','start','stop','profile-write','same-success','same-failure','refresh-success','refreshAll-success','observe-success','start-success','same-write-failure','reentrant-get','reentrant-get-failure'] as const
export async function observeApiFailureTiming(Ctor:Function,scenario:string):Promise<unknown[]>{
 const trace:unknown[]=[];const failure=new Error('fixture-failure')
 const state={kind:null,pid:null,startedAt:null,heartbeatAt:null,lockExpiresAt:null,leaseId:null,preferred:null}
 let reenter:(()=>Promise<unknown>)|undefined;let reads=0
 let armed=false,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
 const sub={id:'sub',title:'Fixture',sourceUrl:'source',feedUrl:'feed',platform:scenario==='profile-write'?'instagram':'custom',sourceKind:scenario==='profile-write'?'profile':'feed',keywords:[],tags:[],categories:['posts'],onlyDownloadLatest:false,autoDownload:false,enabled:true,status:'idle',createdAt:1,updatedAt:1,items:[]}
 const meta={async readLeader(){trace.push('meta-read');if(armed&&['observe','start'].includes(scenario))throw failure;return {...state}},async casLeader(request:{next:object}){trace.push('meta-cas');if(armed&&scenario==='stop')throw failure;Object.assign(state,request.next);return true},async readPreferred(){return null},async writePreferred(){}}
 const store={async get(){trace.push('get');if(scenario.startsWith('reentrant-get')&&++reads===1&&reenter!==undefined){const nested=reenter();trace.push('reentry-returned');await nested;trace.push('reentry-awaited')};if(['refreshOne-get','refresh-get','refreshAll-get'].includes(scenario))throw failure;return {...sub}},async update(_id:string,patch:{status?:string}){trace.push(['update',patch.status]);if(['refreshOne-write','profile-write','same-write-failure','reentrant-get-failure'].includes(scenario)&&patch.status==='checking')throw failure;return {...sub}},async list(){trace.push('list');return [sub]},async clearOrphanedQueueLinks(){return 0},async replaceItems(){trace.push('replace')},async clearQueueLinks(){return 0},async mergeItems(){},async markItemQueued(){},async remove(){return true},async findDuplicateFeed(){return null},async add(){return sub}}
 const options={kind:'desktop',pid:1,store,metaStore:meta,fetcher:{async fetch(){trace.push('fetch');if(scenario.startsWith('same-')){await gate;if(scenario==='same-failure')throw failure}return {items:[]}}},profileFetcher:{async fetch(){return {items:[],categoryErrors:{}}}},async enqueueItem(){return null},now:()=>1000,log(_level:string,message:string){trace.push(['log',message])},scheduler:{setTimeoutImpl(){return 0},clearTimeoutImpl(){}},leader:{scheduleInterval(){return 0},clearInterval(){}}}
 const owner=Reflect.construct(Ctor,[options])
 reenter=()=>owner.refreshOne('sub')
 if(scenario==='stop')await owner.start()
 trace.length=0;armed=true
 let first:Promise<unknown>
 if(scenario.startsWith('observe'))first=owner.observeLeader()
 else if(scenario.startsWith('start'))first=owner.start()
 else if(scenario==='stop')first=owner.stop()
 else if(scenario==='refresh-get'||scenario==='refresh-success')first=owner.refresh({id:'sub'})
 else if(scenario==='refreshAll-get'||scenario==='refreshAll-success')first=owner.refreshAll({force:true})
 else first=owner.refreshOne('sub')
 let observed=false
 const watch=(pending:Promise<unknown>,label:string)=>pending.then(()=>{observed=true;return trace.push(['settled',label])},error=>{observed=true;return trace.push(['rejected',label,error===failure])})
 const watched=watch(first,'first');const second=scenario.startsWith('same-')?watch(owner.refreshOne('sub'),'second'):undefined
 trace.push('returned');let marker=0;const step=()=>{trace.push(['microtask',++marker]);if(marker===3)release();if(marker<40)queueMicrotask(step)};queueMicrotask(step)
 if(scenario.startsWith('reentrant-get')){for(let i=0;i<80;i++)await Promise.resolve();if(!observed){trace.push('blocked');return trace}}
 await watched;if(second!==undefined)await second;trace.push('awaited');for(let i=0;i<45;i++)await Promise.resolve()
 // No real timers were created; stop may intentionally fail in its own scenario.
 return trace
}
