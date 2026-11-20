import assert from 'node:assert/strict';
import test from 'node:test';
import {isolated} from './isolation.mjs';
for(const driver of ['borrowed','node'])test(`native CLI SQL lifecycle: ${driver}`,{timeout:120000},()=>{
  const result=isolated(['scripts/cli/characterization/native-sql.worker.mjs',driver],120000);
  assert.equal(result.status,0,result.stdout+result.stderr);
});
