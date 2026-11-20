import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,writeFileSync,symlinkSync,existsSync,copyFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {repo} from './isolation.mjs';
if(process.env.CLI_ISOLATED!=='1')throw Error('isolation required');
const scratch=mkdtempSync(join(tmpdir(),'cli-native-sql-'));
const driver=process.argv[2];
const source=`
import * as NodeServices from '@effect/platform-node/NodeServices';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Runtime from 'effect/ManagedRuntime';
import * as Sql from 'effect/sql/SqlClient';
import * as S from 'effect/Schema';
import {UpgradeCache} from './apps/cli/src/Upgrade.model.ts';
import {DescriptorPayload} from './apps/cli/src/Descriptor.model.ts';
export const decodeCopies=(descriptor,cache)=>[S.decodeSync(S.fromJsonString(DescriptorPayload))(descriptor),S.decodeSync(S.fromJsonString(UpgradeCache))(cache)];
import {CliLocalLive} from './apps/cli/src/CliLocal.layer.ts';
import {CliLocal} from './apps/cli/src/CliLocal.service.ts';
import {CliHost} from './apps/cli/src/CliHost.service.ts';
import {DownloadHost} from '@vidbee/downloader-core/DownloadHost.service';
import {TaskExecutor} from '@vidbee/task-queue/TaskExecutor.service';
${driver==='borrowed'?"import Database from 'better-sqlite3';import {runtimeForHandle,releaseHandle,rethrowDriverError} from '@vidbee/db/legacy';":"import {layer as nodeLayer} from '@vidbee/db/node';"}
export async function open(filename) {
  ${driver==='borrowed'?"const statements=[];const handle=new Database(filename,{timeout:5000,verbose:statement=>statements.push(statement)});const bridge=runtimeForHandle(handle);const client=await bridge.runPromise(Sql.SqlClient);const sql=Layer.succeed(Sql.SqlClient,client);":"const sql=nodeLayer(filename);"}
  const downloadHost=Layer.succeed(DownloadHost,{platform:()=> 'linux',homeDirectory:()=>process.env.HOME,tempDirectory:()=>process.env.TMPDIR,environment:()=>({}),setEnvironment:()=>Effect.void,makeAbortController:()=>new AbortController(),uuid:()=> 'fixture'});
  const host=Layer.succeed(CliHost,{platform:'linux',homeDirectory:process.env.HOME,executingArtifactUrl:new URL('file:///fixture/index.mjs'),environment:()=>Effect.succeed(undefined)});
  const executor=Layer.succeed(TaskExecutor,{run:()=>Effect.die('queued executor must not run')});
  const runtime=Runtime.make(CliLocalLive.pipe(Layer.provide(Layer.mergeAll(NodeServices.layer,downloadHost,host,executor,sql))));
  const session=await runtime.runPromise(Effect.flatMap(CliLocal,local=>local.open({persist:'sqlite',sqlitePath:filename,maxConcurrency:0})));
  return {run: effect=>runtime.runPromise(effect),session,close:async()=>{await runtime.runPromise(session.shutdown);await runtime.dispose();${driver==='borrowed'?"if(statements.some(statement=>statement.startsWith('INSERT'))&&!statements.some(statement=>statement==='BEGIN IMMEDIATE'))throw Error('missing BEGIN IMMEDIATE');const original=handle.prepare;const marker=new Error('synthetic driver error');handle.prepare=()=>{throw marker;};const failed=bridge.runSyncExit(client.unsafe('SELECT fixture_driver_error'));handle.prepare=original;if(failed._tag!=='Failure')throw Error('expected driver failure');let same=false;try{rethrowDriverError(failed.cause);}catch(error){same=error===marker;}if(!same)throw Error('driver identity changed');releaseHandle(handle);assertHandle(handle);handle.close();":""}}};
}
${driver==='borrowed'?"function assertHandle(handle){if(!handle.open)throw Error('borrowed client closed caller handle');handle.prepare('SELECT 1').get();}":''}
`;
const built=await build({stdin:{contents:source,resolveDir:repo,loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,external:['better-sqlite3','@effect/sql-sqlite-node/SqliteClient']});
writeFileSync(join(scratch,'candidate.mjs'),built.outputFiles[0].contents);symlinkSync(join(repo,'node_modules'),join(scratch,'node_modules'));
const {open,decodeCopies}=await import(pathToFileURL(join(scratch,'candidate.mjs')));
const filename=join(scratch,'queue.db');
const first=await open(filename);
const input={kind:'yt-dlp-forward',url:'https://example.invalid/v',rawArgs:['--fixture','秘密'],options:{foreign:{nested:[false,null,3]}}};
const created=await first.run(first.session.add({input}));assert.equal(created.task.status,'queued');
await first.close();assert.ok(existsSync(filename));
const second=await open(filename);const restored=await second.run(second.session.get(created.id));
assert.deepEqual(restored.input,input);assert.equal(restored.status,'queued');
await second.run(second.session.shutdown);await second.close();
process.stdout.write(driver+': native SQL DDL, nested codec, restart, supplied path, borrowed ownership and repeated shutdown passed\n');

const original=join(scratch,'synthetic-owner-descriptor.json'),copy=join(scratch,'copied-descriptor.json');
writeFileSync(original,JSON.stringify({version:1,schemaVersion:'1.0.0',kind:'desktop',host:'127.0.0.1',port:12345,tokenHash:null,tokenIssuedAt:null,tokenExpiresAt:null,pid:123,pidStartedAt:1,updatedAt:1,appVersion:'fixture'}));copyFileSync(original,copy);
const cacheOriginal=join(scratch,'synthetic-owner-cache.json'),cacheCopy=join(scratch,'copied-cache.json');writeFileSync(cacheOriginal,'{"version":"0.1.0","fetchedAt":1}');copyFileSync(cacheOriginal,cacheCopy);
assert.equal(decodeCopies(readFileSync(copy,'utf8'),readFileSync(cacheCopy,'utf8')).length,2);
assert.throws(()=>decodeCopies(readFileSync(copy,'utf8'),'{"version":"0.1.0","fetchedAt":"invalid"}'));
process.stdout.write('synthetic owner-file-copy codecs: 2 files decoded; 1 deliberate fetchedAt failure; no owner data read\n');
