// Regeneration is a deliberate pre-port operation, never part of the test command.
import {readFileSync, writeFileSync} from 'node:fs'
import {observe, pureCases} from './pure-oracle'
import {observeSchema, schemaCases, schemaExportNames} from './schema-oracle'
const expected = readFileSync(new URL('../../../../.node-version', import.meta.url), 'utf8').trim().replace(/^v/, '')
if (process.versions.bun || process.versions.node !== expected) throw new Error(`Oracle recording requires Node ${expected}`)
const pure = pureCases()
if (new Set(pure.map(entry => entry.name)).size !== pure.length) throw new Error('Duplicate pure case names')
const schema = schemaCases()
if (new Set(schema.map(entry => entry.name)).size !== schema.length) throw new Error('Duplicate schema case names')
writeFileSync(new URL('./pure-oracle.json', import.meta.url), JSON.stringify(Object.fromEntries(pure.map(entry => [entry.name, observe(entry)])), null, 2) + '\n')
writeFileSync(new URL('./schema-oracle.json', import.meta.url), JSON.stringify({exports: schemaExportNames, ...Object.fromEntries(schema.map(entry => [entry.name, observeSchema(entry)]))}, null, 2) + '\n')
console.log(JSON.stringify({pure: pure.length, schemas: schema.length}))
