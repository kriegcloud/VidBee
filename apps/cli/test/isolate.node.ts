import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isolated } from './isolation.mjs';
const version = readFileSync(new URL('../../../.node-version', import.meta.url), 'utf8').trim();
test('CLI observations run in private user/mount/network/PID namespaces under pinned Node', { timeout: 28_860_000 }, () => {
  assert.equal(process.version, `v${version}`);
  const result = isolated(['--test', 'apps/cli/test/oracle.worker.mjs', 'apps/cli/test/edge.worker.mjs', 'apps/cli/test/approved.worker.mjs', 'apps/cli/test/safety.worker.mjs']);
  process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
  assert.equal(result.error, undefined); assert.equal(result.status, 0);
});
