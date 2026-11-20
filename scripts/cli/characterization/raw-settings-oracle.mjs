// Execute the frozen pre-port methods, not a reimplementation of their expectations.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = new URL('../../../fixtures/cli-pre-port/', import.meta.url);
const source = readFileSync(new URL('library.mjs', root), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
assert.equal(createHash('sha256').update(source).digest('hex'), manifest.artifacts['library.mjs'].sha256);
const methods = source.slice(source.indexOf('      resolveRuntimeSettings(input2, override) {'), source.indexOf('      /** Diagnostic: return the resolved argv'));
assert.ok(methods.startsWith('      resolveRuntimeSettings'));
const Old = new Function('return class { ' + methods + ' }')();
const start = source.indexOf('    cookieSourcesFromArgsDataFirst = (args2, settings) => {');
const end = source.indexOf('    cookieSourcesFromArgs = dual', start);
assert.ok(start > 0 && end > start);
const cookies = new Function('split', 'return ' + source.slice(start, end).trim().replace('cookieSourcesFromArgsDataFirst = ', ''))((value, separator) => value.split(separator));
export function oldRawObservation(input) {
  const executor = new Old();
  executor.opts = { defaultRuntimeSettings: {}, defaultDownloadDir: '/fixture/default' };
  const args = executor.buildArgsFor(input);
  return { args, cookieSources: cookies(args, executor.resolveRuntimeSettings(input)), initialSubtitleStatus: executor.resolveInitialSubtitleStatus(input), canRetryWithoutSubtitles: false };
}
