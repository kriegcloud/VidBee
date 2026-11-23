import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// Run serially against owned source; restore every mutation even when a runner fails.
// A mutation is killed only by a runtime assertion, never a parse/type failure.
const scratch = path.resolve(process.argv[2])
assert(fs.existsSync(path.join(scratch, 'BRIEF.md')), 'Require the services lane scratch')
const vitest = (file, pattern) => ['bunx', '--bun', 'vitest', 'run', file, ...(pattern ? ['-t', pattern] : [])]
const production = 'apps/desktop/test/services-corpus/production.spec.mjs'
const review = 'apps/desktop/test/services-corpus/review.spec.mjs'
const observation = (kind) => ['node', '--input-type=module', '-e', `import assert from 'node:assert/strict';import fs from 'node:fs';import {${kind}Observations}from './scripts/desktop-foundation/${kind==='channelTiming'?'channel-timing':'audit-observe'}.mjs';const value=await ${kind}Observations();assert.equal(JSON.stringify(value),JSON.stringify(JSON.parse(fs.readFileSync('scripts/desktop-foundation/audit.expected.json')).${kind}));`]
const app = 'apps/desktop/src/main/ipc/services/app-service.ts'
const window = 'apps/desktop/src/main/ipc/services/window-service.ts'
const runtime = 'apps/desktop/src/main/legacy/foundation-runtime.ts'
const call = 'apps/desktop/src/renderer/src/runtime/FoundationCalls.service.ts'
const state = 'apps/desktop/src/renderer/src/lib/foundation-state.ts'
const mutations = []
const replace = (label,file,from,to,argv) => mutations.push({label,file,mutate:source=>{assert(source.includes(from),`${label}: mutation site missing`);return source.replace(from,to)},argv})
const restoreHead = (label,file,argv) => mutations.push({label,file,mutate:()=>{const r=spawnSync('git',['show',`HEAD:${file}`],{encoding:'utf8'});assert.equal(r.status,0);return r.stdout},argv})
replace('R01 Windows threshold',app,'buildNumber >= 22_000','buildNumber > 22_000',observation('app'))
replace('R02 missing favicon fallback',app,'for (const url of urls)','for (const url of urls.slice(0, 1))',observation('app'))
replace('R03 final null becomes undefined',app,'    return null;','    return undefined;',observation('app'))
replace('R04 dialog adoption turn','apps/desktop/src/main/AppHost.driver.ts','queueMicrotask(() => {','((run) => run())(() => {',observation('channelTiming'))
replace('R05 missing settings broadcast','apps/desktop/src/main/SettingsApplication.service.ts','yield* attempt("Settings.broadcast", native.broadcast);','yield* Effect.void;',observation('channelTiming'))
replace('R06 no-focus maximized true',window,'yield* host.maximized(window) : false','yield* host.maximized(window) : true',['node','--import','tsx','--test','--test-name-pattern=window operations','scripts/desktop-foundation/semantics.node.ts'])
replace('R07 inverted maximize toggle',window,'if (yield* host.maximized(window))','if (!(yield* host.maximized(window)))',['node','--import','tsx','--test','--test-name-pattern=window operations','scripts/desktop-foundation/semantics.node.ts'])
replace('R08 reverse persistence','apps/desktop/src/main/settings.ts','for (const [key, value] of entries)','for (const [key, value] of [...entries].reverse())',vitest(production,'round trips open settings'))
replace('R09 reset clear omitted','apps/desktop/src/main/settings.ts','yield* store.clear;','yield* Effect.void;',vitest('scripts/desktop-foundation/foundation.test.mjs','base matrix'))
replace('R10 duplicate updates admitted','apps/desktop/src/shared/Settings.model.ts','if (HashSet.has(seen, update.key)) return "Duplicate setting key";','if (false) return "Duplicate setting key";',vitest('apps/desktop/test/settings-model.spec.ts'))
replace('R11 optimistic rollback omitted','apps/desktop/src/renderer/src/runtime/Settings.atoms.ts','if (pending) before.success.restore();','if (pending) void 0;',observation('renderer'))
replace('R12 projection notifications no-op',state,'() => set((value) => !value)','() => {}',vitest(review,'reconciles cached'))
mutations.push({label:'F01 write cuts omitted',file:'apps/desktop/src/main/FoundationHandlers.layer.ts',mutate:source=>{const start=source.indexOf('"Settings.Set":'),end=source.indexOf('"Settings.Reset":',start);const section=source.slice(start,end);assert.equal((section.match(/\n\s*bound\n/g)||[]).length,2);return source.slice(0,start)+section.replace(/\n\s*bound\n/g,'\n            undefined\n')+source.slice(end)},argv:vitest(production,'waits for its admitted observation')})
replace('F02 former observation node cutoff','apps/desktop/src/renderer/src/transport/RpcObservation.model.ts','nodes <= observationBytes / minimumNodeBytes','nodes <= 65536',vitest(production,'GetAll preserves 2650'))
replace('F03 former retention node cutoff','apps/desktop/src/renderer/src/transport/ElectronRpc.model.ts','++nodes > (128 * 1024 * 1024) / 128','++nodes > 65536',vitest(production,'GetAll preserves 2650'))
restoreHead('F04 retroactive legacy quota',runtime,vitest(review,'65 held'))
restoreHead('F05 capture extra Promise turn','apps/desktop/src/main/legacy/window-service.ts',vitest(review,'capture exact'))
replace('F06 unmounted reconciliation omitted',state,'{ immediate: true }','{ immediate: false }',vitest(review,'reconciles cached'))
replace('F07 selected preference reconstruction',call,'S.declare((input: unknown): input is SettingValue => S.is(AppSettings.fields[key])(input))','AppSettings.fields[key]',vitest(production,'preserves nested insertion order'))
for(const name of ['FoundationClient.service','About.atoms','FoundationFailures.service']) restoreHead(`F08 identity composer ${name}`,`apps/desktop/src/renderer/src/runtime/${name}.ts`,vitest(review,`composes ${name}`))
replace('S01 closed GetAll observation codec','apps/desktop/src/shared/Settings.rpc.ts','success: RpcObserved(SettingsView)','success: S.Struct({ theme: S.String })',vitest(production,'round trips open settings'))
replace('F09 removed observation capacity guard','apps/desktop/src/renderer/src/transport/RpcObservation.model.ts','return depth <= 64 && nodes <= observationBytes / minimumNodeBytes && bytes <= observationBytes;','return true;',vitest(review,'finite observation'))
replace('F10 former tagged depth cutoff','apps/desktop/src/renderer/src/transport/ElectronRpc.model.ts','depth > 4 * 64','depth > 64',vitest(production,'full supported 64-level'))
const run = (label, argv) => {
  const available=Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)[1]);assert(available>=15000000,'Wait for memory before mutation run')
  const result=spawnSync(argv[0],argv.slice(1),{env:{...process.env,TMPDIR:path.join(scratch,'tmp'),BUN_TMPDIR:path.join(scratch,'tmp'),CI:'true'},encoding:'utf8',maxBuffer:32*1024*1024})
  const output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(scratch,`fix1-mutation-${label.replaceAll(/[^a-zA-Z0-9]/g,'_')}.log`),output)
  return {exit:result.status,signal:result.signal,assertion:/AssertionError| FAIL /.test(output),syntax:/SyntaxError|Transform failed/.test(output)}
}
const results=[]
for(const mutation of mutations){
 const original=fs.readFileSync(mutation.file,'utf8')
 try {
  const changed=mutation.mutate(original);assert.notEqual(changed,original,`${mutation.label}: no change`)
  fs.writeFileSync(mutation.file,changed)
  const result=run(mutation.label,mutation.argv);const killed=result.exit!==0&&result.signal===null&&result.assertion&&!result.syntax
  results.push({label:mutation.label,file:mutation.file,killed,...result})
  fs.writeFileSync(path.join(scratch,'fix1-mutations.json'),JSON.stringify(results,null,2)+'\n')
  console.log(JSON.stringify(results.at(-1)))
  assert(killed,`Mutation survived or runner failed: ${mutation.label}`)
 } finally {fs.writeFileSync(mutation.file,original);assert.equal(fs.readFileSync(mutation.file,'utf8'),original)}
}
console.log(`Killed ${results.length}/${results.length} mutations, including all twelve review defects`)
