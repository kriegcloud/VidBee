import { ownPid } from './worker-safety.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repo } from './isolation.mjs';
const scratch = mkdtempSync(join(tmpdir(), 'cli-pure-'));
const built = await build({entryPoints:[join(repo,'scripts/cli/characterization/candidate.ts')],bundle:true,platform:'node',format:'esm',write:false,external:['better-sqlite3','yt-dlp-wrap-plus','@opentelemetry/api']});
writeFileSync(join(scratch,'candidate.mjs'),built.outputFiles[0].contents);
symlinkSync(join(repo,'node_modules'),join(scratch,'node_modules'));
const candidate=await import(pathToFileURL(join(scratch,'candidate.mjs')));
import * as reference from '../../../fixtures/cli-pre-port/library.mjs';
import { readFileSync } from 'node:fs';
const recorded=JSON.parse(readFileSync(new URL('../../../fixtures/cli-pre-port/pure-results.json',import.meta.url),'utf8'));
import { encode, observe, vectors, flags } from './pure-vectors.mjs';

test('keeps public pure exports equal to the immutable reference', {timeout:120000}, () => {
  const cases = vectors();
  assert.equal(cases.length,recorded.length);
  assert.ok(cases.length<5000);
  for (const [index, vector] of cases.entries()) {
    const old = observe(reference, vector);
    if (!old.engine) assert.equal(encode(old),recorded[index],`reference ${index}`);
    else assert.equal(JSON.parse(recorded[index]).engine,true);
    if (['findReservedFlag','findProbeFlag','isProbeArgv','isVidbeePrefixed'].includes(vector.fn)) continue; // Reference evidence only; public parseArgv pins routing.
    const actual = observe(candidate, vector);
    if (old.engine) assert.ok(actual.error,`engine ${index}`);
    else assert.equal(encode(actual),encode(old),`case ${index}`);
  }
});
test('public scanner pins all priority and target spellings and transport precedence', () => {
  for (const priority of ['user','subscription','background']) for (const target of ['api','desktop','local']) {
    for (const fn of ['parseArgv','selectTransport','buildForwardedInput']) {
      const args=fn==='parseArgv'?[[`--vidbee-priority=${priority}`,`--vidbee-target=${target}`]]:fn==='selectTransport'?[{...flags,priority,target}]:[{argv:['https://example.invalid/v'],flags:{...flags,priority,target}}];
      assert.equal(encode(observe(candidate,{fn,args})),encode(observe(reference,{fn,args})));
    }
  }
});
