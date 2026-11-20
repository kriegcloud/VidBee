import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,symlinkSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {repo} from './isolation.mjs';
if(process.env.CLI_ISOLATED!=='1')throw Error('isolation required');
const source=process.argv[2],scratch=mkdtempSync(join(tmpdir(),'cli-verify-dist-')),pkg=join(scratch,'package');mkdirSync(pkg);
cpSync(join(source,'dist'),join(pkg,'dist'),{recursive:true});
const metadata=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));metadata.exports=metadata.publishConfig.exports;writeFileSync(join(pkg,'package.json'),JSON.stringify(metadata));mkdirSync(join(pkg,'node_modules'));for(const name of [...Object.keys(metadata.dependencies),...Object.keys(metadata.optionalDependencies)]){if(name.startsWith('@vidbee/'))continue;mkdirSync(join(pkg,'node_modules',name,'..'),{recursive:true});symlinkSync(join(repo,'node_modules',name),join(pkg,'node_modules',name));}
assert.equal(existsSync(join(pkg,'src')),false);
const entries={};
for(const [entry,target]of [['.','index'],['./parser','parser/index'],['./envelope','envelope/index']]){
  assert.equal(metadata.exports[entry].import,'./dist/library/'+target+'.js');readFileSync(join(pkg,'dist/library',target+'.d.ts'));
  try{entries[entry]=await import(pathToFileURL(join(pkg,'dist/library',target+'.js')));process.stdout.write(entry+': built import passed\n');}
  catch(error){process.stderr.write(entry+': '+error.code+' '+error.message+'\n');process.exitCode=1;}
}
const bytes=readFileSync(join(pkg,'dist/index.mjs'),'utf8');assert.ok(bytes.includes('@vidbee/cli/CliProgram.service/CliProgram'),'executable must contain the strict program');
assert.deepEqual(readFileSync(join(pkg,'dist/bin/vidbee.mjs')),readFileSync(join(repo,'fixtures/cli-pre-port/bin/vidbee.mjs')));
for(const entry of ['dist/index.mjs','dist/bin/vidbee.mjs']){
  const result=spawnSync(process.execPath,[join(pkg,entry),':version'],{env:process.env,encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr);assert.equal(result.signal,null);assert.equal(result.stderr,'');
  assert.equal(JSON.parse(result.stdout).result.cli,metadata.version);process.stdout.write(entry+': strict executable starts\n');
}

// The same source-unavailable layout must also resolve every public declaration.
const consumer=join(scratch,'consumer');mkdirSync(join(consumer,'node_modules/@vidbee'),{recursive:true});symlinkSync(pkg,join(consumer,'node_modules/@vidbee/cli'));
for(const name of ['effect','@effect/platform-node','@types/node']){mkdirSync(join(consumer,'node_modules',name,'..'),{recursive:true});symlinkSync(join(repo,'node_modules',name),join(consumer,'node_modules',name));}
cpSync(join(repo,'scripts/cli/fixtures/declaration-consumer.mts'),join(consumer,'consumer.mts'));
writeFileSync(join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{module:'NodeNext',moduleResolution:'NodeNext',target:'ES2022',strict:true,exactOptionalPropertyTypes:true,skipLibCheck:false,noEmit:true,types:['node']},files:['consumer.mts']}));
const checked=spawnSync(process.execPath,[new URL('bin/tsrs',import.meta.resolve('tsrs/package.json')).pathname,'-p',join(consumer,'tsconfig.json')],{encoding:'utf8',timeout:30000});
assert.equal(checked.status,0,checked.stdout+checked.stderr);process.stdout.write('source-unavailable declaration consumer passed\n');

assert.equal(entries['.'].parseArgv,entries['./parser'].parseArgv);
assert.equal(entries['.'].renderEnvelope,entries['./envelope'].renderEnvelope);
function inspect(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){
 const file=join(directory,entry.name);if(entry.isDirectory())inspect(file);
 else if(entry.name.endsWith('.js')||entry.name.endsWith('.d.ts'))assert.equal(/(?:from\s*|import\()["']@vidbee\//.test(readFileSync(file,'utf8')),false,'private workspace reference: '+file);
}}
inspect(join(pkg,'dist/library'));process.stdout.write('shared entry identities and private-specifier closure passed\n');
