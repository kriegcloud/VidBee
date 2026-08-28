import { existsSync, renameSync } from 'node:fs'

interface SqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): {
    get(...params: unknown[]): unknown
    run(...params: unknown[]): { changes: number }
  }
  close(): void
}

export interface MergeTaskQueueDbResult {
  merged: boolean
  tasksCopied: number
  attemptsCopied: number
  journalCopied: number
  backupPath: string | null
}

/**
 * Copy an older standalone `task-queue.db` into the unified `vidbee.db`
 * connection, then rename the source to `*.migrated`.
 */
export function mergeLegacyTaskQueueDb(input: {
  target: SqliteDatabase
  legacyPath: string
  openLegacy: (path: string) => SqliteDatabase
}): MergeTaskQueueDbResult {
  const result: MergeTaskQueueDbResult = {
    merged: false,
    tasksCopied: 0,
    attemptsCopied: 0,
    journalCopied: 0,
    backupPath: null
  }
  if (!existsSync(input.legacyPath)) {
    return result
  }

  const escaped = input.legacyPath.replace(/'/g, "''")
  const legacy = input.openLegacy(input.legacyPath)
  try {
    const hasTasks = legacy
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
      .get() as { name?: string } | undefined
    if (!hasTasks?.name) {
      return result
    }
    const before = Number(
      (input.target.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number | bigint } | undefined)
        ?.n ?? 0
    )
    input.target.exec(`ATTACH DATABASE '${escaped}' AS legacy_tq`)
    try {
      input.target.exec(`
        INSERT OR IGNORE INTO tasks SELECT * FROM legacy_tq.tasks;
        INSERT OR IGNORE INTO attempts SELECT * FROM legacy_tq.attempts;
        INSERT INTO process_journal (ts, op, task_id, attempt_id, pid, pid_started_at, exit_code, signal)
          SELECT ts, op, task_id, attempt_id, pid, pid_started_at, exit_code, signal
          FROM legacy_tq.process_journal;
      `)
    } finally {
      input.target.exec('DETACH DATABASE legacy_tq')
    }
    const after = Number(
      (input.target.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number | bigint } | undefined)
        ?.n ?? 0
    )
    result.tasksCopied = Math.max(0, after - before)
    result.attemptsCopied = Number(
      (input.target.prepare('SELECT COUNT(*) AS n FROM attempts').get() as { n: number | bigint } | undefined)
        ?.n ?? 0
    )
    result.journalCopied = Number(
      (
        input.target.prepare('SELECT COUNT(*) AS n FROM process_journal').get() as
          | { n: number | bigint }
          | undefined
      )?.n ?? 0
    )
    result.merged = true
  } finally {
    legacy.close()
  }

  const backupPath = `${input.legacyPath}.migrated`
  if (!existsSync(backupPath)) {
    renameSync(input.legacyPath, backupPath)
    result.backupPath = backupPath
  }
  return result
}
