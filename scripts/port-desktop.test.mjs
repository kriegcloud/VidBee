import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
const api = await import(process.env.RATCHET_MODULE ?? './port-desktop.mjs')
const { capture, listing, checkDesktop, compareBaseline } = api
const { check: textual } = await import('./port-check.mjs')
const workspace = resolve(import.meta.dirname, '..')
const scratch = resolve(workspace, '.cache/ratchet-tests')
mkdirSync(scratch, { recursive: true })
function fixture() {
  const root = mkdtempSync(join(scratch, 'case-'))
  const write = (file, value) => { mkdirSync(resolve(root, file, '..'), { recursive: true }); writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value)) }
  execFileSync('git', ['init', '-q', root])
  execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd: root })
  symlinkSync(join(workspace, 'node_modules'), join(root, 'node_modules'))
  write('tsconfig.base.json', readFileSync(join(workspace, 'tsconfig.base.json'), 'utf8'))
  for (const env of ['node', 'web', 'test']) write(`apps/desktop/tsconfig.ported.${env}.json`, JSON.parse(readFileSync(join(workspace, `apps/desktop/tsconfig.ported.${env}.json`), 'utf8')))
  const doc = { version: 1, files: [], renames: [] }
  const add = (file, text, partition = 'legacy', environments = ['node', 'web', 'test']) => {
    write(file, text)
    doc.files.push({ file, partition, environments, capability: 'fixture' })
  }
  const save = () => {
    write('apps/desktop/port-units.json', doc); write('apps/desktop/port-units.baseline.json', doc)
    for (const env of ['node', 'web', 'test']) {
      const path = `apps/desktop/tsconfig.ported.${env}.json`
      const config = JSON.parse(readFileSync(join(root, path), 'utf8'))
      config.files = doc.files.filter((entry) => entry.partition === 'strict' && entry.environments.includes(env)).map((entry) => entry.file.slice('apps/desktop/'.length))
      write(path, config)
    }
  }
  return { root, write, add, save, doc, close: () => rmSync(root, { recursive: true, force: true }) }
}
async function withFixture(run) { const f = fixture(); try { await run(f) } finally { f.close() } }
const check = (f, options = {}) => checkDesktop(f.root, [], { revision: 'HEAD', ...options })

for (const [name, source, legacy, legacyText] of [
  ['renderer alias', "import { x } from '@renderer/old'; export const y = x", 'src/renderer/src/old.ts', 'export const x = 1'],
  ['shared alias', "import { x } from '@shared/old'; export const y = x", 'src/shared/old.ts', 'export const x = 1'],
  ['main alias', "import { x } from '@main/old'; export const y = x", 'src/main/old.ts', 'export const x = 1'],
  ['type-only', "import type { X } from '@shared/old'; export type Y = X", 'src/shared/old.ts', 'export type X = string'],
  ['declaration re-export', "export type { X } from '@shared/old'", 'src/shared/old.ts', 'export type X = string'],
  ['typeof declaration shim', "export type Y = typeof import('@main/old').x", 'src/main/old.ts', 'export const x = 1']
]) test(`graph rejects ${name}`, () => withFixture(async (f) => {
  f.add(`apps/desktop/${name.includes('declaration') ? 'strict.d.ts' : 'strict.ts'}`, source, 'strict', ['web'])
  f.add(`apps/desktop/${legacy}`, legacyText)
  f.save()
  await assert.rejects(check(f), /Legacy or wrong-environment dependency/)
}))

