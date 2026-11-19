import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { apiSqlFailureScenario, reopenScenario, failureScenario, invalidRowScenario, limitScenario, memoryScenario, safeScenario, scenario, serialize, timingScenario, transactionFailureScenario } from './fixtures/store-scenario.js'

assert.equal(process.version, 'v22.23.4', 'Persistence oracle requires pinned Node')
for (const [name, run] of Object.entries({ store: scenario, 'store-safe': safeScenario, 'store-memory': memoryScenario, 'store-failures': failureScenario, 'store-limit': limitScenario, 'store-invalid': invalidRowScenario, 'store-timing': timingScenario, 'store-transaction-failures': transactionFailureScenario, 'store-api-sql-failure': apiSqlFailureScenario, 'store-reopen': reopenScenario })) {
  test(`legacy supplied-Drizzle ${name}: full values, SQL, parameters, transactions and timing`, { timeout: 60_000 }, async () => {
    const expected = readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8').trim()
    assert.equal(serialize(await run()), expected)
  })
}
