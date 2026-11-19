// Shared by every in-process harness and subprocess runner. Adapt the current branch here at port time.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
export const revision = '0739410'
const base = new URL('../', import.meta.url)
export const hashes = JSON.parse(readFileSync(new URL('fixtures/source-sha256.json', import.meta.url), 'utf8'))
export const observations = { old: 0, current: 0 }
export function source(entry, old = false) {
  observations[old ? 'old' : 'current']++
  if (!old) return readFileSync(new URL(entry, base), 'utf8')
  const frozen = readFileSync(new URL(`fixtures/${entry.split('/').at(-1)}.txt`, import.meta.url), 'utf8')
  if (createHash('sha256').update(frozen).digest('hex') !== hashes[entry]) throw new Error(`Frozen source hash mismatch: ${entry}`)
  return frozen
}
export function gitSource(entry) {
  try { return execFileSync('git', ['show', `${revision}:apps/extension/${entry}`], { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }
  catch { return undefined }
}

// All executable entry loading (including child processes) passes through this composition seam.
// A future Effect implementation adapts the current branch here and injects the same boundary fakes.
// Frozen-source compilation and its expected observations stay unchanged.
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import * as JSX from 'react/jsx-runtime'
const compiled = {}
export function evaluate(text, filename, context, { old = false, onRoot = () => {} } = {}) {
  const module = { exports: {} }
  const key = `${filename}:${text}`
  const code = compiled[key] ??= transformSync(text, { loader: filename.endsWith('tsx') ? 'tsx' : 'ts', format: 'cjs', jsx: 'automatic', target: 'es2022' }).code
  const require = name => {
    if (name.endsWith('.css')) return {}
    if (name === 'react') return React
    if (name === 'react/jsx-runtime') return JSX
    if (name === 'react-dom/client') return { ...ReactDOM, createRoot: node => { const root = ReactDOM.createRoot(node); onRoot(root); return root } }
    if (name === './App.tsx') return loadEntry('entrypoints/popup/App.tsx', { old, context, onRoot })
    throw new Error(`Unsupported entry dependency (network denied): ${name}`)
  }
  vm.runInNewContext(`"use strict";\n${code}`, { module, exports: module.exports, require, ...context }, { filename })
  return module.exports
}
export function loadEntry(entry, { old = false, context, onRoot } = {}) {
  return evaluate(source(entry, old), entry.split('/').at(-1), context, { old, onRoot })
}
