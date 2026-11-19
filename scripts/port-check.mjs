import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, relative, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// JSONC comments are removed lexically so comment-like text inside strings survives.
export function parseJsonc(text) {
  const clean = text.replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/g,
    (token) => token.startsWith('"') ? token : '')
  return JSON.parse(clean.replace(/,\s*([}\]])/g, '$1'))
}
const ignored = new Set(['node_modules', 'dist', 'dist-test', 'out', '.git', '.wxt', '.output', 'build'])
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) return []
    const file = join(directory, entry.name)
    return entry.isDirectory() ? walk(file) : [file]
  })
}
function extendsBase(file, seen = new Set()) {
  if (seen.has(file)) return false
  seen.add(file)
  const config = parseJsonc(readFileSync(file, 'utf8'))
  const parents = Array.isArray(config.extends) ? config.extends : [config.extends]
  return parents.some((parent) => {
    if (typeof parent !== 'string' || !parent.startsWith('.')) return false
    const target = resolve(dirname(file), parent)
    return target.endsWith('/tsconfig.base.json') || (existsSync(target) && extendsBase(target, seen))
  })
}
export function check(root) {
  const units = ['apps', 'packages'].flatMap((folder) => existsSync(join(root, folder)) ? walk(join(root, folder)) : [])
    .filter((file) => /\/tsconfig(?:\.[^/]*)?\.json$/.test(file))
    .map((file) => ({ file: relative(root, file), ported: extendsBase(file) }))
    .sort((a, b) => a.file.localeCompare(b.file))
  const allowlist = parseJsonc(readFileSync(join(root, 'standards/effect-allowlist.jsonc'), 'utf8'))
  if (!Array.isArray(allowlist) || allowlist.some((entry) => !entry.file || !entry.rule || !entry.reason)) {
    throw new Error('Allowlist entries require file, rule and reason')
  }
  const violations = []
  const add = (file, rule, line, detail) => {
    if (!allowlist.some((entry) => entry.file === file && entry.rule === rule)) violations.push({ file, rule, line, detail })
  }
  const base = parseJsonc(readFileSync(join(root, 'tsconfig.base.json'), 'utf8'))
  for (const plugin of base.compilerOptions?.plugins ?? []) {
    if (plugin.overrides && Object.keys(plugin.overrides).length > 0) add('tsconfig.base.json', 'overrides', 1, 'Diagnostic overrides must stay empty')
  }
  const roots = [...new Set(units.filter((unit) => unit.ported).map((unit) => dirname(unit.file)))]
  if (existsSync(join(root, '.git'))) {
    const paths = roots.flatMap((directory) => ['src', 'test'].map((name) => join(directory, name)))
    if (paths.length) {
      const files = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', ...paths], { cwd: root, encoding: 'utf8' })
      for (const file of files.split('\0').filter(Boolean).sort()) add(file, 'ignored-source', 1, 'Git-ignored file in a ported source or test tree')
    }
  }
  for (const directory of roots) {
    for (const absolute of walk(join(root, directory)).filter((file) => /\.[cm]?[jt]sx?$/.test(file))) {
      const file = relative(root, absolute)
      const text = readFileSync(absolute, 'utf8')
      const entry = /(?:^|\/)legacy\//.test(file) || /(?:^|\/)(?:index|main|entry|cli)\.[cm]?[jt]sx?$/.test(file) || /\.entry\.[cm]?[jt]sx?$/.test(file)
      const rules = [
        ['diagnostics', /(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)@effect-diagnostics|@effect-diagnostics/g, false],
        ['promise', /\bEffect\s*\.\s*(?:promise|tryPromise)\b/g, /\.driver\.ts$/.test(file)],
        ['runtime', /\bEffect\s*\.\s*run\w*\b|\bManagedRuntime\b/g, entry],
        // The owner's standing rules (plan section 5 item 6) and the no-suppression rule (item 2).
        ['suppression', /@ts-ignore|@ts-expect-error|@ts-nocheck|biome-ignore|eslint-disable/g, false],
        ['native-collection', /\bnew\s+(?:Map|Set)\b/g, false],
        ['node-http', /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["'](?:node:)?https?["']/g, false],
        ['node-sqlite-before-cutover', /(?:from\s*|import\s*\()["'](?:@effect\/sql-sqlite-node(?:\/[^"']*)?|@vidbee\/db\/node)["']/g, file.startsWith('packages/db/')],
        ['zod', /from\s+["']zod(?:\/[^"']*)?["']/g, false]
      ]
      for (const [rule, pattern, exempt] of rules) {
        if (exempt) continue
        for (const match of text.matchAll(pattern)) add(file, rule, text.slice(0, match.index).split('\n').length, match[0])
      }
    }
  }
  return { units, violations }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = check(process.cwd())
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else {
    console.table(result.units.map((unit) => ({ unit: unit.file, status: unit.ported ? 'ported' : 'unported' })))
    if (result.violations.length) console.table(result.violations)
    process.stdout.write(`${result.units.filter((unit) => unit.ported).length} ported configs; ${result.violations.length} violations\n`)
  }
  process.exitCode = result.violations.length ? 1 : 0
}
