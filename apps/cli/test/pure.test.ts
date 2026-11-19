import { expect, it } from '@effect/vitest';
import * as candidate from './candidate';
import * as reference from '../../../fixtures/cli-pre-port/library.mjs';
import recorded from '../../../fixtures/cli-pre-port/pure-results.json';
import { encode, observe, vectors } from './pure-vectors.mjs';

it('keeps pure exports equal to the immutable pre-port oracle and recorded results', () => {
  const cases = vectors();
  expect(cases.length).toBe(recorded.length);
  expect(cases.length).toBeLessThan(5000);
  for (const [index, vector] of cases.entries()) {
    const old = observe(reference, vector);
    if (!old.engine) expect(encode(old), `reference case ${index}: ${encode(vector)}`).toBe(recorded[index]);
    else expect(JSON.parse(recorded[index]).engine).toBe(true);
    const actual = observe(candidate, vector);
    if (old.engine) expect(actual.error, `engine case ${index}`).toBeDefined();
    else expect(encode(actual), `case ${index}: ${encode(vector)}`).toBe(encode(old));
  }
}, 120_000);
