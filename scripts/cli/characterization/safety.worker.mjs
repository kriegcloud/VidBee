import './worker-safety.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repo } from './isolation.mjs';
test('structural namespace and executable guard reject bypass routes',{timeout:120000},()=>{
  assert.equal(process.env.CLI_ISOLATED,'1');
  const mounts=readFileSync('/proc/self/mountinfo','utf8');
  assert.match(mounts,/\s\/proc\s.* - proc /);
  for(const path of JSON.parse(process.env.CLI_MASKED_PATHS))assert.ok(mounts.split('\n').some(line=>line.split(' ')[4]===path));
  const root=mkdtempSync(join(tmpdir(),'guard-self-test-'));
  const source="import cp from 'node:child_process';let refused=0;for(const name of ['exec','execSync','execFile','execFileSync','spawnSync','fork']){try{cp[name]('/uncontrolled');}catch{refused++;}}for(const pid of [0,-1,process.pid,2147483647])for(const signal of [0,'SIGTERM','SIGKILL']){try{process.kill(pid,signal);}catch{refused++;}}try{cp.spawn('/uncontrolled');}catch{refused++;}process.stdout.write(String(refused));";
  const result=spawnSync(process.execPath,['--import',join(repo,'scripts/cli/characterization/guard.mjs'),'--input-type=module','-e',source],{env:{...process.env,CLI_FIXTURE_ROOT:root,CLI_LIVE_PID:'2147483646'},encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'19');
});
