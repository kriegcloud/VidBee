import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { buildInputs } from './build-inputs.mjs'

// The historical manifest authorizes recording only. Comparison selects a separate
// candidate manifest without changing the behavioral oracle or its provenance.
export async function admitBuild({ build, manifest, baseline, recording, sha256 }) {
  const selected = JSON.parse(await fs.readFile(manifest, 'utf8'))
  if (recording) assert.deepEqual(selected, baseline, 'Recording requires the immutable baseline manifest')
  assert.equal(selected['resources/app.asar'], sha256, 'Selected manifest/archive hash mismatch')
  const verify = async () => assert.deepEqual(await buildInputs(build), selected, 'Selected candidate build changed')
  await verify()
  return { selected, verify }
}