test('real compiler graph exceeds 64 KiB before legacy tail', () => withFixture(async (f) => {
  const imports = []
  for (let index = 0; index < 512; index++) {
    const name = `padding/${String(index).padStart(4, '0')}-${'complete-graph-evidence-'.repeat(4)}.ts`
    f.add(`apps/desktop/${name}`, 'export const value = 1', 'strict', ['web'])
    imports.push(`import './${name}'`)
  }
  f.add('apps/desktop/strict.ts', `${imports.join('\n')}\nimport { x } from '@shared/old'; export const y = x`, 'strict', ['web'])
  f.add('apps/desktop/src/shared/old.ts', 'export const x = 1'); f.save()
  await assert.rejects(check(f, { compiler: async (...args) => {
    const result = await capture(...args)
    if (args[1].includes('--listFilesOnly')) assert.ok(result.stdout.indexOf(join(f.root, 'apps/desktop/src/shared/old.ts')) > 65536)
    return result
  } }), /Legacy or wrong-environment dependency/)
}))
test('strict textual rules cover tests without scanning legacy siblings', () => withFixture((f) => {
  f.write('standards/effect-allowlist.jsonc', '[]')
  f.add('apps/desktop/test/strict.ts', 'new Map(); Effect.tryPromise(f); Effect.runSync(x)', 'strict', ['test'])
  f.add('apps/desktop/old.ts', 'new Set()'); f.save()
  const result = textual(f.root, ['apps/desktop/test/strict.ts'])
  assert.deepEqual(result.violations.map((entry) => entry.rule).sort(), ['native-collection', 'promise', 'runtime'])
}))
test('unported package and compatibility dependencies fail', () => withFixture(async (f) => {
  f.add('apps/desktop/strict.ts', 'export const x = 1', 'strict', ['web']); f.save()
  for (const path of ['packages/old/src/index.ts', 'packages/strict/src/legacy/index.ts']) {
    f.write(path, 'export const x = 1')
    const compatibility = path.includes('/legacy/')
    const units = compatibility ? [{ file: 'packages/strict/tsconfig.json', ported: true }] : []
    await assert.rejects(checkDesktop(f.root, units, { revision: 'HEAD', compiler: async () => ({ stdout: `${join(f.root, 'apps/desktop/strict.ts')}\n${join(f.root, path)}\n`, stderr: '' }) }), compatibility ? /Compatibility dependency/ : /Unported package/)
  }
}))
test('tiny strict graph and empty sets work', () => withFixture(async (f) => {
  f.save(); assert.equal((await check(f)).strict, 0)
  f.add('apps/desktop/strict.ts', 'export const value = 1', 'strict'); f.save()
  assert.equal((await check(f)).strict, 1)
}))
test('inventory rejects new TS TSX and declarations', () => withFixture(async (f) => {
  f.save()
  for (const file of ['new.ts', 'new.tsx', 'new.d.ts', 'build/new.ts']) {
    f.write(`apps/desktop/${file}`, ''); await assert.rejects(check(f), /inventory mismatch/)
    rmSync(join(f.root, 'apps/desktop', file))
  }
}))
test('target baseline survives editing both ownership files', () => withFixture(async (f) => {
  f.add('apps/desktop/strict.ts', 'export const x = 1', 'strict'); f.save()
  execFileSync('git', ['add', 'apps/desktop/port-units.baseline.json'], { cwd: f.root })
  execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'strict baseline'], { cwd: f.root })
  f.doc.files[0].partition = 'legacy'; f.save()
  await assert.rejects(check(f), /Strict ownership regression/)
}))
test('rename identity retains strict environments', () => {
  const file = { file: 'apps/desktop/old.ts', partition: 'strict', capability: 'fixture', environments: ['node', 'web'] }
  const baseline = { version: 1, files: [file], renames: [] }
  const current = { version: 1, files: [{ ...file, file: 'apps/desktop/new.ts' }], renames: [{ from: file.file, to: 'apps/desktop/new.ts' }] }
  compareBaseline(current, baseline)
  current.files[0].environments = ['node']; assert.throws(() => compareBaseline(current, baseline), /regression/)
})
test('listing rejects missing root', () => withFixture(async (f) => {
  f.write('a.ts', ''); f.write('b.ts', '')
  const received = await capture(process.execPath, ['-e', 'console.log(process.argv[1])', join(f.root, 'a.ts')])
  assert.throws(() => listing(received.stdout, [join(f.root, 'b.ts')]), /Missing explicit root/)
}))
test('listing rejects malformed nonexistent and partial paths', () => withFixture((f) => {
  f.write('a.ts', ''); f.write('a.t', '')
  for (const output of ['', join(f.root, 'a.ts'), `${join(f.root, 'absent.ts')}\n`, 'relative.ts\n', `${join(f.root, 'a.ts')}\n\n`]) assert.throws(() => listing(output, []))
}))
test('capture over 64 KiB reaches forbidden dependency at end', () => withFixture(async (f) => {
  f.add('apps/desktop/strict.ts', 'export const x = 1', 'strict', ['web']); f.add('apps/desktop/old.ts', ''); f.save()
  const text = `${join(f.root, 'apps/desktop/strict.ts')}\n`.repeat(1800) + `${join(f.root, 'apps/desktop/old.ts')}\n`
  assert.ok(Buffer.byteLength(text) > 65536)
  f.write('listing.txt', text)
  const received = await capture(process.execPath, ['-e', 'process.stdout.write(require("node:fs").readFileSync(process.argv[1]))', join(f.root, 'listing.txt')])
  assert.equal(received.stdout, text)
  await assert.rejects(check(f, { compiler: async () => received }), /Legacy or wrong-environment dependency/)
}))
test('capture rejects ceiling subprocess signal and stream errors', async () => {
  await assert.rejects(capture(process.execPath, ['-e', 'process.stdout.write("abcdef\\n")'], { ceiling: 4 }), /ceiling/)
  await assert.rejects(capture('/does-not-exist-ratchet', []))
  await assert.rejects(capture('fixture', [], { spawnProcess: () => { throw new Error('spawn failed') } }), /spawn failed/)
  await assert.rejects(capture(process.execPath, ['-e', 'process.exit(3)']))
  await assert.rejects(capture(process.execPath, ['-e', 'process.kill(process.pid, "SIGTERM")']))
  const fake = (kind) => () => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {}
    queueMicrotask(() => {
      if (kind === 'error') child.stdout.emit('error', new Error('stream failed'))
      if (kind === 'incomplete') child.stderr.end()
      if (kind === 'throw') child.emit('error', new Error('process failed'))
      child.emit('close', 0, null)
    }); return child
  }
  for (const kind of ['error', 'incomplete', 'throw']) await assert.rejects(capture('fixture', [], { spawnProcess: fake(kind) }))
})
test('ignored strict desktop sources retain the existing ignored-source rule', () => withFixture((f) => {
  f.write('standards/effect-allowlist.jsonc', '[]')
  f.write('.gitignore', '*.hidden.ts\n')
  f.add('apps/desktop/strict.hidden.ts', 'export const x = 1', 'strict'); f.save()
  assert.ok(textual(f.root, ['apps/desktop/strict.hidden.ts']).violations.some((item) => item.rule === 'ignored-source'))
}))
test('strict configs cannot weaken inherited policy', () => withFixture(async (f) => {
  f.save(); const file = 'apps/desktop/tsconfig.ported.node.json'
  const config = JSON.parse(readFileSync(join(f.root, file), 'utf8')); config.compilerOptions.strict = false; f.write(file, config)
  await assert.rejects(check(f), /compiler policy/)
}))

