#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { log } from '@vidbee/logger/script'

const desktopRoot = path.resolve(import.meta.dirname, '..')
const checkScript =
  "const Database=require('better-sqlite3');const db=new Database(':memory:');db.close()"

function canLoadBetterSqlite3WithElectron() {
  const result = spawnSync('pnpm', ['exec', 'electron', '-e', checkScript], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1'
    },
    encoding: 'utf8'
  })

  if (result.status === 0) {
    return true
  }

  const stderr = result.stderr?.trim()
  const stdout = result.stdout?.trim()
  const details = stderr || stdout || 'No output'
  log.warn(`[native-deps] better-sqlite3 check failed: ${details}`)
  return false
}

if (canLoadBetterSqlite3WithElectron()) {
  log.log('[native-deps] better-sqlite3 is ready for Electron')
  process.exit(0)
}

log.log('[native-deps] Rebuilding Electron native dependencies...')
execSync('pnpm exec electron-builder install-app-deps', {
  cwd: desktopRoot,
  stdio: 'inherit'
})

if (!canLoadBetterSqlite3WithElectron()) {
  throw new Error('[native-deps] better-sqlite3 is still unavailable after install-app-deps')
}

log.log('[native-deps] Electron native dependencies are ready')
