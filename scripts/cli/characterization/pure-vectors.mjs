// Stable, bounded generator. Absolute synthetic paths prevent cwd-dependent output.
export const flags = { api: 'https://example.invalid', local: false, target: 'desktop', json: true, pretty: false, wait: false, detach: false, priority: 'user', maxAttempts: 3, noRetry: false, groupKey: 'group', timeoutMs: 1000, noAutostart: false, token: 'fixture-token' };
export const reserved = [ ['api','https://example.invalid'], ['local'], ['target','local'], ['json'], ['pretty'], ['wait'], ['detach'], ['priority','user'], ['max-attempts','3'], ['no-retry'], ['group-key','组'], ['timeout','100'], ['no-autostart'], ['token','fixture-token'] ];
export const probes = ['-j','--dump-json','-J','--dump-single-json','-F','--list-formats','--list-formats-as-table','--list-formats-old','-s','--simulate','--skip-download','--list-subs','--list-extractors','--list-extractor-descriptions','--get-id','--get-title','--get-thumbnail','--get-description','--get-duration','--get-filename','--get-format','--get-url','--update','--version','--print'];
export const numbers = ['0','-1','+1','01',' 1','1 ','1x','1e3','1.5','NaN','Infinity','9007199254740992','9999999999999999999999','', '3'];
export function vectors() {
  const cases = [];
  const add = (fn, ...args) => cases.push({ fn, args });
  for (const [name, value] of reserved) {
    const flag = `--vidbee-${name}`;
    for (const tail of [[],['--'],[':status','--vidbee-pretty'],['--help'],['']]) {
      add('parseArgv', [flag, ...(value === undefined ? [] : [value]), ...tail]);
      add('parseArgv', [`${flag}=${value ?? 'false'}`, ...tail]);
    }
    add('parseArgv', [flag]);
    add('parseArgv', [flag, '--vidbee-pretty']);
    add('findReservedFlag', flag);
  }
  for (const n of numbers) {
    add('parseArgv',['--vidbee-max-attempts',n]); add('parseArgv',['--vidbee-timeout',n]); add('parseListArgs',['--limit',n]);
  }
  for (const a of reserved) for (const b of reserved) {
    add('parseArgv',[`--vidbee-${a[0]}`, ...(a.length > 1 ? [a[1]] : []), `--vidbee-${b[0]}`, ...(b.length > 1 ? [b[1]] : [])]);
  }
  for (const p of probes) for (const args of [[p],[`${p}=value`],['--',p],['--output',p],[p,'--version'],['--vidbee-api',p]]) {
    add('parseArgv',args); add('findProbeFlag',args); add('isProbeArgv',args);
  }
  for(const args of [[],[''],[':'],['--vidb'],['--vidbe-wait'],['--vidbee:wait'],['--video-sort'],['--get-unknown'],['--help'],['--','--vidbee-typo'],[':status','--vidbee-typo']]) add('parseArgv',args);
  for(const output of [['-o','-'],['-o-'],['-o=-'],['--output','-'],['--output=-']]) {add('parseArgv',output);add('parseArgv',['-j',...output]);}
  for(const name of ['--status','--group','--group-key','--parent','--limit','--cursor']) for(const value of ['','queued','completed','bogus','--limit','2junk']) {
    add('parseListArgs',[name,value]); add('parseListArgs',[`${name}=${value}`]); add('parseListArgs',[name]);
  }
  for(const status of ['queued','running','processing','paused','retry-scheduled','completed','failed','cancelled'])add('parseListArgs',['--status',status]);
  const scalars = [undefined,null,false,true,0,42,'',' x ',NaN];
  for(const field of Object.keys(flags)) for(const value of scalars) {
    const altered={...flags,[field]:value}; add('selectTransport',altered); add('buildForwardedInput',{argv:['https://example.invalid/v','-o','/fixture/movie.%(ext)s'],flags:altered});
  }
  for(const value of scalars) for(const fn of ['redactText','validateApiUrl','isLoopbackOrPrivateHost','compareSemver','isVidbeePrefixed','findReservedFlag'])add(fn,...(fn==='compareSemver'?[value,'1.2.3']:[value]));
  const secrets=['--username','--password','--video-password','--ap-password','--twofactor','--ap-username'];
  for(const s of secrets)for(const args of [[s],[s,'秘密'],[`${s}=secret`],[s,'--password'],[s.toUpperCase(),'plain']])add('redactArgs',args);
  for(const header of ['authorization','cookie','set-cookie','token','x-token','bearer','x-auth','x-auth-token','proxy-authorization','other'])for(const flag of ['--add-header','--add-headers'])for(const v of [`${header}: secret`,` ${header.toUpperCase()} :秘密`,header]){add('redactArgs',[flag,v]);add('redactArgs',[`${flag}=${v}`]);}
  for(const key of ['token','access_token','auth_token','id_token','signature','sig','policy','key','secret','apikey','api_key','password','pass','pwd','other'])for(const token of [`HTTPS://EXAMPLE.invalid?${key}=a&${key}=b`,`https://example.invalid?${key.toUpperCase()}=秘密`]) {add('redactArgs',[token]);add('redactText',`tail ${token}\nAuthorization: secret\nkeep`);}
  for(const args of [[],[''],['a b',"a'b",'"','\\','$','`','秘密'],['https://example.invalid'],['http://['],['--output=x','--paths','/fixture','-P','/other'],['--cookies','https://example.invalid/a','https://example.invalid/b'],['--unknown','https://example.invalid/v']]) {add('redactArgs',args);add('buildForwardedInput',{argv:args,flags});}
  for(const host of ['localhost','LOCALHOST','[::1]','::1','127.999.0.1','10.1.2.3','192.168.1.1','172.15.0.1','172.16.0.1','172.31.0.1','172.32.0.1','169.254.1.1','printer.local','example.invalid','8.8.8.8']){add('isLoopbackOrPrivateHost',host);add('validateApiUrl',`http://${host}`);}
  for(const url of ['','broken','file:///fixture','https://example.invalid/a','http://user:pass@localhost/path?x=1'])add('validateApiUrl',url);
  const versions=['','1','1.0','1.0.0','1.0.0-rc.1','1.0.0-rc.10','v2.3','1x.2','01.2','2.0+build','1.0.0.1'];for(const a of versions)for(const b of versions)add('compareSemver',a,b);
  for(const code of ['UNKNOWN_VIDBEE_FLAG','INVALID_TARGET','INVALID_PRIORITY','INVALID_MAX_ATTEMPTS','INVALID_TIMEOUT','MISSING_VALUE','UNEXPECTED_VALUE','STDOUT_OUTPUT_DISALLOWED','PARSE_ERROR','PROBE_OUTPUT_TOO_LARGE','DESKTOP_NOT_READY','API_UNREACHABLE','HANDSHAKE_FAILED','TOKEN_EXPIRED','AUTH_FAILED','CONTRACT_VERSION_MISMATCH','CONTRACT_SCHEMA_MISMATCH','NOT_IMPLEMENTED','UNKNOWN_ERROR']){add('exitCodeForError',code);add('errorEnvelope',code,'message');add('errorEnvelope',code,'message',{nested:undefined,n:NaN});}
  for(const result of [undefined,null,false,0,'秘密',{z:undefined,a:Infinity,b:NaN,c:-Infinity},[1,null,'x']])for(const pretty of [false,true])add('renderEnvelope',{ok:true,mode:'subcommand',subcommand:'fixture',result},{pretty});
  for (const kind of ['local','api','desktop']) add('transportNotReady',{kind});
  for(const value of scalars)add('compareSemver','1.2.3',value);
  const envelopes = [
    {ok:true,mode:'probe',command:'yt-dlp --version',ytDlp:{exitCode:7,stdout:'秘密\n',stderr:'tail'}},
    {ok:true,mode:'download',task:{id:'fixed',status:'queued',attempt:1,maxAttempts:3,command:'yt-dlp'}},
    {ok:true,mode:'download',task:{id:'fixed',status:'completed'},ytDlp:{exitCode:0,stdoutTail:'',stderrTail:''}},
    {ok:false,mode:'download',task:{id:'fixed',status:'failed'},ytDlp:{exitCode:1,stdoutTail:'',stderrTail:'tail'}},
    {ok:false,code:'UNKNOWN_ERROR',message:'failure',details:{path:'/fixture'}},
    {ok:true,mode:'subcommand',subcommand:'status',result:{items:[],nextCursor:null}}
  ];
  for(const envelope of envelopes) for(const pretty of [false,true]){
    add('renderEnvelope',envelope,{pretty});
    for(const field of Object.keys(envelope))for(const value of scalars)add('renderEnvelope',{...envelope,[field]:value},{pretty});
  }
  return cases;
}
export function observe(module, vector) {
  try { return { value: module[vector.fn](...vector.args) }; }
  catch(error) {return { error: { name:error.name,message:error.message,code:error.code,exitCode:error.exitCode }, engine: error instanceof TypeError || error instanceof RangeError };}
}
// Preserve undefined, NaN and infinity in recorded observations (JSON alone loses them).
export const encode = value => JSON.stringify(value, (_key,v) => v === undefined ? {$scalar:'undefined'} : typeof v==='number' && !Number.isFinite(v) ? {$scalar:String(v)} : v);
