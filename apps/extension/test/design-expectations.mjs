// Independent section 9 oracle: explicit type policy from the reviewed design.
// Rendering uses frozen pre-port markup and helpers, never the new decoder or controller.
import { Harness, now, url } from './harness.mjs'
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const finite = value => typeof value === 'number' && Number.isFinite(value)
const formatKinds = { format_id: 'string', ext: 'string', format_note: 'string', resolution: 'string', width: 'number', height: 'number', fps: 'number', vcodec: 'string', acodec: 'string', filesize: 'number', filesize_approx: 'number', tbr: 'number' }
const infoKinds = { title: 'string', thumbnail: 'string', duration: 'number' }
function project(value, kinds) {
  return Object.fromEntries(Object.entries(kinds).filter(([key, kind]) => kind === 'number' ? finite(value[key]) : typeof value[key] === kind).map(([key]) => [key, value[key]]))
}
export function responseProjection(value) {
  if (!record(value)) return null
  const result = project(value, infoKinds)
  if (Array.isArray(value.formats)) result.formats = value.formats.filter(record).map(format => project(format, formatKinds))
  return result
}
function fieldsValid(value, kinds) {
  return Object.entries(kinds).every(([key, kind]) => value[key] === undefined || (kind === 'number' ? finite(value[key]) : typeof value[key] === kind))
}
export function selectedValid(entry) {
  return record(entry) && typeof entry.url === 'string' && ['pending', 'ready', 'error'].includes(entry.status) && finite(entry.fetchedAt)
    && (entry.error === undefined || typeof entry.error === 'string')
    && (entry.info === undefined || record(entry.info) && fieldsValid(entry.info, infoKinds)
      && (entry.info.formats === undefined || Array.isArray(entry.info.formats) && entry.info.formats.every(format => record(format) && fieldsValid(format, formatKinds))))
}
export async function metadataExpectation(value, observe) {
  // Harness's undefined constructor argument selects its well-formed default fixture.
  if (value === undefined) value = { title: 'Fixture', duration: 60, formats: [] }
  const projection = responseProjection(value)
  if (projection !== null) return observe(projection, true)
  const error = { url, status: 'error', fetchedAt: now, error: 'Invalid video info.' }
  const h = await new Harness({ old: true, map: { [url]: error } }).popup()
  const html = h.html()
  await h.close()
  return { writes: [ ['set', { videoInfoCacheByUrl: { [url]: { url, status: 'pending', fetchedAt: now } } }], ['set', { videoInfoCacheByUrl: { [url]: error } }] ], html, failure: undefined }
}
export async function historicalExpectation(entry, unrelated) {
  const map = { [url]: entry, unrelated }
  const h = await new Harness({ old: true, map: selectedValid(entry) ? map : { unrelated } }).popup()
  const trace = h.trace.map(item => item[0] === 'got' ? ['got', { videoInfoCacheByUrl: structuredClone(map) }] : item)
  const html = h.html()
  await h.close()
  return { html, trace, failure: undefined }
}
// Frozen ordinary success supplies the unchanged protocol/icon bytes. Section 9 alone
// changes admission, root failure location, timestamp pruning and selected-entry use.
export function backgroundExpectation(previous, ordinary) {
  const { scenario } = previous
  if (scenario.failure) return { ...previous, failures: [] }
  if ('map' in scenario && !record(scenario.map)) return { scenario, trace: Array.from({ length: scenario.repeat ? 2 : 1 }, () => ['get', 'videoInfoCacheByUrl']), failures: [] }
  if (scenario.repeat) return { ...previous, failures: [] }
  const target = 'https://example.invalid/watch'
  let map = structuredClone(scenario.map ?? {})
  const trace = ordinary.trace.map(item => {
    if (item[0] !== 'set') return item
    map = Object.fromEntries(Object.entries(map).filter(([, entry]) => !record(entry) || !finite(entry.fetchedAt) || now - entry.fetchedAt <= 300000))
    map[target] = structuredClone(item[1].videoInfoCacheByUrl[target])
    return ['set', { videoInfoCacheByUrl: structuredClone(map) }]
  })
  return { scenario, trace, failures: [] }
}
export function backgroundLogCount(previous) {
  if ('map' in previous.scenario && !record(previous.scenario.map)) return previous.scenario.repeat ? 2 : 1
  return previous.scenario.failure ? previous.failures.length : 0
}
