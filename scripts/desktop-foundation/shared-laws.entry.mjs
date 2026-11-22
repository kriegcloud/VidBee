import fs from 'node:fs'
import path from 'node:path'
import * as Effect from 'effect/Effect'
import { CompilerHost } from '../../tooling/standards/src/compiler/CompilerHost.service.ts'
import { CompilerHostLive } from '../../tooling/standards/src/compiler/CompilerHost.layer.ts'
import { inspectLaws } from '../../tooling/standards/src/LawRules.ts'

// Use the repository's compiler adapter and law recognizers over the exact strict partition.
// The ordinary CLI expands files-from to complete packages and remains an additional gate.
const projectPath=path.resolve('scripts/desktop-foundation/tsconfig.strict-shared.json')
const config=JSON.parse(fs.readFileSync(projectPath,'utf8'))
const files=config.files.map(file=>path.resolve(path.dirname(projectPath),file)).filter(file=>file.includes('/apps/desktop/src/shared/')&&!file.endsWith('/types/ipc.ts'))
const findings=await Effect.runPromise(Effect.gen(function*(){
 const host=yield* CompilerHost
 const session=yield* host.open(projectPath)
 const rows=yield* Effect.forEach(files,file=>session.laws(file).pipe(Effect.map(facts=>inspectLaws(path.relative(process.cwd(),file),facts).map(finding=>({file:path.relative(process.cwd(),file),...finding})))))
 return rows.flat()
}).pipe(Effect.scoped,Effect.provide(CompilerHostLive)))
if(process.argv.includes('--json'))console.log(JSON.stringify({files:files.length,findings}))
else console.log(`Strict shared standards: ${files.length} files, ${findings.length} findings`)
if(findings.length){if(!process.argv.includes('--json'))console.error(JSON.stringify(findings,null,2));process.exitCode=1}
