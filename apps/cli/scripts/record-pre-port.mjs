#!/usr/bin/env node
// Explicit maintenance operation; ordinary tests only verify the committed artifacts.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const revision = '9dab889b0b1d5328721802d65699a5f8593bf2e2';
const checkout = resolve(process.argv[2] ?? '');
const output = fileURLToPath(new URL('../../../fixtures/cli-pre-port/', import.meta.url));
const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();
if (!process.argv[2] || git('rev-parse', 'HEAD') !== revision || git('status', '--porcelain')) throw new Error('Pass a clean detached pre-port checkout');
try { git('symbolic-ref', '-q', 'HEAD'); throw new Error('Checkout must be detached'); } catch (error) { if (error.status !== 1) throw error; }
if (process.version !== 'v22.23.4') throw new Error('Node 22.23.4 required');
if (execFileSync('bun', ['--version'], { encoding: 'utf8' }).trim() !== '1.4.4') throw new Error('Bun 1.4.4 required');
execFileSync('bun', ['install', '--frozen-lockfile'], { cwd: checkout, stdio: 'inherit' });
const { build, version: esbuildVersion } = createRequire(join(checkout, 'package.json'))('esbuild');
execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: join(checkout, 'apps/cli'), stdio: 'inherit' });
const options = { absWorkingDir: checkout, bundle: true, format: 'esm', platform: 'node', target: 'node20', external: ['better-sqlite3', 'electron', 'yt-dlp-wrap-plus', '@opentelemetry/api'], legalComments: 'inline' };
mkdirSync(join(output, 'bin'), { recursive: true });
for (const [source, target] of [['apps/cli/dist/index.mjs','index.mjs'], ['apps/cli/dist/bin/vidbee.mjs','bin/vidbee.mjs'], ['apps/cli/package.json','package.json'], ['LICENSE','LICENSE']]) copyFileSync(join(checkout, source), join(output, target));
await build({ ...options, stdin: { contents: "export * from './src/index.ts'; export * from './src/parser/probe-flags.ts'; export * from './src/parser/reserved-flags.ts'", resolveDir: join(checkout, 'apps/cli'), sourcefile: 'pre-port-library.ts', loader: 'ts' }, outfile: join(output, 'library.mjs') });
const executable = await build({ ...options, entryPoints: [join(checkout, 'apps/cli/src/bin.ts')], outfile: join(checkout, 'apps/cli/dist/index.mjs'), write: false, banner: { js: '#!/usr/bin/env node\n// @vidbee/cli — standalone build (NEX-148). Built by scripts/build.mjs.' } });
writeFileSync(join(output, 'index.mjs'), executable.outputFiles[0].contents);
const vectors = await import('../test/pure-vectors.mjs');
const reference = await import(new URL('../../../fixtures/cli-pre-port/library.mjs', import.meta.url));
writeFileSync(join(output, 'pure-results.json'), JSON.stringify(vectors.vectors().map(vector => vectors.encode(vectors.observe(reference, vector))), null, 2) + '\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const artifacts = Object.fromEntries(['index.mjs','bin/vidbee.mjs','package.json','LICENSE','library.mjs','pure-results.json'].map(name => { const bytes = readFileSync(join(output,name)); return [name, { bytes: bytes.length, sha256: hash(bytes) }]; }));
if (artifacts['index.mjs'].sha256 !== '96711ba9fa521c2aeb8d02dcccc1d45db2ebdd982ccd6118ab4e0991a9134e0f') throw new Error('Pre-port executable differs from reviewed design');
writeFileSync(join(output,'manifest.json'), JSON.stringify({ revision, lockfileSha256: hash(readFileSync(join(checkout,'bun.lock'))), node: process.version, bun: execFileSync('bun',['--version'],{encoding:'utf8'}).trim(), esbuild: esbuildVersion, options: { ...options, absWorkingDir: undefined }, banner: '#!/usr/bin/env node\n// @vidbee/cli — standalone build (NEX-148). Built by scripts/build.mjs.', artifacts }, null, 2) + '\n');