// Mutate isolated copies, then run the actual negative tests against each copy.
// A passing test run for a mutant means the protection lacks an effective test.
if (!process.env.RATCHET_MODULE) test('negative fixtures kill removed protections', () => {
  const source = readFileSync(new URL('./port-desktop.mjs', import.meta.url), 'utf8')
  const mutations = [
    ['legacy graph', 'if (!strict(owner) || !owner.environments.includes(env))', 'if (false)', 'graph rejects'],
    ['unported package', 'if (!units.some', 'if (false && units.some', 'unported package and compatibility'],
    ['compatibility', "if (/(?:^|\\/)legacy\\/|(?:^|\\/)[^/]+-legacy\\//.test(file)", 'if (false', 'unported package and compatibility'],
    ['target revision', 'compareBaseline(current, targetBaseline(root, revision))', '', 'target baseline'],
    ['inventory', "if (JSON.stringify(actual) !== JSON.stringify(current.files.map((entry) => entry.file).sort()))", 'if (false)', 'inventory rejects'],
    ['roots', 'if (!paths.has(realpathSync(root)))', 'if (false)', 'listing rejects missing root'],
    ['path validation', '.map((line) => {', '.map((line) => { return line;', 'listing rejects malformed'],
    ['newline', "if (!stdout || !stdout.endsWith('\\n'))", 'if (false)', 'listing rejects malformed'],
    ['ceiling', 'if (size >= ceiling)', 'if (false)', 'capture rejects'],
    ['stream completeness', '!ended.stdout || !ended.stderr', 'false', 'capture rejects'],
    ['capture errors', 'if (failure || signal || code !== 0 || !ended.stdout || !ended.stderr)', 'if (false)', 'capture rejects'],
    ['64KiB truncation', "stdout: Buffer.concat(chunks.stdout).toString('utf8')", "stdout: Buffer.concat(chunks.stdout).subarray(0, 65536).toString('utf8')", 'capture over 64'],
    ['config policy', 'if (Object.keys(options).some((key) => !permitted.has(key))', 'if (false', 'strict configs']
  ]
  const dir = mkdtempSync(join(scratch, 'mutations-'))
  try {
    for (const [name, before, after, pattern] of mutations) {
      assert.ok(source.includes(before), name)
      // Preserve relative helper imports by pointing at the original module explicitly.
      const mutant = source.replace(before, after).replace("from './port-check.mjs'", `from '${join(workspace, 'scripts/port-check.mjs')}'`)
      const path = join(dir, 'mutant.mjs'); writeFileSync(path, mutant)
      const childEnv = { ...process.env, RATCHET_MODULE: path }; delete childEnv.NODE_TEST_CONTEXT
      const result = spawnSync(process.execPath, ['--test', '--test-name-pattern', pattern, new URL(import.meta.url).pathname], { env: childEnv, encoding: 'utf8' })
      assert.notEqual(result.status, 0, `Surviving mutant: ${name}\n${result.stdout}\n${result.stderr}`)
      const expectedFailures = pattern === 'graph rejects' ? 6 : 1
      assert.match(result.stdout, new RegExp(`# fail ${expectedFailures}\\n`), `Every selected negative fixture must kill ${name}:\n${result.stdout}`)
      assert.match(result.stdout, /code: 'ERR_ASSERTION'/, `Mutant must fail an assertion, not startup: ${name}\n${result.stdout}\n${result.stderr}`)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
