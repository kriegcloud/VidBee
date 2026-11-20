import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const namespace = (pid, kind) => fs.readlink(`/proc/${pid}/ns/${kind}`)
const inside = (parent, child) => child.startsWith(`${parent}${path.sep}`)
const digest = async (file) => createHash('sha256').update(await fs.readFile(file)).digest('hex')

// This check must complete before importing/connecting a CDP client or invoking a host.
export async function verifyWorker({ run, identity }) {
  assert(run && identity, 'Isolation refused: missing owned run identity')
  const receipt = JSON.parse(await fs.readFile(path.join(run, 'identity.json'), 'utf8'))
  assert.equal(receipt.identity, identity, 'Isolation refused: wrong run identity')
  assert.equal(await fs.realpath(run), receipt.run)
  assert(inside(receipt.lane, receipt.run), 'Isolation refused: profile outside lane')
  await fs.access(path.join(receipt.lane, 'BRIEF.md'))
  for (const kind of ['net', 'user', 'mnt']) {
    const current = await namespace('self', kind)
    assert.notEqual(current, receipt.host[kind], `Isolation refused: host ${kind} namespace`)
    assert.equal(current, receipt.owned[kind], `Isolation refused: unowned ${kind} namespace`)
    assert.equal(current, await namespace(receipt.namespacePid, kind))
    assert.equal(current, await namespace(receipt.appPid, kind))
  }
  const interfaces = (await fs.readFile('/proc/net/dev', 'utf8')).trim().split('\n').slice(2).map(line => line.split(':')[0].trim())
  assert.deepEqual(interfaces, ['lo'], 'Isolation refused: network is not loopback-only')
  assert.equal(await fs.readlink(`/proc/${receipt.appPid}/exe`), path.join(receipt.build, 'vidbee'))
  const argv = (await fs.readFile(`/proc/${receipt.appPid}/cmdline`, 'utf8')).split('\0')
  assert(argv.includes(`--user-data-dir=${path.join(receipt.run, 'userdata')}`), 'Isolation refused: unexpected profile')
  assert.equal(await fs.realpath(path.join(receipt.run, 'userdata')), path.join(receipt.run, 'userdata'), 'Isolation refused: profile symlink escaped run')
  assert(argv.includes('--remote-debugging-port=9230'))
  const env = (await fs.readFile(`/proc/${receipt.appPid}/environ`, 'utf8')).split('\0')
  assert(env.includes(`VIDBEE_AUTOMATION_DESCRIPTOR=${path.join(receipt.run, 'automation.json')}`))
  assert(env.includes(`VIDBEE_MCP_CONFIG=${path.join(receipt.run, 'mcp.json')}`))
  const portable = env.find(entry => entry.startsWith('VIDBEE_PORTABLE_DIR='))
  if (portable) {
    assert.equal(portable, `VIDBEE_PORTABLE_DIR=${path.join(receipt.run, 'portable')}`)
    assert.equal(await fs.realpath(path.join(receipt.run, 'portable/Data/UserData')), path.join(receipt.run, 'portable/Data/UserData'))
  }
  assert.equal(await digest(path.join(receipt.build, 'resources/app.asar')), receipt.asar)
  assert.equal(await digest(path.join(receipt.build, 'vidbee')), receipt.executable)
  return receipt
}
