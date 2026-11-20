import { homedir } from 'node:os';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { terminal } from '@vidbee/cli';
import { hostLayers } from './layers.js';
const program = terminal(process.argv.slice(2)).pipe(
  Effect.provide(hostLayers({ platform: process.platform, homeDirectory: homedir(), executingArtifactUrl: new URL(import.meta.url) })),
  Effect.scoped,
);
const result = await Effect.runPromiseExit(program);
process.exitCode = Exit.isSuccess(result) ? result.value : 2;
process.exit(process.exitCode);
