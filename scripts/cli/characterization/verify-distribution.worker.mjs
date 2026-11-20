import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,symlinkSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {repo} from './isolation.mjs';
if(process.env.CLI_ISOLATED!=='1')throw Error('isolation required');
process.env.BUN_TMPDIR=process.env.TMPDIR;
const source=process.argv[2],bun=process.argv[3],cache=process.argv[4];
const scratch=mkdtempSync(join(tmpdir(),'cli-verify-dist-'));
const tarball=join(scratch,'cli.tgz');
// Give lifecycle hooks the pinned interpreter without exposing a real CLI/profile.
symlinkSync(process.execPath,join(process.env.PATH,'node'));
const originalManifest=readFileSync(join(source,'package.json'));
let packed;
try{packed=spawnSync(bun,['pm','pack','--filename',tarball],{cwd:source,encoding:'utf8'});}
finally{
  const backup=join(source,'.package-prepack.json');
  if(existsSync(backup)){
    const restored=spawnSync(process.execPath,[join(source,'scripts/pack-manifest.mjs'),'restore'],{encoding:'utf8'});
    assert.equal(restored.status,0,restored.stderr);
  }
  assert.deepEqual(readFileSync(join(source,'package.json')),originalManifest,'packing restores source metadata exactly');
}
assert.equal(packed.status,0,packed.stdout+packed.stderr);
const manifest=spawnSync('/usr/bin/tar',['--use-compress-program=/usr/bin/gzip','-xOf',tarball,'package/package.json'],{encoding:'utf8'});
assert.equal(manifest.status,0,manifest.stderr);
const metadata=JSON.parse(manifest.stdout);
assert.deepEqual(Object.keys(metadata.dependencies).filter(name=>name.startsWith('@vidbee/')),[], 'packed production dependencies must be public runtime externals');
for(const version of Object.values({...metadata.dependencies,...metadata.optionalDependencies}))assert.equal(/^(catalog:|workspace:)/.test(version),false,'packed versions must be resolved');
// Seed a writable cache with only installed external runtime closures, never workspace code.
const runtimeCache=join(scratch,'cache');mkdirSync(runtimeCache);
// Bun hashes registry manifests; metadata alone supplies no installable package bytes.
for(const sourceCache of [process.argv[5],cache])for(const entry of readdirSync(sourceCache))if(entry.endsWith('.npm'))cpSync(join(sourceCache,entry),join(runtimeCache,entry));
const pending=Object.keys({...metadata.dependencies,...metadata.optionalDependencies}),copied=[];
while(pending.length){
  const name=pending.shift();if(copied.includes(name))continue;
  assert.equal(name.startsWith('@vidbee/'),false);
  const info=JSON.parse(readFileSync(join(repo,'node_modules',name,'package.json'),'utf8'));
  copied.push(name);
  const key=name+'@'+info.version+'@@@1',target=join(runtimeCache,key);
  mkdirSync(join(target,'..'),{recursive:true});cpSync(join(cache,key),target,{recursive:true});
  mkdirSync(join(runtimeCache,name),{recursive:true});symlinkSync(target,join(runtimeCache,name,info.version+'@@@1'));
  pending.push(...Object.keys(info.dependencies??{}),...Object.keys(info.optionalDependencies??{}),...Object.keys(info.peerDependencies??{}).filter(peer=>!info.peerDependenciesMeta?.[peer]?.optional));
}
process.stdout.write('offline cache contains runtime closures: '+copied.join(', ')+'\n');
const install=join(scratch,'install');mkdirSync(install);
const pinned=Object.fromEntries(copied.map(name=>[name,JSON.parse(readFileSync(join(repo,'node_modules',name,'package.json'),'utf8')).version]));
writeFileSync(join(install,'package.json'),JSON.stringify({private:true,type:'module',dependencies:{...pinned,'@vidbee/cli':tarball}}));
// Reuse the repository's resolved external package versions/integrities. A lock seed
// avoids requiring registry metadata that Bun may not retain for an already locked package.
const parsed=spawnSync(bun,['-e',"process.stdout.write(JSON.stringify(Bun.JSONC.parse(await Bun.file(process.argv[1]).text())))",join(repo,'bun.lock')],{encoding:'utf8'});
assert.equal(parsed.status,0,parsed.stderr);
const lock=JSON.parse(parsed.stdout);
const packages=Object.fromEntries(copied.map(name=>[name,lock.packages[name]]));
writeFileSync(join(install,'bun.lock'),JSON.stringify({lockfileVersion:2,configVersion:1,workspaces:{'':{dependencies:pinned}},packages}));
// The namespace has no external network. Offline mode also prevents attempted registry access.
const installed=spawnSync(bun,['install','--offline','--ignore-scripts','--cache-dir',runtimeCache],{cwd:install,encoding:'utf8',timeout:90000});
assert.equal(installed.status,0,installed.stdout+installed.stderr);
const pkg=join(install,'node_modules/@vidbee/cli');
assert.deepEqual(readdirSync(join(install,'node_modules/@vidbee')),['cli']);
process.stdout.write('real Bun tarball packed and installed offline without private workspace packages\n');
assert.equal(existsSync(join(pkg,'src')),false);
const resolved=spawnSync(process.execPath,['--input-type=module','-e',`
import assert from 'node:assert/strict';
import * as main from '@vidbee/cli';
import * as parser from '@vidbee/cli/parser';
import * as envelope from '@vidbee/cli/envelope';
assert.equal(main.parseArgv,parser.parseArgv);
assert.equal(main.renderEnvelope,envelope.renderEnvelope);
`],{cwd:install,encoding:'utf8',timeout:30000});
assert.equal(resolved.status,0,resolved.stdout+resolved.stderr);
assert.equal(resolved.stderr,'');
process.stdout.write('all three installed package specifiers resolve under pinned Node\n');
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
for(const name of ['effect','@effect/platform-node','@types/node']){mkdirSync(join(consumer,'node_modules',name,'..'),{recursive:true});symlinkSync(join(install,'node_modules',name),join(consumer,'node_modules',name));}
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
