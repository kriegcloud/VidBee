// D7 plain-Node tooling. Compiler output is evidence, never display text.
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, realpathSync, statSync, existsSync } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { parseJsonc } from './port-check.mjs'

/** Names the compiler partitions supported by desktop ownership.
 * **Example** (List partitions)
 * ```ts
 * import { environments } from "./scripts/port-desktop.mjs"
 * environments.join(",") // node,web,test
 * ```
 * @category configuration
 * @since 0.0.0
 */
export const environments = ['node', 'web', 'test']
const manifestPath = 'apps/desktop/port-units.json'
const baselinePath = 'apps/desktop/port-units.baseline.json'
const skipped = new Set(['node_modules', 'dist', 'dist-test', 'out', '.git', '.wxt', '.output', '.turbo'])
/** Lists desktop TypeScript files, including ignored sources and declarations.
 * **Example** (Inventory the desktop)
 * ```ts
 * import { inventory } from "./scripts/port-desktop.mjs"
 * inventory("apps/desktop").includes("apps/desktop/src/main/index.ts")
 * ```
 * @category tools
 * @since 0.0.0
 */
export function inventory(directory, ancestors = new Set()) {
  const canonical = realpathSync(directory)
  if (ancestors.has(canonical)) throw new Error(`Inventory symlink cycle: ${directory}`)
  const seen = new Set([...ancestors, canonical])
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (skipped.has(entry.name)) return []
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink() && /\.[cm]?tsx?$/.test(path)) throw new Error(`Symlink in desktop inventory: ${path}`)
    return (entry.isDirectory() || (entry.isSymbolicLink() && statSync(path).isDirectory())) ? inventory(path, seen) : /\.[cm]?tsx?$/.test(path) ? [path] : []
  })
}

// Rule 1-3: separate streams, unlimited capture by default, wait for close and EOF.
/** Captures both subprocess streams through close and rejects incomplete evidence.
 * **Example** (Capture a complete line)
 * ```ts
 * import { capture } from "./scripts/port-desktop.mjs"
 * const output = await capture(process.execPath, ["-e", "console.log('complete')"])
 * output.stdout === "complete\n"
 * ```
 * @category tools
 * @since 0.0.0
 */
