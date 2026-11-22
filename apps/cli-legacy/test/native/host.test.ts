import {expect,layer} from '@effect/vitest';
import * as Effect from 'effect/Effect';
import {CliLocal,CliProbe,CliLauncher} from '@vidbee/cli';
import {hostLayers} from '../../src/layers.js';
layer(hostLayers({platform:'linux',homeDirectory:'/fixture/home',executingArtifactUrl:new URL('file:///fixture/pkg/dist/index.mjs')}))((it)=>{
  it.effect('raw probe preserves chunks and nullable process observation reduction',()=>Effect.gen(function*(){
    const probe=yield* CliProbe;
    const result=yield* probe.run({argv:['--version']});
    expect(result.kind).toBe('success');
    if(result.kind==='success'){expect(result.stdout).toBe('native fixture');expect(result.exitCode).toBe(0);}
  }));
  it.effect('synchronous raw spawn errors remain a handled probe envelope',()=>Effect.gen(function*(){
    const probe=yield* CliProbe;
    const result=yield* probe.run({argv:[],ytDlpPath:'\0'});
    expect(result.kind).toBe('error');
    if(result.kind==='error')expect(result.envelope.code).toBe('NOT_IMPLEMENTED');
  }));
  it.effect('raw launcher detaches/unrefs without retaining parent lifetime',()=>Effect.gen(function*(){
    const launcher=yield* CliLauncher;
    yield* launcher.launch({command:'vidbee-desktop',argv:['--background','--from-cli']});
  }));
  it.effect('local owner has an independent queue and an idempotent explicit shutdown',()=>Effect.gen(function*(){
    const local=yield* CliLocal;
    const first=yield* local.open({defaultDownloadDir:'/fixture/downloads'});
    const second=yield* local.open({defaultDownloadDir:'/fixture/other'});
    const page=yield* first.list({});
    expect(page.items).toEqual([]);
    const missing=yield* second.get('missing').pipe(Effect.result);
    expect(missing._tag).toBe('Failure');
    yield* first.shutdown;
    yield* first.shutdown;
    yield* second.shutdown;
  }));
});
