import { readFileSync } from 'node:fs'
import { FeedCheckScheduler } from '../../src/scheduler.js'
import { LeaderElection } from '../../src/leader.js'
import { SubscriptionsApi } from '../../src/api.js'
import { RssParserFeedFetcher } from '../../src/feed-parser.js'
import { createSqliteSubscriptionsStore, createSqliteMetaStore } from '../../src/store.js'
import { callbackScenarios, runCallbackScenario } from './callback-parity.js'

const expectedNode = readFileSync(new URL('../../../../.node-version', import.meta.url), 'utf8').trim()
if (process.version !== `v${expectedNode.replace(/^v/, '')}`) {
  throw new Error('Callback parity runner requires the repository-pinned Node')
}
const selected = callbackScenarios.find(name => name === process.argv[2])
if (selected === undefined) throw new Error('Unknown callback parity scenario')
process.stdout.write(JSON.stringify(await runCallbackScenario(selected, {
  FeedCheckScheduler, LeaderElection, SubscriptionsApi, RssParserFeedFetcher,
  createSqliteSubscriptionsStore, createSqliteMetaStore
})))
