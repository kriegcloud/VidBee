// Executed only under explicitly selected pinned Node with a specified TZ.
import {normalizeFeedItems} from '@vidbee/subscriptions-core-legacy/feed-items'
import {encode} from './pure-oracle'
const values: unknown[] = ['2020-01-01', '2020-01-01T12:00:00', '2020-01-01T12:00:00Z', '2020-01-01T12:00:00+09:00', 'Sun, 08 Mar 2020 02:30:00', '2020-03-08T02:30:00', '2020-11-01T01:30:00', 'Tue, 01 Jan 2019 00:00:00 GMT', 'January 1 2020 12:00:00 PST', 'invalid', undefined, null, false, true, 0, 1, 7, NaN, {toString: () => '2020-01-01T00:00:00Z'}, {toString: () => {throw new Error('date coercion fixture')}}]
const dates = values.map((value, index) => {
 let calls = 0
 try {
  const result = Reflect.apply(normalizeFeedItems, undefined, [[{guid: `id-${index}`, title: 'Title', link: 'url', isoDate: value, pubDate: 'bad'}], {now: () => {calls++; return 123}}])
  return {index, result: encode(result), calls}
 } catch (error) {return {index, error: error instanceof Error ? error.name : typeof error, message: error instanceof Error ? error.message : String(error), calls}}
})
let customIdentity: unknown
try { Reflect.apply(normalizeFeedItems, undefined, [[{youtubeId: {nested: 'video'}, guid: 'fallback', title: 'Title', link: 'url'}], {now: () => 100}]) } catch (error) {customIdentity = {error: error instanceof Error ? error.name : typeof error, message: error instanceof Error ? error.message : String(error)}}
console.log(JSON.stringify({dates, customIdentity}))
