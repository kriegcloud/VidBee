import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MemoryPersistAdapter } from '../src/persist/memory'
import { ProcessRegistry } from '../src/process/registry'

for (const recorded of [null, 1000, 1999]) {
  test(`recovery does not signal an unverified process (${recorded})`, async () => {
    const persist = new MemoryPersistAdapter()
    await persist.appendJournal({
      ts: 0,
      op: 'spawn',
      taskId: 'a',
      attemptId: 'one',
      pid: process.pid,
      pidStartedAt: recorded,
      exitCode: null,
      signal: null
    })
    const signals: string[] = []
    const registry = new ProcessRegistry({
      persist,
      isAlive: () => true,
      readStartTime: () => 2000,
      sleep: async () => {},
      kill: (_pid, signal) => {
        signals.push(signal)
      }
    })
    const rows = await registry.reconcile()
    assert.deepEqual(signals, [])
    assert.equal(rows[0]?.killed, false)
    assert.equal((await persist.findOpenSpawns()).length, 0)
  })
}

for (const mode of ['reconcile', 'cancel'] as const) {
  test(`${mode} rechecks PID identity before escalating`, async () => {
    const persist = new MemoryPersistAdapter()
    let start = 2000
    const signals: string[] = []
    const registry = new ProcessRegistry({
      persist,
      isAlive: () => true,
      readStartTime: () => start,
      sleep: async () => {
        start = 3000
      },
      kill: (_pid, signal) => {
        signals.push(signal)
      }
    })
    await registry.recordSpawn({
      taskId: 'a',
      attemptId: 'one',
      pid: process.pid,
      pidStartedAt: 2000,
      kind: 'yt-dlp',
      spawnedAt: 0
    })
    if (mode === 'reconcile') {
      await registry.reconcile()
    } else {
      await registry.cancel('a', 'one')
    }
    assert.deepEqual(signals, ['SIGTERM'])
  })
}

test('verified surviving orphan receives escalation', async () => {
  const persist = new MemoryPersistAdapter()
  const signals: string[] = []
  const registry = new ProcessRegistry({
    persist,
    isAlive: () => true,
    readStartTime: () => 2000,
    sleep: async () => {},
    kill: (_pid, signal) => {
      signals.push(signal)
    }
  })
  await registry.recordSpawn({
    taskId: 'a',
    attemptId: 'one',
    pid: process.pid,
    pidStartedAt: 2000,
    kind: 'yt-dlp',
    spawnedAt: 0
  })
  const rows = await registry.reconcile()
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'])
  assert.equal(rows[0]?.killed, true)
})
