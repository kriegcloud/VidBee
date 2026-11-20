import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const repo = fileURLToPath(new URL('../../../', import.meta.url));
export function isolated(args, timeout = 28_800_000, scratchParent = tmpdir()) {
  const scratch = mkdtempSync(join(scratchParent, 'cli-isolated-'));
  const env = { PATH: join(scratch, 'bin'), TZ: process.env.TZ ?? 'UTC', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', VIDBEE_CLI_PORTED: process.env.VIDBEE_CLI_PORTED ?? '0', CLI_ISOLATED:'1', VIDBEE_GOLDEN_REFERENCE: process.env.VIDBEE_GOLDEN_REFERENCE ?? '0' };
  for (const key of ['HOME', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_RUNTIME_DIR', 'APPDATA', 'LOCALAPPDATA', 'PATH']) {
    if (key !== 'PATH') env[key] = join(scratch, key);
    mkdirSync(env[key], { recursive: true });
  }
  for (const key of ['VIDBEE_AUTOMATION_DESCRIPTOR', 'VIDBEE_MCP_CONFIG']) { env[key] = join(scratch, key); writeFileSync(env[key], '{}'); }
  const empty = join(scratch, 'empty'); mkdirSync(empty);
  // Mount before importing any reference/candidate code. Hide alternate home lookups too.
  // A golden child already has synthetic HOME; passwd still identifies the owner.
  const homes = [homedir(), userInfo().homedir];
  const masks = homes.flatMap(home => ['.config', '.local/opt'].map(part => join(home, part)))
    .filter((path, index, paths) => paths.indexOf(path) === index && existsSync(path));
  env.CLI_MASKED_PATHS=JSON.stringify(masks);
  const script = '/usr/bin/mount --make-rprivate / && empty=$1; shift; count=$1; shift; while [ "$count" -gt 0 ]; do /usr/bin/mount --bind "$empty" "$1" || exit; shift; count=$((count-1)); done; /usr/bin/ip link set lo up && exec "$@"';
  const result = spawnSync('/usr/bin/unshare', ['--user', '--map-root-user', '--mount', '--net', '--pid', '--fork', '--kill-child=SIGKILL', '--mount-proc', '/bin/sh', '-ec', script, 'cli-isolation', empty, String(masks.length), ...masks, realpathSync(process.env.CLI_NODE ?? process.execPath), ...args], { cwd: repo, env, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 });
  if (result.status === 0) rmSync(scratch, { recursive: true, force: true });
  return result;
}