export function capture(command, args, { cwd, ceiling = Infinity, spawnProcess = spawn } = {}) {
  return new Promise((accept, reject) => {
    let child
    try { child = spawnProcess(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch (error) { reject(error); return }
    const chunks = { stdout: [], stderr: [] }
    const ended = { stdout: false, stderr: false }
    let size = 0
    let failure
    child.on('error', (error) => { failure = error })
    for (const name of ['stdout', 'stderr']) {
      child[name].on('data', (data) => {
        size += data.length
        if (size >= ceiling) { failure = new Error('Capture ceiling reached'); child.kill() }
        else chunks[name].push(Buffer.from(data))
      })
      child[name].on('end', () => { ended[name] = true })
      child[name].on('error', (error) => { failure = error; child.kill() })
    }
    child.on('close', (code, signal) => {
      if (failure || signal || code !== 0 || !ended.stdout || !ended.stderr) {
        reject(failure ?? new Error(`Compiler capture failed: code=${code} signal=${signal}; ${Buffer.concat(chunks.stderr)}`))
      } else accept({ stdout: Buffer.concat(chunks.stdout).toString('utf8'), stderr: Buffer.concat(chunks.stderr).toString('utf8') })
    })
  })
}

// Rules 4-6: no filtering invalid lines; canonical paths and explicit roots.
/** Validates compiler listing paths and requires all explicit roots to be present.
 * **Example** (Validate one root)
 * ```ts
 * import { listing } from "./scripts/port-desktop.mjs"
 * const file = process.execPath
 * listing(`${file}\n`, [file]).size === 1
 * ```
 * @category validation
 * @since 0.0.0
 */
export function listing(stdout, roots) {
  if (!stdout || !stdout.endsWith('\n')) throw new Error('Listing must be nonempty and newline terminated')
  const paths = new Set(stdout.slice(0, -1).split('\n').map((line) => {
    const path = line.endsWith('\r') ? line.slice(0, -1) : line
    if (!isAbsolute(path) || path.includes('\0') || !statSync(path).isFile()) throw new Error(`Invalid compiler path: ${path}`)
    return realpathSync(path)
  }))
  for (const root of roots) if (!paths.has(realpathSync(root))) throw new Error(`Missing explicit root: ${root}`)
  return paths
}

function strict(entry) { return entry?.partition === 'strict' }
function validate(document) {
  if (document.version !== 1 || !Array.isArray(document.files) || !Array.isArray(document.renames)) throw new Error('Invalid ownership document')
  const paths = new Set()
  for (const entry of document.files) {
    if (typeof entry.file !== 'string' || !entry.file.startsWith('apps/desktop/') || entry.file.includes('..') || paths.has(entry.file) ||
      !['strict', 'legacy'].includes(entry.partition) || !entry.capability || !Array.isArray(entry.environments) ||
      !entry.environments.length || new Set(entry.environments).size !== entry.environments.length || entry.environments.some((env) => !environments.includes(env))) throw new Error(`Invalid ownership: ${JSON.stringify(entry)}`)
    paths.add(entry.file)
  }
  return document
}
/** Rejects historical strict membership loss, following explicit rename identities.
 * **Example** (Compare empty ownership)
 * ```ts
 * import { compareBaseline } from "./scripts/port-desktop.mjs"
 * const empty = { version: 1, files: [], renames: [] }
 * compareBaseline(empty, empty) // succeeds
 * ```
 * @category validation
 * @since 0.0.0
 */
export function compareBaseline(current, baseline) {
  validate(baseline)
  const destinations = new Set()
  const origins = new Set()
  for (const move of current.renames) {
    if (!move.from || !move.to || move.from === move.to || destinations.has(move.to) || origins.has(move.from) || current.files.some((entry) => entry.file === move.from)) throw new Error('Invalid rename identity')
    destinations.add(move.to)
    origins.add(move.from)
  }
  for (const entry of baseline.files.filter(strict)) {
    let destination = entry.file
    const visited = new Set()
    while (current.renames.some((move) => move.from === destination)) {
      if (visited.has(destination)) throw new Error('Rename identity cycle')
      visited.add(destination)
      destination = current.renames.find((move) => move.from === destination).to
    }
    const next = current.files.find((item) => item.file === destination)
    if (!strict(next) || entry.environments.some((env) => !next.environments.includes(env))) throw new Error(`Strict ownership regression: ${entry.file}`)
  }
}

/** Reads historical ownership from a verified Git target independently of working files.
 * **Example** (Read a named target)
 * ```ts
 * import { targetBaseline } from "./scripts/port-desktop.mjs"
 * targetBaseline(process.cwd(), "main").version === 1
 * ```
 * @category tools
 * @since 0.0.0
 */
export function targetBaseline(root, revision) {
  const target = revision ?? process.env.PORT_CHECK_TARGET ?? (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'main')
  const commit = execFileSync('git', ['rev-parse', '--verify', `${target}^{commit}`], { cwd: root, encoding: 'utf8' }).trim()
  const names = execFileSync('git', ['ls-tree', '--name-only', commit, '--', baselinePath], { cwd: root, encoding: 'utf8' })
  // Bootstrap only: a target predating this machinery cannot contain strict membership.
  if (!names.trim()) return { version: 1, files: [], renames: [] }
  return JSON.parse(execFileSync('git', ['show', `${commit}:${baselinePath}`], { cwd: root, encoding: 'utf8' }))
}

/** Validates partial desktop ownership, compiler graphs and separate diagnostics.
 * **Example** (Report desktop membership)
 * ```ts
 * import { checkDesktop } from "./scripts/port-desktop.mjs"
 * import { check } from "./scripts/port-check.mjs"
 * const root = process.cwd()
 * const report = await checkDesktop(root, check(root).units)
 * report.status === "partially ported"
 * ```
 * @category tools
 * @since 0.0.0
 */
export async function checkDesktop(root, units, { revision, compiler = capture } = {}) {
  if (!existsSync(join(root, manifestPath))) throw new Error('Missing desktop ownership manifest')
  const current = validate(JSON.parse(readFileSync(join(root, manifestPath), 'utf8')))
  const baseline = validate(JSON.parse(readFileSync(join(root, baselinePath), 'utf8')))
  compareBaseline(current, baseline)
  compareBaseline(current, targetBaseline(root, revision))
  for (const entry of current.files.filter(strict)) if (!baseline.files.some((item) => item.file === entry.file && strict(item) && entry.environments.every((env) => item.environments.includes(env)))) throw new Error(`Strict file absent from baseline: ${entry.file}`)
  const actual = inventory(join(root, 'apps/desktop')).map((file) => relative(root, file)).sort()
  if (JSON.stringify(actual) !== JSON.stringify(current.files.map((entry) => entry.file).sort())) throw new Error('Desktop ownership inventory mismatch')
  const strictFiles = new Set()
  const memberships = {}
  await Promise.all(environments.map(async (env) => {
    const configFile = `apps/desktop/tsconfig.ported.${env}.json`
    const config = parseJsonc(readFileSync(join(root, configFile), 'utf8'))
    const roots = current.files.filter((entry) => strict(entry) && entry.environments.includes(env)).map((entry) => entry.file)
    const configured = (config.files ?? []).map((file) => relative(root, resolve(root, 'apps/desktop', file))).sort()
    if (JSON.stringify(configured) !== JSON.stringify([...roots].sort()) || config.include?.length || config.exclude?.length || config.extends !== '../../tsconfig.base.json') throw new Error(`Strict roots/config mismatch: ${env}`)
    const options = config.compilerOptions ?? {}
    const permitted = new Set(['module', 'moduleResolution', 'lib', 'types', 'paths', 'rootDir', 'noEmit', 'incremental', 'composite', 'declaration', 'declarationMap'])
    if (Object.keys(options).some((key) => !permitted.has(key)) || options.module !== 'esnext' || options.moduleResolution !== 'bundler' || options.noEmit !== true) throw new Error(`Strict compiler policy: ${env}`)
    memberships[env] = roots.length
    // Empty roots have no graph evidence; still run the separate diagnostic/config check.
    if (!roots.length) {
      await compiler(process.execPath, [join(root, 'node_modules/tsrs/bin/tsrs'), '--noEmit', '--incremental', 'false', '--composite', 'false', '-p', configFile], { cwd: root })
      return
    }
    const args = [join(root, 'node_modules/tsrs/bin/tsrs'), '--listFilesOnly', '--noEmit', '--incremental', 'false', '--composite', 'false', '-p', configFile]
    const output = await compiler(process.execPath, args, { cwd: root })
    const graph = listing(output.stdout, roots.map((file) => join(root, file)))
    const canonicalRoot = realpathSync(root)
    for (const absolute of graph) {
      const file = relative(canonicalRoot, absolute)
      if (file.split('/').includes('node_modules')) continue
      if (file.startsWith('..')) throw new Error(`Unowned external compiler dependency: ${absolute}`)
      if (/(?:^|\/)legacy\/|(?:^|\/)[^/]+-legacy\//.test(file) || file === 'apps/desktop/src/main/ipc/index.ts' || file.startsWith('apps/desktop/src/renderer/src/stores/')) throw new Error(`Compatibility dependency: ${file}`)
      if (file.startsWith('apps/desktop/')) {
        const owner = current.files.find((entry) => entry.file === file)
        if (!strict(owner) || !owner.environments.includes(env)) throw new Error(`Legacy or wrong-environment dependency: ${env}: ${file}`)
        strictFiles.add(file)
      } else if (/\.[cm]?[jt]sx?$/.test(file)) {
        if (!units.some((unit) => unit.ported && !unit.file.startsWith('apps/desktop/') && file.startsWith(unit.file.slice(0, unit.file.lastIndexOf('/') + 1)))) throw new Error(`Unported package dependency: ${file}`)
      }
    }
    // Diagnostics are a separate invocation, with the same native Node launcher.
    await compiler(process.execPath, [args[0], '--noEmit', '--incremental', 'false', '--composite', 'false', '-p', configFile], { cwd: root })
  }))
  return { files: [...strictFiles].sort(), status: 'partially ported', strict: current.files.filter(strict).length, legacy: current.files.filter((entry) => !strict(entry)).length, memberships }
}
