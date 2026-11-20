import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, symlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// Execute the unmodified shipping build in a scratch package, never tracked dist.
export function buildDistribution(repo, scratch) {
  const root = join(scratch, 'shipping'); mkdirSync(join(root, 'scripts'), {recursive:true});
  copyFileSync(join(repo,'apps/cli/scripts/build.mjs'),join(root,'scripts/build.mjs'));
  symlinkSync(join(repo,'apps/cli/src'),join(root,'src'));
  symlinkSync(join(repo,'node_modules'),join(root,'node_modules'));
  copyFileSync(join(repo,'apps/cli/package.json'),join(root,'package.json'));
  const result=spawnSync(process.execPath,[join(root,'scripts/build.mjs')],{cwd:root,encoding:'utf8',timeout:120000});
  assert.equal(result.status,0,result.stderr);
  const changes=JSON.parse(readFileSync(new URL('./approved-changes.json',import.meta.url),'utf8'));
  const metadata=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  const expected=process.env.VIDBEE_CLI_PORTED==='1'?changes.metadata.new:changes.metadata.old;
  assert.equal(metadata.main,expected.main);assert.equal(metadata.types,expected.types);
  if(process.env.VIDBEE_CLI_PORTED==='1'){
    for(const [entry,target] of Object.entries(expected.entries)){
      const exported=metadata.publishConfig.exports[entry];
      assert.equal(typeof exported==='string'?exported:exported.import??exported.default,'./dist/library/'+target+'.js');
      readFileSync(join(root,'dist/library',target+'.js'));readFileSync(join(root,'dist/library',target+'.d.ts'));
    }
  }
  const bundle=readFileSync(join(root,'dist/index.mjs'));
  const shim=readFileSync(join(root,'dist/bin/vidbee.mjs'));
  assert.deepEqual(shim,readFileSync(join(repo,'fixtures/cli-pre-port/bin/vidbee.mjs')));
  assert.equal(bundle.toString().split('\n')[0],'#!/usr/bin/env node');
  return {bundle,shim};
}
