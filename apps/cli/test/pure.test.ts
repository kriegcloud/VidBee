import { it } from '@effect/vitest';
import assert from 'node:assert/strict';
import { pinnedNode } from './pinned-node.mjs';
import { isolated } from './isolation.mjs';
it('runs the public pure oracle behind the same structural safety boundary', () => {
  // Bun-backed Vitest aliases node; select the installed pinned Node explicitly.
  process.env.CLI_NODE = pinnedNode();
  const result = isolated(['--test', 'apps/cli/test/pure.worker.mjs'], 180000);
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stdout + result.stderr);
}, 240000);
