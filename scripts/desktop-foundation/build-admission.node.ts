import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { admitBuild } from './build-admission.mjs'
import { buildInputs } from './build-inputs.mjs'

test('comparison admits changed candidate bytes; recording and replacement refuse', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foundation-admission-'))
  try {
    const build = path.join(root, 'build')
    await fs.mkdir(path.join(build, 'resources'), { recursive: true })
    await fs.writeFile(path.join(build, 'resources/app.asar'), 'old bytes')
    const baseline = await buildInputs(build)
    await fs.writeFile(path.join(build, 'resources/app.asar'), 'new bytes')
    const candidate = await buildInputs(build), manifest = path.join(root, 'candidate.json')
    await fs.writeFile(manifest, JSON.stringify(candidate))
    const admission = await admitBuild({ build, manifest, baseline, recording: false, sha256: candidate['resources/app.asar'] })
    assert.notDeepEqual(admission.selected, baseline)
    await admission.verify()
    await assert.rejects(admitBuild({ build, manifest, baseline, recording: true, sha256: candidate['resources/app.asar'] }), /immutable baseline/)
    await fs.writeFile(path.join(build, 'resources/app.asar'), 'replaced during run')
    await assert.rejects(admission.verify(), /candidate build changed/)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('settlement clock distinguishes two added Promise turns against its reference', async () => {
  const { settlementObservation } = await import('./channel-timing.mjs')
  const reference = await settlementObservation(() => Promise.resolve('value'))
  const delayed = await settlementObservation(async () => { await Promise.resolve(); await Promise.resolve(); return 'value' })
  assert.notDeepEqual(delayed.trace, reference.trace)
})

test('main inspector refuses an unowned direct caller before any connection', async () => {
  const { spawnSync } = await import('node:child_process')
  const child = spawnSync(process.execPath, ['--import', './scripts/desktop-foundation/no-network-fixture.mjs', '--input-type=module', '-e', "import { mainInspector } from './scripts/desktop-foundation/inspector.mjs'; await mainInspector(undefined)"], { encoding: 'utf8' })
  assert.notEqual(child.status, 0)
  assert.match(child.stderr, /Isolation refused: missing owned run identity/)
})
