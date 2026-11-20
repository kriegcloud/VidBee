import { writeFileSync } from 'node:fs';
import * as old from '../../../fixtures/cli-pre-port/library.mjs';
import { observeApproved } from './approved-adapter.mjs';
import { encode } from './pure-vectors.mjs';
const path='/fixture/descriptor.json';
const valid={version:1,host:'localhost',port:27100,pid:123,pidStartedAt:1,tokenIssuedAt:2,tokenExpiresAt:3,updatedAt:4};
const observations=[];
for(const field of ['port','pid','pidStartedAt','tokenIssuedAt','tokenExpiresAt','updatedAt'])for(const number of ['1e999','-1e999']){
  const raw=JSON.stringify({...valid,[field]:'NUMBER'}).replace('"NUMBER"',number);
  const scenario={id:field+' '+number,kind:'descriptor',raw};
  const before=await observeApproved(old,scenario);let after;
  if(['port','pid','pidStartedAt'].includes(field))after={ok:false,path,envelope:{ok:false,code:'DESKTOP_NOT_READY',message:field==='port'?'descriptor missing host/port':'descriptor missing pid/pidStartedAt',details:{path}}};
  else after={...before,descriptor:{...before.descriptor,[field]:field==='updatedAt'?0:null}};
  observations.push({...scenario,old:encode(before),new:encode(after)});
}
for(const raw of ['{','\ufeff{}','{\n"x":}']){
  const scenario={id:'descriptor syntax '+JSON.stringify(raw),kind:'descriptor',raw};const before=await observeApproved(old,scenario);
  observations.push({...scenario,old:encode(before),new:encode({...before,envelope:{...before.envelope,message:'automation descriptor is malformed: Expected a valid JSON string'}})});
}
for(const number of ['Infinity','-Infinity','NaN']){
  const scenario={id:'handshake '+number,kind:'handshake',number};
  observations.push({...scenario,old:encode(await observeApproved(old,scenario)),new:encode({error:{message:'handshake response missing token/expiresAt',code:'CONTRACT_ERROR',status:200,body:number}})});
}
for(const number of ['1e999','-1e999']){
  const scenario={id:'cache '+number,kind:'cache',raw:'{"version":"2.0","fetchedAt":'+number+'}'};
  observations.push({...scenario,old:encode(await observeApproved(old,scenario)),new:encode(await observeApproved(old,{...scenario,raw:'{}'}))});
}
for(const finished of [false,true]) {
  const scenario={id:finished?'deadline body finishes':'deadline fires',kind:'deadline-clear',finished};
  observations.push({...scenario,old:encode(await observeApproved(old,scenario)),new:encode({cleared:finished?[1]:[]})});
}
writeFileSync(new URL('./approved-changes.json' ,import.meta.url),JSON.stringify({switch:'VIDBEE_CLI_PORTED=1',observations,
outputCompletion:{old:{code:0,signal:null,stderr:'',stdout:'nonempty prefix of complete document; kernel-dependent length'},new:{slow:'exact complete rendered document plus newline',closed:{code:'nonzero',signal:null,stderrWhenOpen:'nonempty'}}},
metadata:{old:{main:'./dist/index.mjs',types:'./dist/index.d.mts'},new:{main:'./dist/library/index.js',types:'./dist/library/index.d.ts',entries:{'.':'index','./parser':'parser/index','./envelope':'envelope/index'}}},
registrySyntax:['{','{\n"x":}',''].map(raw=>{let message;try{JSON.parse(raw);}catch(error){message=error.message;}return {raw,old:message,new:'Expected a valid JSON string'};})},null,2)+'\n');
