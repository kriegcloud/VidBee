import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const read = name => JSON.parse(readFileSync(new URL('../../../'+name,import.meta.url),'utf8'));
test('production manifest requires only public external runtime packages',()=>{
  const manifest=read('apps/cli/package.json');
  assert.deepEqual(Object.keys(manifest.dependencies).filter(name=>name.startsWith('@vidbee/')),[]);
});
test('parse-pretty records compact failure bytes and exit 2 from frozen executable',()=>{
  const value=read('apps/desktop/test/golden/cli--extended--parse-pretty.json');
  assert.equal(value.code,2);assert.equal(value.signal,null);assert.equal(typeof value.stdout,'string');
  assert.equal(value.stdout,JSON.stringify(JSON.parse(value.stdout))+'\n');
  assert.equal(JSON.parse(value.stdout).ok,false);
});
test('history removal compares actual envelopes and an empty post-removal query',()=>{
  const value=read('apps/desktop/test/golden/cli--extended--history-remove.json');
  assert.equal(value.removals.length,5);
  for(const removal of value.removals){assert.equal(removal.code,0);assert.equal(removal.signal,null);assert.equal(removal.stderr,'');assert.equal(removal.stdout.ok,true);assert.equal(removal.stdout.result.removed.length,1);}
  assert.equal(value.history.code,0);assert.equal(value.history.signal,null);assert.equal(value.history.stderr,'');
  for(const removal of value.removals) assert.equal(value.history.stdout.result.items.some(task=>task.id===removal.stdout.result.removed[0]),false);
});

// Independent pre-port observation: neither a broken nor a held error body is touched.
test('frozen registry rejects headers before consuming broken or held non-OK bodies',async()=>{
  assert.equal(process.env.CLI_ISOLATED,'1');
  const {checkUpgrade}=await import('../../../fixtures/cli-pre-port/library.mjs');
  const fetch=globalThis.fetch;
  try{
    for(const mode of ['broken','open']){
      let bodies=0;
      globalThis.fetch=async()=>({ok:false,status:503,json(){bodies++;return mode==='broken'?Promise.reject(Error('fixture body broken')):new Promise(()=>{});}});
      await assert.rejects(checkUpgrade({current:'0.1.0',force:true,cachePath:process.env.TMPDIR+'/unused-upgrade.json'}),{message:'registry responded 503'});
      assert.equal(bodies,0);
    }
  }finally{globalThis.fetch=fetch;}
});
