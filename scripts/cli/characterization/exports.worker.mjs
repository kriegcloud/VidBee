import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as Schema from 'effect/Schema';
import * as Context from 'effect/Context';
import * as Layer from 'effect/Layer';
import {repo} from './isolation.mjs';
if(process.env.CLI_ISOLATED!=='1')throw Error('isolation required');
const pure=['parseArgv','parseListArgs','redactArgs','redactText','selectTransport','validateApiUrl','isLoopbackOrPrivateHost','transportNotReady','buildForwardedInput','compareSemver','renderEnvelope','errorEnvelope','exitCodeForError'];
const operations=['AutomationClient','checkUpgrade','connect','createLocalClient','defaultCachePath','dispatchSubcommand','enqueueDownload','ensureDesktopReady','handshakeReply','isPidAlive','readCliVersion','readDescriptor','resolveDescriptorPath','run','runProbe','terminal'];
const typeOnly={'.':['AutomationSession','CliError','ConnectResult','EffectContractClient','EnqueueOptions','EnqueueResult','Flags','LocalSession','SubcommandContext','SubcommandResult','TransportSelection'],'./parser':['Flags'],'./envelope':[]};
const actual={};
const scratch=mkdtempSync(join(tmpdir(),'cli-export-manifests-'));symlinkSync(join(repo,'node_modules'),join(scratch,'node_modules'));
for(const entry of ['.','./parser','./envelope']){
  const source=entry==='.'?'@vidbee/cli':'@vidbee/cli/'+entry.slice(2);
  const built=await build({stdin:{contents:`export * from '${source}';`,resolveDir:repo,loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,external:['better-sqlite3','yt-dlp-wrap-plus','@opentelemetry/api']});
  const path=join(scratch,entry==='.'?'index.mjs':entry.slice(2)+'.mjs');writeFileSync(path,built.outputFiles[0].contents);
  const values=await import(pathToFileURL(path));
  actual[entry]=Object.keys(values).map(name=>{
    const value=values[name];
    const kind=Schema.isSchema(value)?'schema':Context.isKey(value)?'service':Layer.isLayer(value)||name==='CliHostLive'?'layer':pure.includes(name)?'pure function':operations.includes(name)?'effect operation':name==='ExitCode'||name==='REDACTED_PLACEHOLDER'?'constant':undefined;
    assert.ok(kind,`uncategorized export ${entry} ${name}`);return {name,kind};
  }).concat(typeOnly[entry].map(name=>({name,kind:'type'}))).sort((a,b)=>a.name.localeCompare(b.name));
}
const path=join(repo,'apps/cli/test/export-manifests.json');
if(process.argv.includes('--record'))writeFileSync(path,JSON.stringify(actual,null,2)+'\n');
else assert.deepEqual(actual,JSON.parse(readFileSync(path,'utf8')));
process.stdout.write(Object.entries(actual).map(([name,exports])=>`${name}: ${exports.length} named exports/types`).join('\n')+'\n');
