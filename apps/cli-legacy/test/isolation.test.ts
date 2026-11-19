import {expect,it} from '@effect/vitest';
import * as Effect from 'effect/Effect';
import {runNativeOracle} from '../../../scripts/cli/characterization/run-oracles.mjs';
it.effect('qualifies retained host capabilities inside namespace isolation',()=>Effect.sync(()=>{
  const result=runNativeOracle('apps/cli-legacy/vitest.native.config.ts');
  expect(result.error).toBeUndefined();
  expect(result.status,result.stdout+result.stderr).toBe(0);
}),300000);
