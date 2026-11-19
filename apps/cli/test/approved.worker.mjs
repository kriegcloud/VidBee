import { ownPid } from './worker-safety.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as reference from '../../../fixtures/cli-pre-port/library.mjs';
import { observeApproved } from './approved-adapter.mjs';
import { encode } from './pure-vectors.mjs';
import { repo } from './isolation.mjs';
const scratch=mkdtempSync(join(tmpdir(),'cli-approved-'));
const result=await build({entryPoints:[join(repo,'apps/cli/test/execution-adapter.ts')],bundle:true,platform:'node',format:'esm',write:false,external:['better-sqlite3','yt-dlp-wrap-plus','@opentelemetry/api']});
writeFileSync(join(scratch,'candidate.mjs'),result.outputFiles[0].contents);symlinkSync(join(repo,'node_modules'),join(scratch,'node_modules'));
const candidate=await import(pathToFileURL(join(scratch,'candidate.mjs')));
const cases=JSON.parse(readFileSync(new URL('./approved-changes.json',import.meta.url),'utf8'));
test('declared descriptor and handshake changes have independent frozen old/new observations',{timeout:120000},async()=>{
  for(const scenario of cases.observations){
    assert.equal(encode(await observeApproved(reference,scenario)),scenario.old,scenario.id+' reference');
    assert.equal(encode(await observeApproved(candidate,scenario)),process.env.VIDBEE_CLI_PORTED==='1'?scenario.new:scenario.old,scenario.id+' candidate');
  }
});
