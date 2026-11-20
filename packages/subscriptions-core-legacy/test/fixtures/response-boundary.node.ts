import { RssParserFeedFetcher } from '../../src/feed-parser.js'
import { runResponseBoundary } from './response-boundary.js'

process.stdout.write(JSON.stringify(await runResponseBoundary(RssParserFeedFetcher)) + '\n')
