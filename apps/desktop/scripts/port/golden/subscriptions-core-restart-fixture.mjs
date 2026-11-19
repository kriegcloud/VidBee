import { lstat, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** Called only after the disposable app has stopped, before physical-profile reuse. */
export async function prepareSubscriptionsRestart(runDir) {
  const statePath = path.join(runDir, 'subscriptions-core/state.json')
  const state = JSON.parse(await readFile(statePath, 'utf8'))
  const db = new DatabaseSync(path.join(runDir, 'userdata/vidbee.db'))
  try {
    const before = db
      .prepare(
        'SELECT item_id, task_id, added FROM subscription_items WHERE subscription_id = ? ORDER BY item_id'
      )
      .all(state.ids[0])
    const changed = db
      .prepare(
        'UPDATE subscription_items SET task_id = ?, added = 1 WHERE subscription_id = ? AND item_id = ?'
      )
      .run('golden-subscriptions-orphan', state.ids[0], 'automatic-dropped')
    if (changed.changes !== 1) {
      throw new Error('Missing disposable orphan fixture item')
    }
    state.orphanItem = 'automatic-dropped'
    state.beforeReopen = before
    await writeFile(statePath, JSON.stringify(state, null, 2))
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    await symlink(path.join(runDir, 'subscription-downloads'), state.alias)
  } finally {
    db.close()
  }
}

/** Remove the owned alias only after the restarted app has stopped. */
export async function cleanupSubscriptionsRestart(runDir) {
  let state
  try {
    state = JSON.parse(await readFile(path.join(runDir, 'subscriptions-core/state.json'), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return
    }
    throw error
  }
  let info
  try {
    info = await lstat(state.alias)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return
    }
    throw error
  }
  if (!info.isSymbolicLink()) {
    throw new Error('Subscription output alias unexpectedly became a physical path')
  }
  await rm(state.alias)
}
