import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const version = readFileSync(new URL('../../../.node-version', import.meta.url), 'utf8').trim();
test('CLI Node observations run offline under the pinned Node', { timeout: 1_200_000 }, () => {
  assert.equal(process.version, `v${version}`);
  const scratch = mkdtempSync(join(tmpdir(), 'cli-node-suite-'));
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, TZ: process.env.TZ ?? 'UTC', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
  for (const key of ['HOME', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_RUNTIME_DIR', 'APPDATA', 'LOCALAPPDATA']) {
    env[key] = join(scratch, key);
    mkdirSync(env[key], { recursive: true });
  }
  for (const key of ['VIDBEE_AUTOMATION_DESCRIPTOR', 'VIDBEE_MCP_CONFIG']) {
    env[key] = join(scratch, key);
    writeFileSync(env[key], '{}');
  }
  const result = spawnSync('/usr/bin/unshare', ['-Urn', '/bin/sh', '-c', '/usr/bin/ip link set lo up && exec "$@"', 'cli-offline', realpathSync(process.execPath), '--test', 'apps/cli/test/oracle.worker.mjs', 'apps/cli/test/edge.worker.mjs'], { cwd: root, env, encoding: 'utf8', timeout: 1_180_000, maxBuffer: 16 * 1024 * 1024 });
  if (result.status === 0) rmSync(scratch, { recursive: true, force: true });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
});
