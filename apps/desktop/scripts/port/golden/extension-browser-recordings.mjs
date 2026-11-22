import { differences, normalize } from './normalize.mjs'

export const REQUIRED_SCENARIOS = [
  'metadata-success',
  'cache-reopen',
  'layout-light',
  'layout-dark',
  'metadata-failure',
  'stored-error',
  'retry-recovery',
  'connection-failure',
  'root-null',
  'root-false',
  'root-zero',
  'root-empty-string',
  'root-number',
  'root-true',
  'root-string',
  'root-array',
  'root-null-array',
  'worker-restart',
  'document-worker-cleanup',
  'keyboard'
]

/** A failed/partial/skipped browser run cannot admit a golden, even if repeated. */
export function stableBrowserDocuments(runs) {
  if (runs.length !== 5) {
    throw new Error('Browser admission requires exactly five consecutive runs')
  }
  for (const run of runs) {
    if (run.status !== 'passed') {
      throw new Error('Missing successful browser proof')
    }
    for (const name of REQUIRED_SCENARIOS) {
      if (!run.recordings.some((value) => value.name === name)) {
        throw new Error(`Missing browser scenario: ${name}`)
      }
    }
  }
  const stable = []
  const unstable = []
  for (const first of runs[0].recordings) {
    const values = runs.map((run) => run.recordings.find((value) => value.name === first.name))
    const mismatch = values.slice(1).find((value) => differences(first, value).length)
    if (mismatch) {
      unstable.push({
        name: first.name,
        before: first,
        after: mismatch,
        differences: differences(first, mismatch)
      })
    } else {
      stable.push(first)
    }
  }
  return { stable, unstable }
}

/** No blanket section-9 exemption: each observed difference needs a reviewed row. */
export function compareBrowserRecordings(old, current) {
  return differences(old, current)
}

/** Named browser-only projection; full CDP envelopes remain in raw receipts.
 * CDP transport IDs/timings are not application outputs. Wire headers, order,
 * body, response body, storage fields, DOM and AX names/properties remain.
 */
export function normalizeBrowserObservation(value, roots = []) {
  if (['keyboard', 'document-worker-cleanup'].includes(value.name)) {
    return normalize(value, roots)
  }
  const storage = structuredClone(value.storage)
  const cache = storage?.videoInfoCacheByUrl
  if (cache && typeof cache === 'object' && !Array.isArray(cache)) {
    for (const entry of Object.values(cache)) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.fetchedAt === 'number' &&
        entry.fetchedAt > 1_760_000_000_000
      ) {
        entry.fetchedAt = '<timestamp>'
      }
    }
  }
  const requests = value.requests.map((item) => {
    const url = new URL(item.request.url)
    if (url.searchParams.has('token')) {
      url.searchParams.set('token', '<token>')
    }
    let responseBody = item.body?.body
    try {
      responseBody = JSON.parse(responseBody)
    } catch {
      /* literal body retained */
    }
    return {
      method: item.request.method,
      url: url.href,
      headers: item.wireHeaders ?? item.request.headers,
      body: item.request.postData ?? null,
      response: { status: item.response?.status, body: responseBody, bodyError: item.bodyError }
    }
  })
  // InlineTextBox is a browser line-wrap fragment of its parent StaticText name.
  // Full nodes stay in raw receipts; compare complete semantic names, not split paths.
  const ax = value.accessibility?.nodes
    ?.filter((node) => node.role?.value !== 'InlineTextBox')
    .map((node) => ({
      role: node.role?.value,
      name: node.name?.value,
      description: node.description?.value,
      value: node.value?.value,
      ignored: node.ignored,
      properties: node.properties?.map((property) => ({
        name: property.name,
        value: property.value?.value
      }))
    }))
  return normalize(
    {
      name: value.name,
      screenshotSha256: value.screenshotSha256,
      seed: value.seed,
      serializedBeforePopup: value.serializedBeforePopup,
      queriedTabs: value.queries?.map((query) => ({
        input: query.input,
        firstTabUrl: query.result[0]?.url
      })),
      storage,
      dom: value.dom,
      layout: value.layout,
      accessibility: ax,
      icons: value.icons,
      requests
    },
    roots
  )
}
