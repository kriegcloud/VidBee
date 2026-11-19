import { isolated } from './isolation.mjs';
import { pinnedNode } from './pinned-node.mjs';
export function runPureOracle() {
  process.env.CLI_NODE = pinnedNode();
  return isolated(['--test', 'scripts/cli/characterization/pure.worker.mjs'], 180000);
}
import { spawnSync } from 'node:child_process';
export function runNativeOracle(config='apps/cli/vitest.native.config.ts') {
  process.env.CLI_NODE = pinnedNode();
  const bun=spawnSync('bun',['-p','process.execPath'],{encoding:'utf8'}).stdout.trim();
  return isolated(['scripts/cli/characterization/native.runner.mjs',bun,config],240000);
}
export function runExportOracle() {
  process.env.CLI_NODE=pinnedNode();
  return isolated(['scripts/cli/characterization/exports.worker.mjs'],30000);
}
