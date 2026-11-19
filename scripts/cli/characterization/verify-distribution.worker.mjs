import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,symlinkSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {repo} from './isolation.mjs';
if(process.env.CLI_ISOLATED!=='1')throw Error('isolation required');
const source=process.argv[2],scratch=mkdtempSync(join(tmpdir(),'cli-verify-dist-')),pkg=join(scratch,'package');mkdirSync(pkg);
cpSync(join(source,'dist'),join(pkg,'dist'),{recursive:true});
const metadata=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));metadata.exports=metadata.publishConfig.exports;writeFileSync(join(pkg,'package.json'),JSON.stringify(metadata));symlinkSync(join(repo,'node_modules'),join(pkg,'node_modules'));
assert.equal(existsSync(join(pkg,'src')),false);
for(const [entry,target]of [['.','index'],['./parser','parser/index'],['./envelope','envelope/index']]){
  assert.equal(metadata.exports[entry].import,'./dist/library/'+target+'.js');readFileSync(join(pkg,'dist/library',target+'.d.ts'));
  try{await import(pathToFileURL(join(pkg,'dist/library',target+'.js')));process.stdout.write(entry+': built import passed\n');}
  catch(error){process.stderr.write(entry+': '+error.code+' '+error.message+'\n');process.exitCode=1;}
}
const bytes=readFileSync(join(pkg,'dist/index.mjs'),'utf8');assert.ok(bytes.includes('@vidbee/cli/CliProgram.service/CliProgram'),'executable must contain the strict program');
assert.deepEqual(readFileSync(join(pkg,'dist/bin/vidbee.mjs')),readFileSync(join(repo,'fixtures/cli-pre-port/bin/vidbee.mjs')));
for(const entry of ['dist/index.mjs','dist/bin/vidbee.mjs']){
  const result=spawnSync(process.execPath,[join(pkg,entry),':version'],{env:process.env,encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr);assert.equal(result.signal,null);assert.equal(result.stderr,'');
  assert.equal(JSON.parse(result.stdout).result.cli,metadata.version);process.stdout.write(entry+': strict executable starts\n');
}
