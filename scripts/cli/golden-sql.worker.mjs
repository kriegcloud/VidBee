import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {writeFileSync,symlinkSync,existsSync,mkdtempSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../',import.meta.url));
if(process.env.CLI_ISOLATED!=='1')throw Error('isolation required');
const scratch=mkdtempSync(join(tmpdir(),'cli-golden-sql-'));
let module;
if(process.env.VIDBEE_GOLDEN_REFERENCE==='1')module=await import('../../fixtures/cli-pre-port/library.mjs');
else{
  const result=await build({entryPoints:[join(repo,'apps/cli-legacy/src/local-client.ts')],bundle:true,platform:'node',format:'esm',write:false,external:['better-sqlite3','yt-dlp-wrap-plus','@opentelemetry/api']});
  writeFileSync(join(scratch,'client.mjs'),result.outputFiles[0].contents);symlinkSync(join(repo,'node_modules'),join(scratch,'node_modules'));module=await import(pathToFileURL(join(scratch,'client.mjs')));
}
const filename=join(process.argv[2],'local.db');
const initial=readdirSync(tmpdir()).filter(name=>name.startsWith('vidbee-cli-'));
const options={persist:'sqlite',sqlitePath:filename,maxConcurrency:0,executor:{run(){throw Error('queued only');}}};
const first=await module.createLocalClient(options);const created=await first.add({input:{kind:'yt-dlp-forward',url:'https://example.invalid/v',rawArgs:['--fixture'],options:{foreign:{nested:true}}}});await first.shutdown();
const second=await module.createLocalClient(options);const task=await second.get(created.id);assert.deepEqual(task.input,created.task.input);await second.shutdown();
assert.deepEqual(readdirSync(tmpdir()).filter(name=>name.startsWith('vidbee-cli-')),initial);
process.stdout.write(JSON.stringify({status:task.status,input:task.input,pathPreserved:existsSync(filename),temporaryDirectoriesCleaned:true})+'\n');
