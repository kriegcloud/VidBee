#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { log } from '@vidbee/logger/script'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirPath = path.dirname(currentFilePath)
const localesDir = path.join(currentDirPath, '..', '..', '..', 'packages', 'i18n', 'src', 'locales')
const baseLocaleFile = 'en.json'

const readJson = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    log.error(`ERROR: Failed to read ${filePath}`)
    log.error(String(error))
    process.exit(1)
  }
}

const collectLeafKeys = (value, prefix = '', keys = new Set()) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${key}` : key
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        collectLeafKeys(child, next, keys)
      } else {
        keys.add(next)
      }
    }
    return keys
  }

  if (prefix) {
    keys.add(prefix)
  }

  return keys
}

if (!fs.existsSync(localesDir)) {
  log.error(`ERROR: Locales directory not found: ${localesDir}`)
  process.exit(1)
}

const localeFiles = fs
  .readdirSync(localesDir)
  .filter((file) => file.endsWith('.json'))
  .sort()

if (!localeFiles.includes(baseLocaleFile)) {
  log.error(`ERROR: Base locale file not found: ${baseLocaleFile}`)
  process.exit(1)
}

const baseLocalePath = path.join(localesDir, baseLocaleFile)
const baseLocaleData = readJson(baseLocalePath)
const baseKeys = collectLeafKeys(baseLocaleData)

let hasMissing = false
let hasExtra = false

for (const file of localeFiles) {
  if (file === baseLocaleFile) {
    continue
  }

  const localePath = path.join(localesDir, file)
  const localeData = readJson(localePath)
  const localeKeys = collectLeafKeys(localeData)

  const missing = [...baseKeys].filter((key) => !localeKeys.has(key))
  const extra = [...localeKeys].filter((key) => !baseKeys.has(key))

  if (missing.length > 0) {
    hasMissing = true
    log.error(`ERROR: Missing keys in ${file}`)
    for (const key of missing) {
      log.error(`  - ${key}`)
    }
  }

  if (extra.length > 0) {
    hasExtra = true
    log.warn(`WARN: Extra keys in ${file}`)
    for (const key of extra) {
      log.warn(`  - ${key}`)
    }
  }
}

if (hasMissing) {
  process.exit(1)
}

if (hasExtra) {
  log.log('INFO: No missing keys, but extra keys were found.')
  process.exit(0)
}

log.log('OK: All locale files include every key from en.json.')
